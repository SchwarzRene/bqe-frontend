// Stubs and builders shared by the commodity-price tests.

import { vi } from "vitest";
import { handlePrices } from "../../worker/prices";
import { type Instrument } from "../../worker/prices/store";

export const OFF = { kind: "refresh" as const }; // the backfill has its own tests

export const date = (i: number) => new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10);

export const TEST: Instrument[] = [
  ...["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD", "XTIUSD", "XBRUSD", "XNGUSD"].map((symbol, i) => ({
    symbol, name: symbol, group: i < 4 ? "metals" : "energy", yahoo: `T${i}=F`, unit: "USD", decimals: symbol === "XNGUSD" ? 3 : 2,
  })),
];

export const NOW = Date.parse("2026-10-20T13:05:12Z"); // a Tuesday, 09:05 in New York

/** A year of daily bars ending the day before `now`, price rising 1 a day from `base`. */
export function yahooBody(base: number, now = NOW) {
  const end = Math.floor(now / 86_400_000) * 86_400; // today 00:00 UTC, seconds
  const n = 255;
  const timestamp = Array.from({ length: n }, (_, i) => end - (n - i) * 86_400 + 4 * 3600); // 04:00 UTC, so GMT-4 keeps the date
  const c = timestamp.map((_, i) => base + i);
  return {
    chart: {
      result: [{
        meta: { gmtoffset: -14_400, regularMarketPrice: base + n + 2, regularMarketTime: Math.floor(now / 1000) - 60 },
        timestamp,
        indicators: { quote: [{ open: c, high: c.map((v) => v + 2), low: c.map((v) => v - 2), close: c }] },
      }],
    },
  };
}

export function yahoo(failing: string[] = []) {
  const calls: string[] = [];
  const f = vi.fn(async (input: any) => {
    const url = String(input);
    calls.push(url);
    const ticker = decodeURIComponent(url.match(/chart\/([^?]+)/)![1]);
    if (failing.includes(ticker)) return new Response("nope", { status: 404 });
    return new Response(JSON.stringify(yahooBody(1000 + 100 * Number(ticker[1]))), { status: 200 });
  });
  return { fetch: f as unknown as typeof fetch, calls };
}

export const get = (env: any, query = "", now = NOW) =>
  handlePrices(new Request(`https://x.test/api/commodities/prices${query}`), env, now, TEST);

export const H3 = 3 * 3_600_000, DAY = 86_400_000;

/** Weekdays (YYYY-MM-DD) from `from` to `to`, inclusive. */
export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    const dow = new Date(t).getUTCDay();
    if (dow >= 1 && dow <= 5) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** The delta-encoded body Dukascopy sends, for daily candles that open three hours before their date. */
export function encode(days: string[], price: (i: number) => number, multiplier = 0.001) {
  const open = (d: string) => Date.parse(`${d}T00:00:00Z`) - H3;
  const u = (i: number) => Math.round(price(i) / multiplier);
  const col = (f: (i: number) => number) => days.map((_, i) => (i === 0 ? 0 : f(i) - f(i - 1)));
  return {
    timestamp: open(days[0]) - DAY, shift: DAY, multiplier,
    open: price(0), high: price(0) + 2, low: price(0) - 2, close: price(0),
    times: days.map((d, i) => (i === 0 ? 1 : Math.round((open(d) - open(days[i - 1])) / DAY))),
    opens: col(u), highs: col((i) => u(i) + 2000), lows: col((i) => u(i) - 2000), closes: col(u),
    volumes: days.map(() => 1000),
  };
}

export const GOLD: Instrument = { symbol: "XAUUSD", name: "Gold", group: "metals", yahoo: "GC=F", unit: "USD/oz", dukascopy: "XAU-USD", since: 2024 };

export const OIL: Instrument = { symbol: "XTIUSD", name: "WTI", group: "energy", yahoo: "CL=F", unit: "USD/bbl", dukascopy: "LIGHT.CMD-USD", since: 2025 };

export const CORN: Instrument = { symbol: "CORN", name: "Corn", group: "softs", yahoo: "ZC=F", unit: "US cents/bu", since: 2025 };

export const MIX = [GOLD, OIL, CORN];

/** Dukascopy and Yahoo stubbed: a rising price per instrument, bars on every weekday of the year asked for. */
export function feeds(failing: string[] = []) {
  const calls: string[] = [];
  const base: Record<string, number> = { "XAU-USD": 2000, "LIGHT.CMD-USD": 70, "ZC=F": 450 };
  const f = vi.fn(async (input: any) => {
    const url = String(input);
    calls.push(url);
    if (failing.some((k) => url.includes(k))) return new Response("", { status: 503 });
    if (url.includes("dukascopy")) {
      const [, code, year] = url.match(/day\/([^/]+)\/BID(?:\/(\d{4})|\?from=(\d+))?/)!.slice(0, 3).concat([]) as string[];
      const y = Number(year ?? new Date(Number(url.split("from=")[1]) + 1000).getUTCFullYear());
      if (y < 2025 && code === "LIGHT.CMD-USD") return new Response("", { status: 404 });
      return new Response(JSON.stringify(encode(weekdays(`${y}-01-01`, `${y}-12-31`), (i) => (base[code] ?? 100) + i)));
    }
    const ticker = decodeURIComponent(url.match(/chart\/([^?]+)/)![1]);
    const p1 = Number(url.match(/period1=(\d+)/)?.[1] ?? Date.UTC(2025, 9, 20) / 1000);
    const p2 = Number(url.match(/period2=(\d+)/)?.[1] ?? Date.UTC(2026, 9, 20) / 1000);
    const days = weekdays(new Date(p1 * 1000).toISOString().slice(0, 10), new Date((p2 - 1) * 1000).toISOString().slice(0, 10));
    const c = days.map((_, i) => (base[ticker] ?? 100) + i);
    return new Response(JSON.stringify({
      chart: { result: [{
        meta: { gmtoffset: 0, regularMarketPrice: c.at(-1)! + 1, regularMarketTime: Math.floor(NOW / 1000) },
        timestamp: days.map((d) => Date.parse(`${d}T12:00:00Z`) / 1000),
        indicators: { quote: [{ open: c, high: c.map((v) => v + 2), low: c.map((v) => v - 2), close: c }] },
      }] },
    }));
  });
  return { fetch: f as unknown as typeof fetch, calls };
}
