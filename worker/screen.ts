// The S&P 500 screen: one row of figures per constituent — returns over
// several horizons, distance from the 52-week range and the moving averages,
// RSI and volatility — computed from the daily bars the Stack job already
// keeps in D1. The Market News chat reads it, so a question about "which
// stocks" can be answered across the whole index instead of only the few
// companies the news fetch watches.
//
// Kept as a single document ('stack:screen', ~500 short rows), updated from
// the quotes each Stack batch has just refreshed: no extra download and no
// second read of the 100 KB price documents.

import type { Env } from "./env";
import { isoNow } from "./http";
import type { Columns } from "./yahoo";

const KEY = "stack:screen";

// A backfill reads this many price documents per run: about 2.5 MB, well
// inside a free-plan invocation.
const BACKFILL_BATCH = 25;

export interface ScreenRow {
  s: string; // symbol as listed (BRK.B)
  n: string; // company name
  sec: string; // GICS sector
  date: string; // last daily bar, YYYY-MM-DD
  px: number; // last close
  r1d: number | null; // % change over 1, 5, 21, 63, 126 and 252 sessions
  r5d: number | null;
  r1m: number | null;
  r3m: number | null;
  r6m: number | null;
  r1y: number | null;
  ytd: number | null; // % since the last close of the previous year
  hi52: number | null; // % below the 52-week high (0 = at the high)
  lo52: number | null; // % above the 52-week low
  sma50: number | null; // % above (+) or below (-) the 50-day average
  sma200: number | null;
  rsi: number | null; // 14-day RSI, Wilder's smoothing
  vol: number | null; // 20-day volatility, annualised %
  streak: number; // consecutive up (+) or down (-) closes
}

export const METRICS = ["r1d", "r5d", "r1m", "r3m", "r6m", "r1y", "ytd", "hi52", "lo52", "sma50", "sma200", "rsi", "vol", "streak"] as const;
export type Metric = (typeof METRICS)[number];

// --------------------------------------------------------------------------
// the figures
// --------------------------------------------------------------------------

const pct = (a: number, b: number): number | null => (b > 0 && Number.isFinite(a) ? round((a / b - 1) * 100, 2) : null);
const round = (x: number, places: number): number => Math.round(x * 10 ** places) / 10 ** places;

/** One row for a constituent, or null when there are too few bars to say anything. */
export function screenRow(meta: { s: string; n: string; sec: string }, d: Columns | undefined): ScreenRow | null {
  if (!d || !Array.isArray(d.c) || d.c.length < 2) return null;
  const c = d.c;
  const n = c.length;
  const last = c[n - 1];
  if (!(last > 0)) return null;
  const back = (k: number) => (n > k ? pct(last, c[n - 1 - k]) : null);
  const lastMs = d.t[n - 1] * d.tu;
  const date = new Date(lastMs).toISOString().slice(0, 10);

  // Year to date: against the last close before 1 January of the bar's year.
  const yearStart = Date.UTC(new Date(lastMs).getUTCFullYear(), 0, 1);
  let ytd: number | null = null;
  for (let i = n - 1; i >= 0; i--) {
    if (d.t[i] * d.tu < yearStart) {
      ytd = pct(last, c[i]);
      break;
    }
  }

  const from = Math.max(0, n - 252);
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = from; i < n; i++) {
    if (d.h[i] > hi) hi = d.h[i];
    if (d.l[i] > 0 && d.l[i] < lo) lo = d.l[i];
  }

  const sma = (k: number) => {
    if (n < k) return null;
    let sum = 0;
    for (let i = n - k; i < n; i++) sum += c[i];
    return pct(last, sum / k);
  };

  let streak = 0;
  for (let i = n - 1; i > 0; i--) {
    const up = c[i] > c[i - 1];
    const down = c[i] < c[i - 1];
    if (!up && !down) break;
    if (streak === 0) streak = up ? 1 : -1;
    else if ((streak > 0) === up) streak += up ? 1 : -1;
    else break;
  }

  return {
    s: meta.s,
    n: meta.n,
    sec: meta.sec,
    date,
    px: round(last, 2),
    r1d: back(1),
    r5d: back(5),
    r1m: back(21),
    r3m: back(63),
    r6m: back(126),
    r1y: back(252),
    ytd,
    hi52: Number.isFinite(hi) ? pct(last, hi) : null,
    lo52: Number.isFinite(lo) ? pct(last, lo) : null,
    sma50: sma(50),
    sma200: sma(200),
    rsi: rsi(c, 14),
    vol: volatility(c, 20),
    streak,
  };
}

