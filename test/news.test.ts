import { afterEach, describe, expect, it, vi } from "vitest";
import { validateBriefing, pickInput } from "../worker/news/briefing";
import { type CalendarConfig, fixedEvents, mergeMeetingResults, nasdaqEvent, parseEconomic, parseIcs, pickNasdaq } from "../worker/news/calendar";
import { describeGeminiError } from "../worker/news/gemini";
import { chatError, cleanMessages, handleChat, splitSources } from "../worker/news/chat";
import { GeminiError } from "../worker/news/gemini";
import { classify, cleanText, type Config, fetchAll, normalizeUrl, parseFeed, type RawItem, tickersFor } from "../worker/news/feeds";
import { withHeadlines } from "../worker/news/index";
import { dedupe, eventWordsFor, isBlocked, isPromo, sameStory, scoreItem, staleSources, titleWords } from "../worker/news/store";
import { briefingSlot, isCalendarRun, shouldFetch, wallClock, zonedToUtc } from "../worker/news/time";

afterEach(() => vi.unstubAllGlobals());

const cfg: Config = {
  feeds: [{ id: "bbc", name: "BBC", type: "rss", url: "https://feeds.example/world.xml", category: "world", region: "global", weight: 18 }],
  yahooWeight: 16,
  watchlist: [
    { symbol: "NVDA", name: "Nvidia", region: "us" },
    { symbol: "EBS.VI", name: "Erste Group", region: "europe" },
  ],
  commodities: [
    { symbol: "CL=F", name: "Crude oil", group: "Energy" },
    { symbol: "GC=F", name: "Gold", group: "Metals" },
    { symbol: "ZS=F", name: "Soybeans", group: "Agriculture" },
  ],
  blockedPublishers: ["Motley Fool", "RT"],
  promoPatterns: ["stocks? to buy", "could make you rich"],
};

describe("news feeds", () => {
  it("parses RSS items with CDATA and entities, and Atom entries", () => {
    const rss = `<rss><channel><title>Feed</title>
      <item><title><![CDATA[Oil &amp; gas <b>jump</b>]]></title><link>https://ex.com/a?utm_source=x&amp;id=2</link><pubDate>Thu, 24 Sep 2026 13:05:00 GMT</pubDate></item>
      <item><title>No link</title></item>
    </channel></rss>`;
    expect(parseFeed(rss)).toEqual([{ title: "Oil & gas jump", link: "https://ex.com/a?utm_source=x&id=2", date: "Thu, 24 Sep 2026 13:05:00 GMT" }]);

    const atom = `<feed><entry><title type="html">Kremlin &lt;i&gt;says&lt;/i&gt;</title>
      <link rel="enclosure" href="https://ex.com/img.jpg"/><link rel="alternate" href="https://ex.com/story"/>
      <published>2026-09-24T10:00:00Z</published></entry></feed>`;
    expect(parseFeed(atom)).toEqual([{ title: "Kremlin says", link: "https://ex.com/story", date: "2026-09-24T10:00:00Z" }]);
  });

  it("cleans text", () => {
    expect(cleanText("  A&#x2019;s   <em>deal</em> &#8212; done ")).toBe("A’s deal — done");
  });

  it("normalizes URLs: tracking parameters, fragment, trailing slash, host case", () => {
    expect(normalizeUrl("https://WWW.Ex.com/path/?utm_medium=a&b=2&fbclid=z#top")).toBe("https://www.ex.com/path?b=2");
    expect(normalizeUrl("https://ex.com/")).toBe("https://ex.com/");
    expect(normalizeUrl("javascript:alert(1)")).toBe("");
  });

  it("classifies broad sources by the words in the headline", () => {
    expect(classify("Oil slips as OPEC+ supply talk returns", "markets", "us")).toEqual({ category: "commodities", region: "us" });
    expect(classify("Kremlin rejects new sanctions", "world", "global")).toEqual({ category: "world", region: "russia" });
    expect(classify("Leaders tell us they will meet", "world", "global").region).toBe("global");
    expect(classify("ECB officials split on October", "world", "global").region).toBe("europe");
  });

  it("finds watchlist tickers by name, symbol or Yahoo's list", () => {
    expect(tickersFor("Nvidia shares recover", [], cfg.watchlist)).toEqual(["NVDA"]);
    expect(tickersFor("Banks rally in Vienna", ["EBS.VI"], cfg.watchlist)).toEqual(["EBS.VI"]);
    expect(tickersFor("Erste Group among top gainers", [], cfg.watchlist)).toEqual(["EBS.VI"]);
  });

  it("fetches every source, and a failing one is only recorded", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("feeds.example")) {
        return new Response(`<rss><item><title>Nvidia soars on results</title><link>https://ex.com/n1</link><pubDate>${new Date().toUTCString()}</pubDate></item></rss>`);
      }
      if (url.includes("q=NVDA")) {
        return new Response(JSON.stringify({ news: [{ title: "Nvidia deal", publisher: "Reuters", link: "https://ex.com/n2", providerPublishTime: Math.floor(Date.now() / 1000), relatedTickers: ["NVDA"] }] }));
      }
      return new Response("nope", { status: 500 });
    });
    const { items, health } = await fetchAll(cfg);
    expect(items.map((i) => i.title).sort()).toEqual(["Nvidia deal", "Nvidia soars on results"]);
    const deal = items.find((i) => i.title === "Nvidia deal")!;
    expect(deal.source).toBe("Reuters");
    expect(deal.category).toBe("company");
    expect(deal.tickers).toEqual(["NVDA"]);
    expect(health.bbc.ok).toBe(true);
    expect(health["yahoo:GC=F"]).toMatchObject({ ok: false, error: "HTTP 500" });
    const oil = items.find((i) => i.sourceId === "yahoo:CL=F");
    expect(oil).toBeUndefined();
  });
});

