// Commodity prices: the cron job against a real SQLite database, with Yahoo stubbed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { d1 } from "../helpers/d1";
import { isPricesRun, pricesTick, slotKind } from "../../worker/prices";
import { INSTRUMENTS } from "../../worker/prices/store";
import { OFF, TEST, NOW, yahooBody, yahoo, get, weekdays } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

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
