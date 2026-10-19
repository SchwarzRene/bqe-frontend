// Commodity prices for the 15 instruments in instruments.json.
//
//   GET /api/commodities/prices                 the snapshot (public, one D1 read, no upstream fetch)
//   GET /api/commodities/prices?history=1       plus the daily closes
//   GET /api/commodities/prices?symbol=XAUUSD   one instrument
//
// pricesTick() is the job behind it: its own cron (minutes :05/:20/:35/:50,
// which the news cron's :00/:15/:30/:45 never uses), so it takes no run from
// the briefings or the headline fetch. Weekdays it refreshes the next
// PER_TICK instruments round-robin (a full pass every 45 minutes); on
// Saturday morning one full pass; Sunday nothing.

import type { Env } from "../env";
import { json, jsonText, mapLimit } from "../http";
import { ET, wallClock } from "../news/time";
import { isStale, round } from "./indicators";
import { BARS_PREFIX, INSTRUMENTS, type Instrument, markFailed, readCursor, rebuildSnapshot, saveChart, SNAPSHOT_KEY, type Snapshot, writeCursor } from "./store";
import type { StoredBars } from "./store";
import { fetchChart } from "./yahoo";

/** Instruments refreshed per run; drop to 3 if a run ever exceeds the free plan's CPU budget. */
export const PER_TICK = 5;

export const PRICES_CRON = "5,20,35,50 * * * *";

/** The Saturday pass starts at this New York hour. */
const WEEKEND_HOUR = 7;

const HEADERS = { "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*" };

// --------------------------------------------------------------------------
// GET /api/commodities/prices
// --------------------------------------------------------------------------

export async function handlePrices(request: Request, env: Env, now = Date.now(), instruments = INSTRUMENTS): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...HEADERS, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  }
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405, { Allow: "GET, OPTIONS" });

  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase() ?? null;
  const history = ["1", "true"].includes(params.get("history") ?? "");
  if (symbol !== null && !instruments.some((i) => i.symbol === symbol)) {
    return json({ error: "unknown symbol" }, 404, HEADERS);
  }

  // One read: the snapshot, and with history the series too.
  const { results } = await env.DB.prepare(
    `SELECT key, body FROM documents WHERE key = ?1${history ? " OR key LIKE ?2" : ""}`,
  )
    .bind(...(history ? [SNAPSHOT_KEY, `${BARS_PREFIX}%`] : [SNAPSHOT_KEY]))
    .all<{ key: string; body: string }>();
  const row = results.find((r) => r.key === SNAPSHOT_KEY);
  if (!row) return json({ error: "no price data yet" }, 503, { "Retry-After": "300" });

  const snapshot = JSON.parse(row.body) as Snapshot;
  const series = new Map(
    results.filter((r) => r.key.startsWith(BARS_PREFIX)).map((r) => [r.key.slice(BARS_PREFIX.length), JSON.parse(r.body) as StoredBars]),
  );
  const decimals = new Map(instruments.map((i) => [i.symbol, i.decimals ?? 2]));

  const body = {
    ...snapshot,
    instruments: snapshot.instruments
      .filter((i) => symbol === null || i.symbol === symbol)
      .map((i) => ({
        ...i,
        // Stored at build time; time has passed since, and a stopped cron must show.
        stale: isStale(i.lastBarDate, i.fetchedAt, now),
        ...(history ? { closes: (series.get(i.symbol)?.bars ?? []).map((b) => [b[0], round(b[4], decimals.get(i.symbol) ?? 2)]) } : {}),
      })),
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

/** Refresh the next PER_TICK instruments and rebuild the snapshot. A failed instrument keeps its stored data. */
export async function pricesTick(env: Env, ms = Date.now(), instruments: Instrument[] = INSTRUMENTS, fetcher: typeof fetch = fetch): Promise<string> {
  if (!isPricesRun(ms, instruments.length)) return "skipped";
  const start = (await readCursor(env)) % instruments.length;
  const batch = Array.from({ length: Math.min(PER_TICK, instruments.length) }, (_, k) => instruments[(start + k) % instruments.length]);

  const outcome = await mapLimit(batch, PER_TICK, async (inst) => {
    try {
      await saveChart(env, inst.symbol, await fetchChart(inst.yahoo, fetcher, ms), ms);
      return true;
    } catch (err) {
      console.warn(`prices: fetch failed for ${inst.yahoo} (${err instanceof Error ? err.message : err})`);
      await markFailed(env, inst.symbol);
      return false;
    }
  });

  await writeCursor(env, (start + batch.length) % instruments.length);
  await rebuildSnapshot(env, instruments, ms);
  const failed = batch.filter((_, i) => !outcome[i]).map((i) => i.symbol);
  return `${batch.length - failed.length}/${batch.length} refreshed` + (failed.length ? `, failed: ${failed.join(" ")}` : "");
}
