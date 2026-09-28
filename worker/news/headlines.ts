// Headline ranking: after each fetch, Gemma reads the headlines that have
// not been through it yet and returns, for each one, its importance for
// markets (1-5, the briefing's scale), its tone, and the companies it is
// about. That gives every headline a model ranking, not only the hundred or
// so the briefing sees, and ties company news to all ~500 S&P 500 names
// instead of only the watchlist's, so the chat's get_company finds it.
//
// Gemma on the Gemini API takes neither a system instruction nor a JSON
// schema, so the rules are in the prompt and the answer is parsed from text.
// No fallback to the Gemini models: those quotas belong to the briefing and
// the chat, and a headline that is not ranked keeps its rule-based score.

import type { Env } from "../env";
import { isoNow } from "../http";
import { CONFIG, type Config } from "./feeds";
import { gemmaModel, generate, textOf } from "./gemini";
import { iso } from "./time";

/** Headlines per model call: ~2k tokens in, well inside Gemma's per-minute limit. */
export const RANK_BATCH = 60;

export interface Ranking {
  importance: number | null;
  tone: string | null;
  tickers: string[];
}

export function rankPrompt(items: { id: string; source: string; title: string }[], cfg: Config = CONFIG): string {
  const nonUs = cfg.watchlist.filter((w) => /[.=]/.test(w.symbol)).map((w) => `${w.symbol} (${w.name})`);
  const futures = cfg.commodities.map((c) => `${c.symbol} ${c.name.toLowerCase()}`);
  return `You rank news headlines for a trading desk that trades US equities, gold and NASDAQ futures.

For every headline below return one object:
- "id": the headline's id, unchanged.
- "i": importance for markets, 1-5. 5 = can move a whole index or a mega-cap stock (central bank decisions, CPI or jobs data, a major escalation, a mega-cap's earnings or guidance). 4 = moves a sector or a large company. 3 = notable company or economic news. 2 = minor. 1 = no market relevance.
- "t": symbols of the companies or contracts the headline is about. US companies by their US ticker (AAPL, BRK.B, GOOGL); also ${nonUs.join(", ")}; futures ${futures.join(", ")}. Only what is clearly named or unambiguously meant; [] if none.
- "s": tone for those companies, or for markets if none: "+" good, "-" bad, "0" neutral or mixed.

Reply with only a JSON array, no other text, for example:
[{"id":"3fa9c1d2e4b5","i":3,"t":["NVDA"],"s":"+"}]

Headlines (id | source | title):
${items.map((i) => `${i.id} | ${i.source} | ${i.title.replace(/\s+/g, " ")}`).join("\n")}`;
}

/**
 * The model's answer, checked: only ids that were asked about, importance
 * 1-5, tone one of + - 0, and only symbols in `known` (Yahoo spelling, so
 * BRK.B becomes BRK-B). Anything else is dropped rather than guessed at.
 */
export function parseRanks(text: string, ids: Set<string>, known: Set<string>): Map<string, Ranking> {
  const out = new Map<string, Ranking>();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return out;
  let list: unknown;
  try {
    list = JSON.parse(text.slice(start, end + 1));
  } catch {
    return out;
  }
  if (!Array.isArray(list)) return out;
  for (const r of list as any[]) {
    const id = String(r?.id ?? "");
    if (!ids.has(id) || out.has(id)) continue;
    const i = Math.round(Number(r?.i));
    const tone = ["+", "-", "0"].includes(String(r?.s)) ? String(r.s) : null;
    const tickers: string[] = [];
    for (const raw of Array.isArray(r?.t) ? r.t : []) {
      const t = String(raw).trim().toUpperCase();
      const symbol = known.has(t) ? t : known.has(t.replace(/\./g, "-")) ? t.replace(/\./g, "-") : null;
      if (symbol && !tickers.includes(symbol)) tickers.push(symbol);
    }
    out.set(id, { importance: i >= 1 && i <= 5 ? i : null, tone, tickers: tickers.slice(0, 8) });
  }
  return out;
}

/**
 * Rank the newest headlines Gemma has not seen yet, one call. Every headline
 * sent is marked ranked, answered or not, so a headline the model skips is
 * not sent again on every run; a failed call marks nothing.
 */
export async function rankHeadlines(env: Env, now = Date.now(), cfg: Config = CONFIG, limit = RANK_BATCH): Promise<string> {
  const modelName = gemmaModel(env);
  if (!modelName || !env.GEMINI_API_KEY) return "off";
  const { results: items } = await env.DB.prepare(
    `SELECT id, title, source, tickers FROM news_items
      WHERE ranked_at IS NULL AND published_at > ? ORDER BY published_at DESC LIMIT ?`,
  )
    .bind(iso(now - 26 * 3_600_000), limit)
    .all<{ id: string; title: string; source: string; tickers: string }>();
  if (!items.length) return "nothing to rank";

  const { results: active } = await env.DB.prepare("SELECT file FROM tickers WHERE active = 1").all<{ file: string }>();
  const known = new Set([...active.map((t) => t.file), ...cfg.watchlist.map((w) => w.symbol), ...cfg.commodities.map((c) => c.symbol)]);

  const body = await generate(env, modelName, {
    contents: [{ role: "user", parts: [{ text: rankPrompt(items, cfg) }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  }, "rank", { fallback: false });
  const ranks = parseRanks(textOf(body), new Set(items.map((i) => i.id)), known);

  const rows: { id: string; i: number | null; s: string | null; tk: string }[] = [];
  const pairs: [string, string][] = [];
  for (const item of items) {
    const r = ranks.get(item.id);
    let had: string[] = [];
    try {
      had = JSON.parse(item.tickers);
    } catch {
      /* kept empty */
    }
    const tickers = [...new Set([...had, ...(r?.tickers ?? [])])];
    for (const t of r?.tickers ?? []) if (!had.includes(t)) pairs.push([item.id, t]);
    rows.push({ id: item.id, i: r?.importance ?? null, s: r?.tone ?? null, tk: JSON.stringify(tickers) });
  }
  // Two statements for the whole batch (the free plan counts every statement).
  const pick = (field: string) => `(SELECT json_extract(value, '$.${field}') FROM json_each(?1) WHERE json_extract(value, '$.id') = news_items.id)`;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE news_items SET importance = ${pick("i")}, tone = ${pick("s")}, tickers = ${pick("tk")}, ranked_at = ?2
        WHERE id IN (SELECT json_extract(value, '$.id') FROM json_each(?1))`,
    ).bind(JSON.stringify(rows), isoNow()),
    env.DB.prepare(
      `INSERT OR IGNORE INTO news_item_tickers (item_id, ticker)
       SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?)`,
    ).bind(JSON.stringify(pairs)),
  ]);
  const tagged = rows.filter((r) => ranks.get(r.id)?.tickers.length).length;
  return `${ranks.size} of ${items.length} ranked by ${modelName}, ${tagged} tied to companies`;
}
