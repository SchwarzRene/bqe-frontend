// Per-user app state: one JSON document per signed-in user per app.
//
//   GET /api/state/:app   -> {version, updated, data}   (data null when empty)
//   PUT /api/state/:app   {version, data}               -> {version, updated}
//
// Guests get 401 and keep their work in the page only. `version` is the one
// the client last saw; a save from a tab that fell behind gets 409 instead
// of overwriting newer work.

import { currentUser } from "./auth";
import type { Env } from "./env";
import { crossSite, isoNow, json, jsonText, readJson } from "./http";

// news: the companies a user follows on Market News.
export const APPS = new Set(["stack", "journal", "news"]);
// D1 rows top out at 2 MB; the JSON envelope needs a little room.
const MAX_BYTES = 1_800_000;

export async function handleState(request: Request, env: Env, app: string): Promise<Response> {
  if (!APPS.has(app)) return json({ error: "not found" }, 404);
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in to save your work." }, 401);

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
