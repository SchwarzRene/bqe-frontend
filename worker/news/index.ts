// Market News on the Worker.
//
//   GET  /api/news          everything the page shows, one JSON document (public)
//   POST /api/news/refresh  fetch now and build a new briefing (AI access; max 1 per 15 min)
//   POST /api/chat          see chat.ts (AI access; daily limit per user)
//   /api/company/analysis   see analyst.ts (AI access; the same daily limit)
//
// "AI access" is a signed-in user an admin has granted it to (see admin.ts).
//
// and one cron, every 15 minutes (see newsTick):
//   fetch + dedupe         every run not doing one of the jobs below; a third
//                          of the sources per run (each every ~45 minutes)
//   briefing (Gemini)      02:30, 08:00, 12:30, 16:30 New York time on weekdays, Sat 10:00
//   calendar + pruning     05:00 and 05:30 New York time (no model calls)
//   calendar results       hourly on weekdays, yesterday to tomorrow (no model calls)
//   calendar ranking       05:45 New York time: Gemini ranks the events of busy days

import { aiDenied, currentUser, pruneAuth } from "../auth";
import { pruneAudit } from "../admin";
import { pruneContact } from "../contact";
import type { Env } from "../env";
import { crossSite, isoNow, json } from "../http";
import { buildBriefing, latestBriefing } from "./briefing";
import { CALENDAR, calendarIsEmpty, type CalendarEvent, readCalendar, refreshCalendar } from "./calendar";

// The daily calendar in two runs (see calendarRun in time.ts).
const CALENDAR_FIRST_HALF = ["meetings", "yahoo-economic", "fallback-rules", ...CALENDAR.ics.map((s) => s.id)];
const CALENDAR_SECOND_HALF = ["dated", "rules", "nasdaq", "yahoo"];
import { CONFIG, type FetchPlan } from "./feeds";
import { type Item, eventWordsFor, FETCH_PARTS, ingest, itemsById, MAX_NEW_PER_RUN, pruneNews, readHealth, recentItems, staleSources } from "./store";
import { latestRanks, rankCalendar } from "./rank";
import { briefingSlot, calendarRun, isRankRun, isResultsRun, iso } from "./time";

export { handleChat } from "./chat";
export { handleAnalysis } from "./analyst";

const REFRESH_EVERY_MS = 15 * 60_000;

export async function handleNews(request: Request, env: Env, action: string): Promise<Response> {
  if (action === "" && request.method === "GET") return news(env);
  if (action === "refresh") {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
    return refresh(request, env);
  }
  return json({ error: "not found" }, 404);
}

// --------------------------------------------------------------------------
// GET /api/news
// --------------------------------------------------------------------------

async function news(env: Env): Promise<Response> {
  const now = Date.now();
  const [briefing, recent, events, health, ranks] = await Promise.all([
    latestBriefing(env),
    recentItems(env, now, 24, 250),
    readCalendar(env, now - 8 * 86_400_000, now + 9 * 86_400_000),
    readHealth(env),
    latestRanks(env),
  ]);
  // A briefing can cite headlines that have since dropped out of the 24 h window.
  const have = new Set(recent.map((i) => i.id));
  const cited = briefing
    ? [
        ...Object.values(briefing.pages).flatMap((p) => p.topStories.flatMap((s) => s.ids)),
        ...briefing.companies.flatMap((c) => c.ids),
        ...briefing.commodityGroups.flatMap((g) => g.ids),
      ].filter((id) => !have.has(id))
    : [];
  const items = [...recent, ...(await itemsById(env, cited))];

  const names = new Map<string, string>([
    ...CONFIG.feeds.map((f) => [f.id, f.name] as [string, string]),
    ...CONFIG.watchlist.map((w) => [`yahoo:${w.symbol}`, `Yahoo (${w.symbol})`] as [string, string]),
    ...CONFIG.commodities.map((c) => [`yahoo:${c.symbol}`, `Yahoo (${c.name})`] as [string, string]),
  ]);
  const stale = staleSources(health, now).map((id) => names.get(id) ?? id);
  const yahooIds = Object.keys(health?.sources ?? {}).filter((id) => id.startsWith("yahoo:"));
  // Yahoo is "unavailable" when none of its lookups returned anything for 2 hours.
  const yahooOk = !yahooIds.length || yahooIds.some((id) => {
    const ok = health!.sources[id].lastOk;
    return !!ok && now - Date.parse(ok) < 2 * 3_600_000;
  });

  return json(
    {
      now: iso(now),
      fetchedAt: health?.updated ?? null,
      briefing,
      items,
      events: withHeadlines(events, recent),
      // The model's ranking of busy calendar days (see rank.ts); null until it has run.
      calendarRanks: ranks ? { generatedAt: ranks.generatedAt, events: ranks.events, days: ranks.days } : null,
      watchlist: CONFIG.watchlist,
      commodities: CONFIG.commodities,
      stale: [...new Set(stale)],
      yahooOk,
    },
    200,
    { "Cache-Control": "public, max-age=60" },
  );
}

