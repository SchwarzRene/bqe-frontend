// What the prices job keeps in D1's documents table (one JSON blob per key):
//
//   prices:bars:<SYMBOL>          the recent window: the last RECENT_BARS completed daily bars.
//   prices:entry:<SYMBOL>         the instrument as the endpoint reports it (indicators, levels,
//                                 signals), computed when the instrument is refreshed. ~2 KB, so
//                                 assembling the snapshot never touches the bars: on the free plan
//                                 a run has 10 ms of CPU, and analysing 15 instruments takes more.
//   prices:years:<SYMBOL>:<YEAR>  every completed bar of one calendar year, the archive behind
//                                 ?from= / ?years= (filled by the backfill)
//   prices:backfill               which year the backfill fetches next, per instrument
//   prices:snapshot               the endpoint's response body without history, assembled from the
//                                 entries after every job, so a GET is a single read
//   prices:cursor                 where the round-robin over the instruments stands

import type { Env } from "../env";
import { isoNow } from "../http";
import { analyse, type Bar, isStale, round } from "./indicators";
import config from "./instruments.json";
import type { Chart } from "./yahoo";

export interface Instrument {
  symbol: string;
  name: string;
  group: string;
  yahoo: string; // ticker for the Yahoo source (and the fallback reference)
  unit: string;
  decimals?: number;
  dukascopy?: string; // instrument code in Dukascopy's feed; when set, it is the source
  since?: number; // first year worth backfilling
}

export const INSTRUMENTS: Instrument[] = config;

export const SOURCE =
  "Dukascopy daily BID candles (CFD-style spot, close to IC Markets) where the feed has the instrument; " +
  "Yahoo Finance front-month futures (daily) otherwise (see each instrument's `source`). " +
  "Not IC Markets quotes; expect small basis differences, and roll gaps in the futures series.";

export const sourceOf = (i: Instrument): "dukascopy" | "yahoo" => (i.dukascopy ? "dukascopy" : "yahoo");

/** Completed bars in the recent window: the 200-day average, the 52-week range and the year of ATR values behind the percentile need 272. */
export const RECENT_BARS = 300;

/** The recent window of one instrument. */
export interface StoredBars {
  bars: Bar[];
}

export const BARS_PREFIX = "prices:bars:";
export const ENTRY_PREFIX = "prices:entry:";
export const YEARS_PREFIX = "prices:years:";
export const SNAPSHOT_KEY = "prices:snapshot";
const CURSOR_KEY = "prices:cursor";
const BACKFILL_KEY = "prices:backfill";

export const yearKey = (symbol: string, year: number) => `${YEARS_PREFIX}${symbol}:${year}`;

