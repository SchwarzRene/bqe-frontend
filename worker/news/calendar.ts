// The event calendar, built without any model calls:
//
//   meetings        central bank decisions from calendar.json (set once a
//                   year), with the decided rate from Yahoo as the result
//   dated           one-off dated events from calendar.json (WASDE, OPEC+ …)
//   yahoo-economic  Yahoo Finance's economic calendar: data releases, rate
//                   decisions and central bank speakers across the US, Europe,
//                   Asia and Russia, with consensus and, once published, actual
//   rules           releases at a fixed weekday or day of the month
//   ics             published release schedules (BLS)
//   nasdaq          US earnings: the watchlist plus the largest companies
//                   reporting each day, EPS estimate and reported EPS
//   yahoo           earnings dates for watchlist tickers listed outside the US
//
// Rules and schedules marked `fallback` in calendar.json are used only when
// the Yahoo economic calendar cannot be reached, so nothing appears twice.
//
// Rebuilt daily at 05:00 New York time, and hourly for yesterday to tomorrow
// so results appear once they are published. A row's `origin` is the source
// that wrote it: each source replaces only its own upcoming rows in the
// window, and a source that fails keeps what it wrote before.

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

export interface EconomicConfig {
  countries: Record<string, { region: Region; name: string }>;
  include: { match: string; title: string; kind: "rate" | "data" | "speech"; importance: number; countries?: string[] }[];
}

export interface CalendarConfig {
  meetings: (Fixed & { date: string; country?: string })[];
  dated?: (Fixed & { date: string })[];
  weekly: (Fixed & { weekday: number; months?: number[]; fallback?: boolean })[];
  monthly: (Fixed & { day: number | "last"; weekend: "next-business-day" | "same-day"; fallback?: boolean })[];
  yahooEconomic?: EconomicConfig;
  ics: { id: string; name: string; url: string; type: EventType; region: Region; fallback?: boolean; include: { match: string; title: string; importance: number }[] }[];
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

export interface FixedEvents {
  meetings: (CalendarEvent & { country?: string })[];
  dated: CalendarEvent[];
  rules: CalendarEvent[];
  fallbackRules: CalendarEvent[];
}

export function fixedEvents(from: string, to: string, cal: CalendarConfig = CALENDAR): FixedEvents {
  const onDate = (list: (Fixed & { date: string; country?: string })[]) => {
    const out: (CalendarEvent & { country?: string })[] = [];
    for (const m of list) {
      if (m.date < from || m.date > to) continue;
      const e = event(m, m.date);
      if (e) out.push({ ...e, country: m.country });
    }
    return out;
  };
  const meetings = onDate(cal.meetings);
  const dated = onDate(cal.dated ?? []);

  const rules: CalendarEvent[] = [];
  const fallbackRules: CalendarEvent[] = [];
  for (const date of days(from, to)) {
    const month = Number(date.slice(5, 7));
    for (const w of cal.weekly) {
      if (weekday(date) === w.weekday && (!w.months || w.months.includes(month))) {
        const e = event(w, date);
        if (e) (w.fallback ? fallbackRules : rules).push(e);
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
        if (e) (r.fallback ? fallbackRules : rules).push(e);
      }
    }
  }
  return { meetings, dated, rules, fallbackRules };
}

// --------------------------------------------------------------------------
// published schedules (iCalendar)
// --------------------------------------------------------------------------

export interface IcsEvent {
  summary: string;
  start: number; // epoch ms
}

/**
 * VEVENTs with a SUMMARY and a DTSTART (UTC, TZID=…, or floating = `defaultTz`).
 * With `from`/`to` (YYYY-MM-DD), events outside those days (±1) are skipped
 * before their time is converted: a schedule lists a whole year.
 */
export function parseIcs(text: string, defaultTz = ET, from = "", to = ""): IcsEvent[] {
  const lo = from ? addDays(from, -1).replace(/-/g, "") : "";
  const hi = to ? addDays(to, 1).replace(/-/g, "") : "";
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
        const day = `${d[1]}${d[2]}${d[3]}`;
        if ((lo && day < lo) || (hi && day > hi)) {
          current.start = NaN;
          continue;
        }
        const [h, mi] = [Number(d[4] ?? 0), Number(d[5] ?? 0)];
        current.start = d[7]
          ? Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), h, mi)
          : zonedToUtc(`${d[1]}-${d[2]}-${d[3]}`, h, mi, params.match(/TZID=([^;:]+)/)?.[1] ?? defaultTz);
      }
    }
  }
  return out;
}

