// The commodity prices job and endpoint: indicators against a hand-computed
// fixture, then the cron and GET /api/commodities/prices against a real SQLite
// database (the D1 shim), with Yahoo stubbed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { d1 } from "./d1";
import { analyse, atr, atrSeries, swings, trendState, type Bar, breakout, highN, isStale, lowN, sma, weekdaysSince } from "../worker/prices/indicators";
import { handlePrices, isPricesRun, pricesTick, slotKind } from "../worker/prices";
import { firstYear, INSTRUMENTS, type Instrument, sourceFor } from "../worker/prices/store";
import { parseChart } from "../worker/prices/yahoo";

afterEach(() => vi.unstubAllGlobals());

const OFF = { kind: "refresh" as const }; // the backfill has its own tests

// 30 bars: close = 100 + i, high = close + 2, low = close - 2, open = close.
// Every true range is max(4, 3, 1) = 4, so ATR is exactly 4 whatever the seed.
const date = (i: number) => new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10);
const line: Bar[] = Array.from({ length: 30 }, (_, i) => [date(i), 100 + i, 102 + i, 98 + i, 100 + i]);

describe("indicators", () => {
  it("highN and lowN cover the last N bars, the latest included", () => {
    expect(highN(line, 10)).toBe(131); // bar 29: 129 + 2
    expect(lowN(line, 10)).toBe(118); // bar 20: 120 - 2 ... 98 + 20
    expect(highN(line, 20)).toBe(131);
    expect(lowN(line, 20)).toBe(108); // bar 10
    expect(lowN(line, 30)).toBe(98);
  });

  it("sma is the mean of the last N closes, null without N bars", () => {
    expect(sma(line, 5)).toBe(127); // 125..129
    expect(sma(line, 30)).toBe(114.5);
    expect(sma(line, 50)).toBeNull();
  });

  it("atr is Wilder's: a mean of the first 20 true ranges, then smoothed", () => {
    expect(atr(line, 20)).toBe(4);
    expect(atr(line.slice(0, 20), 20)).toBeNull(); // 20 bars give 19 true ranges
    expect(atr(line.slice(0, 21), 20)).toBe(4); // 20 true ranges: just the seed
    // A 22nd bar with TR = 24 (h 130, l 106 around prev close 120): (4 * 19 + 24) / 20 = 5
    const wide: Bar[] = [...line.slice(0, 21), [date(21), 121, 130, 106, 121]];
    expect(atr(wide, 20)).toBe(5);
    // and one more calm bar (TR 4) smooths it back: (5 * 19 + 4) / 20 = 4.95
    expect(atr([...wide, [date(22), 121, 123, 119, 121]], 20)).toBeCloseTo(4.95, 10);
  });

  it("breakout compares the live price with the completed range", () => {
    expect(breakout(132, 131, 108)).toBe("up");
    expect(breakout(107, 131, 108)).toBe("down");
    expect(breakout(131, 131, 108)).toBe("none"); // equal is not a breakout
    expect(breakout(null, 131, 108)).toBeNull();
    expect(breakout(120, null, 108)).toBeNull();
  });

  it("analyse puts it together and returns null for what the history cannot support", () => {
    const a = analyse(line, 133);
    expect(a.lastBarDate).toBe(date(29));
    expect(a.levels).toMatchObject({ high10: 131, low10: 118, high20: 131, low20: 108, high52w: 131, low52w: 98 });
    expect(a.levels.high55).toBeNull();
    expect(a.atr20).toBe(4);
    expect(a.sma50).toBeNull();
    expect(a.sma200).toBeNull();
    expect(a.change.d1Pct).toBe(Math.round(((133 - 129) / 129) * 1e4) / 100); // 3.1
    expect(a.change.w1Pct).toBe(Math.round(((133 - 125) / 125) * 1e4) / 100); // 5 bars back = bar 25
    expect(a.change.m1Pct).toBe(Math.round(((133 - 109) / 109) * 1e4) / 100); // 21 bars back = bar 9
    expect(a.signals).toMatchObject({
      aboveSma50: null, aboveSma200: null, sma50AboveSma200: null,
      breakout20: "up", breakout55: null,
      distToHigh20InAtr: 0.5, // (133 - 131) / 4
      distToLow20InAtr: 6.25, // (133 - 108) / 4
    });
    expect(analyse(line, 105).signals.breakout20).toBe("down");
    expect(analyse(line, 120).signals.breakout20).toBe("none");
  });

  it("everything is null without a price or bars", () => {
    const a = analyse(line, null);
    expect(a.change).toEqual({ d1Pct: null, w1Pct: null, m1Pct: null });
    expect(a.signals.breakout20).toBeNull();
    expect(a.signals.distToHigh20InAtr).toBeNull();
    const none = analyse([], 100);
    expect(none.lastBarDate).toBeNull();
    expect(none.levels.high52w).toBeNull();
    expect(none.atr20).toBeNull();
  });

  it("long series: sma200 and the 52-week window", () => {
    const long: Bar[] = Array.from({ length: 300 }, (_, i) => [date(i), 100 + i, 102 + i, 98 + i, 100 + i]);
    const a = analyse(long, 400);
    expect(a.sma50).toBe(374.5); // closes 350..399 (bars 250..299)
    expect(a.sma200).toBe(299.5); // closes 200..399 (bars 100..299)
    expect(a.levels.low52w).toBe(98 + 48); // last 252 bars start at index 48
    expect(a.signals).toMatchObject({ aboveSma50: true, aboveSma200: true, sma50AboveSma200: true });
  });

  // A zigzag through the given [index, close] points, linear in between; high = close + 1, low = close - 1.
  const zigzag = (points: [number, number][]): Bar[] => {
    const out: Bar[] = [];
    for (let i = points[0][0]; i <= points.at(-1)![0]; i++) {
      const k = points.findIndex(([x]) => x >= i);
      const [x1, y1] = points[k], [x0, y0] = k ? points[k - 1] : points[k];
      const c = x1 === x0 ? y1 : y0 + ((y1 - y0) * (i - x0)) / (x1 - x0);
      out.push([date(i), c, c + 1, c - 1, c]);
    }
    return out;
  };

  it("structure: swing points and trendState for an up-trend, a down-trend and a range", () => {
    // peaks at 6 and 18, troughs at 12 and 24; 30 is too close to the end to be a swing
    const up = analyse(zigzag([[0, 100], [6, 110], [12, 104], [18, 114], [24, 107], [30, 118]]), 118).structure;
    expect(up).toMatchObject({
      trendState: "up",
      lastSwingHigh: { date: date(18), price: 115 }, prevSwingHigh: { date: date(6), price: 111 },
      lastSwingLow: { date: date(24), price: 106 }, prevSwingLow: { date: date(12), price: 103 },
    });
    const down = analyse(zigzag([[0, 120], [6, 110], [12, 116], [18, 106], [24, 112], [30, 102]]), 102).structure;
    expect(down.trendState).toBe("down");
    expect(down.lastSwingLow).toEqual({ date: date(18), price: 105 });
    const range = analyse(zigzag([[0, 100], [6, 110], [12, 104], [18, 114], [24, 100], [30, 108]]), 108).structure;
    expect(range.trendState).toBe("range"); // higher high, lower low
    // a plain line has no swings at all
    expect(analyse(line, 130).structure).toMatchObject({ trendState: null, lastSwingHigh: null, prevSwingLow: null });
    // strict: a flat top is no swing
    expect(swings(zigzag([[0, 100], [3, 100], [4, 100], [10, 90]]), "high")).toEqual([]);
    expect(trendState([], [])).toBeNull();
  });

  it("structure: distance to the 50-day average, in ATRs", () => {
    const long: Bar[] = Array.from({ length: 300 }, (_, i) => [date(i), 100 + i, 102 + i, 98 + i, 100 + i]);
    expect(analyse(long, 400).structure.distToSma50InAtr).toBe(6.38); // (400 - 374.5) / 4 = 6.375
    expect(analyse(line, 130).structure.distToSma50InAtr).toBeNull(); // no sma50
  });

  it("structure: days since a 55-bar breakout, and its direction", () => {
    const flat: Bar[] = Array.from({ length: 60 }, (_, i) => [date(i), 100, 101, 99, 100]);
    const up: Bar[] = [...flat, [date(60), 100, 106, 100, 105], ...[61, 62, 63].map((i): Bar => [date(i), 104, 105, 103, 104])];
    expect(analyse(up, 104).structure).toMatchObject({ daysSinceBreakout55: 3, breakout55Dir: "up" });
    const down: Bar[] = [...flat, [date(60), 100, 100, 93, 94]];
    expect(analyse(down, 94).structure).toMatchObject({ daysSinceBreakout55: 0, breakout55Dir: "down" });
    expect(analyse(flat, 100).structure).toMatchObject({ daysSinceBreakout55: null, breakout55Dir: null });
    expect(analyse(line, 130).structure.breakout55Dir).toBeNull(); // 30 bars: no 55-bar prior
  });

  it("structure: ATR percentile and volatility regime", () => {
    expect(atrSeries(line, 20).filter((v) => v !== null)).toHaveLength(10); // idx 20..29
    expect(analyse(line, 130).structure).toMatchObject({ atrPercentile1y: 1, volRegime: null }); // ten bars ago has no ATR yet
    const longer: Bar[] = Array.from({ length: 40 }, (_, i) => [date(i), 100 + i, 102 + i, 98 + i, 100 + i]);
    expect(analyse(longer, 140).structure).toMatchObject({ atrPercentile1y: 1, volRegime: "stable" }); // 4 vs 4
    const wide: Bar[] = [...line, [date(30), 130, 142, 118, 130]]; // TR 24 -> ATR 5, ten bars ago 4
    expect(analyse(wide, 130).structure).toMatchObject({ volRegime: "expanding", atrPercentile1y: 1 });
    const calm: Bar[] = [...wide, [date(31), 130, 132, 128, 130]]; // ATR (5 * 19 + 4) / 20 = 4.95
    // 11 of the 12 values (ten 4s, the 5, itself) are <= 4.95; ten bars ago it was 4: +23.75%
    expect(analyse(calm, 130).structure).toMatchObject({ volRegime: "expanding", atrPercentile1y: 0.92 });
    // a short history cannot say
    expect(analyse(line.slice(0, 15), 110).structure).toMatchObject({ atrPercentile1y: null, volRegime: null });
  });

  it("stale: an old bar, or an old fetch on a weekday", () => {
    const wed = Date.parse("2026-10-21T14:00:00Z");
    expect(weekdaysSince("2026-10-16", "2026-10-19")).toBe(1); // Fri -> Mon
    expect(weekdaysSince("2026-10-19", "2026-10-19")).toBe(0);
    expect(weekdaysSince("2026-10-21", "2026-10-19")).toBe(0);
    // the same as counting the days one by one, for every start and length over a few weeks
    for (let a = 0; a < 21; a++) for (let b = 0; b < 40; b++) {
      const from = new Date(Date.UTC(2026, 0, 1 + a)).toISOString().slice(0, 10), to = new Date(Date.UTC(2026, 0, 1 + a + b)).toISOString().slice(0, 10);
      let n = 0;
      for (let k = 1; k <= b; k++) { const dow = new Date(Date.UTC(2026, 0, 1 + a + k)).getUTCDay(); if (dow >= 1 && dow <= 5) n++; }
      expect(weekdaysSince(from, to)).toBe(n);
    }
    expect(isStale("2026-10-20", "2026-10-21T12:00:00Z", wed)).toBe(false);
    expect(isStale("2026-10-20", "2026-10-21T07:00:00Z", wed)).toBe(true); // 7 h old on a weekday
    expect(isStale("2026-10-15", "2026-10-21T13:00:00Z", wed)).toBe(true); // Thu bar: Fri Mon Tue Wed = 4
    expect(isStale("2026-10-16", "2026-10-21T13:00:00Z", wed)).toBe(false); // Mon Tue Wed = 3
    const sun = Date.parse("2026-10-25T14:00:00Z");
    expect(isStale("2026-10-23", "2026-10-24T11:00:00Z", sun)).toBe(false); // old fetch is fine at the weekend
    expect(isStale(null, null, wed)).toBe(true);
  });
});

