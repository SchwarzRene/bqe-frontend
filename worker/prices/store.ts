// What the prices job keeps in D1's documents table (one JSON blob per key):
//
//   prices:bars:<SYMBOL>          the recent window: the last RECENT_BARS completed
//                                 daily bars and the live price. Indicators are
//                                 computed from this, so a snapshot rebuild stays
//                                 a few KB per instrument, not the whole history.
//   prices:years:<SYMBOL>:<YEAR>  every completed bar of one calendar year, the
//                                 archive behind ?from= / ?years= (filled by the backfill)
//   prices:backfill               which year the backfill fetches next, per instrument
//   prices:snapshot               the endpoint's response body without history,
//                                 rebuilt after every job, so a GET is a single read
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

/** Completed bars kept in the recent window: the 200-day average, the 52-week range and a year of ATR values fit with room to spare. */
export const RECENT_BARS = 400;

/** One instrument's recent window. `fetchedAt` is the last *successful* fetch. */
export interface StoredBars {
  ok: boolean;
  fetchedAt: string | null;
  last: number | null;
  lastAt: string | null;
  bars: Bar[];
}

export const BARS_PREFIX = "prices:bars:";
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

const emptyDoc = (): StoredBars => ({ ok: false, fetchedAt: null, last: null, lastAt: null, bars: [] });

/**
 * A successful refresh: the recent window absorbs the new bars, and the years
 * in `replace` — years the fetch covered completely — are written as they are.
 * Years in `merge` were covered only in part and are merged into the archive.
 */
export async function saveChart(env: Env, symbol: string, chart: Chart, now: number, years: { replace: number[]; merge?: number[] }): Promise<void> {
  const previous = (await get<StoredBars>(env, BARS_PREFIX + symbol)) ?? emptyDoc();
  const doc: StoredBars = {
    ok: true,
    fetchedAt: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"),
    last: chart.last,
    lastAt: chart.lastAt,
    bars: mergeBars(previous.bars, chart.bars).slice(-RECENT_BARS),
  };
  await put(env, BARS_PREFIX + symbol, JSON.stringify(doc));
  for (const y of years.replace) await put(env, yearKey(symbol, y), JSON.stringify(inYear(chart.bars, y)));
  for (const y of years.merge ?? []) {
    const stored = (await get<Bar[]>(env, yearKey(symbol, y))) ?? [];
    await put(env, yearKey(symbol, y), JSON.stringify(mergeBars(stored, inYear(chart.bars, y))));
  }
}

/** A backfilled year: into the archive, and into the recent window when it is recent enough to matter. */
export async function saveYear(env: Env, symbol: string, year: number, bars: Bar[], now: number): Promise<void> {
  await put(env, yearKey(symbol, year), JSON.stringify(bars));
  if (year < new Date(now).getUTCFullYear() - 2 || !bars.length) return;
  const previous = (await get<StoredBars>(env, BARS_PREFIX + symbol)) ?? emptyDoc();
  await put(env, BARS_PREFIX + symbol, JSON.stringify({ ...previous, bars: mergeBars(previous.bars, bars).slice(-RECENT_BARS) }));
}

/** A failed fetch keeps what is stored and flips `ok` off. */
export async function markFailed(env: Env, symbol: string): Promise<void> {
  const doc = (await get<StoredBars>(env, BARS_PREFIX + symbol)) ?? emptyDoc();
  doc.ok = false;
  await put(env, BARS_PREFIX + symbol, JSON.stringify(doc));
}

/**
 * The exclusive upper bound of a key prefix ("prices:bars:" -> "prices:bars;").
 * `key >= prefix AND key < end` walks the primary-key index; LIKE with a bound
 * pattern is a full scan of the table, and D1's free plan counts rows read.
 */
export const prefixEnd = (prefix: string) => prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);

export async function readAllBars(env: Env): Promise<Map<string, StoredBars>> {
  const { results } = await env.DB.prepare("SELECT key, body FROM documents WHERE key >= ? AND key < ?")
    .bind(BARS_PREFIX, prefixEnd(BARS_PREFIX))
    .all<{ key: string; body: string }>();
  return new Map(results.map((r) => [r.key.slice(BARS_PREFIX.length), JSON.parse(r.body) as StoredBars]));
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

/** One instrument as the endpoint reports it. */
export function entry(inst: Instrument, stored: StoredBars | undefined, now: number, backfill?: Backfill) {
  const bars = stored?.bars ?? [];
  const last = stored?.last ?? null;
  const decimals = inst.decimals ?? 2;
  const a = analyse(bars, last, decimals);
  const fetchedAt = stored?.fetchedAt ?? null;
  return {
    symbol: inst.symbol,
    name: inst.name,
    group: inst.group,
    yahoo: inst.yahoo,
    unit: inst.unit,
    source: sourceOf(inst),
    ok: stored?.ok ?? false,
    stale: isStale(a.lastBarDate, fetchedAt, now),
    historyComplete: backfill ? backfillDone(backfill, inst, now) : false,
    fetchedAt,
    lastBarDate: a.lastBarDate,
    last: round(last, decimals),
    lastAt: stored?.lastAt ?? null,
    change: a.change,
    levels: a.levels,
    atr20: a.atr20,
    sma50: a.sma50,
    sma200: a.sma200,
    signals: a.signals,
    structure: a.structure,
  };
}

export type Entry = ReturnType<typeof entry>;

export interface Snapshot {
  generatedAt: string;
  source: string;
  instruments: Entry[];
}

/** Rebuild prices:snapshot from the recent windows. */
export async function rebuildSnapshot(env: Env, instruments = INSTRUMENTS, now = Date.now()): Promise<Snapshot> {
  const [all, backfill] = await Promise.all([readAllBars(env), readBackfill(env)]);
  const snapshot: Snapshot = {
    generatedAt: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"),
    source: SOURCE,
    instruments: instruments.map((i) => entry(i, all.get(i.symbol), now, backfill)),
  };
  await put(env, SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}