async function icsEvents(src: CalendarConfig["ics"][number], fromMs: number, toMs: number, fetcher: typeof fetch, from: string, to: string): Promise<CalendarEvent[]> {
  const res = await fetcher(src.url, { headers: { "User-Agent": USER_AGENT, Accept: "text/calendar" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const out: CalendarEvent[] = [];
  for (const e of parseIcs(await res.text(), ET, from, to)) {
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

interface YahooSession {
  cookie: string;
  crumb: string;
}

/** Yahoo's calendar endpoints want a session cookie and a "crumb" minted for it. */
function yahooSession(fetcher: typeof fetch): () => Promise<YahooSession> {
  let session: Promise<YahooSession> | null = null;
  return () =>
    (session ??= (async () => {
      const first = await fetcher("https://fc.yahoo.com", { headers: { "User-Agent": BROWSER_UA }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
      const cookie = (first.headers.get("set-cookie") ?? "").split(";")[0];
      const res = await fetcher("https://query1.finance.yahoo.com/v1/test/getcrumb", {
        headers: { "User-Agent": BROWSER_UA, Cookie: cookie }, signal: AbortSignal.timeout(10_000),
      });
      const crumb = (await res.text()).trim();
      if (!res.ok || !crumb || crumb.length > 40 || crumb.includes("<")) throw new Error(`no Yahoo crumb (HTTP ${res.status})`);
      return { cookie, crumb };
    })());
}

const ECONOMIC_FIELDS = [
  "econ_release", "country_code", "startdatetime", "period",
  "after_release_actual", "consensus_estimate", "prior_release_actual", "originally_reported_actual",
];
// The same fields by the labels Yahoo puts on its columns.
const ECONOMIC_LABELS: Record<string, string[]> = {
  econ_release: ["event"], country_code: ["country code", "region"], startdatetime: ["event time"], period: ["for", "period"],
  after_release_actual: ["actual"], consensus_estimate: ["market expectation", "expected"], prior_release_actual: ["prior to this", "last"],
};

export interface EconomicRow {
  name: string;
  country: string;
  start: number;
  period: string;
  actual: number | null;
  consensus: number | null;
  prior: number | null;
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Rows of Yahoo's economic-calendar answer, by column id or label. */
export function parseEconomic(body: any): EconomicRow[] {
  const doc = body?.finance?.result?.[0]?.documents?.[0];
  const columns: any[] = Array.isArray(doc?.columns) ? doc.columns : [];
  const rows: any[] = Array.isArray(doc?.rows) ? doc.rows : [];
  const index = (field: string) => {
    let i = columns.findIndex((c) => c?.id === field);
    if (i < 0) i = columns.findIndex((c) => (ECONOMIC_LABELS[field] ?? []).includes(String(c?.label ?? "").toLowerCase()));
    if (i < 0 && columns.length === ECONOMIC_FIELDS.length) i = ECONOMIC_FIELDS.indexOf(field);
    return i;
  };
  const at = Object.fromEntries(ECONOMIC_FIELDS.map((f) => [f, index(f)]));
  const out: EconomicRow[] = [];
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    const raw = r[at.startdatetime];
    const n = Number(raw);
    const start = typeof raw === "number" || /^\d+$/.test(String(raw)) ? (n < 1e12 ? n * 1000 : n) : Date.parse(String(raw));
    const name = String(r[at.econ_release] ?? "").trim();
    if (!name || !Number.isFinite(start)) continue;
    out.push({
      name,
      country: String(r[at.country_code] ?? "").trim().toUpperCase(),
      start,
      period: at.period >= 0 ? String(r[at.period] ?? "").trim() : "",
      actual: num(r[at.after_release_actual]),
      consensus: num(r[at.consensus_estimate]),
      prior: num(r[at.prior_release_actual]),
    });
  }
  return out;
}

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

export interface EconomicEvent extends CalendarEvent {
  country: string;
  kind: "rate" | "data" | "speech";
}

/**
 * Keep the releases calendar.json asks for, and fold the variants of one
 * release (CPI m/m, y/y, core …) at the same time into one event whose result
 * lists their figures.
 */
const INCLUDE = new WeakMap<EconomicConfig, RegExp[]>();

export function economicEvents(rows: EconomicRow[], econ: EconomicConfig, now: number): EconomicEvent[] {
  let patterns = INCLUDE.get(econ);
  if (!patterns) INCLUDE.set(econ, (patterns = econ.include.map((r) => new RegExp(r.match, "i"))));
  const groups = new Map<string, { rule: EconomicConfig["include"][number]; rows: EconomicRow[] }>();
  for (const row of rows) {
    const country = econ.countries[row.country];
    if (!country) continue;
    const rule = econ.include.find((r, i) => (!r.countries || r.countries.includes(row.country)) && patterns![i].test(row.name));
    if (!rule) continue;
    const key = rule.kind === "speech" ? `${row.country}|${row.start}|${row.name}` : `${row.country}|${row.start}|${rule.match}`;
    const g = groups.get(key) ?? { rule, rows: [] };
    g.rows.push(row);
    groups.set(key, g);
  }
  // New York is a whole number of hours off UTC, so its date is the same
  // throughout any UTC hour: work it out once per hour, not once per event.
  const dates = new Map<number, string>();
  const etDate = (ms: number) => {
    const hour = Math.floor(ms / 3_600_000);
    let d = dates.get(hour);
    if (!d) dates.set(hour, (d = wallClock(ms, ET).date));
    return d;
  };
  const out: EconomicEvent[] = [];
  for (const { rule, rows: list } of groups.values()) {
    const first = list[0];
    const country = econ.countries[first.country];
    const type: EventType = rule.kind === "data"
      ? ({ us: "us-data", europe: "eu-data", asia: "asia-data", russia: "russia", global: "us-data" } as const)[country.region]
      : ({ us: "fed", europe: "eu-central-bank", asia: "asia-central-bank", russia: "russia", global: "fed" } as const)[country.region];
    const title = rule.kind === "speech"
      ? `${country.name}: ${first.name}`
      : `${country.name} ${rule.title}${first.period ? ` (${first.period})` : ""}`;
    // Yahoo writes 0 for "not published yet"; a 0 after the release is a real 0.
    const released = first.start <= now;
    const figures = list
      .filter((r) => r.actual != null && (r.actual !== 0 || released))
      .slice(0, 3)
      .map((r) => `${list.length > 1 ? `${r.name} ` : ""}${fmt(r.actual!)}${r.consensus != null && r.consensus !== 0 ? ` (exp. ${fmt(r.consensus)})` : ""}`);
    const date = etDate(first.start);
    out.push({
      id: `${type}-${date}-${slug(`${first.country} ${rule.kind === "speech" ? first.name : rule.title}`)}`,
      type,
      title: title.slice(0, 120),
      start: iso(first.start),
      end: iso(first.start + (rule.kind === "speech" ? 45 : DEFAULT_MINUTES[type]) * 60_000),
      region: country.region,
      importance: rule.importance,
      streamUrl: "",
      result: figures.join("; ").slice(0, 200),
      tickers: [],
      country: first.country,
      kind: rule.kind,
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

async function yahooEconomic(
  session: () => Promise<YahooSession>, from: string, to: string, econ: EconomicConfig, now: number, fetcher: typeof fetch,
): Promise<EconomicEvent[]> {
  const { cookie, crumb } = await session();
  const rows: EconomicRow[] = [];
  for (let offset = 0; offset < 600; offset += 100) {
    const res = await fetcher(`https://query1.finance.yahoo.com/v1/finance/visualization?lang=en-US&region=US&crumb=${encodeURIComponent(crumb)}`, {
      method: "POST",
      headers: { "User-Agent": BROWSER_UA, Cookie: cookie, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sortType: "ASC",
        entityIdType: "economic_event",
        sortField: "startdatetime",
        includeFields: ECONOMIC_FIELDS,
        size: 100,
        offset,
        query: { operator: "and", operands: [
          { operator: "gte", operands: ["startdatetime", from] },
          { operator: "lte", operands: ["startdatetime", to] },
        ] },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json<any>();
    if (body?.finance?.error) throw new Error(String(body.finance.error?.description ?? "error"));
    const page = parseEconomic(body);
    rows.push(...page);
    if (page.length < 100) break;
  }
  return economicEvents(rows, econ, now);
}

/** A meeting from calendar.json takes the rate decision Yahoo lists for it as its result. */
export function mergeMeetingResults(
  meetings: (CalendarEvent & { country?: string })[],
  economic: EconomicEvent[],
): { meetings: CalendarEvent[]; economic: EconomicEvent[] } {
  const used = new Set<EconomicEvent>();
  const merged = meetings.map(({ country, ...m }) => {
    const hit = economic.find((e) => !used.has(e) && e.kind === "rate" && e.country === country &&
      Math.abs(Date.parse(e.start) - Date.parse(m.start)) <= 6 * 3_600_000);
    if (!hit) return m;
    used.add(hit);
    return { ...m, result: hit.result };
  });
  return { meetings: merged, economic: economic.filter((e) => !used.has(e)) };
}

/** Earnings dates for watchlist tickers listed outside the US, from Yahoo's calendarEvents. */
async function yahooEarnings(session: () => Promise<YahooSession>, cfg: Config, fromMs: number, toMs: number, fetcher: typeof fetch): Promise<CalendarEvent[]> {
  const foreign = cfg.watchlist.filter((w) => w.symbol.includes("."));
  if (!foreign.length) return [];
  const { cookie, crumb } = await session();
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

export interface RefreshOptions {
  cfg?: Config;
  cal?: CalendarConfig;
  fetcher?: typeof fetch;
  /** Days back and ahead of today (New York). Daily: 7 and 8. Hourly results refresh: 1 and 1. */
  back?: number;
  ahead?: number;
  /** Only these sources (by origin); all when omitted. */
  only?: string[];
}

/** Rebuild the calendar for the window. Each source replaces only its own rows in it. */
export async function refreshCalendar(
  env: Env,
  now = Date.now(),
  { cfg = CONFIG, cal = CALENDAR, fetcher = fetch, back = DAYS_BACK, ahead = DAYS_AHEAD, only }: RefreshOptions = {},
): Promise<string> {
  const today = wallClock(now, ET).date;
  const from = addDays(today, -back);
  const to = addDays(today, ahead);
  const fromMs = zonedToUtc(from, 0, 0, ET);
  const toMs = zonedToUtc(addDays(to, 1), 0, 0, ET);
  const wanted = (origin: string) => !only || only.includes(origin);
  const fixed = fixedEvents(from, to, cal);
  const session = yahooSession(fetcher);

  // The Yahoo economic calendar first: the meetings take their results from
  // it, and the fallback sources are only needed when it is unreachable.
  let economic: EconomicEvent[] | null = null;
  let economicError = "";
  if (cal.yahooEconomic && (wanted("yahoo-economic") || wanted("meetings"))) {
    try {
      // Past days only matter for their results: from yesterday.
      economic = await yahooEconomic(session, addDays(today, -1) < from ? from : addDays(today, -1), to, cal.yahooEconomic, now, fetcher);
    } catch (err) {
      economicError = err instanceof Error ? err.message : String(err);
    }
  }
  const { meetings, economic: others } = mergeMeetingResults(fixed.meetings, economic ?? []);
  const useFallback = economic === null;

  const sources: [string, () => Promise<CalendarEvent[]>][] = [
    ["meetings", async () => meetings],
    ["dated", async () => fixed.dated],
    ...(cal.yahooEconomic
      ? [["yahoo-economic", async () => {
          if (economic === null) throw new Error(economicError);
          return others;
        }] as [string, () => Promise<CalendarEvent[]>]]
      : []),
    ["rules", async () => fixed.rules],
    ["fallback-rules", async () => (useFallback ? fixed.fallbackRules : [])],
    ...cal.ics.map((s) => [s.id, async () => (s.fallback && !useFallback ? [] : icsEvents(s, fromMs, toMs, fetcher, from, to))] as [string, () => Promise<CalendarEvent[]>]),
    // Nasdaq from yesterday, whose reported EPS fills in the result.
    ["nasdaq", () => nasdaqEarnings(days(addDays(today, -1), to), cfg, fetcher)],
    ["yahoo", () => yahooEarnings(session, cfg, fromMs, toMs, fetcher)],
  ];

  const report: string[] = [];
  const stamp = iso(now);
  // Rows before today keep what they have (their results); rows from today
  // to the end of the window are rewritten by the source that owns them.
  const cutoff = iso(Math.max(zonedToUtc(today, 0, 0, ET), fromMs));
  for (const [origin, load] of sources.filter(([o]) => wanted(o))) {
    let events: CalendarEvent[];
    try {
      events = await load();
    } catch (err) {
      report.push(`${origin} failed: ${err instanceof Error ? err.message : err}`);
      continue; // a failed source keeps what it wrote before
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM news_events WHERE origin = ? AND start_at >= ? AND start_at < ? AND result IS NULL").bind(origin, cutoff, iso(toMs)),
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
