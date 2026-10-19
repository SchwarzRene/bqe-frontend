// Yahoo's chart endpoint for the commodity futures: one request per ticker,
// a year of daily bars plus the live price. Completed bars only — today's
// partial bar is dropped here and reported as `last` instead.

import type { Bar } from "./indicators";

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const USER_AGENT = "Mozilla/5.0 (compatible; bqe-frontend/1.0; +https://github.com/SchwarzRene/bqe-frontend)";
const TIMEOUT_MS = 10_000;

export class PriceFetchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface Chart {
  bars: Bar[];
  last: number | null;
  lastAt: string | null;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The completed daily bars and live price from a chart response. Bars with a
 * null in any of open/high/low/close (holidays) are dropped, and so is the
 * bar of the exchange's current date: it is still being formed.
 */
export function parseChart(body: any, now = Date.now()): Chart {
  const result = body?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const stamps: unknown = result?.timestamp;
  if (!result || !quote || !Array.isArray(stamps)) throw new PriceFetchError("no chart data");

  const offset = num(result.meta?.gmtoffset) ? result.meta.gmtoffset : 0;
  const day = (seconds: number) => new Date((seconds + offset) * 1000).toISOString().slice(0, 10);
  const today = day(now / 1000);

  const byDate = new Map<string, Bar>();
  stamps.forEach((t, i) => {
    const o = quote.open?.[i], h = quote.high?.[i], l = quote.low?.[i], c = quote.close?.[i];
    if (!num(t) || !num(o) || !num(h) || !num(l) || !num(c)) return;
    const date = day(t);
    if (date >= today) return;
    byDate.set(date, [date, o, h, l, c]);
  });
  const bars = [...byDate.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const price = result.meta?.regularMarketPrice;
  const at = result.meta?.regularMarketTime;
  return {
    bars,
    last: num(price) ? price : null,
    lastAt: num(at) ? new Date(at * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") : null,
  };
}

/** One chart request: query1, then query2 when that fails. Throws PriceFetchError. */
async function request(ticker: string, query: string, fetcher: typeof fetch, now: number): Promise<Chart> {
  let failure = new PriceFetchError("no host tried");
  for (const host of HOSTS) {
    try {
      const res = await fetcher(`${host}/v8/finance/chart/${encodeURIComponent(ticker)}?${query}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        failure = new PriceFetchError(`status ${res.status}`, res.status);
        continue;
      }
      const chart = parseChart(await res.json(), now);
      if (!chart.bars.length) {
        failure = new PriceFetchError("no completed bars");
        continue;
      }
      return chart;
    } catch (err) {
      failure = err instanceof PriceFetchError ? err : new PriceFetchError(String(err));
    }
  }
  throw failure;
}

/** The last year of daily bars and the live price. */
export function fetchChart(ticker: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Chart> {
  return request(ticker, "range=1y&interval=1d", fetcher, now);
}

/** The completed bars of one past calendar year, for the backfill. */
export async function fetchYahooYear(ticker: string, year: number, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Bar[]> {
  const query = `period1=${Date.UTC(year, 0, 1) / 1000}&period2=${Date.UTC(year + 1, 0, 1) / 1000}&interval=1d`;
  try {
    return (await request(ticker, query, fetcher, now)).bars.filter((b) => b[0].startsWith(`${year}-`));
  } catch (err) {
    // A year before the ticker existed: Yahoo answers 404 or an empty chart.
    if (err instanceof PriceFetchError && (err.status === 404 || err.message === "no completed bars" || err.message === "no chart data")) return [];
    throw err;
  }
}
