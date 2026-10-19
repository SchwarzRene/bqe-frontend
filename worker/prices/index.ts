// Commodity prices for the 15 instruments in instruments.json.
//
//   GET /api/commodities/prices                 the snapshot (public, one D1 read, no upstream fetch)
//   GET /api/commodities/prices?history=1       plus the last 260 daily closes
//   GET /api/commodities/prices?symbol=XAUUSD   one instrument
//   history also takes a range, from the archive the backfill fills:
//     &from=2020-01-01&to=2024-12-31   |   &days=90   |   &years=10   |   &ohlc=1 for [date,o,h,l,c]
//     (more than 2 calendar years needs ?symbol=)
//
// pricesTick() is the job behind it: its own cron (minutes :05/:20/:35/:50,
// which the news cron's :00/:15/:30/:45 never uses), so it takes no run from
// the briefings or the headline fetch. Every run:
//   refresh   weekdays: the next PER_TICK instruments round-robin (a full pass
//             every 45 minutes); Saturday morning one full pass; Sunday none.
//             Only this year's candles are fetched (last year's too in the first
//             days of January), so "later only the last week" is a small request.
//   backfill  until every instrument's archive reaches its `since` year: a few
//             year-files per run, newest year first, round-robin over the instruments.
// A run stays inside the free plan's 50 D1 queries and subrequests.

import type { Env } from "../env";
import { json, jsonText, mapLimit } from "../http";
import { ET, wallClock } from "../news/time";
import { fetchRecent, fetchYearBars } from "./dukascopy";
import { type Bar, isStale, round } from "./indicators";
import {
  type Backfill, backfillDone, BARS_PREFIX, INSTRUMENTS, type Instrument, markFailed, nextYear, readBackfill, readCursor, rebuildSnapshot,
  saveChart, saveYear, SNAPSHOT_KEY, type Snapshot, type StoredBars, writeBackfill, writeCursor, YEARS_PREFIX, yearKey,
} from "./store";
import { fetchChart, fetchYahooYear } from "./yahoo";

/** Instruments refreshed per run; drop to 3 if a run ever exceeds the free plan's CPU budget. */
export const PER_TICK = 5;
/** Year-files fetched per run by the backfill. */
export const BACKFILL_PER_TICK = 3;

export const PRICES_CRON = "5,20,35,50 * * * *";

/** The Saturday pass starts at this New York hour. */
const WEEKEND_HOUR = 7;

/** More calendar years than this in one answer needs ?symbol= (CPU: the response is parsed from D1). */
const MAX_YEARS_ALL = 2;
const DEFAULT_HISTORY_BARS = 260;

const HEADERS = { "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*" };

// --------------------------------------------------------------------------
// GET /api/commodities/prices
// --------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const dayString = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface Range {
  from: string;
  to: string;
}

/** The requested history window, or null for the default (the recent window), or an error message. */
function parseRange(params: URLSearchParams, now: number): Range | null | { error: string } {
  const [from, to, days, years] = ["from", "to", "days", "years"].map((k) => params.get(k));
  if (!from && !to && !days && !years) return null;
  const today = dayString(now);
  const bad = (name: string) => ({ error: `bad ${name}` });
  if (from && !validDate(from)) return bad("from");
  if (to && !validDate(to)) return bad("to");
  for (const [name, v] of [["days", days], ["years", years]] as const) if (v && !/^[1-9]\d{0,4}$/.test(v)) return bad(name);

  const end = to ?? today;
  let start = from ?? "0000-01-01";
  if (!from && days) start = dayString(Date.parse(`${end}T00:00:00Z`) - Number(days) * 86_400_000);
  else if (!from && years) start = dayString(Date.parse(`${end}T00:00:00Z`) - Number(years) * 365.25 * 86_400_000);
  else if (!from) start = "1970-01-01";
  if (start > end) return { error: "from is after to" };
  return { from: start, to: end };
}