describe("news store", () => {
  const raw = (id: string, title: string, source: string, at = "2026-09-24T10:00:00Z"): RawItem => ({
    id, title, url: `https://ex.com/${id}`, source, sourceId: source, category: "markets", region: "us", tickers: [], publishedAt: at, weight: 20,
  });

  it("filters promo patterns and blocked publishers", () => {
    expect(isPromo("3 stocks to buy before the Fed", cfg)).toBe(true);
    expect(isPromo("Stocks fall before the Fed", cfg)).toBe(false);
    expect(isBlocked("The motley fool ", { ...cfg, blockedPublishers: ["The Motley Fool"] })).toBe(true);
    expect(isBlocked("Reuters", cfg)).toBe(false);
  });

  it("treats near-identical titles as one story", () => {
    const a = titleWords("US GDP growth revised up in third estimate");
    const b = titleWords("GDP growth revised up in third estimate, Commerce Dept says");
    expect(sameStory(a, b)).toBe(true);
    expect(sameStory(a, titleWords("Oil slips as supply talk returns"))).toBe(false);
  });

  it("dedupes: same URL dropped, a twin from another source folded into alsoIn", () => {
    const known = [{
      id: "k1", title: "ECB officials split on October rate cut", words: titleWords("ECB officials split on October rate cut"),
      source: "Euronews", alsoIn: [], tickers: [], publishedAt: "2026-09-24T08:00:00Z",
    }];
    const { added, merged } = dedupe(
      [
        raw("k1", "ECB officials split on October rate cut", "Euronews"),
        raw("n1", "ECB officials split on October rate cut, sources say", "Reuters"),
        raw("n2", "Oil slips as OPEC+ supply talk returns", "CNBC"),
        raw("n3", "Oil slips as OPEC+ supply talk returns", "MarketWatch", "2026-09-24T11:00:00Z"),
      ],
      known,
    );
    expect(added.map((a) => a.id)).toEqual(["n2"]);
    expect((added[0] as any).alsoIn).toEqual([{ source: "MarketWatch", url: "https://ex.com/n3" }]);
    expect(merged.map((m) => m.id)).toEqual(["k1"]);
    expect(merged[0].alsoIn).toEqual([{ source: "Reuters", url: "https://ex.com/n1" }]);
  });

  it("scores sources, recency, the watchlist and today's events", () => {
    const now = Date.parse("2026-09-24T12:00:00Z");
    const base = { weight: 20, source: "CNBC", alsoIn: [], publishedAt: "2026-09-24T12:00:00Z", tickers: [], title: "US CPI rises" };
    expect(scoreItem(base, now)).toBe(45);
    expect(scoreItem({ ...base, alsoIn: [{}, {}, {}] }, now)).toBe(75);
    expect(scoreItem({ ...base, tickers: ["NVDA"] }, now, ["CPI"])).toBe(70);
    expect(scoreItem({ ...base, publishedAt: "2026-09-23T12:00:00Z" }, now)).toBe(20);
  });

  it("names sources that have been silent for 24 hours", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    const doc = { updated: "", sources: {
      a: { lastOk: "2026-09-25T11:00:00Z", lastError: null, count: 3 },
      b: { lastOk: "2026-09-24T10:00:00Z", lastError: "HTTP 404", count: 0 },
      c: { lastOk: null, lastError: "HTTP 403", count: 0 },
    } };
    expect(staleSources(doc, now)).toEqual(["b", "c"]);
  });

  it("takes acronyms and tickers from event titles", () => {
    expect(eventWordsFor(["US CPI, August", "OPEC+ meeting", "EIA natural gas storage"], ["SAP.DE"]).sort()).toEqual(["CPI", "EIA", "OPEC", "SAP"]);
  });
});

