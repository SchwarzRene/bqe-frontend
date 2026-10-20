// Commodity prices: choosing and switching the source (Yahoo or Dukascopy), and the Dukascopy probe.

import { describe, expect, it } from "vitest";
import { d1 } from "../helpers/d1";
import { handlePrices, pricesTick } from "../../worker/prices";
import { firstYear, INSTRUMENTS, sourceFor } from "../../worker/prices/store";
import { PROBE_KEY, probeOne, VARIANTS } from "../../worker/prices/probe";
import { OFF, NOW, yahoo, GOLD, OIL, CORN, MIX, feeds } from "./fixtures";

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

  it("sugar is on Yahoo's #11 (cents a pound), and what Dukascopy's white sugar wrote is cleared once", async () => {
    const sugar = INSTRUMENTS.find((i) => i.symbol === "SUGAR")!;
    expect(sugar.dukascopy).toBeUndefined();
    expect(sourceFor(sugar, { PRICES_SOURCE: "dukascopy" })).toBe("yahoo");
    expect(sugar.unit).toBe("US cents/lb");
    const db = d1();
    db.raw.prepare("INSERT INTO documents (key, body, updated) VALUES ('prices:source', '\"dukascopy\"', 'x'), ('prices:entry:SUGAR', '{\"last\":546.75}', 'x'), ('prices:years:SUGAR:2024', '[]', 'x'), ('prices:entry:CORN', '{}', 'x')").run();
    const env: any = { DB: db, PRICES_SOURCE: "dukascopy" };
    expect(await pricesTick(env, NOW, [sugar, CORN], feeds().fetch, OFF)).toBe("moved to yahoo: SUGAR cleared");
    expect(keys(db, "prices:entry:%")).toEqual(["prices:entry:CORN"]);
    expect(keys(db, "prices:years:SUGAR:%")).toEqual([]);
    expect(await pricesTick(env, NOW + 3_600_000, [sugar, CORN], feeds().fetch, OFF)).toContain("refreshed"); // only once
  });
});