/** Headlines that mention an event (its acronyms or tickers) around its day, grouped under it. */
export function withHeadlines(events: CalendarEvent[], items: Item[]): (CalendarEvent & { itemIds: string[] })[] {
  return events.map((e) => {
    const words = eventWordsFor([e.title], e.tickers);
    const start = Date.parse(e.start);
    const itemIds = words.length
      ? items
          .filter((i) => Math.abs(Date.parse(i.publishedAt) - start) < 18 * 3_600_000)
          .filter((i) => words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(i.title) || i.tickers.includes(w)))
          .slice(0, 5)
          .map((i) => i.id)
      : [];
    return { ...e, itemIds };
  });
}

// --------------------------------------------------------------------------
// POST /api/news/refresh
// --------------------------------------------------------------------------

/** Take a slot in documents unless it was taken within `everyMs`. Atomic. */
async function claim(env: Env, key: string, everyMs: number): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT INTO documents (key, body, updated) VALUES (?1, '{}', ?2)
     ON CONFLICT (key) DO UPDATE SET updated = excluded.updated WHERE documents.updated < ?3`,
  )
    .bind(key, isoNow(), iso(Date.now() - everyMs))
    .run();
  return result.meta.changes > 0;
}

async function headlineCount(env: Env, now: number): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM news_items WHERE published_at > ?").bind(iso(now - 86_400_000)).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Which third of the sources the next fetch run takes: a counter, so skipped runs do not skip a third. */
async function nextFetchPart(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO documents (key, body, updated) VALUES ('news:fetch-part', '0', ?1)
     ON CONFLICT (key) DO UPDATE SET body = CAST((CAST(documents.body AS INTEGER) + 1) % ${FETCH_PARTS} AS TEXT), updated = excluded.updated
     RETURNING body`,
  )
    .bind(isoNow())
    .first<{ body: string }>();
  return Number(row?.body ?? 0) % FETCH_PARTS;
}

async function refresh(request: Request, env: Env): Promise<Response> {
  if (crossSite(request)) return json({ error: "forbidden" }, 403);
  // Before anything else: a guest never costs a fetch or a model call.
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in to build a fresh briefing." }, 401);
  const denied = aiDenied(user);
  if (denied) return denied;
  if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY is not set." }, 503);
  if (!(await claim(env, "news:refresh", REFRESH_EVERY_MS))) {
    return json({ error: "A fresh briefing was built less than 15 minutes ago." }, 429);
  }
  const fetched = await ingest(env);
  const result = await buildBriefing(env, "manual", { force: true });
  console.log(`news refresh by ${user.username}: ${fetched.added} new, ${result}`);
  return json({ result, added: fetched.added });
}

// --------------------------------------------------------------------------
// the cron
// --------------------------------------------------------------------------