async function put(env: Env, key: string, body: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO documents (key, body, updated) VALUES (?1, ?2, ?3)
     ON CONFLICT (key) DO UPDATE SET body = excluded.body, updated = excluded.updated`,
  )
    .bind(key, body, isoNow())
    .run();
}

async function get<T>(env: Env, key: string): Promise<T | null> {
  const row = await env.DB.prepare("SELECT body FROM documents WHERE key = ?").bind(key).first<{ body: string }>();
  return row ? (JSON.parse(row.body) as T) : null;
}

export async function readCursor(env: Env): Promise<number> {
  const n = Number(await get<number>(env, CURSOR_KEY));
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function writeCursor(env: Env, cursor: number): Promise<void> {
  return put(env, CURSOR_KEY, String(cursor));
}

/** `incoming` wins on a date both have; oldest first. */
export function mergeBars(existing: Bar[], incoming: Bar[]): Bar[] {
  const byDate = new Map<string, Bar>();
  for (const b of existing) byDate.set(b[0], b);
  for (const b of incoming) byDate.set(b[0], b);
  return [...byDate.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

const inYear = (bars: Bar[], year: number) => bars.filter((b) => b[0].startsWith(`${year}-`));

/** What a fetch says about an instrument; `fetchedAt` is the last *successful* fetch. */
export interface Meta {
  ok: boolean;
  fetchedAt: string | null;
  last: number | null;
  lastAt: string | null;
}

/**
 * A successful refresh: the recent window absorbs the new bars (reaching into
 * the archive when it is still short), the instrument's entry is recomputed,
 * and the years in `replace` — years the fetch covered completely — are
 * written as they are. Years in `merge` were covered only in part and are
 * merged into the archive.
 */
export async function saveChart(
  env: Env, inst: Instrument, chart: Chart, now: number, years: { replace: number[]; merge?: number[] },
): Promise<void> {
  const symbol = inst.symbol;
  let bars = mergeBars((await get<StoredBars>(env, BARS_PREFIX + symbol))?.bars ?? [], chart.bars);
  // Still short of a full window (a fresh deploy, the first days of January): take the years before from the archive.
  for (let y = new Date(now).getUTCFullYear() - 1; bars.length < RECENT_BARS && y >= new Date(now).getUTCFullYear() - 3; y--) {
    bars = mergeBars((await get<Bar[]>(env, yearKey(symbol, y))) ?? [], bars);
  }
  bars = bars.slice(-RECENT_BARS);
  const meta: Meta = { ok: true, fetchedAt: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"), last: chart.last, lastAt: chart.lastAt };
  await put(env, BARS_PREFIX + symbol, JSON.stringify({ bars }));
  for (const y of years.replace) await put(env, yearKey(symbol, y), JSON.stringify(inYear(chart.bars, y)));
  for (const y of years.merge ?? []) {
    const stored = (await get<Bar[]>(env, yearKey(symbol, y))) ?? [];
    await put(env, yearKey(symbol, y), JSON.stringify(mergeBars(stored, inYear(chart.bars, y))));
  }
  await put(env, ENTRY_PREFIX + symbol, JSON.stringify(buildEntry(inst, meta, bars, now)));
}

/** A backfilled year, into the archive. (The recent window is filled by the next refresh.) */
export function saveYear(env: Env, symbol: string, year: number, bars: Bar[]): Promise<void> {
  return put(env, yearKey(symbol, year), JSON.stringify(bars));
}

/** A failed fetch keeps what is stored and flips `ok` off. */
export async function markFailed(env: Env, inst: Instrument, now: number): Promise<void> {
  const stored = await get<BaseEntry>(env, ENTRY_PREFIX + inst.symbol);
  const doc = stored ?? buildEntry(inst, { ok: false, fetchedAt: null, last: null, lastAt: null }, [], now);
  doc.ok = false;
  await put(env, ENTRY_PREFIX + inst.symbol, JSON.stringify(doc));
}

/**
 * The exclusive upper bound of a key prefix ("prices:bars:" -> "prices:bars;").
 * `key >= prefix AND key < end` walks the primary-key index; LIKE with a bound
 * pattern is a full scan of the table, and D1's free plan counts rows read.
 */
export const prefixEnd = (prefix: string) => prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);

async function readEntries(env: Env): Promise<Map<string, BaseEntry>> {
  const { results } = await env.DB.prepare("SELECT key, body FROM documents WHERE key >= ? AND key < ?")
    .bind(ENTRY_PREFIX, prefixEnd(ENTRY_PREFIX))
    .all<{ key: string; body: string }>();
  return new Map(results.map((r) => [r.key.slice(ENTRY_PREFIX.length), JSON.parse(r.body) as BaseEntry]));
}

// --------------------------------------------------------------------------
// the backfill's progress
// --------------------------------------------------------------------------

/** `next`: the year to fetch next per instrument, newest first; done once it is below the instrument's `since`. */
export interface Backfill {
  rr: number;
  next: Record<string, number>;
}

export async function hasSnapshot(env: Env): Promise<boolean> {
  return !!(await env.DB.prepare("SELECT 1 AS x FROM documents WHERE key = ?").bind(SNAPSHOT_KEY).first());
}

export async function readBackfill(env: Env): Promise<Backfill> {
  return (await get<Backfill>(env, BACKFILL_KEY)) ?? { rr: 0, next: {} };
}

export function writeBackfill(env: Env, state: Backfill): Promise<void> {
  return put(env, BACKFILL_KEY, JSON.stringify(state));
}

export function nextYear(state: Backfill, inst: Instrument, now: number): number {
  return state.next[inst.symbol] ?? new Date(now).getUTCFullYear() - 1;
}

export const backfillDone = (state: Backfill, inst: Instrument, now: number) => nextYear(state, inst, now) < (inst.since ?? 2000);

// --------------------------------------------------------------------------
// the snapshot
// --------------------------------------------------------------------------

/** One instrument as the endpoint reports it, from its recent bars; what is stored per instrument. */
export function buildEntry(inst: Instrument, meta: Meta, bars: Bar[], now: number) {
  const decimals = inst.decimals ?? 2;
  const a = analyse(bars, meta.last, decimals);
  return {
    symbol: inst.symbol,
    name: inst.name,
    group: inst.group,
    yahoo: inst.yahoo,
    unit: inst.unit,
    source: sourceOf(inst),
    ok: meta.ok,
    stale: isStale(a.lastBarDate, meta.fetchedAt, now),
    fetchedAt: meta.fetchedAt,
    lastBarDate: a.lastBarDate,
    last: round(meta.last, decimals),
    lastAt: meta.lastAt,
    change: a.change,
    levels: a.levels,
    atr20: a.atr20,
    sma50: a.sma50,
    sma200: a.sma200,
    signals: a.signals,
    structure: a.structure,
  };
}

export type BaseEntry = ReturnType<typeof buildEntry>;
export type Entry = BaseEntry & { historyComplete: boolean };

export interface Snapshot {
  generatedAt: string;
  source: string;
  instruments: Entry[];
}

/** Assemble prices:snapshot from the stored entries. */
export async function rebuildSnapshot(env: Env, instruments = INSTRUMENTS, now = Date.now()): Promise<Snapshot> {
  const [entries, backfill] = await Promise.all([readEntries(env), readBackfill(env)]);
  const blank: Meta = { ok: false, fetchedAt: null, last: null, lastAt: null };
  const snapshot: Snapshot = {
    generatedAt: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"),
    source: SOURCE,
    instruments: instruments.map((i) => {
      const e = entries.get(i.symbol) ?? buildEntry(i, blank, [], now);
      return { ...e, stale: isStale(e.lastBarDate, e.fetchedAt, now), historyComplete: backfillDone(backfill, i, now) };
    }),
  };
  await put(env, SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}
