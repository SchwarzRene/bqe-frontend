// Commodity prices: GET /api/commodities/prices against a real SQLite database.

import { afterEach, describe, expect, it, vi } from "vitest";
import { d1 } from "../helpers/d1";
import { handlePrices, pricesTick } from "../../worker/prices";
import { type Instrument } from "../../worker/prices/store";
import { OFF, TEST, NOW, yahoo, get } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

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
