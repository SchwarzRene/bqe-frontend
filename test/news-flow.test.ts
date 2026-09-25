// The Market News jobs end to end, against a real SQLite database with the
// repository's migrations applied (a small D1 shim over node:sqlite), and
// with the feeds and the Gemini API stubbed.

import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBriefing, latestBriefing } from "../worker/news/briefing";
import { type CalendarConfig, readCalendar, refreshCalendar } from "../worker/news/calendar";
import type { Config } from "../worker/news/feeds";
import { handleChat, handleNews, newsTick } from "../worker/news/index";
import { ingest, pruneNews } from "../worker/news/store";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations").sort()) db.exec(readFileSync(`migrations/${f}`, "utf8"));
  const statement = (sql: string, args: unknown[] = []) => ({
    sql,
    args,
    bind: (...a: unknown[]) => statement(sql, a),
    async first<T>() {
      return (db.prepare(sql).get(...(args as any[])) as T) ?? null;
    },
    async all<T>() {
      return { results: db.prepare(sql).all(...(args as any[])) as T[] };
    },
    async run() {
      const r = db.prepare(sql).run(...(args as any[]));
      return { meta: { changes: Number(r.changes) } };
    },
  });
  return {
    raw: db,
    prepare: (sql: string) => statement(sql),
    async batch(list: ReturnType<typeof statement>[]) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of list) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

const cfg: Config = {
  feeds: [
    { id: "wire", name: "Wire", type: "rss", url: "https://feeds.example/wire.xml", category: "markets", region: "us", weight: 22 },
    { id: "other", name: "Other", type: "rss", url: "https://feeds.example/other.xml", category: "world", region: "global", weight: 18 },
  ],
  yahooWeight: 16,
  watchlist: [{ symbol: "NVDA", name: "Nvidia", region: "us" }],
  commodities: [{ symbol: "CL=F", name: "Crude oil", group: "Energy" }],
  blockedPublishers: ["Motley Fool"],
  promoPatterns: ["stocks? to buy"],
};

const NOW = Date.parse("2026-09-24T12:05:00Z"); // Thursday, 08:05 New York: the pre-market slot

function rss(items: [string, string, number][]): string {
  return `<rss><channel>${items
    .map(([title, link, minutesAgo]) => `<item><title>${title}</title><link>${link}</link><pubDate>${new Date(NOW - minutesAgo * 60_000).toUTCString()}</pubDate></item>`)
    .join("")}</channel></rss>`;
}

const gemini = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));

/** Stubbed internet: two feeds, Yahoo, and a Gemini that answers by what it is asked. */
function internet(opts: { briefing?: (prompt: string) => unknown; chat?: (body: any) => Response } = {}) {
  const calls: { url: string; body: any }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    if (url.includes("wire.xml")) {
      return new Response(rss([
        ["US GDP growth revised up in third estimate", "https://wire.example/gdp?utm_source=rss", 30],
        ["Nvidia shares recover part of this week's losses", "https://wire.example/nvda", 50],
        ["Oil slips as OPEC+ supply talk returns", "https://wire.example/oil", 70],
        ["3 stocks to buy before the Fed", "https://wire.example/promo", 10],
        ["Old news from last week", "https://wire.example/old", 60 * 50],
      ]));
    }
    if (url.includes("other.xml")) {
      return new Response(rss([
        ["GDP growth revised up in third estimate, Commerce says", "https://other.example/gdp", 20],
        ["Kremlin rejects new EU sanctions package", "https://other.example/ru", 40],
        ["ECB officials split on October cut", "https://other.example/ecb", 45],
      ]));
    }
    if (url.includes("finance/search")) {
      return new Response(JSON.stringify({ news: [{ title: "Nvidia wins data-center deal", publisher: "Motley Fool", link: "https://fool.example/n", providerPublishTime: Math.floor(NOW / 1000) - 600 }] }));
    }
    if (url.includes("finance/chart")) {
      return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: "NVDA", regularMarketPrice: 110, chartPreviousClose: 100, currency: "USD" } }] } }));
    }
    if (url.includes("bls.ics")) {
      return new Response([
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT", "DTSTART;TZID=America/New_York:20260924T083000", "SUMMARY:Consumer Price Index for August 2026", "END:VEVENT",
        "BEGIN:VEVENT", "DTSTART;TZID=America/New_York:20260924T100000", "SUMMARY:County Employment and Wages", "END:VEVENT",
        "BEGIN:VEVENT", "DTSTART;TZID=America/New_York:20261002T083000", "SUMMARY:The Employment Situation - September 2026", "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"));
    }
    if (url.includes("api.nasdaq.com")) {
      const rows = url.endsWith("2026-09-23")
        ? [{ symbol: "NVDA", name: "NVIDIA Corporation", marketCap: "$4,000,000,000,000", time: "time-after-hours", epsForecast: "$1.00", eps: "$1.10" }]
        : [];
      return new Response(JSON.stringify({ data: { rows } }));
    }
    if (url.includes("generativelanguage")) {
      if (body?.generationConfig?.responseMimeType === "application/json") {
        return gemini(JSON.stringify(opts.briefing ? opts.briefing(body.contents[0].parts[0].text) : null));
      }
      if (opts.chat) return opts.chat(body);
    }
    return new Response("not found", { status: 404 });
  });
  return calls;
}

