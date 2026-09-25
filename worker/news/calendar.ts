// The event calendar. Fed events and US watchlist earnings come from the
// Market Tape documents (worker/markettape.ts, twice a day). Everything else
// — US data, European, Asian and Russian central banks and data, non-US
// earnings, commodity reports — is found once a day at 05:00 New York time
// with search-grounded Gemini calls, and stored in news_events. After an
// event has happened, a result line is looked up the same way.

import type { Env } from "../env";
import { isoNow } from "../http";
import { etToUtc } from "../markettape";
import { CONFIG, type Config, type Region, REGIONS } from "./feeds";
import { askGrounded } from "./gemini";
import { parseList } from "./store";
import { addDays, ET, iso, wallClock, zonedToUtc } from "./time";

export const EVENT_TYPES = [
  "fed", "us-data", "earnings", "eu-central-bank", "eu-data", "asia-central-bank", "asia-data", "russia", "commodities",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  start: string; // ISO, UTC
  end: string; // ISO, UTC
  region: Region;
  importance: number;
  streamUrl: string;
  result: string;
  tickers: string[];
}

// Minutes an event counts as "on now" when no end time is known.
const DEFAULT_MINUTES: Record<EventType, number> = {
  fed: 60, "us-data": 15, earnings: 80, "eu-central-bank": 60, "eu-data": 15,
  "asia-central-bank": 60, "asia-data": 15, russia: 30, commodities: 15,
};

interface Group {
  name: string;
  types: EventType[];
  prompt: (from: string, to: string, cfg: Config) => string;
}

const SHAPE = `Return ONLY a compact JSON array, no prose, no markdown fences, sorted earliest first:
[{"type":"…","title":"short title, e.g. US CPI, August","date":"YYYY-MM-DD","time":"HH:MM","tz":"IANA time zone of that time, e.g. America/New_York","endTime":"HH:MM or empty","region":"us|europe|asia|russia|global","importance":1,"streamUrl":"https://… or empty","tickers":[]}]

Rules: date and time are the local wall-clock time of the release or start, in the zone named by tz. importance is 3 for market-moving (central bank rate decisions, CPI, jobs report, GDP), 2 for notable, 1 for minor. endTime only for events with a duration (press conferences, earnings calls, meetings). streamUrl only if an official live stream or webcast page appears in the search results — never invent a URL. tickers lists the stock tickers an earnings event is about, as Yahoo spells them (SAP.DE, 2330.TW). Skip anything you cannot date. Write titles in your own words.`;

const GROUPS: Group[] = [
  {
    name: "us",
    types: ["us-data", "earnings"],
    prompt: (from, to) => `Search the web for scheduled US economic data releases from ${from} through ${to}: CPI, PPI, the jobs report, PCE, GDP, retail sales, weekly jobless claims, ISM PMIs, consumer confidence. Also the five largest US companies (by market value) reporting earnings on each of those days. Do NOT include Federal Reserve events.

Use type "us-data" for data and "earnings" for company results. Up to 16 items.

${SHAPE}`,
  },
  {
    name: "europe",
    types: ["eu-central-bank", "eu-data", "earnings"],
    prompt: (from, to, cfg) => `Search the web for scheduled European events from ${from} through ${to}:
- central banks: ECB rate decisions and press conferences, speeches by the ECB President, Bank of England and Swiss National Bank decisions, Oesterreichische Nationalbank statements (type "eu-central-bank");
- data: euro-area flash inflation, euro-area GDP and unemployment (Eurostat), German ifo and ZEW, Austrian CPI (Statistik Austria) (type "eu-data");
- earnings dates for: ${cfg.watchlist.filter((w) => w.region === "europe").map((w) => `${w.name} (${w.symbol})`).join(", ") || "none"} (type "earnings").
Up to 14 items.

${SHAPE}`,
  },
  {
    name: "asia-russia",
    types: ["asia-central-bank", "asia-data", "russia", "earnings"],
    prompt: (from, to, cfg) => `Search the web for scheduled events from ${from} through ${to}:
- Asian central banks: Bank of Japan decisions, the PBoC loan prime rate, Reserve Bank of India decisions (type "asia-central-bank");
- Asian data: China PMIs, CPI, trade and GDP (NBS), Japan CPI (including Tokyo CPI) and the Tankan (type "asia-data");
- Russia: Bank of Russia key rate decisions, Russian CPI from Rosstat (type "russia", region "russia");
- earnings dates for: ${cfg.watchlist.filter((w) => w.region === "asia").map((w) => `${w.name} (${w.symbol})`).join(", ") || "none"} (type "earnings").
Up to 14 items.

${SHAPE}`,
  },
  {
    name: "commodities",
    types: ["commodities"],
    prompt: (from, to) => `Search the web for scheduled commodity reports and meetings from ${from} through ${to}: USDA WASDE, USDA crop progress, USDA weekly export sales, the EIA weekly petroleum status report, the EIA weekly natural gas storage report, OPEC+ meetings, China industrial profits. Use type "commodities" and region "global" for OPEC+ and "us" for USDA and EIA. Up to 12 items.

${SHAPE}`,
  },
];