describe("parseChart", () => {
  const day = 86_400;
  const t0 = Date.parse("2026-10-14T00:00:00Z") / 1000;
  const chart = (extra: any = {}) => ({
    chart: {
      result: [{
        meta: { gmtoffset: 0, regularMarketPrice: 4211.4, regularMarketTime: t0 + 6 * day + 3600, ...extra },
        timestamp: [t0, t0 + day, t0 + 2 * day, t0 + 3 * day],
        indicators: { quote: [{ open: [1, 2, null, 4], high: [2, 3, 3, 5], low: [0, 1, 1, 3], close: [1.5, 2.5, 2.5, 4.5] }] },
      }],
    },
  });

  it("drops null bars and the exchange's current day", () => {
    // "now" is 2026-10-17 (the fourth bar's day): that bar is still forming.
    const out = parseChart(chart(), Date.parse("2026-10-17T15:00:00Z"));
    expect(out.bars.map((b) => b[0])).toEqual(["2026-10-14", "2026-10-15"]); // the null bar went too
    expect(out.last).toBe(4211.4);
    expect(out.lastAt).toBe("2026-10-20T01:00:00Z");
    // the next day it is complete
    expect(parseChart(chart(), Date.parse("2026-10-18T15:00:00Z")).bars).toHaveLength(3);
  });

  it("uses the exchange's date, and throws on a body without data", () => {
    // GMT-4: 20:00 UTC on the 16th is still the 16th; a bar stamped 00:00 UTC on the 17th is the 16th local.
    const out = parseChart(chart({ gmtoffset: -14_400 }), Date.parse("2026-10-17T12:00:00Z"));
    expect(out.bars[0][0]).toBe("2026-10-13");
    expect(() => parseChart({ chart: { result: null } })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// the job and the endpoint
// ---------------------------------------------------------------------------

const TEST: Instrument[] = [
  ...["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD", "XTIUSD", "XBRUSD", "XNGUSD"].map((symbol, i) => ({
    symbol, name: symbol, group: i < 4 ? "metals" : "energy", yahoo: `T${i}=F`, unit: "USD", decimals: symbol === "XNGUSD" ? 3 : 2,
  })),
];

const NOW = Date.parse("2026-10-20T13:05:12Z"); // a Tuesday, 09:05 in New York

/** A year of daily bars ending the day before `now`, price rising 1 a day from `base`. */
function yahooBody(base: number, now = NOW) {
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

function yahoo(failing: string[] = []) {
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

const get = (env: any, query = "", now = NOW) =>
  handlePrices(new Request(`https://x.test/api/commodities/prices${query}`), env, now, TEST);

describe("pricesTick", () => {
  it("refreshes three at a time round-robin and rebuilds the snapshot", async () => {
    const env: any = { DB: d1() };
    const y = yahoo();
    expect(await pricesTick(env, NOW, TEST, y.fetch, OFF)).toBe("3/3 refreshed");
    expect(y.calls).toHaveLength(3);
    let body: any = await (await get(env)).json();
    expect(body.instruments.map((i: any) => i.ok)).toEqual([true, true, true, false, false, false, false]);

    // 3 + 3 + 3 wraps around the 7 instruments: the third run takes XNGUSD, then XAUUSD and XAGUSD again
    await pricesTick(env, NOW + 30 * 60_000, TEST, y.fetch, OFF);
    expect(await pricesTick(env, NOW + 60 * 60_000, TEST, y.fetch, OFF)).toBe("3/3 refreshed");
    expect(y.calls.slice(6).map((u) => decodeURIComponent(u.match(/chart\/([^?]+)/)![1]))).toEqual(["T6=F", "T0=F", "T1=F"]);
    body = await (await get(env)).json();
    expect(body.instruments.every((i: any) => i.ok)).toBe(true);
  });

  it("a failed instrument keeps its data with ok:false; the others and the endpoint are fine", async () => {
    const env: any = { DB: d1() };
    await pricesTick(env, NOW, TEST, yahoo().fetch, OFF); // T0 T1 T2
    await pricesTick(env, NOW + 30 * 60_000, TEST, yahoo().fetch, OFF); // T3 T4 T5
    const before: any = ((await (await get(env)).json()) as any).instruments[0];

    // the third run takes T6 T0 T1
    const later = NOW + 60 * 60_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await pricesTick(env, later, TEST, yahoo(["T0=F"]).fetch, OFF);
    expect(out).toContain("failed: XAUUSD");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("prices: fetch failed for T0=F (status 404)"));
    warn.mockRestore();

    const res = await get(env, "", later);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    const gold = body.instruments.find((i: any) => i.symbol === "XAUUSD");
    expect(gold.ok).toBe(false);
    expect(gold.error).toBe("status 404"); // and the answer says why
    expect(before.error).toBeNull();
    expect(gold.last).toBe(before.last); // the data is the previous data
    expect(gold.sma200).not.toBeNull();
    expect(body.instruments.filter((i: any) => i.ok)).toHaveLength(6);
  });

  it("an instrument that never worked is ok:false with nulls", async () => {
    const env: any = { DB: d1() };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await pricesTick(env, NOW, TEST, yahoo(["T2=F"]).fetch, OFF);
    const body: any = await (await get(env)).json();
    const bad = body.instruments[2];
    expect(bad).toMatchObject({ ok: false, stale: true, fetchedAt: null, last: null, sma200: null, atr20: null });
    expect(bad.error).toBe("status 404");
  });

  it("computes the levels from the stored bars", async () => {
    const env: any = { DB: d1() };
    await pricesTick(env, NOW, TEST, yahoo().fetch, OFF);
    const g: any = ((await (await get(env)).json()) as any).instruments[0];
    // base 1000, 255 bars of close 1000..1254, last = 1257
    expect(g).toMatchObject({ symbol: "XAUUSD", ok: true, stale: false, last: 1257, lastBarDate: "2026-10-19", fetchedAt: "2026-10-20T13:05:12Z" });
    expect(g.levels).toMatchObject({ high10: 1256, low10: 1243, high20: 1256, low20: 1233, high55: 1256, low55: 1198, high52w: 1256, low52w: 1001 });
    expect(g.atr20).toBe(4);
    expect(g.sma50).toBe(1229.5); // closes 1205..1254
    expect(g.sma200).toBe(1154.5); // closes 1055..1254
    expect(g.signals).toMatchObject({ breakout20: "up", breakout55: "up", aboveSma200: true, sma50AboveSma200: true });
    expect(g.change.d1Pct).toBe(Math.round(((1257 - 1254) / 1254) * 1e4) / 100);
    expect(JSON.stringify(g).length).toBeLessThan(50_000 / 15);
  });

  it("rounds natural gas to three decimals", async () => {
    const env: any = { DB: d1() };
    const f = vi.fn(async () => {
      const b = yahooBody(2.5);
      b.chart.result[0].meta.regularMarketPrice = 2.123456;
      return new Response(JSON.stringify(b), { status: 200 });
    });
    for (let k = 0; k < 3; k++) await pricesTick(env, NOW + k * 30 * 60_000, TEST, f as any, OFF); // ... XNGUSD is the seventh
    const ng = ((await (await get(env)).json()) as any).instruments.find((i: any) => i.symbol === "XNGUSD");
    expect(ng.last).toBe(2.123);
  });

  it("only runs when due: weekdays, Saturday morning, never Sunday", () => {
    expect(isPricesRun(Date.parse("2026-10-20T13:05:00Z"))).toBe(true); // Tue
    expect(isPricesRun(Date.parse("2026-10-24T11:05:00Z"))).toBe(true); // Sat 07:05 ET
    expect(isPricesRun(Date.parse("2026-10-24T13:35:00Z"))).toBe(true); // Sat 09:35 ET: the last hour of 3 (15 instruments, 6 an hour)
    expect(isPricesRun(Date.parse("2026-10-24T14:05:00Z"))).toBe(false); // Sat 10:05 ET
    expect(isPricesRun(Date.parse("2026-10-24T09:05:00Z"))).toBe(false); // Sat 05:05 ET
    expect(isPricesRun(Date.parse("2026-10-25T13:05:00Z"))).toBe(false); // Sun
  });

  it("the run alternates between refreshing and backfilling", () => {
    expect(["05", "20", "35", "50"].map((m) => slotKind(Date.parse(`2026-10-20T13:${m}:00Z`)))).toEqual(["refresh", "backfill", "refresh", "backfill"]);
  });

  it("the config lists the 15 instruments, each with a unique symbol and ticker", () => {
    expect(INSTRUMENTS).toHaveLength(15);
    expect(new Set(INSTRUMENTS.map((i) => i.symbol)).size).toBe(15);
    expect(new Set(INSTRUMENTS.map((i) => i.yahoo)).size).toBe(15);
  });
});

describe("GET /api/commodities/prices", () => {
  async function loaded() {
    const env: any = { DB: d1() };
    await pricesTick(env, NOW, TEST, yahoo().fetch, OFF);
    await pricesTick(env, NOW + 15 * 60_000, TEST, yahoo().fetch, OFF);
    return env;
  }

  it("is public JSON with the cache and CORS headers", async () => {
    const res = await get(await loaded());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body: any = await res.json();
    expect(Object.keys(body)).toEqual(["generatedAt", "source", "instruments"]);
    expect(body.instruments).toHaveLength(7);
    expect(body.instruments[0].closes).toBeUndefined();
  });

  it("history=1 adds the daily closes", async () => {
    const body: any = await (await get(await loaded(), "?history=1")).json();
    const closes = body.instruments[0].closes;
    expect(closes).toHaveLength(255);
    expect(closes.at(-1)).toEqual(["2026-10-19", 1254]);
  });

  it("symbol returns one instrument, an unknown one is a 404", async () => {
    const env = await loaded();
    const one: any = await (await get(env, "?symbol=xagusd&history=1")).json();
    expect(one.instruments.map((i: any) => i.symbol)).toEqual(["XAGUSD"]);
    expect(one.instruments[0].closes).toHaveLength(255);
    const res = await get(env, "?symbol=NOPE");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown symbol" });
  });

  it("recomputes stale when the cron has stopped", async () => {
    const env = await loaded();
    const hoursLater = NOW + 8 * 3_600_000; // still Tuesday in New York
    const body: any = await (await get(env, "", hoursLater)).json();
    expect(body.instruments.every((i: any) => i.stale)).toBe(true);
  });

  it("reads once and never reaches upstream", async () => {
    const env = await loaded();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const prepare = vi.spyOn(env.DB, "prepare");
    await get(env);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is a 503 before the first job, 405 for other methods", async () => {
    const env: any = { DB: d1() };
    expect((await get(env)).status).toBe(503);
    const post = await handlePrices(new Request("https://x.test/api/commodities/prices", { method: "POST" }), env, NOW, TEST);
    expect(post.status).toBe(405);
  });

  it("is under 50 KB for 15 instruments without history", async () => {
    const env: any = { DB: d1() };
    const fifteen: Instrument[] = Array.from({ length: 15 }, (_, i) => ({ symbol: `S${i}`, name: "n", group: "g", yahoo: `T${i}=F`, unit: "USD" }));
    for (let k = 0; k < 3; k++) await pricesTick(env, NOW + k * 15 * 60_000, fifteen, yahoo().fetch, OFF);
    const res = await handlePrices(new Request("https://x.test/api/commodities/prices"), env, NOW, fifteen);
    const text = await res.text();
    expect(JSON.parse(text).instruments).toHaveLength(15);
    expect(text.length).toBeLessThan(50_000);
  });
});

// ---------------------------------------------------------------------------
// Dukascopy, the backfill and the history ranges
// ---------------------------------------------------------------------------

import { chartOf, fetchRecent, fetchYear, parseCandles } from "../worker/prices/dukascopy";

const H3 = 3 * 3_600_000, DAY = 86_400_000;

/** Weekdays (YYYY-MM-DD) from `from` to `to`, inclusive. */
function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    const dow = new Date(t).getUTCDay();
    if (dow >= 1 && dow <= 5) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** The delta-encoded body Dukascopy sends, for daily candles that open three hours before their date. */
function encode(days: string[], price: (i: number) => number, multiplier = 0.001) {
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

describe("dukascopy", () => {
  it("decodes the delta-encoded candles and labels them with the trading day", () => {
    const days = ["2026-10-15", "2026-10-16", "2026-10-19"]; // Thu Fri Mon: the weekend is a gap in `times`
    const candles = parseCandles(encode(days, (i) => 4000 + i * 7.5));
    expect(candles.map((c) => c.bar)).toEqual([
      ["2026-10-15", 4000, 4002, 3998, 4000],
      ["2026-10-16", 4007.5, 4009.5, 4005.5, 4007.5],
      ["2026-10-19", 4015, 4017, 4013, 4015],
    ]);
    expect(parseCandles({ timestamp: 0, times: [] })).toEqual([]);
    expect(() => parseCandles({ times: [1] })).toThrow();
    expect(() => parseCandles({ ...encode(days, () => 1), highs: [1] })).toThrow(); // columns of different length
  });

  it("chartOf: completed days, the forming one as the price, no weekends or empty days", () => {
    const days = weekdays("2026-10-14", "2026-10-20"); // Wed..Tue
    const candles = parseCandles(encode(days, (i) => 100 + i));
    const chart = chartOf(candles, NOW); // Tue 13:05Z: Tuesday's candle (opened Mon 21:00Z) is still forming
    expect(chart.bars.map((b) => b[0])).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19"]);
    expect(chart.last).toBe(104); // Tuesday's close so far (the fifth weekday)
    expect(chart.lastAt).toBe("2026-10-20T13:05:12Z");
    // Saturday: the week is complete, the price is Friday's close, as of the candle's end
    const sat = chartOf(parseCandles(encode(days.slice(0, 3), (i) => 100 + i)), Date.parse("2026-10-17T10:00:00Z"));
    expect(sat.bars.map((b) => b[0])).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(sat.last).toBe(102);
    expect(sat.lastAt).toBe("2026-10-16T21:00:00Z");
    // a Sunday-evening candle and a zero-volume one are not trading days
    const body = encode(["2026-10-17", "2026-10-19"], (i) => 100 + i); // 17th is a Saturday label
    body.volumes = [500, 0];
    expect(chartOf(parseCandles(body), NOW).bars).toEqual([]);
  });

  it("asks for a completed year by path and the current one from January 1st", async () => {
    const urls: string[] = [];
    const f = (async (u: any) => (urls.push(String(u)), new Response(JSON.stringify({ timestamp: 0, times: [] })))) as unknown as typeof fetch;
    await fetchYear("XAU-USD", 2024, f, NOW);
    await fetchYear("XAU-USD", 2026, f, NOW);
    expect(urls).toEqual([
      "https://jetta.dukascopy.com/v1/candles/day/XAU-USD/BID/2024",
      `https://jetta.dukascopy.com/v1/candles/day/XAU-USD/BID?from=${Date.UTC(2026, 0, 1)}`,
    ]);
    // the first days of January reach back into last year
    urls.length = 0;
    await fetchRecent("XAU-USD", f, Date.parse("2027-01-04T10:00:00Z")).catch(() => {});
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("/BID/2026");
  });

  it("an answer that is not JSON says what it was, and asks the way a browser on dukascopy.com does", async () => {
    let init: any;
    const html = (async (_u: any, i: any) => ((init = i), new Response("<html>\n Just a moment...</html>", { headers: { "content-type": "text/html" } }))) as unknown as typeof fetch;
    await expect(fetchYear("X", 2001, html, NOW)).rejects.toThrow('dukascopy: not JSON (status 200, text/html, 31 bytes: <html> Just a moment...</html>)');
    // the host's bot filter answers 202 with nothing to anything that does not look like a browser (found with the probe)
    expect(init.headers["User-Agent"]).toContain("Chrome/");
    expect(init.headers.Referer).toBe("https://www.dukascopy.com/");
    expect(init.headers.Origin).toBe("https://www.dukascopy.com");
  });

  it("a 404 is an empty year, any other error is an error", async () => {
    expect(await fetchYear("X", 2001, (async () => new Response("", { status: 404 })) as any, NOW)).toEqual([]);
    await expect(fetchYear("X", 2001, (async () => new Response("", { status: 503 })) as any, NOW)).rejects.toThrow("status 503");
  });
});

const GOLD: Instrument = { symbol: "XAUUSD", name: "Gold", group: "metals", yahoo: "GC=F", unit: "USD/oz", dukascopy: "XAU-USD", since: 2024 };
const OIL: Instrument = { symbol: "XTIUSD", name: "WTI", group: "energy", yahoo: "CL=F", unit: "USD/bbl", dukascopy: "LIGHT.CMD-USD", since: 2025 };
const CORN: Instrument = { symbol: "CORN", name: "Corn", group: "softs", yahoo: "ZC=F", unit: "US cents/bu", since: 2025 };
const MIX = [GOLD, OIL, CORN];

/** Dukascopy and Yahoo stubbed: a rising price per instrument, bars on every weekday of the year asked for. */
function feeds(failing: string[] = []) {
  const calls: string[] = [];
  const base: Record<string, number> = { "XAU-USD": 2000, "LIGHT.CMD-USD": 70, "ZC=F": 450 };
  const f = vi.fn(async (input: any) => {
    const url = String(input);
    calls.push(url);
    if (failing.some((k) => url.includes(k))) return new Response("", { status: 503 });
    if (url.includes("dukascopy")) {
      const [, code, year] = url.match(/day\/([^/]+)\/BID(?:\/(\d{4})|\?from=(\d+))?/)!.slice(0, 3).concat([]) as string[];
      const y = Number(year ?? new Date(Number(url.split("from=")[1])).getUTCFullYear());
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

describe("refresh from Dukascopy", () => {
  it("fetches only this year, stores it as the archive's current year, and reports the source", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    const feed = feeds();
    await pricesTick(env, NOW, MIX, feed.fetch, OFF);
    expect(feed.calls.filter((u) => u.includes("dukascopy"))).toHaveLength(2);
    expect(feed.calls.every((u) => !u.includes("/2025"))).toBe(true);
    const body: any = await (await handlePrices(new Request("https://x.test/api/commodities/prices"), env, NOW, MIX)).json();
    expect(body.instruments.map((i: any) => [i.symbol, i.source, i.ok])).toEqual([["XAUUSD", "dukascopy", true], ["XTIUSD", "dukascopy", true], ["CORN", "yahoo", true]]);
    const gold = body.instruments[0];
    expect(gold.lastBarDate).toBe("2026-10-19");
    expect(gold.last).toBeGreaterThan(2000);
    const year = env.DB.raw.prepare("SELECT body FROM documents WHERE key = 'prices:years:XAUUSD:2026'").get();
    expect(JSON.parse(year.body).at(-1)[0]).toBe("2026-10-19"); // completed bars only
  });

  it("one failing source flags only that instrument", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await pricesTick(env, NOW, MIX, feeds(["LIGHT.CMD-USD"]).fetch, OFF);
    const body: any = await (await handlePrices(new Request("https://x.test/api/commodities/prices"), env, NOW, MIX)).json();
    expect(body.instruments.map((i: any) => i.ok)).toEqual([true, false, true]);
  });
});

describe("the backfill", () => {
  const history = async (env: any, q: string, instruments = MIX) =>
    handlePrices(new Request(`https://x.test/api/commodities/prices?${q}`), env, NOW, instruments);

  it("fetches a few year-files per run, newest first, one instrument after the other", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    const feed = feeds();
    const out = await pricesTick(env, NOW, MIX, feed.fetch, { kind: "backfill", files: 3 });
    expect(out).toContain("backfill: 3 years, 2 instruments to go"); // gold has 2024 left, corn (Yahoo) walks down to 2000
    const done = feed.calls.filter((u) => !u.includes("from=") && !u.includes("range=1y")).map((u) => u.replace(/^https:\/\/[^/]+/, "").slice(0, 60));
    expect(done[0]).toBe("/v1/candles/day/XAU-USD/BID/2025");
    expect(done[1]).toBe("/v1/candles/day/LIGHT.CMD-USD/BID/2025");
    expect(done[2]).toContain("ZC%3DF?period1="); // Yahoo's year for the corn
    // the next run goes a year further back for gold (since 2024), nothing more for the others
    await pricesTick(env, NOW + 15 * 60_000, MIX, feed.fetch, { kind: "backfill", files: 3 });
    expect(feed.calls.some((u) => u.endsWith("XAU-USD/BID/2024"))).toBe(true);
  });

  it("runs until every instrument reaches its first year, then stops fetching", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    const feed = feeds();
    const sunday = Date.parse("2026-10-25T13:00:00Z"); // no refresh on a Sunday: the backfill alone
    for (let k = 0; k < 4; k++) await pricesTick(env, sunday + k * 15 * 60_000, [GOLD, OIL], feed.fetch, { kind: "backfill", files: 3 });
    const files = feed.calls.length;
    expect(files).toBe(3); // gold 2025 2024, oil 2025 (oil starts in 2025)
    expect(await pricesTick(env, sunday + 3_600_000, [GOLD, OIL], feed.fetch, { kind: "backfill", files: 3 })).toBe("skipped");
    expect(feed.calls).toHaveLength(files);
    const snap: any = await (await history(env, "")).json();
    expect(snap.instruments.map((i: any) => i.historyComplete)).toEqual([true, true]);
  });

  it("a failed year is retried, not skipped; a 404 year counts as empty", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sunday = Date.parse("2026-10-25T13:00:00Z");
    const out = await pricesTick(env, sunday, [GOLD], feeds(["BID/2025"]).fetch, { kind: "backfill", files: 1 });
    expect(out).toContain("1 failed");
    const state = () => JSON.parse(env.DB.raw.prepare("SELECT body FROM documents WHERE key = 'prices:backfill'").get().body);
    expect(state().error).toBe("XAUUSD 2025: status 503"); // visible to whoever wonders why the archive is not filling
    const feed = feeds();
    expect(await pricesTick(env, sunday + 900_000, [GOLD], feed.fetch, { kind: "backfill", files: 1 })).toContain("1 years");
    expect(state().error).toBeUndefined(); // and gone once it works
    expect(feed.calls[0]).toContain("BID/2025"); // the same year again
    const oil = feeds();
    await pricesTick(env, sunday + 1_800_000, [{ ...OIL, since: 2024 }], oil.fetch, { kind: "backfill", files: 3 });
    await pricesTick(env, sunday + 2_700_000, [{ ...OIL, since: 2024 }], oil.fetch, { kind: "backfill", files: 3 });
    expect(oil.calls.filter((u) => u.includes("/2024"))).toHaveLength(1); // the 404 year was not retried
  });

  it("the archive answers from/to, days, years and ohlc", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    const feed = feeds();
    await pricesTick(env, NOW, MIX, feed.fetch, OFF); // this year's candles
    for (let k = 0; k < 5; k++) await pricesTick(env, NOW + (k + 1) * 15 * 60_000, MIX, feed.fetch, { kind: "backfill", files: 3 });

    const one: any = await (await history(env, "history=1&symbol=XAUUSD&from=2025-03-03&to=2025-03-07")).json();
    expect(one.range).toEqual({ from: "2025-03-03", to: "2025-03-07" });
    expect(one.instruments[0].closes.map((c: any) => c[0])).toEqual(["2025-03-03", "2025-03-04", "2025-03-05", "2025-03-06", "2025-03-07"]);

    const ohlc: any = await (await history(env, "history=1&symbol=XAUUSD&from=2025-03-03&to=2025-03-03&ohlc=1")).json();
    expect(ohlc.instruments[0].bars).toHaveLength(1);
    expect(ohlc.instruments[0].bars[0]).toHaveLength(5);
    expect(ohlc.instruments[0].closes).toBeUndefined();

    // the archive spans two calendar years here: 2024, 2025 and 2026
    const all: any = await (await history(env, "history=1&symbol=XAUUSD&from=2000-01-01")).json();
    const dates = all.instruments[0].closes.map((c: any) => c[0]);
    expect(dates[0]).toBe("2024-01-01");
    expect(dates.at(-1)).toBe("2026-10-19");
    expect([...dates].sort()).toEqual(dates);
    const days: any = await (await history(env, "history=1&symbol=XAUUSD&days=7")).json();
    expect(days.instruments[0].closes.length).toBeLessThanOrEqual(5);
    expect(days.instruments[0].closes.at(-1)[0]).toBe("2026-10-19");

    // without ?symbol= the range is limited to two calendar years
    const wide = await history(env, "history=1&from=2024-01-01");
    expect(wide.status).toBe(400);
    expect(((await wide.json()) as any).error).toContain("?symbol=");
    expect((await history(env, "history=1&from=2025-01-01&to=2026-01-31")).status).toBe(200);
    expect((await history(env, "history=1&from=nope")).status).toBe(400);
    expect((await history(env, "history=1&days=-3&symbol=CORN")).status).toBe(400);
    expect((await history(env, "history=1&from=2026-02-01&to=2026-01-01&symbol=CORN")).status).toBe(400);
    // the default history is still the recent window
    const dflt: any = await (await history(env, "history=1&symbol=CORN")).json();
    expect(dflt.range).toBeUndefined();
    expect(dflt.instruments[0].closes.length).toBeGreaterThan(200);
  });

  it("a run stays inside the free plan's 50 D1 queries and subrequests", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    const feed = feeds();
    const stub = vi.fn(async (input: any, init?: any) => {
      // every real instrument answers with a year of candles; Yahoo's from the shared stub
      if (String(input).includes("dukascopy")) return new Response(JSON.stringify(encode(weekdays("2026-01-01", "2026-12-31"), (i) => 100 + i)));
      return feed.fetch(input, init);
    });
    const prepare = vi.spyOn(env.DB, "prepare");
    await pricesTick(env, NOW, INSTRUMENTS, stub as any, { kind: "backfill", files: 3 });
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(50);
    expect(stub.mock.calls.length).toBeLessThanOrEqual(50);
  });

  it("steady state stays far below D1's free daily limits (100k rows written, 5M read)", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    const feed = feeds();
    const stub = vi.fn(async (input: any, init?: any) =>
      String(input).includes("dukascopy")
        ? new Response(JSON.stringify(encode(weekdays("2026-01-01", "2026-12-31"), (i) => 100 + i)))
        : feed.fetch(input, init));
    // the archive is complete: only the refresh is left
    await pricesTick(env, NOW, INSTRUMENTS, stub as any, OFF);
    const prepare = vi.spyOn(env.DB, "prepare");
    await pricesTick(env, NOW + 15 * 60_000, INSTRUMENTS, stub as any, OFF);
    const writes = prepare.mock.calls.filter(([sql]) => /^\s*INSERT/i.test(String(sql))).length;
    // 5 instruments x (recent window + current year) + cursor + snapshot; a written row costs two with its index
    expect(writes).toBeLessThanOrEqual(14);
    expect(96 * writes * 2).toBeLessThan(100_000 / 10); // a weekday of runs uses under a tenth of the day's writes
  });

  it("the key-prefix reads use the primary-key range, not LIKE (a LIKE scans the whole table)", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    const prepare = vi.spyOn(env.DB, "prepare");
    await pricesTick(env, NOW, TEST, yahoo().fetch, OFF);
    await handlePrices(new Request("https://x.test/api/commodities/prices?history=1"), env, NOW, TEST);
    expect(prepare.mock.calls.some(([sql]) => /LIKE/i.test(String(sql)))).toBe(false);
  });

  it("a history answer bigger than one request can serve is refused with a way forward", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    env.DB.raw.prepare("INSERT INTO documents (key, body, updated) VALUES ('prices:source', '\"dukascopy\"', 'x')").run(); // the archive below was written by Dukascopy
    // 40 years of a single instrument: 40 documents of ~13 KB
    for (let y = 1990; y < 2026; y++) {
      const bars = weekdays(`${y}-01-01`, `${y}-12-31`).map((d, i): Bar => [d, 100.12 + i, 102.55 + i, 98.34 + i, 101.01 + i]);
      env.DB.raw.prepare("INSERT INTO documents (key, body, updated) VALUES (?, ?, 'x')").run(`prices:years:XAUUSD:${y}`, JSON.stringify(bars));
    }
    await pricesTick(env, NOW, [GOLD], feeds().fetch, OFF);
    const res = await handlePrices(new Request("https://x.test/api/commodities/prices?history=1&symbol=XAUUSD&from=1990-01-01"), env, NOW, [GOLD]);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toContain("in pieces with from and to");
    const piece = await handlePrices(new Request("https://x.test/api/commodities/prices?history=1&symbol=XAUUSD&from=2015-01-01&to=2020-12-31"), env, NOW, [GOLD]);
    expect(piece.status).toBe(200);
  });

  it("the cursor moves on even when every fetch fails, so a bad instrument cannot stall the rotation", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = yahoo(["T0=F", "T1=F", "T2=F"]);
    await pricesTick(env, NOW, TEST, down.fetch, OFF);
    const ok = yahoo();
    await pricesTick(env, NOW + 30 * 60_000, TEST, ok.fetch, OFF);
    expect(ok.calls.map((u) => decodeURIComponent(u.match(/chart\/([^?]+)/)![1]))).toEqual(["T3=F", "T4=F", "T5=F"]);
  });

  it("backfill progress is saved file by file", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    const sunday = Date.parse("2026-10-25T13:20:00Z");
    // the second file's fetch blows up in a way the job does not catch, as a CPU cut-off would
    let n = 0;
    const feed = feeds();
    const f = (async (u: any, init?: any) => {
      if (++n === 2) throw new Error("killed");
      return feed.fetch(u, init);
    }) as typeof fetch;
    await pricesTick(env, sunday, [GOLD, OIL], f, { kind: "backfill", files: 2 }).catch(() => {});
    const state = JSON.parse(env.DB.raw.prepare("SELECT body FROM documents WHERE key = 'prices:backfill'").get().body);
    expect(state.next.XAUUSD).toBe(2024); // 2025 done and remembered
  });

  it("the recent window reaches into the archive until it is full", async () => {
    const env: any = { DB: d1(), PRICES_SOURCE: "dukascopy" };
    const feed = feeds();
    await pricesTick(env, Date.parse("2026-01-12T14:20:00Z"), [GOLD], feed.fetch, { kind: "backfill", files: 1 }); // 2025 into the archive
    await pricesTick(env, Date.parse("2026-01-12T14:35:00Z"), [GOLD], feed.fetch, OFF);
    const recent = JSON.parse(env.DB.raw.prepare("SELECT body FROM documents WHERE key = 'prices:bars:XAUUSD'").get().body);
    expect(recent.bars).toHaveLength(268); // 7 days of January and the 261 of 2025: all there is so far
    const entry = () => JSON.parse(env.DB.raw.prepare("SELECT body FROM documents WHERE key = 'prices:entry:XAUUSD'").get().body);
    expect(entry().sma200).not.toBeNull();
    expect(entry().structure.atrPercentile1y).not.toBeNull();
    // 2024 arrives; the next refresh fills the window
    await pricesTick(env, Date.parse("2026-01-12T14:50:00Z"), [GOLD], feed.fetch, { kind: "backfill", files: 1 });
    await pricesTick(env, Date.parse("2026-01-12T15:05:00Z"), [GOLD], feed.fetch, OFF);
    expect(JSON.parse(env.DB.raw.prepare("SELECT body FROM documents WHERE key = 'prices:bars:XAUUSD'").get().body).bars).toHaveLength(300);
  });
});

