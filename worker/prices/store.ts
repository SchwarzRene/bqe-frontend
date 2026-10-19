// What the prices job keeps in D1's documents table (one JSON blob per key):
//
//   prices:bars:<SYMBOL>  the last ~260 completed daily bars and the live price
//   prices:snapshot       the endpoint's response body without history, rebuilt
//                         after every job, so a GET is a single read
//   prices:cursor         where the round-robin over the instruments stands

import type { Env } from "../env";
import { isoNow } from "../http";
import { analyse, type Bar, isStale, round } from "./indicators";
import config from "./instruments.json";
import type { Chart } from "./yahoo";

export interface Instrument {
  symbol: string;
  name: string;
  group: string;
  yahoo: string;
  unit: string;
  decimals?: number;
}

export const INSTRUMENTS: Instrument[] = config;

export const SOURCE =
  "Yahoo Finance front-month futures (daily). Not IC Markets CFD quotes; expect basis differences and roll gaps.";

/** One instrument's stored series. `fetchedAt` is the last *successful* fetch. */
export interface StoredBars {
  ok: boolean;
  fetchedAt: string | null;
  last: number | null;
  lastAt: string | null;
  bars: Bar[];
}

export const BARS_PREFIX = "prices:bars:";
export const SNAPSHOT_KEY = "prices:snapshot";
const CURSOR_KEY = "prices:cursor";

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

export async function saveChart(env: Env, symbol: string, chart: Chart, now = Date.now()): Promise<void> {
  const doc: StoredBars = {
    ok: true,
    fetchedAt: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"),
    last: chart.last,
    lastAt: chart.lastAt,
    bars: chart.bars,
  };
  await put(env, BARS_PREFIX + symbol, JSON.stringify(doc));
}

/** A failed fetch keeps what is stored and flips `ok` off. */
export async function markFailed(env: Env, symbol: string): Promise<void> {
  const previous = await get<StoredBars>(env, BARS_PREFIX + symbol);
  const doc: StoredBars = { ok: false, fetchedAt: null, last: null, lastAt: null, bars: [], ...previous, };
  doc.ok = false;
  await put(env, BARS_PREFIX + symbol, JSON.stringify(doc));
}

export async function readAllBars(env: Env): Promise<Map<string, StoredBars>> {
  const { results } = await env.DB.prepare("SELECT key, body FROM documents WHERE key LIKE ?")
    .bind(`${BARS_PREFIX}%`)
    .all<{ key: string; body: string }>();
  return new Map(results.map((r) => [r.key.slice(BARS_PREFIX.length), JSON.parse(r.body) as StoredBars]));
}

/** One instrument as the endpoint reports it. */
export function entry(inst: Instrument, stored: StoredBars | undefined, now: number) {
  const bars = stored?.bars ?? [];
  const last = stored?.last ?? null;
  const a = analyse(bars, last, inst.decimals ?? 2);
  const fetchedAt = stored?.fetchedAt ?? null;
  return {
    symbol: inst.symbol,
    name: inst.name,
    group: inst.group,
    yahoo: inst.yahoo,
    unit: inst.unit,
    ok: stored?.ok ?? false,
    stale: isStale(a.lastBarDate, fetchedAt, now),
    fetchedAt,
    lastBarDate: a.lastBarDate,
    last: round(last, inst.decimals ?? 2),
    lastAt: stored?.lastAt ?? null,
    change: a.change,
    levels: a.levels,
    atr20: a.atr20,
    sma50: a.sma50,
    sma200: a.sma200,
    signals: a.signals,
  };
}

export type Entry = ReturnType<typeof entry>;

export interface Snapshot {
  generatedAt: string;
  source: string;
  instruments: Entry[];
}

/** Rebuild prices:snapshot from the stored series. */
export async function rebuildSnapshot(env: Env, instruments = INSTRUMENTS, now = Date.now()): Promise<Snapshot> {
  const all = await readAllBars(env);
  const snapshot: Snapshot = {
    generatedAt: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"),
    source: SOURCE,
    instruments: instruments.map((i) => entry(i, all.get(i.symbol), now)),
  };
  await put(env, SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}
