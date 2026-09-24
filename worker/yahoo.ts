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

// What the nightly refresh asks for when it already holds the history: the
// last month of days and the last week of hours, a few KB instead of the
// ~10 years that are already stored. The overlap with the stored bars is
// what proves the history is still valid (see mergeDaily).
export const DAILY_RECENT: Spec = { range: "1mo", interval: "1d", unitMs: 86_400_000 };
export const HOURLY_RECENT: Spec = { range: "5d", interval: "60m", unitMs: 60_000 };

const HOURLY_KEEP_MS = 60 * 86_400_000;
const MIN_OVERLAP = 3;

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
    fetchChart(symbol, DAILY, fetcher),
    fetchChart(symbol, HOURLY, fetcher),
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

export async function fetchChart(symbol: string, spec: Spec, fetcher: typeof fetch = fetch): Promise<Columns | null> {
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

/**
 * Bring a stored quote up to date. Normally that is two small requests and a
 * merge; the full 10-year download happens only when there is nothing to
 * merge onto, when the stored history no longer matches Yahoo's (a dividend
 * or split re-adjusted it), or when `forceFull` asks for a periodic check.
 */
export async function refreshQuote(
  symbol: string,
  stored: Quote | null,
  forceFull: boolean,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<{ quote: Quote; full: boolean }> {
  if (stored?.d && !forceFull) {
    const [daily, hourly] = await Promise.allSettled([
      fetchChart(symbol, DAILY_RECENT, fetcher),
      fetchChart(symbol, HOURLY_RECENT, fetcher),
    ]);
    const d = daily.status === "fulfilled" && daily.value ? mergeDaily(stored.d, daily.value) : null;
    if (d) {
      const quote: Quote = { d };
      const recentHours = hourly.status === "fulfilled" ? hourly.value : null;
      const h1 = recentHours ? mergeHourly(stored.h1, recentHours, now) : null;
      if (h1) quote.h1 = h1;
      else {
        // A gap in the hours (the ticker was skipped for a week, say):
        // refetch just the hourly window, keep the stored one if that fails.
        const full = await fetchChart(symbol, HOURLY, fetcher).catch(() => null);
        if (full && full.t.length > MIN_HOURLY_BARS) quote.h1 = full;
        else if (stored.h1) quote.h1 = stored.h1;
      }
      return { quote, full: false };
    }
  }
  return { quote: await fetchQuote(symbol, fetcher), full: true };
}

/**
 * Append recent daily bars to the stored history, or null when the two
 * disagree and the history must be downloaded again.
 *
 * Prices are adjusted (see toColumns), so a dividend or split rescales every
 * bar before it. Every overlapping close is compared; one that moved by more
 * than the rounding of the stored value means the history is stale.
 */
export function mergeDaily(stored: Columns, recent: Columns): Columns | null {
  if (stored.tu !== recent.tu || !recent.t.length || !stored.t.length) return null;

  const at = new Map(stored.t.map((t, i) => [t, i]));
  let overlap = 0;
  for (let j = 0; j < recent.t.length; j++) {
    const i = at.get(recent.t[j]);
    if (i === undefined) continue;
    // The stored series' last bar may have been taken before the day
    // settled; it is replaced below either way, so it proves nothing.
    if (i === stored.t.length - 1) continue;
    const old = stored.c[i];
    const tolerance = 1.5 * 10 ** -(old < 10 ? 4 : 2);
    if (Math.abs(recent.c[j] - old) > tolerance) return null;
    overlap++;
  }
  if (overlap < MIN_OVERLAP) return null; // a gap, or too little to trust

  return splice(stored, recent, -Infinity);
}

/** Append recent hourly bars and drop those older than the 60-day window. */
export function mergeHourly(stored: Columns | undefined, recent: Columns, now: number): Columns | null {
  if (!stored || stored.tu !== recent.tu || !stored.t.length || !recent.t.length) return null;
  // No overlap means hours are missing in between.
  if (recent.t[0] > stored.t[stored.t.length - 1]) return null;
  return splice(stored, recent, (now - HOURLY_KEEP_MS) / stored.tu);
}

/** Stored bars before `recent` starts and not before `from`, then `recent`. */
function splice(stored: Columns, recent: Columns, from: number): Columns {
  const out: Columns = { tu: stored.tu, t: [], o: [], h: [], l: [], c: [] };
  const first = recent.t[0];
  for (let i = 0; i < stored.t.length; i++) {
    if (stored.t[i] < from || stored.t[i] >= first) continue;
    out.t.push(stored.t[i]);
    out.o.push(stored.o[i]);
    out.h.push(stored.h[i]);
    out.l.push(stored.l[i]);
    out.c.push(stored.c[i]);
  }
  out.t.push(...recent.t);
  out.o.push(...recent.o);
  out.h.push(...recent.h);
  out.l.push(...recent.l);
  out.c.push(...recent.c);
  return out;
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
