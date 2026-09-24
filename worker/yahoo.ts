// Yahoo chart client. Ported from bqe-backend's app/services/yahoo.py, which
// was itself a port of the Worker this site used before that.
//
// Yahoo's chart endpoint sends no CORS headers, so the browser cannot call it
// directly; the Worker does, and returns the same column-wise shape the Stack
// page reads. Prices are scaled by adjclose/close, matching yfinance's
// auto_adjust=True, so a level drawn on live bars sits at the same height on
// the stored ones.

const BASE = "https://query1.finance.yahoo.com";
const USER_AGENT = "Mozilla/5.0 (compatible; bqe-frontend/1.0; +https://github.com/SchwarzRene/bqe-frontend)";

// One to ten characters: letters, digits, dot, hyphen. Anything else is not
// a ticker and never reaches Yahoo.
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/;

export interface Columns {
  tu: number; // multiplier that turns a stored `t` back into milliseconds
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}

interface Spec {
  range: string;
  interval: string;
  unitMs: number;
}

export const DAILY: Spec = { range: "10y", interval: "1d", unitMs: 86_400_000 };
export const HOURLY: Spec = { range: "60d", interval: "60m", unitMs: 60_000 };

// Below this many daily bars a card has nothing worth drawing.
const MIN_DAILY_BARS = 40;
const MIN_HOURLY_BARS = 20;

export class UpstreamError extends Error {}

export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol);
}

/** BRK.B -> BRK-B: Yahoo's spelling, and the file name the page asks for. */
export function yahooSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\./g, "-");
}

export interface Quote {
  d: Columns;
  h1?: Columns;
}

/**
 * Daily bars, plus hourly when Yahoo has them. The hourly series is a bonus:
 * if it fails the daily one is still returned, since the chart is drawn from
 * the daily bars.
 */
export async function fetchQuote(symbol: string, fetcher: typeof fetch = fetch): Promise<Quote> {
  const [daily, hourly] = await Promise.allSettled([
    chart(symbol, DAILY, fetcher),
    chart(symbol, HOURLY, fetcher),
  ]);
  if (daily.status === "rejected") {
    throw daily.reason instanceof UpstreamError ? daily.reason : new UpstreamError(String(daily.reason));
  }
  if (!daily.value || daily.value.t.length < MIN_DAILY_BARS) throw new UpstreamError("no data");

  const quote: Quote = { d: daily.value };
  if (hourly.status === "fulfilled" && hourly.value && hourly.value.t.length > MIN_HOURLY_BARS) {
    quote.h1 = hourly.value;
  }
  return quote;
}

async function chart(symbol: string, spec: Spec, fetcher: typeof fetch): Promise<Columns | null> {
  const url = new URL(`/v8/finance/chart/${encodeURIComponent(symbol)}`, BASE);
  url.searchParams.set("range", spec.range);
  url.searchParams.set("interval", spec.interval);
  url.searchParams.set("includePrePost", "false");

  const res = await fetcher(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status !== 200) throw new UpstreamError(`yahoo ${res.status}`);
  return toColumns(await res.json(), spec.unitMs);
}

/** A Yahoo chart response in the page's column format. Exported for tests. */
export function toColumns(body: any, unitMs: number): Columns | null {
  const result = body?.chart?.result?.[0];
  if (!result || !Array.isArray(result.timestamp)) return null;

  const quote = result.indicators?.quote?.[0] ?? {};
  const adjclose: (number | null)[] = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const opens = quote.open ?? [], highs = quote.high ?? [], lows = quote.low ?? [], closes = quote.close ?? [];

  const step = unitMs / 1000;
  const out: Columns = { tu: unitMs, t: [], o: [], h: [], l: [], c: [] };

  result.timestamp.forEach((stamp: number, i: number) => {
    const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
    if (![o, h, l, c].every((v) => typeof v === "number" && v > 0)) return;

    // Match the snapshot's auto_adjust=True: scale OHLC by adjclose/close.
    const adj = adjclose[i];
    const k = typeof adj === "number" && adj > 0 ? adj / c : 1;
    const digits = c * k < 10 ? 4 : 2;

    out.t.push(Math.floor(stamp / step));
    out.o.push(round(o * k, digits));
    out.h.push(round(h * k, digits));
    out.l.push(round(l * k, digits));
    out.c.push(round(c * k, digits));
  });
  return out;
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