export async function handlePrices(request: Request, env: Env, now = Date.now(), instruments = INSTRUMENTS): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...HEADERS, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  }
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405, { Allow: "GET, OPTIONS" });

  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase() ?? null;
  const history = ["1", "true"].includes(params.get("history") ?? "");
  const ohlc = ["1", "true"].includes(params.get("ohlc") ?? "");
  if (symbol !== null && !instruments.some((i) => i.symbol === symbol)) {
    return json({ error: "unknown symbol" }, 404, HEADERS);
  }

  const range = history ? parseRange(params, now) : null;
  if (range && "error" in range) return json(range, 400, HEADERS);
  const scope = instruments.filter((i) => symbol === null || i.symbol === symbol);
  if (range && symbol === null && Number(range.to.slice(0, 4)) - Number(range.from.slice(0, 4)) + 1 > MAX_YEARS_ALL) {
    return json({ error: `a history over ${MAX_YEARS_ALL} calendar years needs ?symbol=` }, 400, HEADERS);
  }

  // One read: the snapshot — and with history the series too, in the same query.
  let sql = "SELECT key, body FROM documents WHERE key = ?";
  const binds: string[] = [SNAPSHOT_KEY];
  if (range) {
    // The archive: each instrument's year documents from the first year to the last.
    const lo = Math.max(1970, Number(range.from.slice(0, 4))), hi = Number(range.to.slice(0, 4));
    for (const i of scope) {
      sql += " OR key BETWEEN ? AND ?";
      binds.push(yearKey(i.symbol, lo), yearKey(i.symbol, hi));
    }
  } else if (history) {
    sql += " OR key LIKE ?";
    binds.push(`${BARS_PREFIX}%`);
  }
  const { results } = await env.DB.prepare(sql).bind(...binds).all<{ key: string; body: string }>();
  const row = results.find((r) => r.key === SNAPSHOT_KEY);
  if (!row) return json({ error: "no price data yet" }, 503, { "Retry-After": "300" });

  const snapshot = JSON.parse(row.body) as Snapshot;
  const decimals = new Map(instruments.map((i) => [i.symbol, i.decimals ?? 2]));

  /** Bars to report for one instrument. */
  const barsFor = (sym: string): Bar[] => {
    if (range) {
      const prefix = `${YEARS_PREFIX}${sym}:`;
      return results
        .filter((r) => r.key.startsWith(prefix))
        .sort((a, b) => (a.key < b.key ? -1 : 1))
        .flatMap((r) => JSON.parse(r.body) as Bar[])
        .filter((b) => b[0] >= range.from && b[0] <= range.to);
    }
    const recent = results.find((r) => r.key === BARS_PREFIX + sym);
    return recent ? (JSON.parse(recent.body) as StoredBars).bars.slice(-DEFAULT_HISTORY_BARS) : [];
  };

  const body = {
    ...snapshot,
    ...(range ? { range } : {}),
    instruments: snapshot.instruments
      .filter((i) => symbol === null || i.symbol === symbol)
      .map((i) => {
        const d = decimals.get(i.symbol) ?? 2;
        const bars = history ? barsFor(i.symbol) : [];
        return {
          ...i,
          // Stored at build time; time has passed since, and a stopped cron must show.
          stale: isStale(i.lastBarDate, i.fetchedAt, now),
          ...(history
            ? ohlc
              ? { bars: bars.map((b) => [b[0], round(b[1], d), round(b[2], d), round(b[3], d), round(b[4], d)]) }
              : { closes: bars.map((b) => [b[0], round(b[4], d)]) }
            : {}),
        };
      }),
  };
  return jsonText(JSON.stringify(body), 200, HEADERS);
}

// --------------------------------------------------------------------------
// the cron
// --------------------------------------------------------------------------

/** Whether the run at `ms` refreshes prices: weekdays always, Saturday morning one full pass, Sunday never. */
export function isPricesRun(ms: number, count = INSTRUMENTS.length): boolean {
  const w = wallClock(ms, ET);
  if (w.weekday >= 1 && w.weekday <= 5) return true;
  return w.weekday === 6 && w.hour === WEEKEND_HOUR && Math.floor(w.minute / 15) < Math.ceil(count / PER_TICK);
}