describe("news time", () => {
  it("converts wall-clock times in any zone, DST included", () => {
    expect(new Date(zonedToUtc("2026-09-24", 11, 0, "Europe/Berlin")).toISOString()).toBe("2026-09-24T09:00:00.000Z");
    expect(new Date(zonedToUtc("2026-01-15", 8, 30, "America/New_York")).toISOString()).toBe("2026-01-15T13:30:00.000Z");
    expect(new Date(zonedToUtc("2026-09-25", 8, 30, "Asia/Tokyo")).toISOString()).toBe("2026-09-24T23:30:00.000Z");
    expect(zonedToUtc("2026-09-24", 8, 0, "Not/AZone")).toBeNaN();
  });

  it("matches the briefing slots in New York time", () => {
    // 2026-09-24 is a Thursday; New York is UTC-4.
    expect(briefingSlot(Date.parse("2026-09-24T12:00:00Z"))).toBe("pre-market");
    expect(briefingSlot(Date.parse("2026-09-24T12:14:00Z"))).toBe("pre-market");
    expect(briefingSlot(Date.parse("2026-09-24T12:15:00Z"))).toBeNull();
    expect(briefingSlot(Date.parse("2026-09-24T06:30:00Z"))).toBe("asia-close");
    expect(briefingSlot(Date.parse("2026-09-26T14:00:00Z"))).toBe("weekend");
    expect(briefingSlot(Date.parse("2026-09-27T14:00:00Z"))).toBeNull();
    // Winter: New York is UTC-5.
    expect(briefingSlot(Date.parse("2026-12-03T21:30:00Z"))).toBe("close");
  });

  it("fetches every run on weekdays and hourly at weekends; the calendar at 05:00", () => {
    expect(shouldFetch(Date.parse("2026-09-24T12:45:00Z"))).toBe(true);
    expect(shouldFetch(Date.parse("2026-09-26T12:45:00Z"))).toBe(false);
    expect(shouldFetch(Date.parse("2026-09-26T13:00:00Z"))).toBe(true);
    expect(isCalendarRun(Date.parse("2026-09-24T09:00:00Z"))).toBe(true);
    expect(isCalendarRun(Date.parse("2026-09-24T09:15:00Z"))).toBe(false);
    expect(wallClock(Date.parse("2026-09-24T03:00:00Z"), "America/New_York").date).toBe("2026-09-23");
  });
});

