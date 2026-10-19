// Dukascopy's daily candles (BID) — a CFD-style spot feed, so the prices track
// IC Markets' far more closely than Yahoo's front-month futures do, and the
// history goes back decades (see `since` in instruments.json).
//
// The endpoint is the one the dukascopy-node library uses (v1.50):
//   completed year   https://jetta.dukascopy.com/v1/candles/day/<CODE>/BID/<YEAR>
//   current year     https://jetta.dukascopy.com/v1/candles/day/<CODE>/BID?from=<ms of Jan 1 UTC>
// It is not an official, documented API: it can change, so a failure here is
// logged and the instrument is flagged ok:false like any other upstream error.
//
// A response is columnar and delta-encoded: a base candle (open, high, low,
// close in price units of `multiplier`), `timestamp` (ms) and `shift` (ms per
// step), then arrays of per-candle differences. Gaps are not filled here.

import { type Bar } from "./indicators";
import { type Chart, PriceFetchError } from "./yahoo";

const ROOT = "https://jetta.dukascopy.com/v1";
const TIMEOUT_MS = 10_000;
const DAY_MS = 86_400_000;

/**
 * A daily candle opens at the market's day roll (21:00 or 22:00 UTC, the New
 * York close) or at 00:00 UTC. Three hours on lands every one of those on the
 * trading day the candle belongs to.
 */
const LABEL_SHIFT_MS = 3 * 3_600_000;

export interface Candle {
  open: number; // ms, the candle's open time
  bar: Bar;
  volume: number;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function scaleOf(multiplier: number): number {
  const [coefficient, exponent = "0"] = multiplier.toString().toLowerCase().split("e");
  return Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
}

/** Decode one response into candles, oldest first. Throws PriceFetchError on a malformed body. */
export function parseCandles(data: any): Candle[] {
  if (!data || !Array.isArray(data.times) || !finite(data.timestamp)) throw new PriceFetchError("bad dukascopy response");
  const n = data.times.length;
  if (n === 0) return [];
  const cols = [data.opens, data.highs, data.lows, data.closes, data.volumes];
  if (cols.some((c) => !Array.isArray(c) || c.length !== n || c.some((v: unknown) => !finite(v)))) {
    throw new PriceFetchError("bad dukascopy response: columns");
  }
  if (![data.open, data.high, data.low, data.close, data.shift].every(finite) || data.shift <= 0 || !finite(data.multiplier) || data.multiplier <= 0) {
    throw new PriceFetchError("bad dukascopy response: base candle");
  }
  const scale = scaleOf(data.multiplier);
  const price = (units: number) => Number((units * data.multiplier).toFixed(scale));
  let at = data.timestamp;
  let o = Math.round(data.open / data.multiplier), h = Math.round(data.high / data.multiplier);
  let l = Math.round(data.low / data.multiplier), c = Math.round(data.close / data.multiplier);
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    at += data.times[i] * data.shift;
    o += data.opens[i];
    h += data.highs[i];
    l += data.lows[i];
    c += data.closes[i];
    const date = new Date(at + LABEL_SHIFT_MS).toISOString().slice(0, 10);
    out.push({ open: at, bar: [date, price(o), price(h), price(l), price(c)], volume: data.volumes[i] });
  }
  return out;
}

/** One year of daily candles; [] when the feed has none for it (404 / empty). */
export async function fetchYear(code: string, year: number, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Candle[]> {
  const url =
    year < new Date(now).getUTCFullYear()
      ? `${ROOT}/candles/day/${code}/BID/${year}`
      : `${ROOT}/candles/day/${code}/BID?from=${Date.UTC(year, 0, 1)}`;
  let res: Response;
  try {
    // No headers of our own: the dukascopy-node library sends none, and this host answered a custom
    // User-Agent / Accept with a 200 that was not JSON.
    res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new PriceFetchError(String(err));
  }
  if (res.status === 404) return [];
  if (!res.ok) throw new PriceFetchError(`status ${res.status}`, res.status);
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // What came back, so a block page or a changed endpoint can be told apart from a network error.
    const type = res.headers.get("content-type") ?? "no content-type";
    throw new PriceFetchError(`dukascopy: not JSON (${type}, ${text.length} bytes: ${text.slice(0, 80).replace(/\s+/g, " ")})`);
  }
  return parseCandles(body);
}

/**
 * Completed trading-day bars and the live price from candles. A candle is
 * complete once 24 h have passed since it opened; the one still forming
 * gives `last`. Weekend-labelled candles (the short Sunday-evening session)
 * and zero-volume ones are not trading days and are dropped.
 */
export function chartOf(candles: Candle[], now = Date.now()): Chart {
  const real = candles.filter((c) => c.volume > 0);
  const byDate = new Map<string, Bar>();
  for (const c of real) {
    const dow = new Date(`${c.bar[0]}T12:00:00Z`).getUTCDay();
    if (c.open + DAY_MS <= now && dow >= 1 && dow <= 5) byDate.set(c.bar[0], c.bar);
  }
  const latest = real.at(-1);
  return {
    bars: [...byDate.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    last: latest ? latest.bar[4] : null,
    lastAt: latest ? new Date(Math.min(now, latest.open + DAY_MS)).toISOString().replace(/\.\d{3}Z$/, "Z") : null,
  };
}

/** The refresh: this year (and last year in the first days of January, when "last week" spans the turn). */
export async function fetchRecent(code: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<{ chart: Chart; years: number[] }> {
  const d = new Date(now);
  const year = d.getUTCFullYear();
  const early = d.getUTCMonth() === 0 && d.getUTCDate() <= 10;
  const years = early ? [year - 1, year] : [year];
  const candles = (await Promise.all(years.map((y) => fetchYear(code, y, fetcher, now)))).flat();
  const chart = chartOf(candles, now);
  if (!chart.bars.length) throw new PriceFetchError("no completed bars");
  return { chart, years };
}

/** Completed bars of one past year, for the backfill. */
export async function fetchYearBars(code: string, year: number, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Bar[]> {
  return chartOf(await fetchYear(code, year, fetcher, now), now).bars.filter((b) => b[0].startsWith(`${year}-`));
}
