// Meal Diary API: what a signed-in user ate, when, with an optional photo, and
// the AI's meal ideas for each day. Everything is per user and per day.
//
//   GET    /api/diary/day/:day            the day's meals, its saved ideas, the user's notes
//   GET    /api/diary/days?month=YYYY-MM  meals per day in a month (the calendar), or ?from=&to= (the date strip)
//   GET    /api/diary/history?before=&limit=  past days with their meals, newest first (the feed)
//   POST   /api/diary/meals               {day, time, slot, description}
//   PATCH  /api/diary/meals/:id           any of day, time, slot, description
//   DELETE /api/diary/meals/:id           the meal and its photo
//   PUT    /api/diary/meals/:id/photo     the picture as the request body (photos.ts)
//   GET    /api/diary/meals/:id/photo     the picture
//   DELETE /api/diary/meals/:id/photo
//   GET/PUT /api/diary/settings           {notes}: diet, allergies, dislikes, goals
//   POST   /api/diary/describe            a picture as the body -> {description} from Gemini (describe.ts)
//   POST   /api/diary/meals/:id/describe  the same for the meal's saved photo
//   POST   /api/diary/suggest             {day}: summary of the day and what to cook next (suggest.ts)
//
// Guests get 401: the diary is the account's, and so is every model call here —
// a guest never reaches one. The AI part needs AI access on top (aiDenied, as
// in Market News); keeping the diary does not. The AI runs only on request.
//
// `day` is the user's own calendar date as their browser saw it (YYYY-MM-DD)
// and `time` their local clock (HH:MM), so a late dinner stays on its day
// whatever the server's zone is.

import { currentUser } from "../auth";
import type { Env } from "../env";
import { crossSite, isoNow, json, readJson } from "../http";
import { handleDescribe } from "./describe";
import { handlePhoto } from "./photos";
import { DAY_MS, DAY_RE, MAX_DESCRIPTION, MAX_MEALS_PER_DAY, MAX_MEALS_PER_USER, MAX_NOTES, MONTH_RE, type Meal, mealsOn, readSettings, SLOTS, TIME_RE, toMeal, validDay } from "./store";
import { handleSuggest } from "./suggest";

