// The event calendar, built without any model calls:
//
//   meetings   central bank decisions from calendar.json (set once a year)
//   rules      releases at a fixed weekday or day of the month (calendar.json)
//   ics        published release schedules (BLS), fetched daily
//   nasdaq     US earnings dates: the watchlist plus the largest companies
//              reporting each day, with the EPS estimate and, once reported,
//              the actual figure
//   yahoo      earnings dates for watchlist tickers listed outside the US
//
// Rebuilt daily at 05:00 New York time and stored in news_events. A row's
// `origin` is the source that wrote it, so each source replaces only its own
// upcoming rows, and a source that fails keeps what it wrote before.

import type { Env } from "../env";
import calendarConfig from "./calendar.json";
import { CONFIG, type Config, type Region } from "./feeds";
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

interface Fixed {
  type: EventType;
  title: string;
  time: string;
  tz: string;
  region: Region;
  importance: number;
  minutes?: number;
  streamUrl?: string;
}

export interface CalendarConfig {
  meetings: (Fixed & { date: string })[];
  weekly: (Fixed & { weekday: number; months?: number[] })[];
  monthly: (Fixed & { day: number | "last"; weekend: "next-business-day" | "same-day" })[];
  ics: { id: string; name: string; url: string; type: EventType; region: Region; include: { match: string; title: string; importance: number }[] }[];
}

export const CALENDAR = calendarConfig as unknown as CalendarConfig;

// Minutes an event counts as "on now" when no length is known.
const DEFAULT_MINUTES: Record<EventType, number> = {
  fed: 60, "us-data": 15, earnings: 60, "eu-central-bank": 60, "eu-data": 15,
  "asia-central-bank": 60, "asia-data": 15, russia: 30, commodities: 15,
};

const USER_AGENT = "Mozilla/5.0 (compatible; bqe-frontend/1.0; +https://github.com/SchwarzRene/bqe-frontend)";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const DAYS_BACK = 7;
const DAYS_AHEAD = 8;
const LARGEST_PER_DAY = 5;

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function event(f: Fixed, date: string, extra: Partial<CalendarEvent> = {}): CalendarEvent | null {
  const m = f.time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const start = zonedToUtc(date, Number(m[1]), Number(m[2]), f.tz);
  if (!Number.isFinite(start)) return null;
  return {
    id: `${f.type}-${date}-${slug(f.title)}`,
    type: f.type,
    title: f.title,
    start: iso(start),
    end: iso(start + (f.minutes ?? DEFAULT_MINUTES[f.type]) * 60_000),
    region: f.region,
    importance: f.importance,
    streamUrl: f.streamUrl ?? "",
    result: "",
    tickers: [],
    ...extra,
  };
}

// --------------------------------------------------------------------------
// fixed sources: meetings, weekly and monthly rules
// --------------------------------------------------------------------------

