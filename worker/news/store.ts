// Dedupe, filter, pre-score and store headline items; read them back for the
// briefing, the page and the chat.

import type { Env } from "../env";
import { isoNow } from "../http";
import { putDocument } from "../stack";
import { CONFIG, type Config, fetchAll, type RawItem, type SourceHealth } from "./feeds";
import { iso } from "./time";

export interface Item {
  id: string;
  title: string;
  url: string;
  source: string;
  alsoIn: { source: string; url: string }[];
  category: string;
  region: string;
  tickers: string[];
  publishedAt: string;
  score: number;
}

const DAY_MS = 86_400_000;
const KEEP_DAYS = 7;
const OVERLAP = 0.7;

// --------------------------------------------------------------------------
// filter + score
// --------------------------------------------------------------------------

export function isPromo(title: string, cfg: Config = CONFIG): boolean {
  return cfg.promoPatterns.some((p) => new RegExp(p, "i").test(title));
}

export function isBlocked(source: string, cfg: Config = CONFIG): boolean {
  const s = source.trim().toLowerCase();
  return cfg.blockedPublishers.some((b) => s === b.toLowerCase());
}

/**
 * 0-100 from source weight, number of sources, recency, watchlist mentions
 * and words that match today's calendar. Used to pick what the model sees.
 */
export function scoreItem(
  item: { weight?: number; source: string; alsoIn: unknown[]; publishedAt: string; tickers: string[]; title: string },
  now: number,
  eventWords: string[] = [],
): number {
  const weight = item.weight ?? 16;
  const sources = Math.min(30, item.alsoIn.length * 15);
  const ageH = Math.max(0, (now - Date.parse(item.publishedAt)) / 3_600_000);
  const recency = Math.max(0, 25 * (1 - ageH / 24));
  const watch = item.tickers.length ? 15 : 0;
  const upper = item.title;
  const event = eventWords.some((w) => new RegExp(`\\b${w}\\b`).test(upper)) ? 10 : 0;
  return Math.round(Math.min(100, weight + sources + recency + watch + event));
}

// --------------------------------------------------------------------------
// dedupe
// --------------------------------------------------------------------------

const STOP = new Set(
  "the a an and or but for nor of on in at to from by with as is are was were be been it its this that these those after before over under into amid says said new more than about".split(" "),
);

export function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[’']s\b/g, "")
      .split(/[^a-z0-9%$.]+/)
      .map((w) => w.replace(/^\.+|\.+$/g, ""))
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/** Near-identical: most of the shorter title's words are in the other one. */
export function sameStory(a: Set<string>, b: Set<string>): boolean {
  const small = a.size <= b.size ? a : b;
  const large = small === a ? b : a;
  if (small.size < 4) return small.size > 0 && small.size === large.size && [...small].every((w) => large.has(w));
  let shared = 0;
  for (const w of small) if (large.has(w)) shared++;
  return shared / small.size >= OVERLAP;
}

export interface Known {
  id: string;
  words: Set<string>;
  source: string;
  alsoIn: { source: string; url: string }[];
  changed?: boolean;
  weight?: number;
  publishedAt: string;
  tickers: string[];
  title: string;
}

/**
 * Fold fresh items into what is already stored. Same URL: dropped. A
 * near-identical title: the new source is added to the story's `alsoIn`
 * (more sources is a signal of importance). Anything else is new.
 */
export function dedupe(fresh: RawItem[], known: Known[]): { added: RawItem[]; merged: Known[] } {
  const byId = new Map(known.map((k) => [k.id, k]));
  const pool: Known[] = [...known];
  const added: RawItem[] = [];
  const merged = new Set<Known>();
  for (const item of [...fresh].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))) {
    if (byId.has(item.id)) continue;
    const words = titleWords(item.title);
    const twin = pool.find((k) => sameStory(words, k.words));
    if (twin) {
      byId.set(item.id, twin);
      const already = twin.source === item.source || twin.alsoIn.some((a) => a.source === item.source);
      if (!already) {
        twin.alsoIn.push({ source: item.source, url: item.url });
        twin.tickers = [...new Set([...twin.tickers, ...item.tickers])];
        merged.add(twin);
      }
      continue;
    }
    const entry: Known = {
      id: item.id, words, source: item.source, alsoIn: [], weight: item.weight,
      publishedAt: item.publishedAt, tickers: item.tickers, title: item.title,
    };
    byId.set(item.id, entry);
    pool.push(entry);
    added.push(item);
  }
  // A merge into an item added in this same run is part of that insert.
  const addedIds = new Set(added.map((a) => a.id));
  for (const a of added) {
    const k = byId.get(a.id)!;
    a.tickers = k.tickers;
    (a as RawItem & { alsoIn?: Known["alsoIn"] }).alsoIn = k.alsoIn;
  }
  return { added, merged: [...merged].filter((k) => !addedIds.has(k.id)) };
}

