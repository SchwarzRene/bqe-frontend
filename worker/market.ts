// Market data for the Trading Journal, ported from its market_data.py.
// Public (guests use the journal too), read-only, and cached at the edge.
//
//   GET /api/market/quote?ticker=GC=F
//   GET /api/market/candles?ticker=^NDX&interval=1h                 (a recent range)
//   GET /api/market/candles?ticker=^NDX&interval=5m&period1=…&period2=…
//   GET /api/market/profile?ticker=NVDA                             (fundamentals, see profile.ts)

import { json } from "./http";
import { fetchProfile, ProfileError } from "./profile";

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";
const USER_AGENT = "Mozilla/5.0 (compatible; bqe-frontend/1.0; +https://github.com/SchwarzRene/bqe-frontend)";
// Yahoo tickers: ^NDX, GC=F, BTC-USD, EURUSD=X, BRK-B …
const TICKER_RE = /^[A-Z0-9^=.\-]{1,20}$/;
const QUOTE_TTL = 30;
const CANDLE_TTL = 300;
const PROFILE_TTL = 6 * 3600;

// Timeframe -> how much history the symbol chart loads. Each range stays
// within what Yahoo serves for that interval (1m only covers ~7 days).
export const TIMEFRAME_RANGES: Record<string, string> = {
  "1m": "5d", "5m": "1mo", "15m": "1mo", "30m": "1mo", "1h": "6mo", "1d": "2y", "1wk": "10y",
};

// Seconds per bar, and the longest span one request may ask for. A custom
// range is rounded to whole bars and clamped to the span, so a script
// cycling through ranges cannot make every request a fresh Yahoo fetch.
const STEP: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "1d": 86_400, "1wk": 86_400 };
const MAX_SPAN: Record<string, number> = {
  "1m": 8 * 86_400, "5m": 60 * 86_400, "15m": 60 * 86_400, "30m": 60 * 86_400,
  "1h": 730 * 86_400, "1d": 40 * 365 * 86_400, "1wk": 40 * 365 * 86_400,
};
// An unknown ticker is remembered this long, so it is not asked again on every request.
const NOT_FOUND_TTL = 600;

export class MarketError extends Error {
  constructor(message: string, readonly notFound = false) {
    super(message);
  }
}

/** A custom candle range, rounded to whole bars and clamped; null when it is not a usable range. */
export function candleRange(interval: string, p1: number, p2: number, now = Date.now() / 1000): { period1: string; period2: string } | null {
  if (!Number.isFinite(p1) || !Number.isFinite(p2) || p1 <= 0 || p2 <= p1) return null;
  const step = STEP[interval];
  let end = Math.ceil(Math.min(p2, now + step) / step) * step;
  let start = Math.floor(p1 / step) * step;
  start = Math.max(start, end - MAX_SPAN[interval]);
  if (start >= end) end = start + step;
  return { period1: String(start), period2: String(end) };
}

export async function handleMarket(request: Request, ctx: ExecutionContext, what: string): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405, { Allow: "GET" });
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) return json({ error: "ticker is required" }, 400);

  if (what === "profile") return profile(url, ticker, ctx);

  let params: Record<string, string>;
  let ttl: number;
  if (what === "quote") {
    params = { range: "1d", interval: "1d" };
    ttl = QUOTE_TTL;
  } else if (what === "candles") {
    const interval = url.searchParams.get("interval") || "1h";
    if (!(interval in TIMEFRAME_RANGES)) {
      return json({ error: `timeframe must be one of: ${Object.keys(TIMEFRAME_RANGES).join(", ")}` }, 400);
    }
    // Rounded to whole bars, so repeated views of an open trade share a fetch.
    const range = candleRange(interval, Number(url.searchParams.get("period1")), Number(url.searchParams.get("period2")));
    params = range ? { ...range, interval } : { range: TIMEFRAME_RANGES[interval], interval };
    ttl = CANDLE_TTL;
  } else {
    return json({ error: "not found" }, 404);
  }

  const key = new Request(`${url.origin}/api/market/${what}?${new URLSearchParams({ ticker, ...params })}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;

  try {
    const result = await fetchChart(ticker, params);
    const body = what === "quote" ? toQuote(ticker, result) : { interval: params.interval, candles: toCandles(result) };
    const res = json(body, 200, { "Cache-Control": `public, max-age=${ttl}` });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (err) {
    const message = err instanceof MarketError ? err.message : "Could not reach the market data provider";
    if (err instanceof MarketError && err.notFound) {
      const res = json({ error: message }, 404, { "Cache-Control": `public, max-age=${NOT_FOUND_TTL}` });
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    }
    return json({ error: message }, 502);
  }
}

async function profile(url: URL, ticker: string, ctx: ExecutionContext): Promise<Response> {
  const key = new Request(`${url.origin}/api/market/profile?ticker=${encodeURIComponent(ticker)}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const res = json(await fetchProfile(ticker), 200, { "Cache-Control": `public, max-age=${PROFILE_TTL}` });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (err) {
    return json({ error: err instanceof ProfileError ? err.message : `Company data for ${ticker} is unavailable right now` }, 502);
  }
}

export async function fetchChart(ticker: string, params: Record<string, string>): Promise<any> {
  const url = BASE + encodeURIComponent(ticker) + "?" + new URLSearchParams(params);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new MarketError("Could not reach the market data provider");
  }
  // Yahoo answers an unknown ticker with a 404 whose JSON says why.
  const body = await res.json<any>().catch(() => null);
  const chart = body?.chart;
  if (chart?.error) {
    throw new MarketError(`${ticker}: ${chart.error.description || chart.error.code || "unknown error"}`, res.status === 404 || chart.error.code === "Not Found");
  }
  if (!res.ok) throw new MarketError(`${ticker}: HTTP ${res.status}`);
  const result = chart?.result?.[0];
  if (!result) throw new MarketError(`No market data found for ${ticker}`);
  return result;
}

export function toQuote(ticker: string, result: any) {
  const meta = result.meta || {};
  if (meta.regularMarketPrice == null) throw new MarketError(`No current price available for ${ticker}`);
  return {
    ticker: meta.symbol || ticker,
    price: meta.regularMarketPrice,
    previous_close: meta.chartPreviousClose ?? meta.previousClose ?? null,
    currency: meta.currency || "",
    name: meta.longName || meta.shortName || "",
    instrument_type: meta.instrumentType || "",
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    price_hint: meta.priceHint ?? null,
    market_time: meta.regularMarketTime ?? null,
  };
}

export function toCandles(result: any) {
  const stamps: number[] = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = [];
  stamps.forEach((time, i) => {
    const open = q.open?.[i], high = q.high?.[i], low = q.low?.[i], close = q.close?.[i];
    if ([open, high, low, close].some((v) => v == null)) return;
    const candle = { time, open, high, low, close, volume: q.volume?.[i] ?? 0 };
    // Yahoo sometimes repeats the live bar; charts need strictly increasing times.
    const last = candles[candles.length - 1];
    if (last && time <= last.time) {
      if (time === last.time) candles[candles.length - 1] = candle;
      return;
    }
    candles.push(candle);
  });
  return candles;
}