// --------------------------------------------------------------------------
// the daily job
// --------------------------------------------------------------------------

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/** One row from the model, checked and placed on a UTC clock; null if unusable. */
export function cleanSearchEvent(raw: any, allowed: EventType[]): CalendarEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type) as EventType;
  if (!allowed.includes(type)) return null;
  const title = String(raw.title ?? "").trim().slice(0, 120);
  const date = String(raw.date ?? "");
  const time = String(raw.time ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) return null;
  const tz = typeof raw.tz === "string" && /^[A-Za-z_]+\/[A-Za-z_\/+-]+$|^UTC$/.test(raw.tz) ? raw.tz : ET;
  const start = zonedToUtc(date, Number(time[1]), Number(time[2]), tz);
  if (!Number.isFinite(start)) return null;
  const endMatch = String(raw.endTime ?? "").match(/^(\d{1,2}):(\d{2})$/);
  let end = endMatch ? zonedToUtc(date, Number(endMatch[1]), Number(endMatch[2]), tz) : NaN;
  if (!Number.isFinite(end) || end <= start || end - start > 12 * 3_600_000) end = start + DEFAULT_MINUTES[type] * 60_000;
  const region = REGIONS.includes(raw.region) ? (raw.region as Region) : "global";
  const importance = Math.min(3, Math.max(1, Math.round(Number(raw.importance) || 2)));
  const streamUrl = typeof raw.streamUrl === "string" && /^https:\/\//.test(raw.streamUrl) ? raw.streamUrl.slice(0, 500) : "";
  const tickers = (Array.isArray(raw.tickers) ? raw.tickers : []).map(String).filter((t: string) => /^[A-Z0-9.^=\-]{1,12}$/.test(t)).slice(0, 5);
  return { id: `${type}-${date}-${slug(title)}`, type, title, start: iso(start), end: iso(end), region, importance, streamUrl, result: "", tickers };
}

