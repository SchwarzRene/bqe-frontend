// Commodity prices: the year-archive backfill.

import { afterEach, describe, expect, it, vi } from "vitest";
import { d1 } from "../helpers/d1";
import { type Bar } from "../../worker/prices/indicators";
import { handlePrices, pricesTick } from "../../worker/prices";
import { INSTRUMENTS } from "../../worker/prices/store";
import { OFF, TEST, NOW, yahoo, weekdays, encode, GOLD, OIL, CORN, MIX, feeds } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

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