export interface TickOptions {
  /** Refresh even when the schedule says this run is not due (the admin run). */
  force?: boolean;
  /** Year-files the backfill fetches; defaults to BACKFILL_PER_TICK. */
  backfill?: number;
}

/** Refresh one instrument from its source. */
async function refresh(env: Env, inst: Instrument, fetcher: typeof fetch, ms: number): Promise<void> {
  const year = new Date(ms).getUTCFullYear();
  const early = new Date(ms).getUTCMonth() === 0 && new Date(ms).getUTCDate() <= 10;
  if (inst.dukascopy) {
    const { chart, years } = await fetchRecent(inst.dukascopy, fetcher, ms);
    await saveChart(env, inst.symbol, chart, ms, { replace: years });
  } else {
    // A year of Yahoo bars covers this year completely and the one before only in part.
    await saveChart(env, inst.symbol, await fetchChart(inst.yahoo, fetcher, ms), ms, { replace: [year], merge: early ? [year - 1] : [] });
  }
}

/**
 * The next `files` (instrument, year) pairs of the backfill, one per instrument
 * in turn so every instrument gets its recent years first. Returns what it did,
 * or "" when every archive is complete.
 */
async function backfill(env: Env, ms: number, instruments: Instrument[], fetcher: typeof fetch, files: number): Promise<string> {
  const state: Backfill = await readBackfill(env);
  const n = instruments.length;
  let fetched = 0, failed = 0;
  for (let looked = 0; looked < n && fetched + failed < files; looked++) {
    const inst = instruments[state.rr % n];
    state.rr = (state.rr + 1) % n;
    if (backfillDone(state, inst, ms)) continue;
    const year = nextYear(state, inst, ms);
    try {
      const bars = inst.dukascopy ? await fetchYearBars(inst.dukascopy, year, fetcher, ms) : await fetchYahooYear(inst.yahoo, year, fetcher, ms);
      await saveYear(env, inst.symbol, year, bars, ms);
      state.next[inst.symbol] = year - 1;
      fetched++;
    } catch (err) {
      console.warn(`prices: backfill failed for ${inst.symbol} ${year} (${err instanceof Error ? err.message : err})`);
      failed++;
    }
  }
  if (!fetched && !failed) return "";
  await writeBackfill(env, state);
  const left = instruments.filter((i) => !backfillDone(state, i, ms)).length;
  return `${fetched} years${failed ? `, ${failed} failed` : ""}, ${left} instruments to go`;
}

/** Refresh the next PER_TICK instruments, run the backfill, and rebuild the snapshot. A failed instrument keeps its stored data. */
export async function pricesTick(
  env: Env, ms = Date.now(), instruments: Instrument[] = INSTRUMENTS, fetcher: typeof fetch = fetch, options: TickOptions = {},
): Promise<string> {
  const report: string[] = [];
  if (options.force || isPricesRun(ms, instruments.length)) {
    const start = (await readCursor(env)) % instruments.length;
    const batch = Array.from({ length: Math.min(PER_TICK, instruments.length) }, (_, k) => instruments[(start + k) % instruments.length]);
    const outcome = await mapLimit(batch, PER_TICK, async (inst) => {
      try {
        await refresh(env, inst, fetcher, ms);
        return true;
      } catch (err) {
        console.warn(`prices: fetch failed for ${inst.dukascopy ?? inst.yahoo} (${err instanceof Error ? err.message : err})`);
        await markFailed(env, inst.symbol);
        return false;
      }
    });
    await writeCursor(env, (start + batch.length) % instruments.length);
    const failed = batch.filter((_, i) => !outcome[i]).map((i) => i.symbol);
    report.push(`${batch.length - failed.length}/${batch.length} refreshed` + (failed.length ? `, failed: ${failed.join(" ")}` : ""));
  }
  const filled = (options.backfill ?? BACKFILL_PER_TICK) > 0 ? await backfill(env, ms, instruments, fetcher, options.backfill ?? BACKFILL_PER_TICK) : "";
  if (filled) report.push(`backfill: ${filled}`);
  if (!report.length) return "skipped";
  await rebuildSnapshot(env, instruments, ms);
  return report.join(" · ");
}
