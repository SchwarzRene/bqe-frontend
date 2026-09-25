// The admin terminal's API (/pages/admin.html). Signed-in admins only; the
// scheduled-job endpoints under /api/admin/run/* keep their bearer token.
//
//   GET    /api/admin/users                      every account, newest first
//   PATCH  /api/admin/users/:id  {ai?, disabled?, role?}
//   POST   /api/admin/users/:id/password         -> {password}: a new temporary one
//   DELETE /api/admin/users/:id                  the account and everything it saved
//
// An admin cannot suspend, demote or delete their own account, so the site
// can never be left without one by accident.

import { currentUser, derive, ITERATIONS, randomToken, type User } from "./auth";
import type { Env } from "./env";
import { crossSite, hex, isoNow, json, readJson, utcDay } from "./http";

export interface AccountRow {
  id: number;
  username: string;
  email: string | null;
  role: "user" | "admin";
  ai: boolean;
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  sessions: number;
  aiToday: number;
}

export async function handleAdminUsers(request: Request, env: Env, id: number | null, sub: string): Promise<Response> {
  const method = request.method;
  if (method !== "GET" && crossSite(request)) return json({ error: "forbidden" }, 403);
  const admin = await currentUser(request, env);
  if (!admin) return json({ error: "Sign in first." }, 401);
  if (admin.role !== "admin") return json({ error: "Admins only." }, 403);

  if (id === null) {
    if (method !== "GET") return json({ error: "method not allowed" }, 405, { Allow: "GET" });
    return json({ users: await listUsers(env), me: admin.id });
  }

  const target = await env.DB.prepare("SELECT id, username, role FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: number; username: string; role: string }>();
  if (!target) return json({ error: "No such user." }, 404);

  if (sub === "password") {
    if (method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
    return resetPassword(env, admin, target);
  }
  if (sub) return json({ error: "not found" }, 404);

  if (method === "PATCH") return update(request, env, admin, target.id);
  if (method === "DELETE") {
    if (target.id === admin.id) return json({ error: "You can't delete your own account here." }, 400);
    await env.DB.batch([
      // D1 enforces foreign keys, but the cascade is spelled out so it does
      // not depend on that.
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id),
      env.DB.prepare("DELETE FROM user_state WHERE user_id = ?").bind(target.id),
      env.DB.prepare("DELETE FROM news_chat_usage WHERE user_id = ?").bind(target.id),
      env.DB.prepare("DELETE FROM users WHERE id = ?").bind(target.id),
    ]);
    console.log(`admin ${admin.username} deleted user ${target.username}`);
    return json({ ok: true });
  }
  return json({ error: "method not allowed" }, 405, { Allow: "PATCH, DELETE" });
}

export async function listUsers(env: Env): Promise<AccountRow[]> {
  const rows = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.role, u.ai_access, u.disabled, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?1) AS sessions,
            COALESCE((SELECT count FROM news_chat_usage c WHERE c.user_id = u.id AND c.day = ?2), 0) AS ai_today
       FROM users u ORDER BY u.created_at DESC, u.id DESC`,
  )
    .bind(isoNow(), utcDay())
    .all<any>();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    username: r.username,
    email: r.email ?? null,
    role: r.role === "admin" ? "admin" : "user",
    ai: r.role === "admin" || !!r.ai_access,
    disabled: !!r.disabled,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at ?? null,
    sessions: Number(r.sessions) || 0,
    aiToday: Number(r.ai_today) || 0,
  }));
}

async function update(request: Request, env: Env, admin: User, id: number): Promise<Response> {
  const body = await readJson(request, 1024);
  if (!body) return json({ error: "Send the changes as JSON." }, 400);
  const sets: string[] = [];
  const args: unknown[] = [];

  if ("ai" in body) {
    if (typeof body.ai !== "boolean") return json({ error: "ai must be true or false." }, 400);
    sets.push("ai_access = ?");
    args.push(body.ai ? 1 : 0);
  }
  if ("disabled" in body) {
    if (typeof body.disabled !== "boolean") return json({ error: "disabled must be true or false." }, 400);
    if (id === admin.id && body.disabled) return json({ error: "You can't suspend your own account." }, 400);
    sets.push("disabled = ?");
    args.push(body.disabled ? 1 : 0);
  }
  if ("role" in body) {
    if (body.role !== "user" && body.role !== "admin") return json({ error: "role must be user or admin." }, 400);
    if (id === admin.id && body.role !== "admin") return json({ error: "You can't remove your own admin role." }, 400);
    sets.push("role = ?");
    args.push(body.role);
  }
  if (!sets.length) return json({ error: "Nothing to change." }, 400);

  const statements = [env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id)];
  // A suspended account is signed out everywhere, not just refused next time.
  if (body.disabled === true) statements.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id));
  await env.DB.batch(statements);
  console.log(`admin ${admin.username} updated user ${id}: ${JSON.stringify(body)}`);

  const user = (await listUsers(env)).find((u) => u.id === id);
  return json({ user });
}

async function resetPassword(env: Env, admin: User, target: { id: number; username: string }): Promise<Response> {
  // 12 URL-safe characters: easy to pass on, and changed by the user after signing in.
  const password = randomToken().slice(0, 12);
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?").bind(
      await derive(password, salt, ITERATIONS), salt, ITERATIONS, target.id,
    ),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND user_id != ?").bind(target.id, admin.id),
  ]);
  console.log(`admin ${admin.username} reset the password of ${target.username}`);
  return json({ password });
}