/** YYYY-MM-DD for every day from `from` through `to`. */
function days(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export function fixedEvents(from: string, to: string, cal: CalendarConfig = CALENDAR): { meetings: CalendarEvent[]; rules: CalendarEvent[] } {
  const meetings = cal.meetings
    .filter((m) => m.date >= from && m.date <= to)
    .map((m) => event(m, m.date))
    .filter((e): e is CalendarEvent => !!e);

  const rules: CalendarEvent[] = [];
  for (const date of days(from, to)) {
    const month = Number(date.slice(5, 7));
    for (const w of cal.weekly) {
      if (weekday(date) === w.weekday && (!w.months || w.months.includes(month))) {
        const e = event(w, date);
        if (e) rules.push(e);
      }
    }
  }
  // Monthly rules: placed on their day in every month the window touches.
  const months = [...new Set(days(from, to).map((d) => d.slice(0, 7)))];
  for (const ym of months) {
    for (const r of cal.monthly) {
      const [y, mo] = ym.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      let date = `${ym}-${String(r.day === "last" ? lastDay : Math.min(r.day, lastDay)).padStart(2, "0")}`;
      if (r.weekend === "next-business-day") {
        while (weekday(date) === 0 || weekday(date) === 6) date = addDays(date, 1);
      }
      if (date >= from && date <= to) {
        const e = event(r, date);
        if (e) rules.push(e);
      }
    }
  }
  return { meetings, rules };
}

// --------------------------------------------------------------------------
// published schedules (iCalendar)
// --------------------------------------------------------------------------

export interface IcsEvent {
  summary: string;
  start: number; // epoch ms
}

/** VEVENTs with a SUMMARY and a DTSTART (UTC, TZID=…, or floating = `defaultTz`). */
export function parseIcs(text: string, defaultTz = ET): IcsEvent[] {
  // Unfold continuation lines (RFC 5545: a line starting with a space or tab).
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: IcsEvent[] = [];
  let current: { summary?: string; start?: number } | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT") {
      if (current?.summary && Number.isFinite(current.start)) out.push({ summary: current.summary, start: current.start! });
      current = null;
    } else if (current) {
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
      if (!m) continue;
      const [, name, params, value] = m;
      if (name === "SUMMARY") current.summary = value.replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ").trim();
      if (name === "DTSTART") {
        const d = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
        if (!d) continue;
        const [h, mi] = [Number(d[4] ?? 0), Number(d[5] ?? 0)];
        current.start = d[7]
          ? Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), h, mi)
          : zonedToUtc(`${d[1]}-${d[2]}-${d[3]}`, h, mi, params.match(/TZID=([^;:]+)/)?.[1] ?? defaultTz);
      }
    }
  }
  return out;
}

