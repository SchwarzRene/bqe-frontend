// Fetch and normalize: every source in sources.json becomes a list of
// headline items in one shape. Headlines, sources, times and links only —
// article bodies are never fetched.

import { mapLimit } from "../http";
import config from "./sources.json";
import { iso } from "./time";

export type Category = "world" | "markets" | "company" | "policy" | "commodities";
export type Region = "us" | "europe" | "asia" | "russia" | "global";

export const REGIONS: Region[] = ["us", "europe", "asia", "russia", "global"];
export const CATEGORIES: Category[] = ["world", "markets", "company", "policy", "commodities"];

export interface Feed {
  id: string;
  name: string;
  type: "rss";
  url: string;
  category: Category;
  region: Region;
  weight: number;
}

export interface WatchItem {
  symbol: string;
  name: string;
  region: Region;
}

export interface Commodity {
  symbol: string;
  name: string;
  group: "Agriculture" | "Energy" | "Metals";
}

export interface Config {
  feeds: Feed[];
  yahooWeight: number;
  watchlist: WatchItem[];
  commodities: Commodity[];
  blockedPublishers: string[];
  promoPatterns: string[];
}

export const CONFIG = config as Config;

/** One headline as it comes off a source, before dedupe. */
export interface RawItem {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceId: string;
  category: Category;
  region: Region;
  tickers: string[];
  publishedAt: string; // ISO, UTC
  weight: number;
}

export interface SourceHealth {
  ok: boolean;
  count: number;
  error?: string;
}

const USER_AGENT = "Mozilla/5.0 (compatible; bqe-frontend/1.0; +https://github.com/SchwarzRene/bqe-frontend)";
const TIMEOUT_MS = 10_000;
const YAHOO_SEARCH = "https://query2.finance.yahoo.com/v1/finance/search";

// --------------------------------------------------------------------------
// fetching
// --------------------------------------------------------------------------

/** True for a headline already stored: it is skipped before any further work. */
export type Known = (title: string) => boolean;

/**
 * Every source in parallel (a few at a time), 10 s each. A failed source is
 * skipped and reported in `health`; it never blocks the run.
 *
 * CPU is the scarce thing here (10 ms per run on the Workers free plan), so
 * headlines already stored (`known`) are dropped right after parsing, and
 * only the rest are normalized, classified and hashed.
 */
export interface FetchPlan {
  /** Which share of the sources this run fetches: sources i with i % of === part. */
  part: number;
  of: number;
  /** New headlines normalized per run at most; the rest are still new next run. */
  budget: number;
}

export async function fetchAll(
  cfg: Config = CONFIG,
  fetcher: typeof fetch = fetch,
  known: Known = () => false,
  plan: FetchPlan = { part: 0, of: 1, budget: Infinity },
  now: number = Date.now(),
): Promise<{ items: RawItem[]; health: Record<string, SourceHealth> }> {
  const budget = { left: plan.budget };
  // Older headlines are skipped right after the parse.
  const since = now - 26 * 3_600_000;
  const all: { id: string; run: () => Promise<{ items: RawItem[]; seen: number }> }[] = [
    ...cfg.feeds.map((feed) => ({ id: feed.id, run: () => fetchFeed(feed, cfg, fetcher, known, budget, since) })),
    ...cfg.watchlist.map((w) => ({
      id: `yahoo:${w.symbol}`,
      run: () => fetchYahoo(w.symbol, "company", w.region, cfg, fetcher, known, budget, since),
    })),
    ...cfg.commodities.map((c) => ({
      id: `yahoo:${c.symbol}`,
      run: () => fetchYahoo(c.symbol, "commodities", "global", cfg, fetcher, known, budget, since),
    })),
  ];
  const jobs = all.filter((_, i) => i % plan.of === plan.part);
  const health: Record<string, SourceHealth> = {};
  const lists = await mapLimit(jobs, 8, async (job) => {
    try {
      const { items, seen } = await job.run();
      health[job.id] = { ok: true, count: seen };
      return items;
    } catch (err) {
      health[job.id] = { ok: false, count: 0, error: String(err instanceof Error ? err.message : err).slice(0, 200) };
      return [];
    }
  });
  return { items: lists.flat(), health };
}

