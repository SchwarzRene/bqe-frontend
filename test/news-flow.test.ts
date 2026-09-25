// The Market News jobs end to end, against a real SQLite database with the
// repository's migrations applied (a small D1 shim over node:sqlite), and
// with the feeds and the Gemini API stubbed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { d1 } from "./d1";
import { buildBriefing, latestBriefing } from "../worker/news/briefing";
import { CALENDAR, type CalendarConfig, readCalendar, refreshCalendar } from "../worker/news/calendar";
import type { Config } from "../worker/news/feeds";
import { handleChat, handleNews, newsTick } from "../worker/news/index";
import { handleAnalysis, priceStats } from "../worker/news/analyst";
import { toProfile } from "../worker/profile";
import { rankCalendar } from "../worker/news/rank";
import { ingest as ingestPart, pruneNews } from "../worker/news/store";

// Every source in one run: the rotation over runs is tested on its own.
const ALL = { part: 0, of: 1, budget: Infinity };
const ingest = (env: any, now: number, cfg: Config) => ingestPart(env, now, cfg, fetch, ALL);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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
function internet(opts: { briefing?: (prompt: string) => unknown; rank?: (prompt: string) => unknown; chat?: (body: any) => Response; econ?: () => unknown[][] } = {}) {
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
    if (url.includes("fc.yahoo.com")) return new Response("", { status: 404, headers: { "Set-Cookie": "A3=session; Domain=.yahoo.com" } });
    if (url.includes("getcrumb")) return opts.econ ? new Response("crumb123") : new Response("Unauthorized", { status: 401 });
    if (url.includes("finance/visualization")) {
      const ids = ["econ_release", "country_code", "startdatetime", "period", "after_release_actual", "consensus_estimate", "prior_release_actual", "originally_reported_actual"];
      return new Response(JSON.stringify({ finance: { result: [{ documents: [{ columns: ids.map((id) => ({ id, label: id })), rows: opts.econ!() }] }], error: null } }));
    }
    if (url.includes("api.nasdaq.com")) {
      const rows = url.endsWith("2026-09-23")
        ? [{ symbol: "NVDA", name: "NVIDIA Corporation", marketCap: "$4,000,000,000,000", time: "time-after-hours", epsForecast: "$1.00", eps: "$1.10" }]
        : [];
      return new Response(JSON.stringify({ data: { rows } }));
    }
    if (url.includes("generativelanguage")) {
      if (body?.generationConfig?.responseMimeType === "application/json") {
        const prompt: string = body.contents[0].parts[0].text;
        if (prompt.startsWith("Days: ")) return gemini(JSON.stringify(opts.rank ? opts.rank(prompt) : null));
        return gemini(JSON.stringify(opts.briefing ? opts.briefing(prompt) : null));
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
    expect(await refreshCalendar(env, NOW, { cfg, cal })).toBe("meetings: 1, dated: 0, rules: 3, fallback-rules: 0, bls: 2, nasdaq: 1, yahoo: 0");
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

  it("reads Yahoo's economic calendar: results as published, meetings' rates, fallbacks off", async () => {
    // CPI at 08:30 New York on the 24th, before release: Yahoo writes 0 for "not yet".
    let econ: unknown[][] = [
      ["CPI MM, SA", "US", "2026-09-24T12:30:00.000Z", "Aug", 0, 0.3, 0.2, 0],
      ["CPI YY, NSA", "US", "2026-09-24T12:30:00.000Z", "Aug", 0, 2.9, 2.7, 0],
      ["Initial Jobless Clm", "US", "2026-09-24T12:30:00.000Z", "", 0, 225, 231, 0],
      ["ECB Refinancing Rate", "EZ", "2026-09-25T12:15:00.000Z", "", 0, 2.15, 2.15, 0],
      ["Tankan Big Mfg Idx", "JP", "2026-10-01T23:50:00.000Z", "Q3", 0, 13, 12, 0],
      ["Fed Waller Speaks", "US", "2026-09-24T15:00:00.000Z", "", 0, 0, 0, 0],
      ["BoE MPC Member Speaks", "GB", "2026-09-24T10:00:00.000Z", "", 0, 0, 0, 0],
      ["Car Registrations", "IT", "2026-09-24T08:00:00.000Z", "", 5, 0, 0, 0],
    ];
    const calls = internet({ econ: () => econ });
    const env = envWith();
    const cal: CalendarConfig = {
      meetings: [{ type: "eu-central-bank", title: "ECB rate decision", date: "2026-09-25", time: "14:15", tz: "Europe/Berlin", minutes: 90, region: "europe", importance: 3, country: "EZ" }],
      weekly: [{ type: "us-data", title: "US weekly jobless claims", weekday: 4, time: "08:30", tz: "America/New_York", region: "us", importance: 2, fallback: true }],
      monthly: [],
      yahooEconomic: CALENDAR.yahooEconomic,
      ics: [{ id: "bls", name: "BLS", url: "https://www.bls.gov/schedule/news_release/bls.ics", type: "us-data", region: "us", fallback: true, include: [{ match: "Consumer Price Index", title: "US CPI", importance: 3 }] }],
    };
    const before = NOW - 60 * 60_000; // 07:05 New York, before the release
    expect(await refreshCalendar(env, before, { cfg, cal })).toBe(
      "meetings: 1, dated: 0, yahoo-economic: 4, rules: 0, fallback-rules: 0, bls: 0, nasdaq: 1, yahoo: 0",
    );
    expect(calls.some((c) => c.url.includes("bls.ics"))).toBe(false);
    const titles = async () => (await readCalendar(env, NOW - 86_400_000, NOW + 8 * 86_400_000)).map((e) => [e.title, e.result]);
    expect(await titles()).toEqual([
      ["NVIDIA results, after the close", "EPS $1.10 vs $1.00 est."],
      ["US inflation (CPI) (Aug)", ""],
      ["US weekly jobless claims", ""],
      ["US: Fed Waller Speaks", ""],
      ["ECB rate decision", ""],
      ["Japan Tankan survey (Q3)", ""],
    ]);

    // Published: the hourly run fills in the figures, and the ECB meeting its rate.
    econ = econ.map((r) => (r[0] === "CPI MM, SA" ? [...r.slice(0, 4), 0.2, ...r.slice(5)] : r[0] === "CPI YY, NSA" ? [...r.slice(0, 4), 3.0, ...r.slice(5)] : r));
    await refreshCalendar(env, NOW, { cfg, cal, back: 1, ahead: 1, only: ["meetings", "yahoo-economic", "nasdaq"] });
    econ = econ.map((r) => (r[0] === "ECB Refinancing Rate" ? [...r.slice(0, 4), 2.15, ...r.slice(5)] : r));
    await refreshCalendar(env, NOW + 86_400_000 + 3_600_000, { cfg, cal, back: 1, ahead: 1, only: ["meetings", "yahoo-economic", "nasdaq"] });
    const after = Object.fromEntries(await titles());
    expect(after["US inflation (CPI) (Aug)"]).toBe("CPI MM, SA 0.2 (exp. 0.3); CPI YY, NSA 3 (exp. 2.9)");
    expect(after["ECB rate decision"]).toBe("2.15 (exp. 2.15)");
    expect(after["Japan Tankan survey (Q3)"]).toBe("");
  });

  it("keeps the previous briefing when the model's answer is unusable twice", async () => {
    const calls = internet({ briefing: () => ({ general: { topStories: [] } }) });
    const env = envWith();
    await ingest(env, NOW, cfg);
    expect(await buildBriefing(env, "first", { force: true, now: NOW, cfg })).toBe("no valid briefing — kept the previous one");
    expect(calls.filter((c) => c.body?.generationConfig?.responseMimeType).length).toBe(2);
    expect(await latestBriefing(env)).toBeNull();
  });

  it("ranks the events of busy days with one model call and serves the ranking", async () => {
    const env = envWith();
    const insert = (id: string, start: string, importance = 2) =>
      env.DB.raw.prepare(`INSERT INTO news_events (id, type, title, start_at, region, importance, origin, updated)
        VALUES (?, 'us-data', ?, ?, 'us', ?, 'test', '2026-09-24')`).run(id, id, start, importance);
    // Friday: six events (busy). Monday: two (quiet, not asked about).
    for (let i = 0; i < 6; i++) insert(`fri-${i}`, `2026-09-25T1${i}:30:00Z`);
    insert("mon-0", "2026-09-28T12:30:00Z");
    insert("mon-1", "2026-09-28T14:00:00Z");
    let asked = "";
    const calls = internet({
      rank: (prompt) => {
        asked = prompt;
        return {
          days: [
            {
              date: "2026-09-25",
              summary: "PCE inflation is the day's main release.",
              key: ["fri-3", "fri-0", "made-up"],
              events: [{ id: "fri-3", importance: 3 }, { id: "fri-0", importance: 2 }, { id: "fri-1", importance: 1 }, { id: "mon-0", importance: 3 }],
            },
            { date: "2026-09-28", summary: "Not asked", key: ["mon-0"], events: [{ id: "mon-0", importance: 3 }] },
          ],
        };
      },
    });
    expect(await rankCalendar(env, NOW)).toBe("1 busy day ranked");
    expect(calls.filter((c) => c.url.includes("generativelanguage")).length).toBe(1);
    expect(asked).toContain('"date":"2026-09-25"');
    expect(asked).not.toContain("mon-0");

    const res = await handleNews(new Request("https://site/api/news"), env, "");
    const { calendarRanks } = await res.json<any>();
    expect(calendarRanks.days).toEqual({ "2026-09-25": "PCE inflation is the day's main release." });
    // Ids from another day or made up are dropped; key events are flagged.
    expect(calendarRanks.events).toEqual({
      "fri-3": { importance: 3, key: true },
      "fri-0": { importance: 2, key: true },
      "fri-1": { importance: 1, key: false },
    });
  });

  it("skips the model when no day is busy", async () => {
    const calls = internet();
    const env = envWith();
    expect(await rankCalendar(env, NOW)).toBe("no busy days");
    expect(calls.some((c) => c.url.includes("generativelanguage"))).toBe(false);
  });

  it("runs one job per tick: calendar, then headlines, then the first briefing, after a deploy", async () => {
    const calls = internet({ briefing: briefingFrom });
    const env = envWith();
    const tick = (utc: string) => newsTick(env, Date.parse(utc), cfg, ALL);
    // 10:00 New York on a Thursday: nothing exists yet. First the calendar, with no fetch.
    let report = await tick("2026-09-24T14:00:00Z");
    // Yahoo unreachable in this test: the fallbacks (BLS, the jobless-claims rule …) take over.
    expect(report).toMatch(/^calendar \(first\): .*yahoo-economic failed: no Yahoo crumb.*fallback-rules: [1-9]\d*, bls: [1-9]/);
    expect(report).not.toMatch(/fetch/);
    // The calendar's other half: earnings, dated events, rules.
    report = await tick("2026-09-24T14:30:00Z");
    expect(report).toMatch(/^calendar \(first, part 2\): dated: 0, rules: \d+, nasdaq: 1, yahoo: 0$/);
    // No headlines yet, so no briefing: this run fetches.
    report = await tick("2026-09-24T14:45:00Z");
    expect(report).toMatch(/^fetch: \{"fetched":9,"added":5/);
    expect(calls.some((c) => c.url.includes("generativelanguage"))).toBe(false);
    // Now the first briefing, in a run of its own.
    report = await tick("2026-09-24T15:00:00Z");
    expect(report).toBe("briefing (first): briefing written from 5 headlines");
    // Results at :15, then the first calendar ranking, then fetch otherwise.
    expect(await tick("2026-09-24T15:15:00Z")).toMatch(/^calendar results: /);
    expect(await tick("2026-09-24T15:30:00Z")).toMatch(/^calendar ranks \(first\): /);
    expect(await tick("2026-09-24T15:45:00Z")).toMatch(/^fetch: /);
    // The daily ranking at 05:45 New York.
    expect(await tick("2026-09-25T09:45:00Z")).toMatch(/^calendar ranks: /);
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

  it("shows Gemini's reason when the chat fails, and does not count the question", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("generativelanguage")
        ? new Response(JSON.stringify({ error: { code: 404, status: "NOT_FOUND", message: "models/gemini-9 is not found for API version v1beta" } }), { status: 404 })
        : new Response("", { status: 404 }));
    const env = envWith();
    env.DB.raw.exec("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('" + (await sha256("tok")) + "', 1, '2026-01-01', '2999-01-01')");
    const res = await handleChat(new Request("https://site/api/chat", {
      method: "POST",
      headers: { Cookie: "bqe_session=tok", Origin: "https://site" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    }), env);
    expect(res.status).toBe(502);
    expect((await res.json<any>()).error).toBe("The model could not answer: NOT_FOUND — models/gemini-9 is not found for API version v1beta");
    expect(env.DB.raw.prepare("SELECT count FROM news_chat_usage").get()).toEqual({ count: 0 });
  });

  it("fetches a third of the sources per run, and a budget of new headlines", async () => {
    internet();
    const env = envWith();
    const five = { ...cfg, feeds: [...cfg.feeds, ...cfg.feeds.map((f) => ({ ...f, id: f.id + "2" }))] };
    const report = await ingestPart(env, NOW, five, fetch, { part: 1, of: 3, budget: 2 });
    // Sources 1 and 4 of wire, other, wire2, other2, yahoo NVDA, yahoo CL=F.
    expect(Object.keys(JSON.parse((env.DB.raw.prepare("SELECT body FROM documents WHERE key = 'news:health'").get() as any).body).sources).sort()).toEqual(["other", "yahoo:NVDA"]);
    expect(report.added).toBe(2);
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

describe("company analysis", () => {
  const DAY = 86400;
  // A year of daily bars rising 0.1% a day, with one dip.
  const bars = Array.from({ length: 250 }, (_, i) => ({ time: 1_760_000_000 + i * DAY, close: 100 * 1.001 ** i * (i === 200 ? 0.9 : 1), volume: i >= 245 ? 2000 : 1000 }));

  it("works a price history into returns, volatility, drawdown and averages", () => {
    const s = priceStats(bars)!;
    expect(s.last).toBeCloseTo(100 * 1.001 ** 249, 6);
    expect(s.returns["1W"]).toBeCloseTo(1.001 ** 7 - 1, 4);
    expect(s.maxDrawdown).toBeCloseTo(-0.1, 2);
    expect(s.fromHigh).toBeCloseTo(0, 6);
    expect(s.vsMa50).toBeGreaterThan(0);
    expect(s.volumeVsAvg).toBeCloseTo(2000 / 1020 - 1, 2);
    expect(s.volatility).toBeGreaterThan(0);
    expect(priceStats(bars.slice(0, 1))).toBeNull();
  });

  it("reads Yahoo's quoteSummary into a profile, keeping only what is there", () => {
    const p = toProfile("NVDA", {
      price: { longName: "NVIDIA Corporation", currency: "USD", marketCap: { raw: 4e12, fmt: "4T" } },
      summaryDetail: { trailingPE: { raw: 55.2 }, fiftyTwoWeekHigh: { raw: 200 }, dividendYield: {} },
      financialData: { recommendationKey: "buy", targetMeanPrice: { raw: 210 }, numberOfAnalystOpinions: { raw: 60 } },
      recommendationTrend: { trend: [{ period: "0m", strongBuy: 20, buy: 30, hold: 8, sell: 1, strongSell: 1 }] },
      calendarEvents: { earnings: { earningsDate: [{ raw: 1_795_000_000 }], earningsAverage: { raw: 1.1 } } },
      earnings: { earningsChart: { quarterly: [{ date: "2Q2026", actual: { raw: 1 }, estimate: { raw: 0.9 } }] } },
    });
    expect(p).toMatchObject({ name: "NVIDIA Corporation", currency: "USD", sector: null });
    expect(p.stats).toMatchObject({ marketCap: 4e12, trailingPE: 55.2, high52: 200, dividendYield: null });
    expect(p.analysts).toMatchObject({ recommendation: "buy", targetMean: 210, count: 60, trend: { strongBuy: 20, hold: 8 } });
    expect(p.earnings.next).toEqual(["2026-11-18"]);
    expect(p.earnings.quarterly).toEqual([{ quarter: "2Q2026", actual: 1, estimate: 0.9 }]);
  });

  it("writes an analysis for signed-in users only, from the data, and reuses it for six hours", async () => {
    const calls: string[] = [];
    let prompt = "";
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.includes("finance/chart")) {
        return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: "NVDA" }, timestamp: bars.map((b) => b.time), indicators: { quote: [{ open: bars.map((b) => b.close), high: bars.map((b) => b.close), low: bars.map((b) => b.close), close: bars.map((b) => b.close), volume: bars.map((b) => b.volume) }] } }] } }));
      }
      if (url.includes("fc.yahoo.com")) return new Response("", { status: 404, headers: { "Set-Cookie": "A3=x; Domain=.yahoo.com" } });
      if (url.includes("getcrumb")) return new Response("crumb1");
      if (url.includes("quoteSummary")) return new Response(JSON.stringify({ quoteSummary: { result: [{ price: { longName: "NVIDIA Corporation" }, financialData: { recommendationKey: "buy" } }] } }));
      if (url.includes("generativelanguage")) {
        const body = JSON.parse(String(init!.body));
        prompt = body.contents[0].parts[0].text;
        const id = prompt.match(/"id":"([0-9a-f]+)"/)![1];
        return gemini(JSON.stringify({
          summary: "Nvidia trades at its high after a steady year.", tone: "positive",
          expect: ["Earnings next month set the tone."], catalysts: ["Data-center demand."], risks: ["Valuation.", ""],
          watch: ["The 50-day average."], sources: [id, "made-up"],
        }));
      }
      return new Response("not found", { status: 404 });
    });
    const env = envWith();
    env.DB.raw.exec(`INSERT INTO news_items (id, title, url, source, category, region, tickers, published_at, score, fetched_at)
      VALUES ('aa11', 'Nvidia wins a data-center deal', 'https://wire.example/n', 'Wire', 'company', 'us', '["NVDA"]', '${new Date(Date.now() - 3600e3).toISOString()}', 60, '2026-01-01')`);
    const req = (method: string, cookie = true) => new Request("https://site/api/company/analysis" + (method === "GET" ? "?ticker=NVDA" : ""), {
      method,
      headers: { ...(cookie ? { Cookie: "bqe_session=tok" } : {}), Origin: "https://site" },
      body: method === "POST" ? JSON.stringify({ ticker: "nvda", name: "Nvidia" }) : undefined,
    });

    expect((await handleAnalysis(req("POST", false), env)).status).toBe(401);
    expect(calls).toEqual([]);

    env.DB.raw.exec("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('" + (await sha256("tok")) + "', 1, '2026-01-01', '2999-01-01')");
    // Nothing stored yet: GET says so without a model call.
    expect(await (await handleAnalysis(req("GET"), env)).json()).toEqual({ analysis: null, cached: false });

    const res = await handleAnalysis(req("POST"), env);
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.analysis).toMatchObject({ tone: "positive", risks: ["Valuation."], sources: [{ id: "aa11", label: "Wire", url: "https://wire.example/n" }] });
    expect(body.cached).toBe(false);
    expect(prompt).toContain("Nvidia wins a data-center deal");
    expect(prompt).toContain('"recommendation":"buy"');
    expect(prompt).toMatch(/max drawdown over the year -9\.9%/);
    expect(env.DB.raw.prepare("SELECT count FROM news_chat_usage").get()).toEqual({ count: 1 });

    // Asked again: the stored one, no model call, not counted.
    const n = calls.filter((u) => u.includes("generativelanguage")).length;
    const again: any = await (await handleAnalysis(req("POST"), env)).json();
    expect(again).toMatchObject({ cached: true, analysis: { tone: "positive" } });
    expect(calls.filter((u) => u.includes("generativelanguage")).length).toBe(n);
    expect(env.DB.raw.prepare("SELECT count FROM news_chat_usage").get()).toEqual({ count: 1 });
  });
});

