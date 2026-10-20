// Commodity prices: the Dukascopy client and refreshing from it.

import { afterEach, describe, expect, it, vi } from "vitest";
import { d1 } from "../helpers/d1";
import { handlePrices, pricesTick } from "../../worker/prices";
import { chartOf, fetchRecent, fetchYear, parseCandles } from "../../worker/prices/dukascopy";
import { OFF, NOW, yahoo, weekdays, encode, CORN, MIX, feeds } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

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
