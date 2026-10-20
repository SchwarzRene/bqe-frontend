// The nightly stack-price job against a real SQLite database, with Wikipedia and Yahoo stubbed.
// The free plan gives a run 10 ms of CPU: the constituent list and the tickers never share a run,
// batches are small, and what a run was about to do is recorded before it does it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { d1 } from "../helpers/d1";
import { cached } from "../../worker/http";
import { refreshStack } from "../../worker/stack";

beforeEach(() => vi.setSystemTime(NIGHT));
afterEach(() => vi.unstubAllGlobals());

// The job refuses a Wikipedia table with fewer than 400 rows (a changed page, not a smaller index).
const SYMBOLS = Array.from({ length: 410 }, (_, i) => `S${String(i).padStart(3, "0")}`);
// The job stamps rows with the clock, so the test freezes it at its "night" (see beforeEach below).
const NIGHT = new Date("2026-10-20T22:00:00Z");
const minute = (k: number) => new Date(NIGHT.getTime() + k * 60_000);

function wikipedia() {
  const rows = SYMBOLS.map((s) => `<tr><td><a href="x">${s}</a></td><td>${s} Inc.</td><td>sec</td><td>Financials</td></tr>`).join("");
  return `<table id="constituents"><tbody><tr><th>Symbol</th><th>Security</th><th>SEC filings</th><th>GICS Sector</th></tr>${rows}`
    .replace("<td>sec</td>", "<td>sec</td>") + "</tbody></table>";
}

/** 60 daily bars, or 60 hourly ones, for a Yahoo chart request. */
function chart(url: string) {
  const hourly = url.includes("interval=60m");
  const step = hourly ? 3600 : 86_400;
  const end = Math.floor(NIGHT.getTime() / 1000);
  const timestamp = Array.from({ length: 60 }, (_, i) => end - (60 - i) * step);
  const c = timestamp.map((_, i) => 100 + i);
  return { chart: { result: [{ timestamp, indicators: { quote: [{ open: c, high: c, low: c, close: c }] } }] } };
}

function world() {
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("wikipedia")) return new Response(wikipedia());
    if (url.includes("yahoo")) return new Response(JSON.stringify(chart(url)));
    return new Response("", { status: 404 });
  }));
  return urls;
}

const env = (db: any, extra: object = {}) => ({ DB: db, ASSETS: { fetch: async () => new Response("", { status: 404 }) }, ...extra }) as any;
const rows = (db: any, sql: string) => db.raw.prepare(sql).all() as any[];

describe("refreshStack", () => {
  it("the first run of the day only refreshes the constituent list", async () => {
    const urls = world();
    const db = d1();
    const report = await refreshStack(env(db), NIGHT);
    expect(report.constituents).toContain("410 from wikipedia");
    expect(report.attempted).toBe(0);
    expect(urls.filter((u) => u.includes("yahoo"))).toHaveLength(0);
    expect(rows(db, "SELECT COUNT(*) AS n FROM tickers")[0].n).toBe(410);
  });

  it("later runs take two tickers each (the default), oldest first", async () => {
    const urls = world();
    const db = d1();
    await refreshStack(env(db), NIGHT);
    const a = await refreshStack(env(db), minute(1));
    expect(a.attempted).toBe(2);
    expect(a.refreshed).toBe(2);
    expect(urls.filter((u) => u.includes("yahoo"))).toHaveLength(4); // two requests each
    const b = await refreshStack(env(db), minute(2));
    expect(b.refreshed).toBe(2);
    const done = rows(db, "SELECT symbol FROM tickers WHERE refreshed_at IS NOT NULL ORDER BY symbol").map((r) => r.symbol);
    expect(done).toHaveLength(4);
    expect(new Set(done).size).toBe(4);
    expect((await refreshStack(env(db), minute(3))).remaining).toBe(404); // 410 less the six done so far
  });

  it("STACK_BATCH still sets the size", async () => {
    world();
    const db = d1();
    await refreshStack(env(db, { STACK_BATCH: "3" }), NIGHT);
    expect((await refreshStack(env(db, { STACK_BATCH: "3" }), minute(1))).attempted).toBe(3);
  });

  it("a run cut off before its bookkeeping does not make the next one repeat it", async () => {
    world();
    const db = d1();
    await refreshStack(env(db), NIGHT);
    // the CPU limit ends the run after the tickers were taken but before the end-of-run bookkeeping
    const dying = { ...db, prepare: db.prepare, batch: async () => { throw new Error("Worker exceeded CPU time limit"); } };
    await expect(refreshStack(env(dying), minute(1))).rejects.toThrow("CPU");
    const taken = rows(db, "SELECT symbol FROM tickers WHERE attempted_at IS NOT NULL ORDER BY symbol").map((r) => r.symbol);
    expect(taken).toHaveLength(2);
    // the next run moves on to other tickers instead of the same two
    const next = await refreshStack(env(db), minute(2));
    expect(next.attempted).toBe(2);
    const now = rows(db, "SELECT symbol FROM tickers WHERE attempted_at IS NOT NULL ORDER BY symbol").map((r) => r.symbol);
    expect(now).toHaveLength(4);
  });

  it("a failed constituent refresh is not retried every minute", async () => {
    const db = d1();
    for (const s of SYMBOLS.slice(0, 6)) db.raw.prepare("INSERT INTO tickers (symbol, file, name, sector, active) VALUES (?, ?, ?, 'x', 1)").run(s, s, s);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: any) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("wikipedia")) throw new Error("Worker exceeded CPU time limit");
      return new Response(JSON.stringify(chart(url)));
    }));
    await refreshStack(env(db), NIGHT).catch(() => {});
    const second = await refreshStack(env(db), minute(1));
    expect(calls.filter((u) => u.includes("wikipedia"))).toHaveLength(1);
    expect(second.attempted).toBe(2);
  });
});

describe("cached", () => {
  const ctx = { waitUntil: (p: Promise<unknown>) => void p } as any;
  function fakeCache() {
    const store = new Map<string, Response>();
    vi.stubGlobal("caches", {
      default: {
        match: async (r: Request) => store.get(r.url)?.clone(),
        put: async (r: Request, res: Response) => void store.set(r.url, res),
      },
    });
    return store;
  }
  const req = (q = "") => new Request(`https://x.test/api/news${q}`);

  it("answers the second visit from the cache", async () => {
    fakeCache();
    const build = vi.fn(async () => new Response("{}", { status: 200, headers: { "Cache-Control": "public, max-age=60" } }));
    await cached(req(), ctx, build);
    await Promise.resolve();
    const second = await cached(req(), ctx, build);
    expect(second.status).toBe(200);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("does not store errors or answers that forbid it, and keeps queries apart", async () => {
    const store = fakeCache();
    await cached(req(), ctx, async () => new Response("{}", { status: 500, headers: { "Cache-Control": "public, max-age=60" } }));
    await cached(req("?a=1"), ctx, async () => new Response("{}", { status: 200, headers: { "Cache-Control": "no-store" } }));
    expect(store.size).toBe(0);
    await cached(req("?a=1"), ctx, async () => new Response("{}", { status: 200, headers: { "Cache-Control": "public, max-age=60" } }));
    await cached(req("?a=2"), ctx, async () => new Response("{}", { status: 200, headers: { "Cache-Control": "public, max-age=60" } }));
    expect(store.size).toBe(2);
  });

  it("just builds when there is no cache", async () => {
    vi.stubGlobal("caches", undefined);
    const res = await cached(req(), ctx, async () => new Response("ok"));
    expect(await res.text()).toBe("ok");
  });
});
