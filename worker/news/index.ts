// Market News on the Worker.
//
//   GET  /api/news          everything the page shows, one JSON document (public)
//   POST /api/news/refresh  fetch now and build a new briefing (signed in; max 1 per 15 min)
//   POST /api/chat          see chat.ts (signed in; daily limit per user)
//
// and one cron, every 15 minutes (see newsTick):
//   fetch + dedupe         every run on weekdays, hourly at weekends
//   briefing (Gemini)      02:30, 08:00, 12:30, 16:30 New York time on weekdays, Sat 10:00
//   calendar + pruning     05:00 New York time (no model calls)
//   calendar results       hourly on weekdays, yesterday to tomorrow (no model calls)

import { currentUser, pruneAuth } from "../auth";
import { pruneContact } from "../contact";
import type { Env } from "../env";
import { crossSite, isoNow, json } from "../http";
import { buildBriefing, latestBriefing } from "./briefing";
import { calendarIsEmpty, type CalendarEvent, readCalendar, refreshCalendar } from "./calendar";
import { CONFIG } from "./feeds";
import { type Item, eventWordsFor, ingest, itemsById, pruneNews, readHealth, recentItems, staleSources } from "./store";
import { briefingSlot, isCalendarRun, isResultsRun, iso, shouldFetch } from "./time";

export { handleChat } from "./chat";

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
  const [briefing, recent, events, health] = await Promise.all([
    latestBriefing(env),
    recentItems(env, now, 24, 250),
    readCalendar(env, now - 8 * 86_400_000, now + 9 * 86_400_000),
    readHealth(env),
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

async function refresh(request: Request, env: Env): Promise<Response> {
  if (crossSite(request)) return json({ error: "forbidden" }, 403);
  // Before anything else: a guest never costs a fetch or a model call.
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in to build a fresh briefing." }, 401);
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

export async function newsTick(env: Env, ms = Date.now(), cfg = CONFIG): Promise<string> {
  const report: string[] = [];
  const record = async (name: string, run: () => Promise<unknown>) => {
    try {
      const out = await run();
      report.push(`${name}: ${typeof out === "string" ? out : JSON.stringify(out)}`);
    } catch (err) {
      report.push(`${name} failed: ${err}`);
    }
  };

  // 05:00 New York: the calendar and the daily clean-up. That run skips the
  // headline fetch, so the two stay within the per-run subrequest limit.
  const calendarRun = isCalendarRun(ms);
  if (shouldFetch(ms) && !calendarRun) await record("fetch", () => ingest(env, ms, cfg));
  if (calendarRun) {
    await record("calendar", () => refreshCalendar(env, ms, { cfg }));
    await record("prune", async () => {
      await Promise.all([pruneNews(env, ms), pruneContact(env), pruneAuth(env)]);
      return "done";
    });
  } else if ((await calendarIsEmpty(env, ms)) && (await claim(env, "news:calendar-first", 60 * 60_000))) {
    // A fresh deploy: the calendar is built by the first run, not at 05:00.
    await record("calendar (first)", () => refreshCalendar(env, ms, { cfg }));
  } else if (isResultsRun(ms)) {
    // Hourly on weekdays: results (actual vs. consensus, reported EPS, rate
    // decisions) appear once they are published.
    await record("calendar results", () =>
      refreshCalendar(env, ms, { cfg, back: 1, ahead: 1, only: ["meetings", "yahoo-economic", "nasdaq"] }));
  }

  // The only model calls the cron makes: the briefing.
  if (!env.GEMINI_API_KEY) {
    report.push("briefing skipped: GEMINI_API_KEY is not set");
    return report.join(" · ");
  }
  const slot = briefingSlot(ms);
  if (slot) {
    await record("briefing", () => buildBriefing(env, slot, { now: ms, cfg }));
  } else if (!(await latestBriefing(env)) && (await claim(env, "news:briefing-first", 60 * 60_000))) {
    // A fresh deploy: the first briefing comes with the first fetch, not at the next slot.
    await record("briefing (first)", () => buildBriefing(env, "first", { force: true, now: ms, cfg }));
  }
  return report.join(" · ");
}