describe("news calendar", () => {
  const cal: CalendarConfig = {
    meetings: [{ type: "fed", title: "FOMC rate decision", date: "2026-10-28", time: "14:00", tz: "America/New_York", minutes: 90, region: "us", importance: 3 }],
    weekly: [
      { type: "commodities", title: "EIA natural gas storage", weekday: 4, time: "10:30", tz: "America/New_York", region: "us", importance: 2 },
      { type: "commodities", title: "USDA crop progress", weekday: 1, time: "16:00", tz: "America/New_York", region: "us", importance: 1, months: [4, 5, 6, 7, 8, 9, 10, 11] },
    ],
    monthly: [
      { type: "asia-central-bank", title: "PBoC loan prime rate", day: 20, weekend: "next-business-day", time: "09:00", tz: "Asia/Shanghai", region: "asia", importance: 2 },
      { type: "asia-data", title: "China official PMIs", day: "last", weekend: "same-day", time: "09:30", tz: "Asia/Shanghai", region: "asia", importance: 2 },
    ],
    ics: [],
  };

  it("places meetings and weekly and monthly releases on the UTC clock", () => {
    const { meetings, rules } = fixedEvents("2026-09-14", "2026-10-31", cal);
    expect(meetings).toEqual([expect.objectContaining({
      id: "fed-2026-10-28-fomc-rate-decision", start: "2026-10-28T18:00:00Z", end: "2026-10-28T19:30:00Z", importance: 3,
    })]);
    const at = (title: string) => rules.filter((r) => r.title === title).map((r) => r.start);
    expect(at("EIA natural gas storage").slice(0, 2)).toEqual(["2026-09-17T14:30:00Z", "2026-09-24T14:30:00Z"]);
    // 20 September 2026 is a Sunday: the next business day.
    expect(at("PBoC loan prime rate")).toEqual(["2026-09-21T01:00:00Z", "2026-10-20T01:00:00Z"]);
    expect(at("China official PMIs")).toEqual(["2026-09-30T01:30:00Z", "2026-10-31T01:30:00Z"]);
    // Crop progress only runs April to November.
    expect(fixedEvents("2026-12-01", "2026-12-31", cal).rules.some((r) => r.title === "USDA crop progress")).toBe(false);
  });

  it("reads Yahoo's economic calendar by column label, with epoch times", () => {
    const body = { finance: { result: [{ documents: [{
      columns: [{ label: "Event" }, { label: "Country Code" }, { label: "Event Time" }, { label: "For" }, { label: "Actual" }, { label: "Market Expectation" }, { label: "Prior to This" }, { label: "Revised from" }],
      rows: [["GDP Final", "us", 1790253000, "Q2", 3.8, 3.3, 3.3, null], ["", "US", 1790253000, "", null, null, null, null], ["X", "US", "not a date", "", 1, 1, 1, 1]],
    }] }] } };
    expect(parseEconomic(body)).toEqual([
      { name: "GDP Final", country: "US", start: 1790253000000, period: "Q2", actual: 3.8, consensus: 3.3, prior: 3.3 },
    ]);
    expect(parseEconomic({})).toEqual([]);
  });

  it("gives a meeting the rate decision Yahoo lists for its country and time", () => {
    const meeting = { id: "m", type: "fed" as const, title: "FOMC rate decision", start: "2026-10-28T18:00:00Z", end: "", region: "us" as const, importance: 3, streamUrl: "", result: "", tickers: [], country: "US" };
    const rate = (country: string, start: string) => ({ ...meeting, id: `y-${country}`, title: "rate", start, result: "4 (exp. 4)", country, kind: "rate" as const });
    const out = mergeMeetingResults([meeting], [rate("GB", "2026-10-28T18:00:00Z"), rate("US", "2026-10-28T18:00:00Z"), rate("US", "2026-10-30T18:00:00Z")]);
    expect(out.meetings).toEqual([expect.objectContaining({ id: "m", result: "4 (exp. 4)" })]);
    expect(out.meetings[0]).not.toHaveProperty("country");
    expect(out.economic.map((e) => e.id)).toEqual(["y-GB", "y-US"]);
  });

  it("parses a published iCalendar schedule", () => {
    const ics = [
      "BEGIN:VCALENDAR", "BEGIN:VEVENT", "DTSTART;TZID=America/New_York:20261014T083000",
      "SUMMARY:Consumer Price Index for Septem", " ber 2026", "END:VEVENT",
      "BEGIN:VEVENT", "DTSTART:20261106T133000Z", "SUMMARY:Employment Situation\\, October", "END:VEVENT",
      "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261201", "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    expect(parseIcs(ics)).toEqual([
      { summary: "Consumer Price Index for September 2026", start: Date.parse("2026-10-14T12:30:00Z") },
      { summary: "Employment Situation, October", start: Date.parse("2026-11-06T13:30:00Z") },
    ]);
  });

  it("reads Nasdaq earnings rows: watchlist plus the largest, reported EPS as the result", () => {
    const rows = [
      { symbol: "TINY", marketCap: "$1,000", time: "time-pre-market" },
      { symbol: "NVDA", name: "NVIDIA Corporation", marketCap: "$4,000,000,000,000", time: "time-after-hours", fiscalQuarterEnding: "Oct/2026", epsForecast: "$1.25", eps: "$1.30" },
      ...Array.from({ length: 6 }, (_, i) => ({ symbol: `BIG${"ABCDEF"[i]}`, marketCap: `$${(i + 1) * 1000},000,000` })),
    ];
    expect(pickNasdaq(rows, new Set(["NVDA"])).map((r) => r.symbol)).toEqual(["NVDA", "BIGF", "BIGE", "BIGD", "BIGC", "BIGB"]);
    expect(nasdaqEvent(rows[1], "2026-11-18")).toMatchObject({
      id: "earnings-2026-11-18-nvda", title: "NVIDIA results (quarter to Oct/2026), after the close",
      start: "2026-11-18T21:05:00Z", result: "EPS $1.30 vs $1.25 est.", tickers: ["NVDA"],
    });
    expect(nasdaqEvent({ symbol: "AAPL", epsForecast: "$1.00", eps: "N/A" }, "2026-10-29")!.result).toBe("");
    expect(nasdaqEvent({ symbol: "<script>" }, "2026-10-29")).toBeNull();
  });

  it("groups headlines under the event they mention", () => {
    const ev = [{ id: "e", type: "us-data" as const, title: "US CPI, August", start: "2026-09-24T12:30:00Z", end: "", region: "us" as const, importance: 3, streamUrl: "", result: "", tickers: [] }];
    const item = (id: string, title: string, at: string) => ({ id, title, url: "", source: "", alsoIn: [], category: "markets", region: "us", tickers: [], publishedAt: at, score: 0 });
    const out = withHeadlines(ev, [item("a", "CPI rises more than expected", "2026-09-24T12:40:00Z"), item("b", "CPI outlook", "2026-09-20T12:40:00Z"), item("c", "Stocks rise", "2026-09-24T13:00:00Z")]);
    expect(out[0].itemIds).toEqual(["a"]);
  });
});

