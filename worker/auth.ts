// Sign-in. One kind of account, created in migrations/0002_users.sql; there
// is no sign-up. A session is a random token in an HttpOnly cookie, and only
// its SHA-256 is stored.
//
//   POST /api/auth/login     {username, password}  -> sets the cookie
//   POST /api/auth/logout                          -> clears it
//   GET  /api/auth/me                              -> {user: {username} | null}
//   POST /api/auth/password  {current, next}       -> change the password

import type { Env } from "./env";
import { crossSite, hashIp, hex, isoNow, json, readJson } from "./http";

export const COOKIE = "bqe_session";
const SESSION_DAYS = 30;
// Must stay low enough for the free plan's 10 ms CPU per request; stored per
// user, so raising it here only affects passwords set from now on.
const ITERATIONS = 50_000;
const MAX_FAILURES = 10; // per visitor per 15 minutes
const MIN_PASSWORD = 8;

export interface User {
  id: number;
  username: string;
}

export async function handleAuth(request: Request, env: Env, action: string): Promise<Response> {
  if (action === "me" && request.method === "GET") {
    const user = await currentUser(request, env);
    return json({ user: user ? { username: user.username } : null });
  }
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
  if (crossSite(request)) return json({ error: "forbidden" }, 403);

  switch (action) {
    case "login":
      return login(request, env);
    case "logout":
      return logout(request, env);
    case "password":
      return changePassword(request, env);
    default:
      return json({ error: "not found" }, 404);
  }
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, 4096);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) return json({ error: "Enter a username and a password." }, 400);

  const ip = await hashIp(request.headers.get("CF-Connecting-IP") || "unknown");
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const failures = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND attempted_at > ?",
  )
    .bind(ip, since)
    .first<{ n: number }>();
  if ((failures?.n ?? 0) >= MAX_FAILURES) {
    return json({ error: "Too many failed attempts — try again in 15 minutes." }, 429);
  }

  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, password_salt, password_iterations FROM users WHERE username = ?",
  )
    .bind(username)
    .first<{ id: number; username: string; password_hash: string; password_salt: string; password_iterations: number }>();

  // Hash even for an unknown name, so the response time does not reveal
  // which usernames exist.
  const hash = await derive(password, user?.password_salt ?? "00".repeat(16), user?.password_iterations ?? ITERATIONS);
  if (!user || !equal(hash, user.password_hash)) {
    await env.DB.prepare("INSERT INTO login_attempts (ip_hash, attempted_at) VALUES (?, ?)").bind(ip, isoNow()).run();
    return json({ error: "Wrong username or password." }, 401);
  }

  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(
      await sha256(token), user.id, isoNow(), expires,
    ),
    env.DB.prepare("DELETE FROM login_attempts WHERE ip_hash = ?").bind(ip),
  ]);
  return json({ user: { username: user.username } }, 200, { "Set-Cookie": cookie(token, SESSION_DAYS * 86_400) });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const token = readCookie(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ user: null }, 200, { "Set-Cookie": cookie("", 0) });
}

async function changePassword(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in first." }, 401);
  const body = await readJson(request, 4096);
  const current = typeof body?.current === "string" ? body.current : "";
  const next = typeof body?.next === "string" ? body.next : "";
  if (next.length < MIN_PASSWORD || next.length > 200) {
    return json({ error: `The new password needs at least ${MIN_PASSWORD} characters.` }, 400);
  }

  const row = await env.DB.prepare("SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ password_hash: string; password_salt: string; password_iterations: number }>();
  if (!row || !equal(await derive(current, row.password_salt, row.password_iterations), row.password_hash)) {
    return json({ error: "The current password is wrong." }, 403);
  }

  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const token = readCookie(request)!;
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?",
    ).bind(await derive(next, salt, ITERATIONS), salt, ITERATIONS, user.id),
    // Every other session ends: whoever else knew the old password is out.
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, await sha256(token)),
  ]);
  return json({ ok: true });
}

/** The signed-in user, or null for a guest. */
export async function currentUser(request: Request, env: Env): Promise<User | null> {
  const token = readCookie(request);
  if (!token) return null;
  try {
    return await env.DB.prepare(
      `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
      .bind(await sha256(token), isoNow())
      .first<User>();
  } catch {
    return null; // tables not migrated yet: everyone is a guest
  }
}

/** Expired sessions and old failed attempts. Run daily by cron. */
export async function pruneAuth(env: Env): Promise<void> {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(isoNow()),
    env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").bind(dayAgo),
  ]);
}

export async function derive(password: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(saltHex.match(/../g) ?? [], (b) => parseInt(b, 16));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return hex(bits);
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readCookie(request: Request): string | null {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=") || null;
  }
  return null;
}

function cookie(value: string, maxAge: number): string {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