// --------------------------------------------------------------------------
// the fetch job
// --------------------------------------------------------------------------

export interface FetchReport {
  fetched: number;
  added: number;
  merged: number;
  failed: string[];
}

/** Fetch every source and store what is new. */
export async function ingest(env: Env, now = Date.now(), cfg: Config = CONFIG): Promise<FetchReport> {
  const { items, health } = await fetchAll(cfg);
  const cutoff = now - DAY_MS;
  const eventWords = await todayEventWords(env, now);
  const fresh = items.filter(
    (i) => Date.parse(i.publishedAt) >= cutoff && !isPromo(i.title, cfg) && !isBlocked(i.source, cfg),
  );

  const rows = await env.DB.prepare(
    "SELECT id, title, source, also_in, tickers, published_at, score FROM news_items WHERE published_at > ?",
  )
    .bind(iso(now - 2 * DAY_MS))
    .all<{ id: string; title: string; source: string; also_in: string; tickers: string; published_at: string; score: number }>();
  const known: Known[] = (rows.results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    words: titleWords(r.title),
    source: r.source,
    alsoIn: parseList(r.also_in),
    tickers: parseList(r.tickers),
    publishedAt: r.published_at,
  }));

  const { added, merged } = dedupe(fresh, known);
  const stamp = isoNow();
  const statements: D1PreparedStatement[] = [];
  for (const a of added) {
    const alsoIn = (a as RawItem & { alsoIn?: Known["alsoIn"] }).alsoIn ?? [];
    const score = scoreItem({ ...a, alsoIn }, now, eventWords);
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO news_items (id, title, url, source, also_in, category, region, tickers, published_at, score, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(a.id, a.title, a.url, a.source, JSON.stringify(alsoIn), a.category, a.region, JSON.stringify(a.tickers), a.publishedAt, score, stamp),
    );
    for (const t of a.tickers) {
      statements.push(env.DB.prepare("INSERT OR IGNORE INTO news_item_tickers (item_id, ticker) VALUES (?, ?)").bind(a.id, t));
    }
  }
  for (const m of merged) {
    const score = scoreItem({ ...m, weight: 16 }, now, eventWords);
    // fetched_at moves too: a story picked up by another outlet is news again.
    statements.push(
      env.DB.prepare("UPDATE news_items SET also_in = ?, tickers = ?, score = MAX(score, ?), fetched_at = ? WHERE id = ?").bind(
        JSON.stringify(m.alsoIn), JSON.stringify(m.tickers), score, stamp, m.id,
      ),
    );
    for (const t of m.tickers) {
      statements.push(env.DB.prepare("INSERT OR IGNORE INTO news_item_tickers (item_id, ticker) VALUES (?, ?)").bind(m.id, t));
    }
  }
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));

  await recordHealth(env, health, now);
  return {
    fetched: items.length,
    added: added.length,
    merged: merged.length,
    failed: Object.entries(health).filter(([, h]) => !h.ok).map(([id]) => id),
  };
}