async function icsEvents(src: CalendarConfig["ics"][number], fromMs: number, toMs: number, fetcher: typeof fetch): Promise<CalendarEvent[]> {
  const res = await fetcher(src.url, { headers: { "User-Agent": USER_AGENT, Accept: "text/calendar" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const out: CalendarEvent[] = [];
  for (const e of parseIcs(await res.text())) {
    if (e.start < fromMs || e.start > toMs) continue;
    const rule = src.include.find((r) => e.summary.toLowerCase().includes(r.match.toLowerCase()));
    if (!rule) continue;
    const date = wallClock(e.start, ET).date;
    out.push({
      id: `${src.type}-${date}-${slug(rule.title)}`, type: src.type, title: rule.title, start: iso(e.start),
      end: iso(e.start + DEFAULT_MINUTES[src.type] * 60_000), region: src.region, importance: rule.importance,
      streamUrl: "", result: "", tickers: [],
    });
  }
  return out;
}

// --------------------------------------------------------------------------
// earnings
// --------------------------------------------------------------------------

const money = (v: unknown) => {
  const s = String(v ?? "").trim();
  const n = Number(s.replace(/[$,()\s]/g, ""));
  return s && s !== "N/A" && Number.isFinite(n) ? n : null;
};

/** One Nasdaq earnings-calendar row as an event; Nasdaq only says "before the open" or "after the close". */
export function nasdaqEvent(row: any, date: string): CalendarEvent | null {
  const symbol = String(row?.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z.\-]{1,8}$/.test(symbol)) return null;
  const time = String(row?.time ?? "");
  const after = time.includes("after"), pre = time.includes("pre");
  const start = zonedToUtc(date, after ? 16 : pre ? 7 : 9, after ? 5 : pre ? 0 : 30, ET);
  const name = String(row?.name ?? symbol).replace(/,?\s+(Inc\.?|Corp(oration)?\.?|Co\.?|Ltd\.?|plc|N\.V\.|Holdings?)$/i, "").trim();
  const quarter = String(row?.fiscalQuarterEnding ?? "").trim();
  const est = String(row?.epsForecast ?? "").trim();
  const actual = row?.eps ?? row?.epsActual;
  const result = money(actual) != null ? `EPS ${String(actual).trim()}${money(est) != null ? ` vs ${est} est.` : ""}` : "";
  return {
    id: `earnings-${date}-${slug(symbol)}`,
    type: "earnings",
    title: `${name} results${quarter ? ` (quarter to ${quarter})` : ""}${after ? ", after the close" : pre ? ", before the open" : ""}`,
    start: iso(start),
    end: iso(start + DEFAULT_MINUTES.earnings * 60_000),
    region: "us",
    importance: 2,
    streamUrl: "",
    result,
    tickers: [symbol],
  };
}

/** Rows to keep for one day: the watchlist, plus the largest companies by market value. */
export function pickNasdaq(rows: any[], watch: Set<string>): any[] {
  const cap = (r: any) => money(r?.marketCap) ?? 0;
  const mine = rows.filter((r) => watch.has(String(r?.symbol ?? "").toUpperCase()));
  const largest = rows.filter((r) => !mine.includes(r)).sort((a, b) => cap(b) - cap(a)).slice(0, LARGEST_PER_DAY);
  return [...mine, ...largest];
}

async function nasdaqEarnings(dates: string[], cfg: Config, fetcher: typeof fetch): Promise<CalendarEvent[]> {
  const watch = new Set(cfg.watchlist.filter((w) => !w.symbol.includes(".")).map((w) => w.symbol));
  const out: CalendarEvent[] = [];
  let failures = 0;
  for (const date of dates) {
    try {
      const res = await fetcher(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows: any[] = (await res.json<any>())?.data?.rows ?? [];
      for (const row of pickNasdaq(Array.isArray(rows) ? rows : [], watch)) {
        const e = nasdaqEvent(row, date);
        if (e) out.push(e);
      }
    } catch {
      failures++;
    }
  }
  if (failures === dates.length) throw new Error("no answer from the Nasdaq earnings calendar");
  return out;
}

const EXCHANGE_TZ: Record<string, string> = {
  DE: "Europe/Berlin", VI: "Europe/Vienna", PA: "Europe/Paris", AS: "Europe/Amsterdam", MI: "Europe/Rome",
  MC: "Europe/Madrid", L: "Europe/London", SW: "Europe/Zurich", T: "Asia/Tokyo", TW: "Asia/Taipei", HK: "Asia/Hong_Kong",
};

/**
 * Earnings dates for watchlist tickers listed outside the US, from Yahoo's
 * calendarEvents. Yahoo wants a session cookie and a "crumb" for it.
 */
async function yahooEarnings(cfg: Config, fromMs: number, toMs: number, fetcher: typeof fetch): Promise<CalendarEvent[]> {
  const foreign = cfg.watchlist.filter((w) => w.symbol.includes("."));
  if (!foreign.length) return [];
  const first = await fetcher("https://fc.yahoo.com", { headers: { "User-Agent": BROWSER_UA }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  const cookie = (first.headers.get("set-cookie") ?? "").split(";")[0];
  const crumbRes = await fetcher("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": BROWSER_UA, Cookie: cookie }, signal: AbortSignal.timeout(10_000),
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumbRes.ok || !crumb || crumb.length > 40) throw new Error(`no Yahoo crumb (HTTP ${crumbRes.status})`);
  const out: CalendarEvent[] = [];
  for (const w of foreign) {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(w.symbol)}?modules=calendarEvents&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetcher(url, { headers: { "User-Agent": BROWSER_UA, Cookie: cookie }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) continue;
    const earnings = (await res.json<any>())?.quoteSummary?.result?.[0]?.calendarEvents?.earnings;
    const when = Number(earnings?.earningsDate?.[0]?.raw) * 1000;
    if (!Number.isFinite(when) || when < fromMs || when > toMs) continue;
    const tz = EXCHANGE_TZ[w.symbol.split(".").pop()!] ?? ET;
    const date = wallClock(when, tz).date;
    // Yahoo gives the day, not the hour: placed at 07:00 local, before the open.
    const e = event({ type: "earnings", title: `${w.name} results (time not confirmed)`, time: "07:00", tz, region: w.region, importance: 2 }, date, { tickers: [w.symbol] });
    if (e) out.push({ ...e, id: `earnings-${date}-${slug(w.symbol)}` });
  }
  return out;
}

// --------------------------------------------------------------------------
// the daily job
// --------------------------------------------------------------------------

/** Rebuild the calendar from 7 days back to 8 days ahead. Each source replaces only its own rows. */
export async function refreshCalendar(
  env: Env,
  now = Date.now(),
  { cfg = CONFIG, cal = CALENDAR, fetcher = fetch }: { cfg?: Config; cal?: CalendarConfig; fetcher?: typeof fetch } = {},
): Promise<string> {
  const today = wallClock(now, ET).date;
  const from = addDays(today, -DAYS_BACK);
  const to = addDays(today, DAYS_AHEAD);
  const fromMs = zonedToUtc(from, 0, 0, ET);
  const toMs = zonedToUtc(addDays(to, 1), 0, 0, ET);
  const { meetings, rules } = fixedEvents(from, to, cal);

  const sources: [string, () => Promise<CalendarEvent[]>][] = [
    ["meetings", async () => meetings],
    ["rules", async () => rules],
    ...cal.ics.map((s) => [s.id, () => icsEvents(s, fromMs, toMs, fetcher)] as [string, () => Promise<CalendarEvent[]>]),
    // Nasdaq from yesterday, whose reported EPS fills in the result.
    ["nasdaq", () => nasdaqEarnings(days(addDays(today, -1), to), cfg, fetcher)],
    ["yahoo", () => yahooEarnings(cfg, fromMs, toMs, fetcher)],
  ];

  const report: string[] = [];
  const stamp = iso(now);
  const cutoff = iso(zonedToUtc(today, 0, 0, ET));
  for (const [origin, load] of sources) {
    let events: CalendarEvent[];
    try {
      events = await load();
    } catch (err) {
      report.push(`${origin} failed: ${err instanceof Error ? err.message : err}`);
      continue; // a failed source keeps what it wrote before
    }
    await env.DB.batch([
      // Upcoming rows this source wrote before; it writes them again below.
      env.DB.prepare("DELETE FROM news_events WHERE origin = ? AND start_at >= ? AND result IS NULL").bind(origin, cutoff),
      ...events.map((e) =>
        env.DB.prepare(
          `INSERT INTO news_events (id, type, title, start_at, end_at, region, importance, stream_url, result, tickers, origin, updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET title = excluded.title, start_at = excluded.start_at, end_at = excluded.end_at,
             region = excluded.region, importance = excluded.importance,
             stream_url = COALESCE(NULLIF(excluded.stream_url, ''), news_events.stream_url),
             result = COALESCE(excluded.result, news_events.result),
             tickers = excluded.tickers, origin = excluded.origin, updated = excluded.updated`,
        ).bind(e.id, e.type, e.title, e.start, e.end, e.region, e.importance, e.streamUrl, e.result || null, JSON.stringify(e.tickers), origin, stamp),
      ),
    ]);
    report.push(`${origin}: ${events.length}`);
  }
  return report.join(", ");
}

/** Whether the calendar has anything upcoming — if not, the next run builds it. */
export async function calendarIsEmpty(env: Env, now = Date.now()): Promise<boolean> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM news_events WHERE start_at > ?").bind(iso(now)).first<{ n: number }>();
  return !row?.n;
}

// --------------------------------------------------------------------------
// reading
// --------------------------------------------------------------------------

type EventRow = {
  id: string; type: string; title: string; start_at: string; end_at: string | null; region: string;
  importance: number; stream_url: string | null; result: string | null; tickers: string;
};

/** Events starting between the two times, earliest first. */
export async function readCalendar(env: Env, fromMs: number, toMs: number): Promise<CalendarEvent[]> {
  const rows = await env.DB.prepare(
    `SELECT id, type, title, start_at, end_at, region, importance, stream_url, result, tickers FROM news_events
      WHERE start_at BETWEEN ? AND ? ORDER BY start_at`,
  )
    .bind(iso(fromMs), iso(toMs))
    .all<EventRow>();
  return (rows.results ?? []).map((r) => ({
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
}
