// The Stack page's data: S&P 500 constituents and one price document per
// ticker, kept in D1 and refreshed by cron. Replaces bqe-backend's
// fetch_market_data.py, which ran on GitHub Actions and committed 46 MB of
// JSON into this repository every weekday.

import type { Env } from "./env";
import { isoNow, jsonText, mapLimit, utcDay } from "./http";
import { fetchQuote, yahooSymbol } from "./yahoo";

const WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";
const USER_AGENT = "bqe market-data (+https://github.com/SchwarzRene/bqe-frontend)";

// A parse that yields fewer rows than this is a changed page, not a smaller
// index — keep the list we have rather than deactivate most of it.
const MIN_CONSTITUENTS = 400;

// A failed ticker is retried after this long, so a throttled evening still
// fills in over the two-hour window without hammering the same symbol.
const RETRY_AFTER_MS = 20 * 60_000;

const CACHE = { "Cache-Control": "public, max-age=3600" };

export interface Constituent {
  s: string; // symbol as listed (BRK.B)
  f: string; // Yahoo spelling and file name (BRK-B)
  n: string; // company name
  sec: string; // GICS sector
}

// --------------------------------------------------------------------------
// serving
// --------------------------------------------------------------------------

/** GET /research/stack/data/<name>.json — D1 first, the committed file after. */
export async function serveStackFile(request: Request, env: Env, name: string): Promise<Response> {
  try {
    if (name === "index") {
      const index = await readIndex(env);
      if (index) return jsonText(index, 200, CACHE);
    } else {
      const row = await env.DB.prepare("SELECT body FROM series WHERE file = ?")
        .bind(name)
        .first<{ body: string }>();
      if (row) return jsonText(row.body, 200, CACHE);
    }
  } catch (err) {
    // No table yet (migrations not applied) or D1 unavailable: the committed
    // snapshot is right there, so this is a degraded answer, not an error.
    console.warn("stack: D1 read failed, serving the committed file", err);
  }
  return env.ASSETS.fetch(request);
}

/**
 * The ticker list, from D1 once D1 holds prices for nearly all of it. Before
 * that — the first evening, while the batches are still filling in — the
 * committed index is the better answer: it lists every ticker, and each file
 * D1 does not have yet falls back to its committed copy.
 */
async function readIndex(env: Env): Promise<string | null> {
  const { results } = await env.DB.prepare(
    `SELECT t.symbol AS s, t.file AS f, t.name AS n, t.sector AS sec, s.updated AS updated
       FROM tickers t LEFT JOIN series s ON s.file = t.file
      WHERE t.active = 1
      ORDER BY t.sector, t.symbol`,
  ).all<Constituent & { updated: string | null }>();
  const stored = results.filter((r) => r.updated);
  if (!stored.length || stored.length < results.length * 0.9) return null;

  const updated = stored.reduce((max, r) => (r.updated! > max ? r.updated! : max), "");
  const tickers = stored.map(({ s, f, n, sec }) => ({ s, f, n, sec }));
  return JSON.stringify({ updated, count: tickers.length, tickers });
}

// --------------------------------------------------------------------------
// refresh (cron)
// --------------------------------------------------------------------------

export interface RefreshReport {
  constituents?: string;
  attempted: number;
  refreshed: number;
  failed: string[];
  remaining: number;
}

/**
 * One cron tick: on the first tick of the day, refresh the constituent list;
 * then refresh the next batch of tickers that have not been refreshed today.
 */