import { wallClock, ET } from "../worker/news/time";
import { newYorkWall } from "../worker/prices/indicators";

describe("newYorkWall", () => {
  it("agrees with Intl across two years, DST changes included", () => {
    let checked = 0;
    for (let ms = Date.parse("2025-01-01T00:00:00Z"); ms < Date.parse("2027-01-01T00:00:00Z"); ms += 37 * 60_000) {
      const a = newYorkWall(ms), b = wallClock(ms, ET);
      if (a.date !== b.date || a.weekday !== b.weekday || a.hour !== b.hour) throw new Error(`mismatch at ${new Date(ms).toISOString()}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      checked++;
    }
    expect(checked).toBeGreaterThan(28_000);
  });
});

describe("the source switch", () => {
  it("Yahoo is the default, even for instruments Dukascopy has", async () => {
    const env: any = { DB: d1() }; // PRICES_SOURCE unset
    const feed = feeds();
    await pricesTick(env, NOW, [GOLD, OIL], feed.fetch, OFF);
    expect(feed.calls.every((u) => u.includes("yahoo"))).toBe(true);
    const body: any = await (await handlePrices(new Request("https://x.test/api/commodities/prices"), env, NOW, [GOLD, OIL])).json();
    expect(body.instruments.map((i: any) => [i.source, i.ok])).toEqual([["yahoo", true], ["yahoo", true]]);
    expect(body.source).toContain("Yahoo");
    expect(body.source).not.toContain("Dukascopy");
  });

  it("the backfill then walks Yahoo's years, down to 2000", async () => {
    const env: any = { DB: d1() };
    const feed = feeds();
    const sunday = Date.parse("2026-10-25T13:20:00Z");
    await pricesTick(env, sunday, [GOLD], feed.fetch, { kind: "backfill" });
    await pricesTick(env, sunday + 900_000, [GOLD], feed.fetch, { kind: "backfill" });
    await pricesTick(env, sunday + 1_800_000, [GOLD], feed.fetch, { kind: "backfill" });
    expect(feed.calls).toHaveLength(3);
    expect(feed.calls.every((u) => u.includes("yahoo") && u.includes("period1="))).toBe(true);
    const state = JSON.parse(env.DB.raw.prepare("SELECT body FROM documents WHERE key = 'prices:backfill'").get().body);
    expect(state.next.XAUUSD).toBe(2022); // 2025, 2024, 2023 done; Dukascopy's `since: 2024` is not what limits it
    const snap: any = await (await handlePrices(new Request("https://x.test/api/commodities/prices"), env, NOW, [GOLD])).json();
    expect(snap.instruments[0].historyComplete).toBe(false);
  });

  it("PRICES_SOURCE=dukascopy turns the Dukascopy path on, for the instruments that have it", () => {
    expect(sourceFor(GOLD, { PRICES_SOURCE: "dukascopy" })).toBe("dukascopy");
    expect(sourceFor(CORN, { PRICES_SOURCE: "dukascopy" })).toBe("yahoo"); // not in Dukascopy's feed
    expect(sourceFor(GOLD, {})).toBe("yahoo");
    expect(sourceFor(GOLD, { PRICES_SOURCE: "nonsense" })).toBe("yahoo");
    expect(firstYear(GOLD, { PRICES_SOURCE: "dukascopy" })).toBe(2024);
    expect(firstYear(GOLD, {})).toBe(2000);
  });
});

import { PROBE_KEY, probeOne, VARIANTS } from "../worker/prices/probe";

describe("the Dukascopy probe", () => {
  const answer = (init: ResponseInit & { body?: string }) => (async () => new Response(init.body ?? "", init)) as unknown as typeof fetch;

  it("records what an empty page looks like", async () => {
    const r = await probeOne(VARIANTS[0], answer({ status: 200, headers: { "content-type": "text/html; charset=UTF-8", server: "nginx", "set-cookie": "a=b" } }));
    expect(r).toMatchObject({ name: "plain", status: 200, type: "text/html; charset=UTF-8", bytes: 0, head: "" });
    expect(r.headers).toEqual({ server: "nginx", "set-cookie": "(present)" });
  });

  it("records the start of a JSON body as text and of a binary one as hex, and a failure as an error", async () => {
    expect((await probeOne(VARIANTS[0], answer({ body: '{"timestamp":1735689600000,"multiplier":0.001}' }))).head).toBe('{"timestamp":1735689600000,"multiplier":0.001}');
    const bin = (async () => new Response(new Uint8Array([0x5d, 0x00, 0x00, 0x80, 0x00, 0xff, 0xfe, 0x01]))) as unknown as typeof fetch;
    expect((await probeOne(VARIANTS[6], bin)).head).toBe("5d 00 00 80 00 ff fe 01");
    const down = (async () => { throw new Error("connection reset"); }) as unknown as typeof fetch;
    expect((await probeOne(VARIANTS[0], down)).error).toContain("connection reset");
  });

  it("runs once on the first backfill slot after a deploy that asks for it, and not again", async () => {
    const env: any = { DB: d1(), PRICES_PROBE: "on" };
    const feed = feeds();
    const out = await pricesTick(env, Date.parse("2026-10-25T13:20:00Z"), [GOLD], answer({ status: 200, headers: { "content-type": "text/html" } }), { kind: "backfill" });
    expect(out).toContain("probe: plain -> 200 0B");
    const doc = JSON.parse(env.DB.raw.prepare("SELECT body FROM documents WHERE key = ?").get(PROBE_KEY).body);
    expect(doc.results).toHaveLength(VARIANTS.length);
    // the next backfill slot is a normal one
    const next = await pricesTick(env, Date.parse("2026-10-25T13:50:00Z"), [GOLD], feed.fetch, { kind: "backfill" });
    expect(next).toContain("backfill:");
    expect(feed.calls.every((u) => u.includes("yahoo"))).toBe(true);
  });

  it("is off unless asked for, and on demand when asked", async () => {
    const env: any = { DB: d1() };
    const feed = feeds();
    expect(await pricesTick(env, Date.parse("2026-10-25T13:20:00Z"), [GOLD], feed.fetch, { kind: "backfill" })).toContain("backfill:");
    expect(await pricesTick(env, Date.parse("2026-10-25T13:35:00Z"), [GOLD], answer({ status: 403 }), { probe: true })).toContain("probe: plain -> 403");
  });
});

describe("changing the source", () => {
  const read = (db: any, sql: string) => db.raw.prepare(sql).all() as any[];
  const keys = (db: any, like: string) => read(db, `SELECT key FROM documents WHERE key LIKE '${like}' ORDER BY key`).map((r) => r.key);

  it("clears the instruments that change source, keeps the others, and fills again from the new one", async () => {
    const db = d1();
    const feed = feeds();
    const sunday = Date.parse("2026-10-25T13:20:00Z");
    // written by Yahoo: gold and oil have a Dukascopy code, corn does not
    const yahooEnv: any = { DB: db };
    await pricesTick(yahooEnv, NOW, MIX, feed.fetch, OFF);
    await pricesTick(yahooEnv, sunday, MIX, feed.fetch, { kind: "backfill", files: 3 });
    expect(keys(db, "prices:entry:%")).toEqual(["prices:entry:CORN", "prices:entry:XAUUSD", "prices:entry:XTIUSD"]);
    expect(keys(db, "prices:years:XAUUSD:%").length).toBeGreaterThan(0);
    expect(keys(db, "prices:years:CORN:%").length).toBeGreaterThan(0);
    const cornEntry = read(db, "SELECT body FROM documents WHERE key = 'prices:entry:CORN'")[0].body;

    // switch
    const duka: any = { DB: db, PRICES_SOURCE: "dukascopy" };
    const out = await pricesTick(duka, NOW + 3_600_000, MIX, feed.fetch, OFF);
    expect(out).toBe("source yahoo -> dukascopy: 2 instruments cleared");
    expect(keys(db, "prices:entry:%")).toEqual(["prices:entry:CORN"]);
    expect(keys(db, "prices:years:XAUUSD:%")).toEqual([]);
    expect(keys(db, "prices:bars:XAUUSD")).toEqual([]);
    expect(keys(db, "prices:years:CORN:%").length).toBeGreaterThan(0);
    expect(read(db, "SELECT body FROM documents WHERE key = 'prices:entry:CORN'")[0].body).toBe(cornEntry);
    const state = JSON.parse(read(db, "SELECT body FROM documents WHERE key = 'prices:backfill'")[0].body);
    expect(state.next.XAUUSD).toBeUndefined();
    expect(state.next.CORN).toBeDefined();

    // and the next refresh writes the new source
    await pricesTick(duka, NOW + 2 * 3_600_000, MIX, feed.fetch, OFF);
    const gold = JSON.parse(read(db, "SELECT body FROM documents WHERE key = 'prices:entry:XAUUSD'")[0].body);
    expect(gold).toMatchObject({ source: "dukascopy", ok: true });
    // no more switching while it stays the same
    expect(await pricesTick(duka, NOW + 3 * 3_600_000, MIX, feed.fetch, OFF)).toContain("refreshed");
  });

  it("a fresh database just remembers the source", async () => {
    const db = d1();
    const env: any = { DB: db, PRICES_SOURCE: "dukascopy" };
    expect(await pricesTick(env, NOW, MIX, feeds().fetch, OFF)).toContain("refreshed"); // a normal first run
    expect(JSON.parse(read(db, "SELECT body FROM documents WHERE key = 'prices:source'")[0].body)).toBe("dukascopy");
  });

  it("switching back clears again", async () => {
    const db = d1();
    const feed = feeds();
    await pricesTick({ DB: db, PRICES_SOURCE: "dukascopy" } as any, NOW, [GOLD], feed.fetch, OFF);
    expect(keys(db, "prices:entry:%")).toEqual(["prices:entry:XAUUSD"]);
    expect(await pricesTick({ DB: db } as any, NOW + 3_600_000, [GOLD], feed.fetch, OFF)).toBe("source dukascopy -> yahoo: 1 instruments cleared");
    expect(keys(db, "prices:entry:%")).toEqual([]);
  });
});
