// The admin terminal's API (/pages/admin.html). Signed-in admins only; the
// scheduled-job endpoints under /api/admin/run/* keep their bearer token.
//
//   GET    /api/admin/users                      every account, newest first
//   PATCH  /api/admin/users/:id  {ai?, disabled?, role?}
//   POST   /api/admin/users/:id/password         -> {password}: a new temporary one
//   DELETE /api/admin/users/:id                  the account and everything it saved
//   GET    /api/admin/messages                   contact-form messages, unanswered first
//   POST   /api/admin/messages/:id/answered      mark one answered (starts the 30-day deletion)
//   GET    /api/admin/audit                      the last 200 admin actions
//
// Every change is written to admin_audit in the same batch as the change.
//
// An admin cannot suspend, demote or delete their own account, so the site
// can never be left without one by accident.

import { currentUser, deleteUserStatements, derive, iterations, randomToken, type User } from "./auth";
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

/** The signed-in admin, or the response that refuses the request. */
async function requireAdmin(request: Request, env: Env): Promise<User | Response> {
  if (request.method !== "GET" && crossSite(request)) return json({ error: "forbidden" }, 403);
  const admin = await currentUser(request, env);
  if (!admin) return json({ error: "Sign in first." }, 401);
  if (admin.role !== "admin") return json({ error: "Admins only." }, 403);
  return admin;
}

/** A row for admin_audit, to go in the same batch as the change it records. */
export function audit(env: Env, admin: User, action: string, target: string, detail = ""): D1PreparedStatement {
  return env.DB.prepare("INSERT INTO admin_audit (at, admin, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(isoNow(), admin.username, action, target, detail.slice(0, 500));
}

export async function handleAdminUsers(request: Request, env: Env, id: number | null, sub: string): Promise<Response> {
  const method = request.method;
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

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

  if (method === "PATCH") return update(request, env, admin, target);
  if (method === "DELETE") {
    if (target.id === admin.id) return json({ error: "You can't delete your own account here." }, 400);
    await env.DB.batch([...deleteUserStatements(env, target.id), audit(env, admin, "delete", target.username)]);
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

async function update(request: Request, env: Env, admin: User, target: { id: number; username: string }): Promise<Response> {
  const id = target.id;
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

  const changes = JSON.stringify({ ai: body.ai, disabled: body.disabled, role: body.role });
  const statements = [
    env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
    audit(env, admin, "update", target.username, changes),
  ];
  // A suspended account is signed out everywhere, not just refused next time.
  if (body.disabled === true) statements.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id));
  await env.DB.batch(statements);
  console.log(`admin ${admin.username} updated user ${id}: ${changes}`);

  const user = (await listUsers(env)).find((u) => u.id === id);
  return json({ user });
}

async function resetPassword(env: Env, admin: User, target: { id: number; username: string }): Promise<Response> {
  // 16 URL-safe characters: easy to pass on, and changed by the user after signing in.
  const password = randomToken().slice(0, 16);
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const rounds = iterations(env);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?").bind(
      await derive(password, salt, rounds), salt, rounds, target.id,
    ),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND user_id != ?").bind(target.id, admin.id),
    audit(env, admin, "password", target.username),
  ]);
  console.log(`admin ${admin.username} reset the password of ${target.username}`);
  return json({ password });
}

// --------------------------------------------------------------------------
// contact messages and the audit log
// --------------------------------------------------------------------------

export async function handleAdminMessages(request: Request, env: Env, id: number | null, sub: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  if (id === null) {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405, { Allow: "GET" });
    const rows = await env.DB.prepare(
      `SELECT id, created_at, name, email, phone, subject, message, answered_at FROM contact_messages
        ORDER BY answered_at IS NOT NULL, created_at DESC LIMIT 200`,
    ).all<any>();
    return json({
      messages: (rows.results ?? []).map((r) => ({
        id: r.id, createdAt: r.created_at, name: r.name, email: r.email, phone: r.phone ?? null,
        subject: r.subject, message: r.message, answeredAt: r.answered_at ?? null,
      })),
    });
  }
  if (sub !== "answered") return json({ error: "not found" }, 404);
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
  const result = await env.DB.prepare("UPDATE contact_messages SET answered_at = ? WHERE id = ? AND answered_at IS NULL")
    .bind(isoNow(), id)
    .run();
  if (!result.meta.changes) return json({ error: "No such unanswered message." }, 404);
  await audit(env, admin, "message", String(id), "answered").run();
  return json({ ok: true });
}

export async function handleAdminAudit(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405, { Allow: "GET" });
  const rows = await env.DB.prepare("SELECT at, admin, action, target, detail FROM admin_audit ORDER BY id DESC LIMIT 200").all<any>();
  return json({ entries: rows.results ?? [] });
}

/** The audit log is kept a year. Run daily by cron. */
export async function pruneAudit(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM admin_audit WHERE at < ?").bind(new Date(Date.now() - 365 * 86_400_000).toISOString()).run();
}