export async function newsTick(env: Env, ms = Date.now(), cfg = CONFIG, plan?: FetchPlan): Promise<string> {
  const report: string[] = [];
  const record = async (name: string, run: () => Promise<unknown>) => {
    try {
      const out = await run();
      report.push(`${name}: ${typeof out === "string" ? out : JSON.stringify(out)}`);
    } catch (err) {
      report.push(`${name} failed: ${err}`);
    }
  };

  // One job per run: the free Workers plan allows 10 ms of CPU per run, so
  // the fetch, the calendar and the briefing never share one.
  const part = calendarRun(ms);
  if (part === 1) {
    // 05:00 New York: the economic calendar, meetings and fallbacks, and the daily clean-up.
    await record("calendar", () => refreshCalendar(env, ms, { cfg, only: CALENDAR_FIRST_HALF }));
    await record("prune", async () => {
      await Promise.all([pruneNews(env, ms), pruneContact(env), pruneAuth(env), pruneAudit(env)]);
      return "done";
    });
    return report.join(" · ");
  }
  if (part === 2) {
    // 05:30 New York: earnings, dated events and the weekly rules.
    await record("calendar", () => refreshCalendar(env, ms, { cfg, only: CALENDAR_SECOND_HALF }));
    return report.join(" · ");
  }
  if ((await calendarIsEmpty(env, ms)) && (await claim(env, "news:calendar-first", 60 * 60_000))) {
    // A fresh deploy: the calendar is built by the first runs, not at 05:00 —
    // this half now, the other half on the next run.
    await record("calendar (first)", () => refreshCalendar(env, ms, { cfg, only: CALENDAR_FIRST_HALF }));
    return report.join(" · ");
  }
  if ((await claim(env, "news:calendar-first-2", 365 * 86_400_000))) {
    await record("calendar (first, part 2)", () => refreshCalendar(env, ms, { cfg, only: CALENDAR_SECOND_HALF }));
    return report.join(" · ");
  }

  // The briefing and the calendar ranking: the cron's only model calls. The
  // briefing at the briefing times, and after a fresh deploy as soon as there
  // are headlines to write about.
  if (env.GEMINI_API_KEY) {
    const slot = briefingSlot(ms);
    if (slot) {
      await record("briefing", () => buildBriefing(env, slot, { now: ms, cfg }));
      return report.join(" · ");
    }
    if (!(await latestBriefing(env)) && (await headlineCount(env, ms)) >= 5 && (await claim(env, "news:briefing-first", 30 * 60_000))) {
      await record("briefing (first)", () => buildBriefing(env, "first", { force: true, now: ms, cfg }));
      return report.join(" · ");
    }
    // The ranking of busy calendar days, once the day's calendar is written.
    if (isRankRun(ms)) {
      await record("calendar ranks", () => rankCalendar(env, ms));
      return report.join(" · ");
    }
  }

  if (isResultsRun(ms)) {
    // Hourly on weekdays: results (actual vs. consensus, reported EPS, rate
    // decisions) appear once they are published.
    await record("calendar results", () =>
      refreshCalendar(env, ms, { cfg, back: 1, ahead: 1, only: ["meetings", "yahoo-economic", "nasdaq"] }));
    return report.join(" · ");
  }

  // After a deploy, the first ranking does not wait for 05:45 (but for the first briefing).
  if (env.GEMINI_API_KEY && !(await latestRanks(env)) && (await latestBriefing(env)) && (await claim(env, "news:ranks-first", 60 * 60_000))) {
    await record("calendar ranks (first)", () => rankCalendar(env, ms));
    return report.join(" · ");
  }

  // Every other run fetches the next third of the sources.
  await record("fetch", async () => ingest(env, ms, cfg, fetch, plan ?? { part: await nextFetchPart(env), of: FETCH_PARTS, budget: MAX_NEW_PER_RUN }));
  return report.join(" · ");
}
