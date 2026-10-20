// The stubbed internet and database setup shared by the Market News flow tests.

import { vi } from "vitest";
import { d1 } from "../helpers/d1";
import type { Config } from "../../worker/news/feeds";
import { ingest as ingestPart } from "../../worker/news/store";

// Every source in one run: the rotation over runs is tested on its own.
export const ALL = { part: 0, of: 1, budget: Infinity };

export const ingest = (env: any, now: number, cfg: Config) => ingestPart(env, now, cfg, fetch, ALL);

export const cfg: Config = {
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

export const NOW = Date.parse("2026-09-24T12:05:00Z"); // Thursday, 08:05 New York: the pre-market slot

export function rss(items: [string, string, number][]): string {
  return `<rss><channel>${items
    .map(([title, link, minutesAgo]) => `<item><title>${title}</title><link>${link}</link><pubDate>${new Date(NOW - minutesAgo * 60_000).toUTCString()}</pubDate></item>`)
    .join("")}</channel></rss>`;
}

export const gemini = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));

/** Stubbed internet: two feeds, Yahoo, and a Gemini that answers by what it is asked. */
export function internet(opts: { briefing?: (prompt: string) => unknown; rank?: (prompt: string) => unknown; chat?: (body: any) => Response; econ?: () => unknown[][] } = {}) {
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
        if (prompt.startsWith("Headlines (id | source | title):")) {
          // The headline ranking: GDP news matters most, Nvidia is NVDA.
          const lines = prompt.split("\n").slice(1);
          return gemini(JSON.stringify({ headlines: lines.map((l) => {
            const [id, , title] = l.split(" | ");
            return { id, importance: /GDP/.test(title) ? 5 : 2, tone: /recover/.test(title) ? "+" : "0", tickers: /Nvidia/.test(title) ? ["NVDA", "MADE.UP"] : [] };
          }) }));
        }
        if (prompt.startsWith("Days: ")) return gemini(JSON.stringify(opts.rank ? opts.rank(prompt) : null));
        return gemini(JSON.stringify(opts.briefing ? opts.briefing(prompt) : null));
      }
      if (opts.chat) return opts.chat(body);
    }
    return new Response("not found", { status: 404 });
  });
  return calls;
}

export function envWith(db = d1()) {
  return { DB: db as any, GEMINI_API_KEY: "k", ASSETS: { fetch: async () => new Response("", { status: 404 }) } } as any;
}

/** A valid briefing that cites whatever ids are in the prompt. */
export function briefingFrom(prompt: string) {
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

export async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