export async function handleDiary(request: Request, env: Env, rest: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in to keep a meal diary." }, 401);
  const method = request.method;
  const url = new URL(request.url);
  const parts = rest.split("/").filter(Boolean);
  const write = method !== "GET" && method !== "HEAD";
  if (write && crossSite(request)) return json({ error: "forbidden" }, 403);

  if (parts[0] === "day" && parts.length === 2) {
    if (method !== "GET") return json({ error: "method not allowed" }, 405, { Allow: "GET" });
    return readDay(env, user, parts[1]);
  }
  if (parts[0] === "days" && parts.length === 1) {
    if (method !== "GET") return json({ error: "method not allowed" }, 405, { Allow: "GET" });
    return readDays(env, user.id, url.searchParams);
  }
  if (parts[0] === "history" && parts.length === 1) {
    if (method !== "GET") return json({ error: "method not allowed" }, 405, { Allow: "GET" });
    return readHistory(env, user.id, url.searchParams);
  }
  if (parts[0] === "settings" && parts.length === 1) {
    if (method === "GET") return json(await readSettings(env, user.id));
    if (method === "PUT") return saveSettings(request, env, user.id);
    return json({ error: "method not allowed" }, 405, { Allow: "GET, PUT" });
  }
  if (parts[0] === "describe" && parts.length === 1) {
    if (method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
    return handleDescribe(request, env, user, null);
  }
  if (parts[0] === "suggest" && parts.length === 1) {
    if (method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
    return handleSuggest(request, env, user);
  }
  if (parts[0] === "meals") {
    if (parts.length === 1) {
      if (method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
      return createMeal(request, env, user.id);
    }
    const id = /^\d{1,12}$/.test(parts[1]) ? Number(parts[1]) : 0;
    if (!id) return json({ error: "not found" }, 404);
    if (parts.length === 2) {
      if (method === "PATCH") return updateMeal(request, env, user.id, id);
      if (method === "DELETE") return deleteMeal(env, user.id, id);
      return json({ error: "method not allowed" }, 405, { Allow: "PATCH, DELETE" });
    }
    if (parts.length === 3 && parts[2] === "photo") return handlePhoto(request, env, user.id, id);
    if (parts.length === 3 && parts[2] === "describe") {
      if (method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
      return handleDescribe(request, env, user, id);
    }
  }
  return json({ error: "not found" }, 404);
}

// --------------------------------------------------------------------------
// reading
// --------------------------------------------------------------------------

async function readDay(env: Env, user: { id: number; ai: boolean }, day: string): Promise<Response> {
  if (!validDay(day)) return json({ error: "That is not a date I can use." }, 400);
  const [meals, saved, settings] = await Promise.all([
    mealsOn(env, user.id, day),
    env.DB.prepare("SELECT body, generated_at FROM diary_suggestions WHERE user_id = ? AND day = ?").bind(user.id, day).first<{ body: string; generated_at: string }>(),
    readSettings(env, user.id),
  ]);
  let suggestion: unknown = null;
  if (saved) {
    try {
      suggestion = { ...JSON.parse(saved.body), generatedAt: saved.generated_at };
    } catch {
      suggestion = null;
    }
  }
  return json({ day, meals, suggestion, notes: settings.notes, ai: user.ai });
}

const MAX_RANGE_DAYS = 400;
const HISTORY_PAGE = 14;

/** Meals per day for a month (?month=YYYY-MM) or for a range of days (?from=&to=, at most 400 days). */
async function readDays(env: Env, userId: number, q: URLSearchParams): Promise<Response> {
  const month = q.get("month");
  let from: string;
  let to: string;
  if (month !== null) {
    if (!MONTH_RE.test(month)) return json({ error: "Ask for a month as YYYY-MM." }, 400);
    [from, to] = [`${month}-01`, `${month}-31`];
  } else {
    from = q.get("from") ?? "";
    to = q.get("to") ?? "";
    // Looser than validDay: old entries stay readable after they leave the window new ones may be written in.
    if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to || Date.parse(to) - Date.parse(from) > MAX_RANGE_DAYS * DAY_MS) {
      return json({ error: `Ask for a range as ?from=YYYY-MM-DD&to=YYYY-MM-DD, at most ${MAX_RANGE_DAYS} days.` }, 400);
    }
  }
  const rows = await env.DB.prepare(
    "SELECT day, COUNT(*) AS n FROM diary_meals WHERE user_id = ? AND day >= ? AND day <= ? GROUP BY day ORDER BY day",
  )
    .bind(userId, from, to)
    .all<{ day: string; n: number }>();
  return json({ ...(month !== null ? { month } : { from, to }), days: (rows.results ?? []).map((r) => ({ day: r.day, meals: Number(r.n) })) });
}

/**
 * The days that have entries before `before` (exclusive; none given = from the newest), newest
 * first, each with its meals — a page for the feed. `next` is the cursor for the following
 * page, null at the end.
 */
async function readHistory(env: Env, userId: number, q: URLSearchParams): Promise<Response> {
  const before = q.get("before") ?? "9999-12-31";
  if (!DAY_RE.test(before)) return json({ error: "before is a date, YYYY-MM-DD." }, 400);
  const limit = Math.min(30, Math.max(1, Math.round(Number(q.get("limit"))) || HISTORY_PAGE));
  const days = await env.DB.prepare("SELECT DISTINCT day FROM diary_meals WHERE user_id = ? AND day < ? ORDER BY day DESC LIMIT ?")
    .bind(userId, before, limit)
    .all<{ day: string }>();
  const list = (days.results ?? []).map((d) => d.day);
  if (!list.length) return json({ days: [], next: null });
  const rows = await env.DB.prepare(
    `SELECT m.id, m.day, m.time, m.slot, m.description, p.updated_at AS photo
       FROM diary_meals m LEFT JOIN diary_photos p ON p.meal_id = m.id
      WHERE m.user_id = ? AND m.day >= ? AND m.day <= ? ORDER BY m.day DESC, m.time, m.id`,
  )
    .bind(userId, list[list.length - 1], list[0])
    .all<any>();
  const byDay = new Map<string, Meal[]>(list.map((d) => [d, []]));
  for (const r of rows.results ?? []) byDay.get(r.day)?.push(toMeal(r));
  return json({ days: list.map((day) => ({ day, meals: byDay.get(day)! })), next: list.length === limit ? list[list.length - 1] : null });
}

// --------------------------------------------------------------------------
// writing
// --------------------------------------------------------------------------

/** The fields of a meal as sent by the page, or the message that says what is wrong. */
function cleanFields(body: any, partial: boolean): { fields: Partial<Omit<Meal, "id" | "photo">> } | { error: string } {
  const fields: Partial<Omit<Meal, "id" | "photo">> = {};
  const has = (k: string) => !partial || k in body;
  if (has("day")) {
    if (!validDay(body.day)) return { error: "Pick a date within the last two years." };
    fields.day = body.day;
  }
  if (has("time")) {
    if (typeof body.time !== "string" || !TIME_RE.test(body.time)) return { error: "The time needs the form HH:MM." };
    fields.time = body.time;
  }
  if (has("slot")) {
    if (!(SLOTS as readonly string[]).includes(body.slot)) return { error: `The meal is one of ${SLOTS.join(", ")}.` };
    fields.slot = body.slot;
  }
  if (has("description")) {
    const text = typeof body.description === "string" ? body.description.replace(/\s+/g, " ").trim() : "";
    if (!text) return { error: "Say what you ate." };
    if (text.length > MAX_DESCRIPTION) return { error: `Keep the description under ${MAX_DESCRIPTION} characters.` };
    fields.description = text;
  }
  return { fields };
}

const dayFull = () => json({ error: `That is ${MAX_MEALS_PER_DAY} entries for one day — enough.` }, 429);

async function createMeal(request: Request, env: Env, userId: number): Promise<Response> {
  const body = await readJson(request, 8 * 1024);
  if (!body) return json({ error: "Send the meal as JSON." }, 400);
  const clean = cleanFields(body, false);
  if ("error" in clean) return json({ error: clean.error }, 400);
  const f = clean.fields as Omit<Meal, "id" | "photo">;

  const counts = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM diary_meals WHERE user_id = ?1 AND day = ?2) AS today,
            (SELECT COUNT(*) FROM diary_meals WHERE user_id = ?1) AS total`,
  )
    .bind(userId, f.day)
    .first<{ today: number; total: number }>();
  if ((counts?.today ?? 0) >= MAX_MEALS_PER_DAY) return dayFull();
  if ((counts?.total ?? 0) >= MAX_MEALS_PER_USER) return json({ error: "Your diary is full. Delete old entries to add more." }, 413);

  const now = isoNow();
  const row = await env.DB.prepare(
    `INSERT INTO diary_meals (user_id, day, time, slot, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(userId, f.day, f.time, f.slot, f.description, now, now)
    .first<{ id: number }>();
  return json({ meal: { id: row!.id, ...f, photo: null } }, 201);
}

async function updateMeal(request: Request, env: Env, userId: number, id: number): Promise<Response> {
  const body = await readJson(request, 8 * 1024);
  if (!body) return json({ error: "Send the changes as JSON." }, 400);
  const clean = cleanFields(body, true);
  if ("error" in clean) return json({ error: clean.error }, 400);
  const entries = Object.entries(clean.fields);
  if (!entries.length) return json({ error: "Nothing to change." }, 400);

  // Moving an entry to another day counts against that day's cap like adding one does.
  if (clean.fields.day) {
    const there = await env.DB.prepare("SELECT COUNT(*) AS n FROM diary_meals WHERE user_id = ? AND day = ? AND id != ?").bind(userId, clean.fields.day, id).first<{ n: number }>();
    if ((there?.n ?? 0) >= MAX_MEALS_PER_DAY) return dayFull();
  }

  const result = await env.DB.prepare(
    `UPDATE diary_meals SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND user_id = ?`,
  )
    .bind(...entries.map(([, v]) => v), isoNow(), id, userId)
    .run();
  if (!result.meta.changes) return json({ error: "That entry no longer exists." }, 404);
  const row = await env.DB.prepare(
    `SELECT m.id, m.day, m.time, m.slot, m.description, p.updated_at AS photo FROM diary_meals m
       LEFT JOIN diary_photos p ON p.meal_id = m.id WHERE m.id = ? AND m.user_id = ?`,
  )
    .bind(id, userId)
    .first<any>();
  return json({ meal: toMeal(row) });
}

async function deleteMeal(env: Env, userId: number, id: number): Promise<Response> {
  // The photo first: the cascade is spelled out, as in deleteUserStatements.
  const [, result] = await env.DB.batch([
    env.DB.prepare("DELETE FROM diary_photos WHERE meal_id = ? AND user_id = ?").bind(id, userId),
    env.DB.prepare("DELETE FROM diary_meals WHERE id = ? AND user_id = ?").bind(id, userId),
  ]);
  if (!result.meta.changes) return json({ error: "That entry no longer exists." }, 404);
  return json({ ok: true });
}

async function saveSettings(request: Request, env: Env, userId: number): Promise<Response> {
  const body = await readJson(request, 8 * 1024);
  if (!body || typeof body.notes !== "string") return json({ error: "Send {notes} as JSON." }, 400);
  const notes = body.notes.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (notes.length > MAX_NOTES) return json({ error: `Keep the notes under ${MAX_NOTES} characters.` }, 413);
  await env.DB.prepare(
    `INSERT INTO diary_settings (user_id, notes, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at`,
  )
    .bind(userId, notes, isoNow())
    .run();
  return json({ notes });
}

/** Saved ideas older than 60 days and finished days of the daily limit. Run daily. */
export async function pruneDiary(env: Env, now = Date.now()): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM diary_suggestions WHERE day < ?").bind(new Date(now - 60 * DAY_MS).toISOString().slice(0, 10)),
    env.DB.prepare("DELETE FROM diary_ai_usage WHERE day < ?").bind(new Date(now - 2 * DAY_MS).toISOString().slice(0, 10)),
  ]);
}