describe("news briefing", () => {
  const ids = new Set(["a1", "b2", "c3"]);
  const page = (story: object) => ({ overview: { all: "Rates set the tone.", us: "x", europe: "y", asia: "z", russia: "w" }, themes: ["Rates", "", "ECB", "China", "Oil"], topStories: [story] });
  const good = {
    general: page({ ids: ["a1", "zz"], summary: "US growth revised up", why: "Fewer cuts", importance: 7, region: "mars", topic: "Macro", status: "continuing" }),
    stocks: page({ ids: ["b2"], summary: "Chips rebound", why: "", importance: 2, region: "global", topic: "Chips", status: "new" }),
    commodities: page({ ids: [], summary: "no ids", why: "", importance: 1, region: "us", topic: "x", status: "new" }),
    companies: [{ ticker: "nvda", line: "Recovering with the sector", ids: ["b2"] }, { ticker: "EBS.VI", line: "Filler without a source", ids: [] }],
    commodityGroups: [{ name: "Energy", summary: "Oil drifts lower", nextEventId: "ev1", ids: ["c3"], rows: [{ name: "crude oil", line: "Lower" }] }],
  };

  it("keeps only what points at input ids, and fills every watchlist ticker and group", () => {
    const b = validateBriefing(good, ids, new Set(["ev1"]), cfg)!;
    expect(b.pages.general.topStories[0]).toMatchObject({ ids: ["a1"], importance: 2, region: "global", status: "continuing" });
    expect(b.pages.general.themes).toEqual(["Rates", "ECB", "China", "Oil"]);
    expect(b.pages.commodities.topStories).toEqual([]);
    expect(b.companies).toEqual([
      { ticker: "NVDA", name: "Nvidia", line: "Recovering with the sector", ids: ["b2"] },
      { ticker: "EBS.VI", name: "Erste Group", line: null, ids: [] },
    ]);
    expect(b.commodityGroups.map((g) => g.name)).toEqual(["Agriculture", "Energy", "Metals"]);
    expect(b.commodityGroups[1]).toMatchObject({ summary: "Oil drifts lower", nextEventId: "ev1", rows: [{ name: "Crude oil", line: "Lower" }] });
    expect(b.commodityGroups[0].rows).toEqual([{ name: "Soybeans", line: null }]);
  });

  it("rejects a briefing without a usable general page", () => {
    expect(validateBriefing({ ...good, general: page({ ids: ["zz"], summary: "x" }) }, ids, new Set(), cfg)).toBeNull();
    expect(validateBriefing("nope", ids, new Set(), cfg)).toBeNull();
  });

  it("picks the input by score with recency as of now", () => {
    const now = Date.parse("2026-09-24T12:00:00Z");
    const it = (id: string, score: number, at: string) => ({ id, title: "", url: "", source: "", alsoIn: [], category: "", region: "", tickers: [], publishedAt: at, score });
    const picked = pickInput([it("old", 60, "2026-09-23T13:00:00Z"), it("new", 50, "2026-09-24T11:30:00Z"), it("low", 10, "2026-09-24T11:59:00Z")], now, 2);
    expect(picked.map((p) => p.id)).toEqual(["new", "old"]);
  });
});