function envWith(db = d1()) {
  return { DB: db as any, GEMINI_API_KEY: "k", ASSETS: { fetch: async () => new Response("", { status: 404 }) } } as any;
}

/** A valid briefing that cites whatever ids are in the prompt. */
function briefingFrom(prompt: string) {
  const heads: { id: string; t: string }[] = JSON.parse(prompt.split("Headlines: ")[1]);
  const id = (word: string) => heads.find((h) => h.t.includes(word))!.id;
  const page = (ids: string[]) => ({
    overview: { all: "Growth was revised up.", us: "US growth up.", europe: "ECB split.", asia: "Quiet.", russia: "Sanctions talk." },
    themes: ["Rates"],
    topStories: [{ ids, summary: "US growth revised higher", why: "Fewer cuts", importance: 3, region: "us", topic: "Macro", status: "new" }],
  });
  return {
    general: page([id("GDP")]),
    stocks: page([id("Nvidia")]),
    commodities: page([id("Oil")]),
    companies: [{ ticker: "NVDA", line: "Recovering after two down days", ids: [id("Nvidia")] }],
    commodityGroups: [{ name: "Energy", summary: "Oil lower on supply talk", nextEventId: null, ids: [id("Oil")], rows: [{ name: "Crude oil", line: "Lower" }] }],
  };
}

