// Per-user app state: one JSON document per signed-in user per app.
//
//   GET /api/state/:app   -> {version, updated, data}   (data null when empty)
//   PUT /api/state/:app   {version, data}               -> {version, updated}
//
// Guests get 401 and keep their work in the page only. `version` is the one
// the client last saw; a save from a tab that fell behind gets 409 instead
// of overwriting newer work.
//
// Display preferences (theme, regions, language …) are one more document,
// "prefs", with a section per app. It is merged rather than versioned: a
// setting is last-write-wins, and two apps saving their sections at once
// must not refuse each other.
//
//   GET   /api/state/prefs                -> {version, updated, data: {news: {…}, journal: {…}}}
//   PATCH /api/state/prefs  {news: {…}}   -> {ok}   (a section set to null is removed)

import { currentUser } from "./auth";
import type { Env } from "./env";
import { crossSite, isoNow, json, jsonText, readJson } from "./http";

// news: the companies a user follows on Market News.
export const APPS = new Set(["stack", "journal", "news"]);
// D1 rows top out at 2 MB; the JSON envelope needs a little room.
const MAX_BYTES = 1_800_000;
// Everything one account may keep, across its apps. With open sign-up the
// database's size is shared by everyone, so no single account gets to fill it.
export const MAX_USER_BYTES = 4_000_000;

// Sections of the prefs document, one per app that has settings.
export const PREF_SECTIONS = new Set(["news", "journal", "historymap"]);
const MAX_PREF_BYTES = 4096; // per section

export async function handleState(request: Request, env: Env, app: string): Promise<Response> {
  if (!APPS.has(app) && app !== "prefs") return json({ error: "not found" }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in to save your work." }, 401);
  if (app === "prefs" && request.method === "PATCH") return patchPrefs(request, env, user.id);
  if (app === "prefs" && request.method === "PUT") return json({ error: "method not allowed" }, 405, { Allow: "GET, PATCH" });

  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT body, version, updated_at FROM user_state WHERE user_id = ? AND app = ?")
      .bind(user.id, app)
      .first<{ body: string; version: number; updated_at: string }>();
    if (!row) return json({ version: 0, updated: null, data: null });
    // The body is stored serialised; splice it in rather than parse it.
    return jsonText(`{"version":${row.version},"updated":${JSON.stringify(row.updated_at)},"data":${row.body}}`);
  }

  if (request.method !== "PUT") return json({ error: "method not allowed" }, 405, { Allow: "GET, PUT" });
  if (crossSite(request)) return json({ error: "forbidden" }, 403);

  const payload = await readJson(request, MAX_BYTES + 1024);
  if (!payload || !Number.isInteger(payload.version) || typeof payload.data !== "object" || payload.data === null) {
    return json({ error: "Send {version, data} as JSON, under 1.8 MB." }, 400);
  }
  const body = JSON.stringify(payload.data);
  if (body.length > MAX_BYTES) return json({ error: "This is too much data to save in one document." }, 413);

  const others = await env.DB.prepare("SELECT COALESCE(SUM(LENGTH(body)), 0) AS n FROM user_state WHERE user_id = ? AND app != ?")
    .bind(user.id, app)
    .first<{ n: number }>();
  if ((others?.n ?? 0) + body.length > MAX_USER_BYTES) {
    return json({ error: "Your account is full (4 MB across the apps). Delete old entries to save more." }, 413);
  }

  const now = isoNow();
  const next = payload.version + 1;
  const result =
    payload.version === 0
      ? await env.DB.prepare(
          `INSERT INTO user_state (user_id, app, body, version, updated_at) VALUES (?, ?, ?, 1, ?)
           ON CONFLICT (user_id, app) DO NOTHING`,
        )
          .bind(user.id, app, body, now)
          .run()
      : await env.DB.prepare(
          "UPDATE user_state SET body = ?, version = ?, updated_at = ? WHERE user_id = ? AND app = ? AND version = ?",
        )
          .bind(body, next, now, user.id, app, payload.version)
          .run();

  if (!result.meta.changes) {
    const current = await env.DB.prepare("SELECT version FROM user_state WHERE user_id = ? AND app = ?")
      .bind(user.id, app)
      .first<{ version: number }>();
    return json({ error: "Saved from another tab in the meantime — reload to continue.", version: current?.version ?? 0 }, 409);
  }
  return json({ version: next, updated: now });
}

async function patchPrefs(request: Request, env: Env, userId: number): Promise<Response> {
  if (crossSite(request)) return json({ error: "forbidden" }, 403);
  const body = await readJson(request, PREF_SECTIONS.size * MAX_PREF_BYTES + 1024);
  if (!body) return json({ error: "Send the settings as a JSON object." }, 400);
  const sections = Object.keys(body);
  if (!sections.length) return json({ error: "Nothing to save." }, 400);
  for (const key of sections) {
    const value = body[key];
    if (!PREF_SECTIONS.has(key)) return json({ error: `Unknown settings section: ${key}` }, 400);
    if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
      return json({ error: `${key} must be an object or null.` }, 400);
    }
    if (JSON.stringify(value).length > MAX_PREF_BYTES) return json({ error: `${key} is too large.` }, 413);
  }
  // json_patch (RFC 7396) merges each section into the stored one and drops
  // the sections set to null.
  const now = isoNow();
  await env.DB.prepare(
    `INSERT INTO user_state (user_id, app, body, version, updated_at) VALUES (?1, 'prefs', json_patch('{}', ?2), 1, ?3)
     ON CONFLICT (user_id, app) DO UPDATE SET body = json_patch(user_state.body, ?2), version = user_state.version + 1, updated_at = ?3`,
  )
    .bind(userId, JSON.stringify(body), now)
    .run();
  return json({ ok: true, updated: now });
}