export async function refreshStack(env: Env, now = new Date()): Promise<RefreshReport> {
  const today = utcDay(now);
  const report: RefreshReport = { attempted: 0, refreshed: 0, failed: [], remaining: 0 };

  const lastListDay = await env.DB.prepare("SELECT body FROM documents WHERE key = 'stack:constituents-day'")
    .first<{ body: string }>();
  if (lastListDay?.body !== today) {
    report.constituents = await refreshConstituents(env);
    await putDocument(env, "stack:constituents-day", today);
  }

  const batch = Math.max(1, Number(env.STACK_BATCH) || 20);
  const retryCutoff = new Date(now.getTime() - RETRY_AFTER_MS).toISOString();
  const { results: due } = await env.DB.prepare(
    `SELECT symbol, file, name, sector FROM tickers
      WHERE active = 1
        AND (refreshed_at IS NULL OR refreshed_at < ?1)
        AND (attempted_at IS NULL OR attempted_at < ?2)
      ORDER BY refreshed_at IS NOT NULL, refreshed_at
      LIMIT ?3`,
  )
    .bind(today, retryCutoff, batch)
    .all<{ symbol: string; file: string; name: string; sector: string }>();

  // Four at a time: polite to Yahoo, and well inside the per-invocation
  // limit on simultaneous open connections.
  const outcomes = await mapLimit(due, 4, async (t) => {
    const stamp = isoNow();
    try {
      const quote = await fetchQuote(t.file);
      const body = JSON.stringify({ s: t.symbol, n: t.name, sec: t.sector, updated: stamp, ...quote });
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO series (file, body, updated) VALUES (?1, ?2, ?3)
           ON CONFLICT (file) DO UPDATE SET body = excluded.body, updated = excluded.updated`,
        ).bind(t.file, body, stamp),
        env.DB.prepare(
          "UPDATE tickers SET refreshed_at = ?2, attempted_at = ?2, last_error = NULL WHERE symbol = ?1",
        ).bind(t.symbol, stamp),
      ]);
      return true;
    } catch (err) {
      await env.DB.prepare("UPDATE tickers SET attempted_at = ?2, last_error = ?3 WHERE symbol = ?1")
        .bind(t.symbol, stamp, String(err).slice(0, 200))
        .run();
      return false;
    }
  });

  report.attempted = due.length;
  report.refreshed = outcomes.filter(Boolean).length;
  report.failed = due.filter((_, i) => !outcomes[i]).map((t) => t.symbol);

  const left = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM tickers WHERE active = 1 AND (refreshed_at IS NULL OR refreshed_at < ?)",
  )
    .bind(today)
    .first<{ n: number }>();
  report.remaining = left?.n ?? 0;
  return report;
}

/**
 * Replace the ticker list from Wikipedia. When Wikipedia is unreachable or
 * its table has changed shape, keep what we have; on a completely empty
 * database, seed from the snapshot index committed next to the page.
 */
async function refreshConstituents(env: Env): Promise<string> {
  let members: Constituent[] = [];
  let source = "wikipedia";
  try {
    const res = await fetch(WIKI_URL, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`wikipedia ${res.status}`);
    members = parseConstituents(await res.text());
    if (members.length < MIN_CONSTITUENTS) throw new Error(`only ${members.length} rows parsed`);
  } catch (err) {
    console.warn("stack: constituent refresh failed", err);
    const have = await env.DB.prepare("SELECT COUNT(*) AS n FROM tickers").first<{ n: number }>();
    if (have?.n) return `kept existing list (${err})`;
    members = await committedIndex(env);
    source = "committed index.json";
    if (!members.length) return `no list available (${err})`;
  }

  // Two statements for the whole list, not one per ticker: the free plan
  // allows 50 D1 queries per invocation, and a batch counts each statement.
  const list = JSON.stringify(members);
  await env.DB.batch([
    // Leavers keep their row and their prices, they just drop out of the feed.
    env.DB.prepare(
      "UPDATE tickers SET active = 0 WHERE symbol NOT IN (SELECT json_extract(value, '$.s') FROM json_each(?))",
    ).bind(list),
    env.DB.prepare(
      `INSERT INTO tickers (symbol, file, name, sector, active)
       SELECT json_extract(value, '$.s'), json_extract(value, '$.f'),
              json_extract(value, '$.n'), json_extract(value, '$.sec'), 1
         FROM json_each(?) WHERE true
       ON CONFLICT (symbol) DO UPDATE SET file = excluded.file, name = excluded.name,
                                          sector = excluded.sector, active = 1`,
    ).bind(list),
  ]);
  return `${members.length} from ${source}`;
}

async function committedIndex(env: Env): Promise<Constituent[]> {
  try {
    const res = await env.ASSETS.fetch("https://assets.local/research/stack/data/index.json");
    if (!res.ok) return [];
    const body = await res.json<{ tickers?: Constituent[] }>();
    return (body.tickers ?? []).filter((t) => t && t.s && t.f);
  } catch {
    return [];
  }
}

/**
 * The constituents table on Wikipedia's S&P 500 page, as [{s, f, n, sec}].
 * Columns are found by their header text, so a reordered table still parses.
 */
export function parseConstituents(html: string): Constituent[] {
  const start = html.search(/<table[^>]*id="constituents"/);
  if (start < 0) return [];
  const end = html.indexOf("</table>", start);
  const table = html.slice(start, end < 0 ? undefined : end);

  const rows = table.split(/<tr[\s>]/).slice(1);
  let col: { s: number; n: number; sec: number } | null = null;
  const out: Constituent[] = [];

  for (const row of rows) {
    const headers = cells(row, "th");
    if (!col && headers.length) {
      const find = (re: RegExp) => headers.findIndex((h) => re.test(h));
      col = { s: find(/^symbol$/i), n: find(/^security$/i), sec: find(/^gics sector$/i) };
      if (col.s < 0 || col.n < 0 || col.sec < 0) return [];
      continue;
    }
    const tds = cells(row, "td");
    if (!col || tds.length <= Math.max(col.s, col.n, col.sec)) continue;
    const s = tds[col.s].toUpperCase();
    if (!s || !/^[A-Z0-9.\-]{1,10}$/.test(s)) continue;
    out.push({ s, f: yahooSymbol(s), n: tds[col.n], sec: tds[col.sec] });
  }
  out.sort((a, b) => a.sec.localeCompare(b.sec) || a.s.localeCompare(b.s));
  return out;
}

function cells(row: string, tag: "td" | "th"): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)(?=<${tag}[\\s>]|<\\/tr>|$)`, "g");
  return [...row.matchAll(re)].map((m) => text(m[1]));
}

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function putDocument(env: Env, key: string, body: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO documents (key, body, updated) VALUES (?1, ?2, ?3)
     ON CONFLICT (key) DO UPDATE SET body = excluded.body, updated = excluded.updated`,
  )
    .bind(key, body, isoNow())
    .run();
}