describe("Market News flow", () => {
  it("ingests: filters, dedupes across sources, scores and records health", async () => {
    internet();
    const env = envWith();
    const report = await ingest(env, NOW, cfg);
    expect(report).toMatchObject({ added: 5, failed: [] });
    const rows = env.DB.raw.prepare("SELECT title, source, also_in, category, region, tickers FROM news_items ORDER BY title").all();
    expect(rows.map((r: any) => r.title)).toEqual([
      "ECB officials split on October cut",
      "Kremlin rejects new EU sanctions package",
      "Nvidia shares recover part of this week's losses",
      "Oil slips as OPEC+ supply talk returns",
      "US GDP growth revised up in third estimate",
    ]);
    const gdp: any = rows.find((r: any) => r.title.startsWith("US GDP"));
    expect(JSON.parse(gdp.also_in)).toEqual([{ source: "Other", url: "https://other.example/gdp" }]);
    const byTitle = (t: string): any => rows.find((r: any) => r.title.startsWith(t));
    expect(byTitle("Kremlin")).toMatchObject({ region: "russia", category: "world" });
    expect(byTitle("Oil")).toMatchObject({ category: "commodities" });
    expect(byTitle("Nvidia")).toMatchObject({ category: "company", tickers: '["NVDA"]' });
    expect(env.DB.raw.prepare("SELECT ticker FROM news_item_tickers").all()).toEqual([{ ticker: "NVDA" }]);

    // A second run adds nothing.
    expect(await ingest(env, NOW + 60_000, cfg)).toMatchObject({ added: 0, merged: 0 });
  });

  it("builds the calendar without AI, a briefing, and serves it all", async () => {
    const calls = internet({ briefing: briefingFrom });
    const env = envWith();
    await ingest(env, NOW, cfg);

    const cal: CalendarConfig = {
      meetings: [{ type: "eu-central-bank", title: "ECB rate decision", date: "2026-09-25", time: "14:15", tz: "Europe/Berlin", minutes: 90, region: "europe", importance: 3 }],
      weekly: [{ type: "commodities", title: "EIA natural gas storage", weekday: 4, time: "10:30", tz: "America/New_York", region: "us", importance: 2 }],
      monthly: [],
      ics: [{ id: "bls", name: "BLS", url: "https://www.bls.gov/schedule/news_release/bls.ics", type: "us-data", region: "us", include: [
        { match: "Consumer Price Index", title: "US CPI", importance: 3 },
        { match: "Employment Situation", title: "US jobs report", importance: 3 },
      ] }],
    };
    // The calendar makes no model calls.
    expect(await refreshCalendar(env, NOW, { cfg, cal })).toBe("meetings: 1, rules: 3, bls: 2, nasdaq: 1, yahoo: 0");
    expect(calls.some((c) => c.url.includes("generativelanguage"))).toBe(false);
    const events = await readCalendar(env, NOW - 86_400_000, NOW + 3 * 86_400_000);
    expect(events.map((e) => [e.title, e.start, e.result])).toEqual([
      ["NVIDIA results, after the close", "2026-09-23T20:05:00Z", "EPS $1.10 vs $1.00 est."],
      ["US CPI", "2026-09-24T12:30:00Z", ""],
      ["EIA natural gas storage", "2026-09-24T14:30:00Z", ""],
      ["ECB rate decision", "2026-09-25T12:15:00Z", ""],
    ]);
    // Rebuilt the next day, nothing is duplicated and the reported EPS stays.
    await refreshCalendar(env, NOW + 86_400_000, { cfg, cal });
    const again = await readCalendar(env, NOW - 86_400_000, NOW + 3 * 86_400_000);
    expect(again.map((e) => e.title)).toEqual(events.map((e) => e.title));
    expect(again[0].result).toBe("EPS $1.10 vs $1.00 est.");

    expect(await buildBriefing(env, "pre-market", { now: NOW, cfg })).toBe("briefing written from 5 headlines");
    const b = (await latestBriefing(env))!;
    expect(b.label).toBe("Pre-market briefing");
    expect(b.pages.general.topStories[0].summary).toBe("US growth revised higher");
    expect(b.companies).toEqual([{ ticker: "NVDA", name: "Nvidia", line: "Recovering after two down days", ids: [expect.any(String)] }]);
    // Nothing new since: the next slot skips the model call.
    const geminiCalls = calls.filter((c) => c.url.includes("generativelanguage")).length;
    expect(await buildBriefing(env, "midday", { now: NOW + 3_600_000, cfg })).toMatch(/skipped/);
    expect(calls.filter((c) => c.url.includes("generativelanguage")).length).toBe(geminiCalls);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW + 90 * 60_000);
    const res = await handleNews(new Request("https://site/api/news"), env, "");
    const body: any = await res.json();
    expect(body.briefing.generatedAt).toBe(b.generatedAt);
    expect(body.items.length).toBeGreaterThanOrEqual(5);
    expect(body.events.length).toBeGreaterThanOrEqual(1);
    expect(body.yahooOk).toBe(true);
  });

  it("keeps the previous briefing when the model's answer is unusable twice", async () => {
    const calls = internet({ briefing: () => ({ general: { topStories: [] } }) });
    const env = envWith();
    await ingest(env, NOW, cfg);
    expect(await buildBriefing(env, "first", { force: true, now: NOW, cfg })).toBe("no valid briefing — kept the previous one");
    expect(calls.filter((c) => c.body?.generationConfig?.responseMimeType).length).toBe(2);
    expect(await latestBriefing(env)).toBeNull();
  });

  it("runs the tick: first briefing and calendar right after a deploy", async () => {
    internet({ briefing: briefingFrom });
    const env = envWith();
    // 10:15 New York on a Thursday: no slot, but nothing exists yet.
    const report = await newsTick(env, Date.parse("2026-09-24T14:15:00Z"), cfg);
    expect(report).toMatch(/fetch: /);
    expect(report).toMatch(/calendar \(first\): meetings: \d+, rules: \d+, bls: \d+, nasdaq: \d+, yahoo: 0/);
    expect(report).toMatch(/briefing \(first\): briefing written/);
  });

  it("answers signed-in users with sources, counts the limit, and refuses past it", async () => {
    internet({
      briefing: briefingFrom,
      chat: (body) => {
        const last = body.contents[body.contents.length - 1];
        if (last.parts[0].functionResponse) {
          const price = last.parts[0].functionResponse.response;
          return gemini(`Nvidia is up ${price.changePercentOver5Days}% over five days.\nSOURCES: ${body.systemInstruction.parts[0].text.match(/\n([0-9a-f]{12}) \|[^\n]*Nvidia/)[1]}`);
        }
        return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "get_price", args: { symbol: "NVDA" } } }] } }] }));
      },
    });
    const env = envWith();
    env.NEWS_CHAT_DAILY_LIMIT = "1";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW + 10 * 60_000);
    await ingest(env, Date.now(), cfg);
    env.DB.raw.exec("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('" +
      (await sha256("tok")) + "', 1, '2026-01-01', '2999-01-01')");

    const ask = () => handleChat(new Request("https://site/api/chat", {
      method: "POST",
      headers: { Cookie: "bqe_session=tok", Origin: "https://site" },
      body: JSON.stringify({ messages: [{ role: "user", content: "How is Nvidia doing?" }], page: "stocks" }),
    }), env);
    const res = await ask();
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.answer).toBe("Nvidia is up 10% over five days.");
    expect(body.sources).toEqual([{ label: "Wire", url: "https://wire.example/nvda", id: expect.any(String) }]);
    expect(body.remaining).toBe(0);

    const again = await ask();
    expect(again.status).toBe(429);
  });

  it("prunes what is older than 7 days", async () => {
    internet();
    const env = envWith();
    await ingest(env, NOW, cfg);
    await pruneNews(env, NOW + 8 * 86_400_000);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM news_items").get()).toEqual({ n: 0 });
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM news_item_tickers").get()).toEqual({ n: 0 });
  });
});

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