/** Rebuild the next 8 days of the calendar. Each region group replaces only its own rows. */
export async function refreshCalendar(env: Env, now = Date.now(), cfg: Config = CONFIG): Promise<string> {
  const today = wallClock(now, ET).date;
  const to = addDays(today, 7);
  const dayStart = iso(zonedToUtc(today, 0, 0, ET));
  const report: string[] = [];
  const found = await Promise.all(
    GROUPS.map(async (g) => {
      try {
        return [g, await askGrounded(env, `Today is ${today} (New York time). ${g.prompt(today, to, cfg)}`, `calendar ${g.name}`)] as const;
      } catch {
        return [g, null] as const;
      }
    }),
  );
  const stamp = isoNow();
  for (const [g, rows] of found) {
    if (!Array.isArray(rows)) {
      report.push(`${g.name}: unusable`);
      continue;
    }
    const events = rows.map((r) => cleanSearchEvent(r, g.types)).filter((e): e is CalendarEvent => !!e);
    if (!events.length) {
      report.push(`${g.name}: 0`);
      continue;
    }
    const statements = [
      // Upcoming rows this group wrote before; past ones keep their results.
      env.DB.prepare("DELETE FROM news_events WHERE origin = ? AND start_at >= ? AND result IS NULL").bind(g.name, dayStart),
      ...events.map((e) =>
        env.DB.prepare(
          `INSERT INTO news_events (id, type, title, start_at, end_at, region, importance, stream_url, result, tickers, origin, updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET title = excluded.title, start_at = excluded.start_at, end_at = excluded.end_at,
             region = excluded.region, importance = excluded.importance,
             stream_url = COALESCE(NULLIF(excluded.stream_url, ''), news_events.stream_url),
             tickers = excluded.tickers, origin = excluded.origin, updated = excluded.updated`,
        ).bind(e.id, e.type, e.title, e.start, e.end, e.region, e.importance, e.streamUrl, JSON.stringify(e.tickers), g.name, stamp),
      ),
    ];
    await env.DB.batch(statements);
    report.push(`${g.name}: ${events.length}`);
  }
  return report.join(", ");
}

/** Whether the calendar has anything upcoming — if not, the next run builds it. */
export async function calendarIsEmpty(env: Env, now = Date.now()): Promise<boolean> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM news_events WHERE start_at > ?")
    .bind(iso(now))
    .first<{ n: number }>();
  return !row?.n;
}

/**
 * One result line for each event that ended in the last day and has none
 * yet, from one grounded call. Fed and US earnings results come from Market
 * Tape instead.
 */
export async function refreshResults(env: Env, now = Date.now()): Promise<string> {
  const rows = await env.DB.prepare(
    `SELECT id, type, title, start_at FROM news_events
      WHERE result IS NULL AND end_at < ? AND start_at > ? ORDER BY importance DESC, start_at DESC LIMIT 8`,
  )
    .bind(iso(now - 20 * 60_000), iso(now - 36 * 3_600_000))
    .all<{ id: string; type: string; title: string; start_at: string }>();
  const due = rows.results ?? [];
  if (!due.length) return "no results due";
  const list = due.map((e) => `- id "${e.id}": ${e.title} (${e.start_at} UTC)`).join("\n");
  const answer = await askGrounded(
    env,
    `Search the web for the outcome of each of these scheduled releases and events:
${list}

Return ONLY compact JSON, no prose, no markdown fences:
{"results":[{"id":"the id above","result":"one line under 12 words, e.g. CPI 2.9% vs 3.0% expected, or Rate held at 4.25%"}]}

Use null for result when nothing has been published yet. Numbers must come from the search results; write the line in your own words.`,
    "results",
  ).catch(() => null);
  const results: any[] = Array.isArray((answer as any)?.results) ? (answer as any).results : [];
  const known = new Set(due.map((d) => d.id));
  const updates = results
    .filter((r) => r && known.has(r.id) && typeof r.result === "string" && r.result.trim())
    .map((r) => env.DB.prepare("UPDATE news_events SET result = ?, updated = ? WHERE id = ?").bind(r.result.trim().slice(0, 140), isoNow(), r.id));
  if (updates.length) await env.DB.batch(updates);
  return `${updates.length} of ${due.length} results`;
}

// --------------------------------------------------------------------------
// reading
// --------------------------------------------------------------------------

type EventRow = {
  id: string; type: string; title: string; start_at: string; end_at: string | null; region: string;
  importance: number; stream_url: string | null; result: string | null; tickers: string;
};