export function parseList<T = any>(text: string | null | undefined): T[] {
  try {
    const v = JSON.parse(text || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------
// source health
// --------------------------------------------------------------------------

export interface HealthDoc {
  updated: string;
  sources: Record<string, { lastOk: string | null; lastError: string | null; count: number }>;
}

/** Per-source log; a source silent for 24 h is logged as a warning on every run. */
async function recordHealth(env: Env, run: Record<string, SourceHealth>, now: number): Promise<void> {
  const prev = await readHealth(env);
  const stamp = iso(now);
  const sources: HealthDoc["sources"] = { ...(prev?.sources ?? {}) };
  for (const [id, h] of Object.entries(run)) {
    const before = sources[id] ?? { lastOk: null, lastError: null, count: 0 };
    sources[id] = h.ok && h.count > 0
      ? { lastOk: stamp, lastError: null, count: h.count }
      : { ...before, lastError: h.error ?? "no items", count: 0 };
  }
  const silent = staleSources({ updated: stamp, sources }, now);
  if (silent.length) console.warn(`news: no items for 24 h from ${silent.join(", ")}`);
  await putDocument(env, "news:health", JSON.stringify({ updated: stamp, sources }));
}

export async function readHealth(env: Env): Promise<HealthDoc | null> {
  const row = await env.DB.prepare("SELECT body FROM documents WHERE key = 'news:health'").first<{ body: string }>();
  try {
    return row ? JSON.parse(row.body) : null;
  } catch {
    return null;
  }
}

export function staleSources(doc: HealthDoc | null, now: number, hours = 24): string[] {
  if (!doc) return [];
  return Object.entries(doc.sources)
    .filter(([, s]) => !s.lastOk || now - Date.parse(s.lastOk) > hours * 3_600_000)
    .map(([id]) => id);
}

// --------------------------------------------------------------------------
// reading
// --------------------------------------------------------------------------

type Row = {
  id: string; title: string; url: string; source: string; also_in: string; category: string;
  region: string; tickers: string; published_at: string; score: number;
};

const COLUMNS = "id, title, url, source, also_in, category, region, tickers, published_at, score";

export function toItem(r: Row): Item {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    source: r.source,
    alsoIn: parseList(r.also_in),
    category: r.category,
    region: r.region,
    tickers: parseList(r.tickers),
    publishedAt: r.published_at,
    score: r.score,
  };
}

/** Headlines of the last `hours`, newest first. */
export async function recentItems(env: Env, now: number, hours = 24, limit = 250): Promise<Item[]> {
  const rows = await env.DB.prepare(`SELECT ${COLUMNS} FROM news_items WHERE published_at > ? ORDER BY published_at DESC LIMIT ?`)
    .bind(iso(now - hours * 3_600_000), limit)
    .all<Row>();
  return (rows.results ?? []).map(toItem);
}

export async function itemsById(env: Env, ids: string[]): Promise<Item[]> {
  const unique = [...new Set(ids)].slice(0, 90);
  if (!unique.length) return [];
  const rows = await env.DB.prepare(`SELECT ${COLUMNS} FROM news_items WHERE id IN (${unique.map(() => "?").join(",")})`)
    .bind(...unique)
    .all<Row>();
  return (rows.results ?? []).map(toItem);
}

/** Words (all-caps acronyms, tickers) that tie a headline to one of today's events. */
export function eventWordsFor(titles: string[], tickers: string[] = []): string[] {
  const words = new Set<string>();
  for (const t of titles) for (const w of t.match(/\b[A-Z][A-Z+]{1,6}\b/g) ?? []) if (!["US", "EU", "UK", "Q1", "Q2", "Q3", "Q4"].includes(w)) words.add(w.replace(/\+$/, ""));
  for (const t of tickers) words.add(t.split(".")[0]);
  return [...words];
}

async function todayEventWords(env: Env, now: number): Promise<string[]> {
  try {
    const rows = await env.DB.prepare("SELECT title, tickers FROM news_events WHERE start_at BETWEEN ? AND ?")
      .bind(iso(now - 12 * 3_600_000), iso(now + 12 * 3_600_000))
      .all<{ title: string; tickers: string }>();
    const list = rows.results ?? [];
    return eventWordsFor(list.map((r) => r.title), list.flatMap((r) => parseList<string>(r.tickers)));
  } catch {
    return [];
  }
}

/** Items, briefings and past events older than 7 days. Run daily. */
export async function pruneNews(env: Env, now = Date.now()): Promise<void> {
  const cutoff = iso(now - KEEP_DAYS * DAY_MS);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM news_item_tickers WHERE item_id IN (SELECT id FROM news_items WHERE published_at < ?)").bind(cutoff),
    env.DB.prepare("DELETE FROM news_items WHERE published_at < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM news_briefings WHERE generated_at < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM news_events WHERE start_at < ?").bind(iso(now - 14 * DAY_MS)),
    env.DB.prepare("DELETE FROM news_chat_usage WHERE day < ?").bind(cutoff.slice(0, 10)),
    // What Market Tape, which Market News replaced, left behind.
    env.DB.prepare("DELETE FROM documents WHERE key LIKE 'markettape:%'"),
  ]);
}