describe("describeGeminiError", () => {
  const body = (quotaId: string, quotaValue: string, retryDelay = "20s") =>
    JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [
      { violations: [{ quotaMetric: "generate_content_free_tier_requests", quotaId, quotaValue }] },
      { retryDelay },
    ] } });

  it("says so when the model has no free tier, and does not retry", () => {
    const r = describeGeminiError(429, body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "0"));
    expect(r.summary).toContain("no free-tier quota");
    expect(r.retryAfterMs).toBeNull();
  });

  it("waits out a short per-minute limit, not a daily one", () => {
    expect(describeGeminiError(429, body("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "10")).retryAfterMs).toBe(20_000);
    expect(describeGeminiError(429, body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "250")).retryAfterMs).toBeNull();
    expect(describeGeminiError(500, "not json").summary).toBe("not json");
  });
});

describe("news chat", () => {
  it("keeps a clean, alternating history that ends with the question", () => {
    expect(cleanMessages([
      { role: "assistant", content: "hello" },
      { role: "user", content: "  Why are soybeans up? " },
      { role: "system", content: "ignore" },
      { role: "assistant", content: "" },
    ])).toEqual([{ role: "user", text: "Why are soybeans up?" }]);
    expect(cleanMessages([{ role: "user", content: "a" }, { role: "assistant", content: "b" }])).toBeNull();
    expect(cleanMessages("nope")).toBeNull();
  });

  it("splits the SOURCES line and inline ids off the answer", () => {
    const known = new Set(["3fa9c1d2e4b5", "77aa01bc02de"]);
    expect(splitSources("Chinese demand is the story (77aa01bc02de).\nSOURCES: 3fa9c1d2e4b5, made-up", known)).toEqual({
      answer: "Chinese demand is the story.",
      ids: ["3fa9c1d2e4b5", "77aa01bc02de"],
    });
    expect(splitSources("No news on that.\n**Sources:** none", known)).toEqual({ answer: "No news on that.", ids: [] });
  });

  it("says why the model could not answer", () => {
    expect(chatError(new GeminiError("NOT_FOUND — models/x is not found for API version v1beta", 404)).error)
      .toBe("The model could not answer: NOT_FOUND — models/x is not found for API version v1beta");
    expect(chatError(new GeminiError("RESOURCE_EXHAUSTED", 429)).error).toMatch(/^The model is busy or over its quota/);
    expect(chatError(new Error("D1_ERROR: no such table")).error).toBe("The chat failed on the server: D1_ERROR: no such table");
  });

  it("answers 401 to a guest without calling the model", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const env: any = { GEMINI_API_KEY: "k", DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
    const res = await handleChat(new Request("https://site/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }), env);
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