/** Stored events plus Market Tape's Fed and earnings rows, earliest first. */
export async function readCalendar(env: Env, fromMs: number, toMs: number, cfg: Config = CONFIG): Promise<CalendarEvent[]> {
  const rows = await env.DB.prepare(
    "SELECT id, type, title, start_at, end_at, region, importance, stream_url, result, tickers FROM news_events WHERE start_at BETWEEN ? AND ?",
  )
    .bind(iso(fromMs), iso(toMs))
    .all<EventRow>();
  const events: CalendarEvent[] = (rows.results ?? []).map((r) => ({
    id: r.id,
    type: r.type as EventType,
    title: r.title,
    start: r.start_at,
    end: r.end_at || iso(Date.parse(r.start_at) + (DEFAULT_MINUTES[r.type as EventType] ?? 30) * 60_000),
    region: r.region as Region,
    importance: r.importance,
    streamUrl: r.stream_url || "",
    result: r.result || "",
    tickers: parseList(r.tickers),
  }));

  const tape = await tapeEvents(env, cfg);
  const inRange = tape.filter((e) => Date.parse(e.start) >= fromMs && Date.parse(e.start) <= toMs);
  // A search row about the same company on the same day as a Market Tape
  // row is the same event; Market Tape's has the webcast and the numbers.
  const tapeKeys = new Set(inRange.flatMap((e) => e.tickers.map((t) => `${t}|${e.start.slice(0, 10)}`)));
  const merged = [
    ...events.filter((e) => !(e.type === "earnings" && e.tickers.some((t) => tapeKeys.has(`${t}|${e.start.slice(0, 10)}`)))),
    ...inRange,
  ];
  return merged.sort((a, b) => a.start.localeCompare(b.start));
}

async function readDoc(env: Env, key: string): Promise<any> {
  const row = await env.DB.prepare("SELECT body FROM documents WHERE key = ?").bind(key).first<{ body: string }>();
  try {
    return row ? JSON.parse(row.body) : null;
  } catch {
    return null;
  }
}

/** Market Tape's schedule and results, as calendar events. */
export async function tapeEvents(env: Env, cfg: Config = CONFIG): Promise<CalendarEvent[]> {
  const [schedule, results] = await Promise.all([readDoc(env, "markettape:schedule"), readDoc(env, "markettape:results")]);
  const list: any[] = Array.isArray(schedule?.events) ? schedule.events : [];
  const res: Record<string, any> = results?.results ?? {};
  return list.map((e) => fromTape(e, res[e.id], cfg)).filter((e): e is CalendarEvent => !!e);
}

export function fromTape(e: any, result: any, cfg: Config = CONFIG): CalendarEvent | null {
  if (!e?.date || !e?.title) return null;
  const clock = (v: unknown) => {
    const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})$/);
    return m ? etToUtc(e.date, Number(m[1]), Number(m[2])) : NaN;
  };
  const call = clock(e.timeET);
  const release = clock(e.releaseET);
  const start = Number.isFinite(release) ? release : call;
  if (!Number.isFinite(start)) return null;
  const earnings = e.kind === "earnings";
  const big = /fomc|rate decision|press conference/i.test(e.title);
  const minutes = earnings ? 80 : big ? 95 : 60;
  const end = (Number.isFinite(call) ? call : start) + minutes * 60_000;
  const ticker = earnings && e.ticker ? String(e.ticker) : "";
  const region = (cfg.watchlist.find((w) => w.symbol === ticker)?.region ?? "us") as Region;
  return {
    id: `tape-${e.id}`,
    type: earnings ? "earnings" : "fed",
    title: earnings ? `${e.org || ticker} ${e.title}`.trim() : e.title,
    start: iso(start),
    end: iso(end),
    region,
    importance: earnings ? 2 : big ? 3 : 2,
    streamUrl: typeof e.streamUrl === "string" && /^https?:\/\//.test(e.streamUrl) ? e.streamUrl : "",
    result: tapeResultLine(result),
    tickers: ticker ? [ticker] : [],
  };
}

export function tapeResultLine(r: any): string {
  if (!r || r.status !== "reported") return "";
  const m = Array.isArray(r.metrics) ? r.metrics[0] : null;
  if (m?.label && m?.actual) return `${m.label} ${m.actual}${m.estimate ? ` vs ${m.estimate} est.` : ""}`.slice(0, 140);
  return String(r.headline || "").slice(0, 140);
}