/** Wilder's RSI over the last ~120 closes; the head start settles the smoothing. */
export function rsi(c: number[], period: number): number | null {
  const start = Math.max(1, c.length - 120);
  if (c.length - start < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = start; i < start + period; i++) {
    const ch = c[i] - c[i - 1];
    if (ch > 0) gain += ch;
    else loss -= ch;
  }
  gain /= period;
  loss /= period;
  for (let i = start + period; i < c.length; i++) {
    const ch = c[i] - c[i - 1];
    gain = (gain * (period - 1) + Math.max(ch, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-ch, 0)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return round(100 - 100 / (1 + gain / loss), 0);
}

function volatility(c: number[], days: number): number | null {
  if (c.length < days + 1) return null;
  const r: number[] = [];
  for (let i = c.length - days; i < c.length; i++) if (c[i - 1] > 0 && c[i] > 0) r.push(Math.log(c[i] / c[i - 1]));
  if (r.length < 2) return null;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return round(Math.sqrt(variance * 252) * 100, 1);
}

// --------------------------------------------------------------------------
// storage
// --------------------------------------------------------------------------

export async function readScreen(env: Env): Promise<ScreenRow[]> {
  const row = await env.DB.prepare("SELECT body FROM documents WHERE key = ?").bind(KEY).first<{ body: string }>();
  if (!row) return [];
  try {
    const body = JSON.parse(row.body);
    return Array.isArray(body?.rows) ? body.rows : [];
  } catch {
    return [];
  }
}

/**
 * Merge fresh rows into the stored screen. `keep`, when given, is the list of
 * active symbols: anything else (a company that left the index) is dropped.
 */
export async function mergeScreen(env: Env, fresh: ScreenRow[], keep?: Set<string>): Promise<number> {
  if (!fresh.length && !keep) return 0;
  const bySymbol = new Map((await readScreen(env)).map((r) => [r.s, r]));
  for (const r of fresh) bySymbol.set(r.s, r);
  const rows = [...bySymbol.values()].filter((r) => !keep || keep.has(r.s)).sort((a, b) => a.s.localeCompare(b.s));
  await env.DB.prepare(
    `INSERT INTO documents (key, body, updated) VALUES (?1, ?2, ?3)
     ON CONFLICT (key) DO UPDATE SET body = excluded.body, updated = excluded.updated`,
  )
    .bind(KEY, JSON.stringify({ updated: isoNow(), rows }), isoNow())
    .run();
  return rows.length;
}

/**
 * Fill in constituents whose screen row is missing or older than their price
 * document — the first evening after this shipped, or after a restore — a
 * batch at a time. Returns how many are still behind after this batch.
 */
export async function backfillScreen(env: Env, limit = BACKFILL_BATCH): Promise<{ filled: number; behind: number }> {
  const { results: active } = await env.DB.prepare(
    `SELECT t.symbol AS s, t.file AS f, t.name AS n, t.sector AS sec, substr(s.updated, 1, 10) AS day
       FROM tickers t JOIN series s ON s.file = t.file
      WHERE t.active = 1`,
  ).all<{ s: string; f: string; n: string; sec: string; day: string }>();
  const have = new Map((await readScreen(env)).map((r) => [r.s, r.date]));
  // A row is behind when it is missing, or its last bar is older than the
  // day its price document was last written (the bar is from the day before
  // at most, since the refresh runs after the close).
  const behind = active.filter((t) => {
    const date = have.get(t.s);
    return !date || Date.parse(t.day) - Date.parse(date) > 4 * 86_400_000;
  });
  const batch = behind.slice(0, limit);
  const fresh: ScreenRow[] = [];
  if (batch.length) {
    const { results } = await env.DB.prepare("SELECT file, body FROM series WHERE file IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(batch.map((t) => t.f)))
      .all<{ file: string; body: string }>();
    const meta = new Map(batch.map((t) => [t.f, t]));
    for (const r of results) {
      try {
        const row = screenRow(meta.get(r.file)!, JSON.parse(r.body)?.d);
        if (row) fresh.push(row);
      } catch {
        /* an unreadable document is left for the next price refresh */
      }
    }
  }
  if (fresh.length || have.size > active.length) await mergeScreen(env, fresh, new Set(active.map((t) => t.s)));
  return { filled: fresh.length, behind: Math.max(0, behind.length - batch.length) };
}

// --------------------------------------------------------------------------
// reading it
// --------------------------------------------------------------------------

/** Rows from the latest session only: a ticker the refresh missed for days would otherwise skew the lists. */
export function currentRows(rows: ScreenRow[]): ScreenRow[] {
  const latest = rows.reduce((max, r) => (r.date > max ? r.date : max), "");
  if (!latest) return [];
  const cutoff = Date.parse(latest) - 5 * 86_400_000;
  return rows.filter((r) => Date.parse(r.date) >= cutoff);
}

export function sortBy(rows: ScreenRow[], metric: Metric, order: "asc" | "desc"): ScreenRow[] {
  const sign = order === "asc" ? 1 : -1;
  return rows
    .filter((r) => r[metric] != null)
    .sort((a, b) => sign * ((a[metric] as number) - (b[metric] as number)));
}

const signed = (x: number | null, unit = "%") => (x == null ? "–" : `${x > 0 ? "+" : ""}${x}${unit}`);

/** One compact line per stock, for the model. */
export function rowLine(r: ScreenRow): string {
  return [
    `${r.s} ${r.n} (${r.sec})`,
    `${r.px}`,
    `1d ${signed(r.r1d)}`,
    `5d ${signed(r.r5d)}`,
    `1m ${signed(r.r1m)}`,
    `3m ${signed(r.r3m)}`,
    `ytd ${signed(r.ytd)}`,
    `1y ${signed(r.r1y)}`,
    `off52wHigh ${signed(r.hi52)}`,
    `vsSMA50 ${signed(r.sma50)}`,
    `vsSMA200 ${signed(r.sma200)}`,
    `RSI ${r.rsi ?? "–"}`,
    `vol ${r.vol ?? "–"}%`,
    `streak ${signed(r.streak, "d")}`,
  ].join(" | ");
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length, 2) : null;
};

/**
 * The screen as prompt text: breadth, sectors and the extremes of each
 * horizon. The full table is a tool (screen_stocks); this is what lets a
 * general question — "what is moving", "what looks weak" — be answered
 * without one.
 */
export function screenSummary(all: ScreenRow[]): string {
  const rows = currentRows(all);
  if (!rows.length) return "No S&P 500 screen yet (it is built after the nightly price refresh).";
  const latest = rows.reduce((max, r) => (r.date > max ? r.date : max), "");
  const up = rows.filter((r) => (r.r1d ?? 0) > 0).length;
  const above200 = rows.filter((r) => (r.sma200 ?? 0) > 0).length;
  const lines: string[] = [
    `As of the close on ${latest}; ${rows.length} constituents. Percent changes on daily closes. Row format: symbol name (sector) | close | 1d | 5d | 1m | 3m | ytd | 1y | off 52-week high | vs 50-day avg | vs 200-day avg | RSI(14) | 20-day volatility | streak.`,
    `Breadth: ${up} of ${rows.length} up on the day; ${above200} above their 200-day average.`,
    "",
    "Sectors (count | avg 1d | avg 5d | avg 1m | avg ytd | share above 200-day avg):",
  ];
  const sectors = [...new Set(rows.map((r) => r.sec))].sort();
  for (const sec of sectors) {
    const g = rows.filter((r) => r.sec === sec);
    const share = Math.round((g.filter((r) => (r.sma200 ?? 0) > 0).length / g.length) * 100);
    lines.push(`- ${sec} | ${g.length} | ${signed(avg(g.map((r) => r.r1d)))} | ${signed(avg(g.map((r) => r.r5d)))} | ${signed(avg(g.map((r) => r.r1m)))} | ${signed(avg(g.map((r) => r.ytd)))} | ${share}%`);
  }
  const block = (title: string, list: ScreenRow[]) => {
    lines.push("", `${title}:`);
    for (const r of list) lines.push(rowLine(r));
  };
  block("Top 10 on the day", sortBy(rows, "r1d", "desc").slice(0, 10));
  block("Bottom 10 on the day", sortBy(rows, "r1d", "asc").slice(0, 10));
  block("Top 10 over 1 month", sortBy(rows, "r1m", "desc").slice(0, 10));
  block("Bottom 10 over 1 month", sortBy(rows, "r1m", "asc").slice(0, 10));
  block("At or near a 52-week high (within 1%)", sortBy(rows, "hi52", "desc").filter((r) => (r.hi52 ?? -99) >= -1).slice(0, 10));
  block("Nearest their 52-week low", sortBy(rows, "lo52", "asc").slice(0, 10));
  block("Most overbought (highest RSI)", sortBy(rows, "rsi", "desc").slice(0, 8));
  block("Most oversold (lowest RSI)", sortBy(rows, "rsi", "asc").slice(0, 8));
  return lines.join("\n");
}

/** Find a constituent by symbol (BRK.B or BRK-B) or by a word of its name. */
export function findRow(rows: ScreenRow[], query: string): ScreenRow | null {
  const q = String(query).trim().toUpperCase();
  if (!q) return null;
  const bySymbol = rows.find((r) => r.s === q || r.s.replace(/\./g, "-") === q || r.s === q.replace(/-/g, "."));
  if (bySymbol) return bySymbol;
  const lower = q.toLowerCase();
  return rows.find((r) => r.n.toLowerCase().startsWith(lower)) ?? rows.find((r) => r.n.toLowerCase().includes(lower)) ?? null;
}

/** "Apple Inc." -> "Apple": the part of a name a headline would use. */
export function shortName(name: string): string {
  const cut = name
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/[,.]?\s+(Inc|Incorporated|Corp|Corporation|Company|Co|Ltd|Limited|plc|PLC|Holdings?|Group|N\.V|S\.A|SE|AG|Class [A-C])\.?(\s|$).*$/i, "")
    .trim();
  return cut || name;
}