async function get(url: string, fetcher: typeof fetch, accept: string): Promise<string> {
  const res = await fetcher(url, {
    headers: { "User-Agent": USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchFeed(feed: Feed, cfg: Config, fetcher: typeof fetch, known: Known, budget: { left: number }, since: number): Promise<{ items: RawItem[]; seen: number }> {
  const xml = await get(feed.url, fetcher, "application/rss+xml, application/atom+xml, application/xml, text/xml");
  const entries = parseFeed(xml);
  if (!entries.length) throw new Error("no items in the feed");
  const out: RawItem[] = [];
  for (const e of entries) {
    // Old and already-stored headlines cost nothing beyond the parse.
    if (known(e.title) || Date.parse(e.date) < since || budget.left <= 0) continue;
    budget.left--;
    const item = toItem(
      { title: e.title, link: e.link, date: e.date, source: feed.name },
      { sourceId: feed.id, category: feed.category, region: feed.region, weight: feed.weight },
      cfg,
    );
    if (item) out.push(item);
  }
  return { items: out, seen: entries.length };
}

async function fetchYahoo(
  symbol: string,
  category: Category,
  region: Region,
  cfg: Config,
  fetcher: typeof fetch,
  known: Known,
  budget: { left: number },
  since: number,
): Promise<{ items: RawItem[]; seen: number }> {
  const url = `${YAHOO_SEARCH}?${new URLSearchParams({ q: symbol, newsCount: "10", quotesCount: "0" })}`;
  const body = JSON.parse(await get(url, fetcher, "application/json"));
  const news: any[] = Array.isArray(body?.news) ? body.news : [];
  const out: RawItem[] = [];
  for (const n of news) {
    const when = Number(n?.providerPublishTime);
    if (known(cleanText(String(n?.title ?? ""))) || when * 1000 < since || budget.left <= 0) continue;
    budget.left--;
    const item = toItem(
      {
        title: String(n?.title ?? ""),
        link: String(n?.link ?? ""),
        date: Number.isFinite(when) ? new Date(when * 1000).toISOString() : "",
        source: String(n?.publisher || "Yahoo"),
      },
      { sourceId: `yahoo:${symbol}`, category, region, weight: cfg.yahooWeight },
      cfg,
      [symbol, ...(Array.isArray(n?.relatedTickers) ? n.relatedTickers.map(String) : [])],
    );
    if (item) out.push(item);
  }
  return { items: out, seen: news.length };
}

// --------------------------------------------------------------------------
// parsing
// --------------------------------------------------------------------------

export interface FeedEntry {
  title: string;
  link: string;
  date: string;
}

const MAX_PER_FEED = 25;

/** RSS <item>s and Atom <entry>s, by pattern: Workers have no DOMParser. The newest 25 per feed. */
export function parseFeed(xml: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  let n = 0;
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi)) {
    if (n++ >= MAX_PER_FEED) break;
    const block = m[0];
    const title = cleanText(tag(block, "title"));
    let link = cleanText(tag(block, "link"));
    if (!/^https?:\/\//.test(link)) {
      // Atom: <link href="…"/>, preferring rel="alternate" (or no rel).
      const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
      const pick = links.find((a) => !/rel\s*=/.test(a) || /rel\s*=\s*["']alternate["']/.test(a)) ?? links[0];
      link = pick ? decodeEntities(pick.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? "") : "";
    }
    if (!/^https?:\/\//.test(link)) link = cleanText(tag(block, "guid"));
    const date = cleanText(tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date"));
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, date });
  }
  return out;
}

const TAGS = new Map<string, RegExp>();

function tag(block: string, name: string): string {
  let re = TAGS.get(name);
  if (!re) TAGS.set(name, (re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i")));
  const m = block.match(re);
  return m ? m[1] : "";
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** CDATA unwrapped, tags stripped, entities decoded, whitespace collapsed. */
export function cleanText(raw: string): string {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Decode first: some feeds escape their markup (&lt;b&gt;) inside the title.
  return decodeEntities(decodeEntities(unwrapped).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// --------------------------------------------------------------------------
// normalizing
// --------------------------------------------------------------------------

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|mc_cid|mc_eid|cmpid|ncid|taid|__source|cid|ref|src|guccounter|guce_referrer|guce_referrer_sig|soc_src|soc_trk|at_medium|at_campaign|yptr)$/i;

/** The URL without tracking parameters, fragment or trailing slash; host lowercased. */
export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return url.toString().replace(/\?$/, "");
}

/**
 * 12 hex characters from the normalized URL: two independent 32-bit string
 * hashes (cyrb53's mixing). Not cryptographic — it only has to tell URLs
 * apart — and a small fraction of the CPU SHA-256 took.
 */
export function itemId(url: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < url.length; i++) {
    const ch = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0").slice(2) + (h1 >>> 0).toString(16).padStart(8, "0").slice(2);
}

const COMMODITY_WORDS = /\b(oil|crude|brent|wti|opec\+?|natural gas|lng|gold|silver|copper|soybeans?|corn|wheat|coffee|grains?|harvest|wasde)\b/i;
const REGION_WORDS: [Region, RegExp][] = [
  ["russia", /\b(russia|russian|kremlin|moscow|putin|ruble|rouble)\b/i],
  ["asia", /\b(china|chinese|beijing|japan|japanese|tokyo|korea|korean|taiwan|india|indian|hong kong|pboc|boj|nikkei|yuan|yen)\b/i],
  // Case-sensitive: "US", "EU" and "UK" are also ordinary words in lower case.
  ["europe", /\b(Europe|European|EU|Euro|euro|eurozone|ECB|Germany|German|France|French|Italy|Spain|Austria|Vienna|Brussels|UK|Britain|British|BoE)\b/],
  ["us", /(\bU\.S\.|\b(US|America|American|Fed|Federal Reserve|Wall Street|Treasury|White House|Washington)\b)/],
];

/** Region and category from the words of a headline, where the source is broad. */
export function classify(title: string, category: Category, region: Region): { category: Category; region: Region } {
  let cat = category;
  if ((cat === "markets" || cat === "world") && COMMODITY_WORDS.test(title)) cat = "commodities";
  let reg = region;
  if (reg === "global") reg = REGION_WORDS.find(([, re]) => re.test(title))?.[0] ?? "global";
  return { category: cat, region: reg };
}

const MATCHERS = new WeakMap<WatchItem[], { symbol: string; upper: string; name: RegExp; bare: RegExp | null }[]>();

/** Watchlist tickers a headline is about: named, or given by Yahoo. */
export function tickersFor(title: string, given: string[], watchlist: WatchItem[]): string[] {
  let matchers = MATCHERS.get(watchlist);
  if (!matchers) {
    matchers = watchlist.map((w) => {
      const bare = w.symbol.split(".")[0];
      return {
        symbol: w.symbol,
        upper: w.symbol.toUpperCase(),
        name: new RegExp(`\\b${escapeRe(w.name)}\\b`, "i"),
        bare: bare.length >= 3 ? new RegExp(`(^|[^A-Za-z])${escapeRe(bare)}([^A-Za-z]|$)`) : null,
      };
    });
    MATCHERS.set(watchlist, matchers);
  }
  const upperGiven = given.length ? new Set(given.map((t) => t.toUpperCase())) : null;
  const found: string[] = [];
  for (const m of matchers) {
    if (upperGiven?.has(m.upper) || m.name.test(title) || m.bare?.test(title)) found.push(m.symbol);
  }
  return found;
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toItem(
  e: { title: string; link: string; date: string; source: string },
  meta: { sourceId: string; category: Category; region: Region; weight: number },
  cfg: Config,
  givenTickers: string[] = [],
): RawItem | null {
  const title = cleanText(e.title).slice(0, 300);
  const url = normalizeUrl(e.link);
  const published = Date.parse(e.date);
  if (!title || !url || Number.isNaN(published)) return null;
  const { category, region } = classify(title, meta.category, meta.region);
  const tickers = tickersFor(title, givenTickers, cfg.watchlist);
  // A futures headline is about the commodity, not a watchlist company.
  const cat = meta.category === "commodities" ? "commodities" : tickers.length && category === "markets" ? "company" : category;
  return {
    id: itemId(url),
    title,
    url,
    source: e.source.slice(0, 80),
    sourceId: meta.sourceId,
    category: cat,
    region,
    tickers,
    publishedAt: iso(Math.min(published, Date.now())),
    weight: meta.weight,
  };
}
