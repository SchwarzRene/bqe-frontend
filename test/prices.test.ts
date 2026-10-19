// The commodity prices job and endpoint: indicators against a hand-computed
// fixture, then the cron and GET /api/commodities/prices against a real SQLite
// database (the D1 shim), with Yahoo stubbed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { d1 } from "./d1";
import { analyse, atr, type Bar, breakout, highN, isStale, lowN, sma, weekdaysSince } from "../worker/prices/indicators";
import { handlePrices, isPricesRun, pricesTick } from "../worker/prices";
import { INSTRUMENTS, type Instrument } from "../worker/prices/store";
import { parseChart } from "../worker/prices/yahoo";

afterEach(() => vi.unstubAllGlobals());

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

  it("stale: an old bar, or an old fetch on a weekday", () => {
    const wed = Date.parse("2026-10-21T14:00:00Z");
    expect(weekdaysSince("2026-10-16", "2026-10-19")).toBe(1); // Fri -> Mon
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
  it("refreshes five at a time round-robin and rebuilds the snapshot", async () => {
    const env: any = { DB: d1() };
    const y = yahoo();
    expect(await pricesTick(env, NOW, TEST, y.fetch)).toBe("5/5 refreshed");
    expect(y.calls).toHaveLength(5);
    expect((await get(env)).status).toBe(200);
    let body: any = await (await get(env)).json();
    expect(body.instruments.map((i: any) => i.ok)).toEqual([true, true, true, true, true, false, false]);

    // 5 + 2 wrap around to the start: XAUUSD and XAGUSD again
    expect(await pricesTick(env, NOW + 20 * 60_000, TEST, y.fetch)).toBe("5/5 refreshed");
    expect(y.calls.slice(5).map((u) => decodeURIComponent(u.match(/chart\/([^?]+)/)![1]))).toEqual(["T5=F", "T6=F", "T0=F", "T1=F", "T2=F"]);
    body = await (await get(env)).json();
    expect(body.instruments.every((i: any) => i.ok)).toBe(true);
  });

  it("a failed instrument keeps its data with ok:false; the others and the endpoint are fine", async () => {
    const env: any = { DB: d1() };
    await pricesTick(env, NOW, TEST, yahoo().fetch);
    await pricesTick(env, NOW + 15 * 60_000, TEST, yahoo().fetch);
    const before: any = ((await (await get(env)).json()) as any).instruments[0];

    // the third tick takes T3 T4 T5 T6 T0
    const later = NOW + 30 * 60_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await pricesTick(env, later, TEST, yahoo(["T0=F"]).fetch);
    expect(out).toContain("failed: XAUUSD");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("prices: fetch failed for T0=F (status 404)"));
    warn.mockRestore();

    const res = await get(env, "", later);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    const gold = body.instruments.find((i: any) => i.symbol === "XAUUSD");
    expect(gold.ok).toBe(false);
    expect(gold.last).toBe(before.last); // the data is the previous data
    expect(gold.sma200).not.toBeNull();
    expect(body.instruments.filter((i: any) => i.ok)).toHaveLength(6);
  });

  it("an instrument that never worked is ok:false with nulls", async () => {
    const env: any = { DB: d1() };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await pricesTick(env, NOW, TEST, yahoo(["T2=F"]).fetch);
    const body: any = await (await get(env)).json();
    const bad = body.instruments[2];
    expect(bad).toMatchObject({ ok: false, stale: true, fetchedAt: null, last: null, sma200: null, atr20: null });
  });

  it("computes the levels from the stored bars", async () => {
    const env: any = { DB: d1() };
    await pricesTick(env, NOW, TEST, yahoo().fetch);
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
    await pricesTick(env, NOW, TEST, f as any); // XAU..XPD, XTI
    await pricesTick(env, NOW + 15 * 60_000, TEST, f as any); // XBR, XNG, ...
    const ng = ((await (await get(env)).json()) as any).instruments.find((i: any) => i.symbol === "XNGUSD");
    expect(ng.last).toBe(2.123);
  });

  it("only runs when due: weekdays, Saturday morning, never Sunday", () => {
    expect(isPricesRun(Date.parse("2026-10-20T13:05:00Z"))).toBe(true); // Tue
    expect(isPricesRun(Date.parse("2026-10-24T11:05:00Z"))).toBe(true); // Sat 07:05 ET
    expect(isPricesRun(Date.parse("2026-10-24T11:35:00Z"))).toBe(true); // Sat 07:35, third tick of 15
    expect(isPricesRun(Date.parse("2026-10-24T11:50:00Z"))).toBe(false); // a fourth tick is not needed
    expect(isPricesRun(Date.parse("2026-10-24T15:05:00Z"))).toBe(false); // Sat afternoon
    expect(isPricesRun(Date.parse("2026-10-25T13:05:00Z"))).toBe(false); // Sun
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
    await pricesTick(env, NOW, TEST, yahoo().fetch);
    await pricesTick(env, NOW + 15 * 60_000, TEST, yahoo().fetch);
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
    for (let k = 0; k < 3; k++) await pricesTick(env, NOW + k * 15 * 60_000, fifteen, yahoo().fetch);
    const res = await handlePrices(new Request("https://x.test/api/commodities/prices"), env, NOW, fifteen);
    const text = await res.text();
    expect(JSON.parse(text).instruments).toHaveLength(15);
    expect(text.length).toBeLessThan(50_000);
  });
});
