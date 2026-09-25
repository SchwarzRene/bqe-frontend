// Accounts. Anyone can sign up; a new account is a plain user without AI
// access, which an admin grants in the admin terminal (see admin.ts). A
// session is a random token in an HttpOnly cookie, and only its SHA-256 is
// stored.
//
//   GET  /api/auth/config                          -> {turnstileSiteKey, minPassword}
//   POST /api/auth/signup    {username, password, email?, turnstile?} -> creates it, sets the cookie
//   POST /api/auth/login     {username, password}  -> sets the cookie
//   POST /api/auth/logout                          -> clears it
//   GET  /api/auth/me                              -> {user: {username, role, ai} | null}
//   POST /api/auth/password  {current, next}       -> change the password
//   GET  /api/auth/export                          -> everything stored for the account, as a download
//   POST /api/auth/delete    {password}            -> delete the account and everything it saved
//
// Sign-in failures are limited per visitor (daily-rotating IP hash, IPv6 per
// /64) and per account, so neither many accounts from one place nor one
// account from many places can be guessed at. Each attempt is recorded
// before it is counted, so parallel requests cannot slip past the limit.

import type { Env } from "./env";
import { allowed, crossSite, hex, isoNow, json, readJson, visitor } from "./http";

export const COOKIE = "bqe_session";
const SESSION_DAYS = 30;
// The Workers free plan's 10 ms CPU per request caps this; on a paid plan set
// PBKDF2_ITERATIONS (e.g. 600000, OWASP's figure for PBKDF2-SHA256). Stored
// per user: older hashes are upgraded at the next successful sign-in.
export const ITERATIONS = 50_000;
const MAX_ITERATIONS = 2_000_000;
const MAX_FAILURES = 10; // per visitor per 15 minutes
const MAX_ACCOUNT_FAILURES = 10; // per account per hour, from anywhere
const MAX_SIGNUPS = 5; // accounts per visitor per day
const DEFAULT_SIGNUPS_PER_HOUR = 30; // accounts per hour, site-wide
export const MIN_PASSWORD = 12; // for new passwords; older, shorter ones still sign in
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface User {
  id: number;
  username: string;
  role: "user" | "admin";
  /** May use the AI features. Admins always may. */
  ai: boolean;
}

/** What the browser is told about the signed-in user. */
export function publicUser(user: User): { username: string; role: string; ai: boolean } {
  return { username: user.username, role: user.role, ai: user.ai };
}

/** A signed-in user without AI access gets this instead of a model call. */
export function aiDenied(user: User): Response | null {
  if (user.ai) return null;
  return json(
    { error: "AI features are not enabled for your account yet. An administrator has to grant access.", code: "ai_access" },
    403,
  );
}

type Row = { id: number; username: string; role: string; ai_access: number };
const toUser = (r: Row): User => ({ id: r.id, username: r.username, role: r.role === "admin" ? "admin" : "user", ai: r.role === "admin" || !!r.ai_access });

/** PBKDF2 iterations for a password set now. */
export function iterations(env: Env): number {
  const n = Math.floor(Number(env.PBKDF2_ITERATIONS));
  return Number.isFinite(n) && n > ITERATIONS ? Math.min(n, MAX_ITERATIONS) : ITERATIONS;
}

export async function handleAuth(request: Request, env: Env, action: string): Promise<Response> {
  if (action === "me" && request.method === "GET") {
    const user = await currentUser(request, env);
    return json({ user: user ? publicUser(user) : null });
  }
  if (action === "config" && request.method === "GET") {
    return json({ turnstileSiteKey: env.TURNSTILE_SECRET ? env.TURNSTILE_SITE_KEY || null : null, minPassword: MIN_PASSWORD });
  }
  if (action === "export" && request.method === "GET") return exportAccount(request, env);
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
  if (crossSite(request)) return json({ error: "forbidden" }, 403);

  const ip = await visitor(request, env);
  // Cloudflare's own limiter first, when configured: a flood never reaches D1 or PBKDF2.
  if (action !== "logout" && !(await allowed(env.AUTH_LIMITER, ip))) {
    return json({ error: "Too many requests — slow down and try again in a minute." }, 429);
  }

  switch (action) {
    case "signup":
      return signup(request, env, ip);
    case "login":
      return login(request, env, ip);
    case "logout":
      return logout(request, env);
    case "password":
      return changePassword(request, env, ip);
    case "delete":
      return deleteAccount(request, env, ip);
    default:
      return json({ error: "not found" }, 404);
  }
}

/** Why a username can't be used, or null when it can. */
export function checkUsername(name: string): string | null {
  if (!USERNAME_RE.test(name)) {
    return "Usernames are 3–32 characters: letters, digits and . _ - (starting with a letter or digit).";
  }
  return null;
}

/** Why a new password can't be used, or null when it can. */
export async function checkNewPassword(password: string, env: Env, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (password.length < MIN_PASSWORD || password.length > 200) {
    return `The password needs at least ${MIN_PASSWORD} characters.`;
  }
  if (env.PASSWORD_BREACH_CHECK !== "off" && (await breached(password, fetcher))) {
    return "This password has appeared in a data breach — please choose another one.";
  }
  return null;
}

/**
 * Whether Have I Been Pwned knows the password. k-anonymity: only the first
 * five characters of its SHA-1 leave the Worker. Fails open — an unreachable
 * service must not stop anyone signing up.
 */
export async function breached(password: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const digest = hex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password))).toUpperCase();
    const res = await fetcher(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`, {
      headers: { "Add-Padding": "true", "User-Agent": "bqe-frontend" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const suffix = digest.slice(5);
    return (await res.text()).split("\n").some((line) => {
      const [hash, count] = line.trim().split(":");
      return hash === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}

/** Cloudflare Turnstile, when TURNSTILE_SECRET is set; otherwise every sign-up passes. */
async function humanEnough(env: Env, token: unknown, request: Request): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", token);
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) form.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    const out = await res.json<{ success?: boolean }>();
    return out.success === true;
  } catch {
    return false; // fail closed: an unverifiable sign-up is refused, the visitor can retry
  }
}

async function signup(request: Request, env: Env, ip: string): Promise<Response> {
  const body = await readJson(request, 8192);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const emailIn = typeof body?.email === "string" ? body.email.trim() : "";
  const nameError = checkUsername(username);
  if (nameError) return json({ error: nameError }, 400);
  if (password.length < MIN_PASSWORD || password.length > 200) {
    return json({ error: `The password needs at least ${MIN_PASSWORD} characters.` }, 400);
  }
  if (emailIn && (emailIn.length > 200 || !EMAIL_RE.test(emailIn))) {
    return json({ error: "That email address doesn't look right." }, 400);
  }
  const email = emailIn || null;
  if (!(await humanEnough(env, body?.turnstile, request))) {
    return json({ error: "The anti-bot check failed — please try again.", code: "turnstile" }, 403);
  }

  // Recorded first, counted second: parallel sign-ups each see the others.
  const attempt = await env.DB.prepare("INSERT INTO signup_attempts (ip_hash, attempted_at) VALUES (?, ?) RETURNING rowid AS id")
    .bind(ip, isoNow())
    .first<{ id: number }>();
  const forget = () => env.DB.prepare("DELETE FROM signup_attempts WHERE rowid = ?").bind(attempt?.id ?? -1).run();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const counts = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM signup_attempts WHERE ip_hash = ?1 AND attempted_at > ?2) AS mine,
            (SELECT COUNT(*) FROM signup_attempts WHERE attempted_at > ?3) AS everyone`,
  )
    .bind(ip, dayAgo, hourAgo)
    .first<{ mine: number; everyone: number }>();
  if ((counts?.mine ?? 0) > MAX_SIGNUPS) {
    await forget();
    return json({ error: "Too many new accounts from here today — try again tomorrow." }, 429);
  }
  const perHour = Math.max(1, Number(env.SIGNUP_HOURLY_LIMIT) || DEFAULT_SIGNUPS_PER_HOUR);
  if ((counts?.everyone ?? 0) > perHour) {
    await forget();
    return json({ error: "Sign-ups are busy right now — please try again in an hour." }, 429);
  }

  const passwordError = await checkNewPassword(password, env);
  if (passwordError) {
    await forget();
    return json({ error: passwordError }, 400);
  }

  const taken = await env.DB.prepare("SELECT username, email FROM users WHERE username = ?1 OR (email IS NOT NULL AND email = ?2 COLLATE NOCASE)")
    .bind(username, email)
    .first<{ username: string; email: string | null }>();
  if (taken) {
    await forget();
    const sameName = taken.username.toLowerCase() === username.toLowerCase();
    // Usernames are public anyway; whether an email address has an account is not said.
    return json({ error: sameName ? "That username is taken." : "That username or email address can't be used." }, 409);
  }

  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const rounds = iterations(env);
  const hash = await derive(password, salt, rounds);
  let row: Row | null;
  try {
    row = await env.DB.prepare(
      `INSERT INTO users (username, email, password_hash, password_salt, password_iterations, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, username, role, ai_access`,
    )
      .bind(username, email, hash, salt, rounds, isoNow(), isoNow())
      .first<Row>();
  } catch {
    // Lost a race with another sign-up for the same name or address.
    await forget();
    return json({ error: "That username or email address can't be used." }, 409);
  }
  if (!row) return json({ error: "The account could not be created." }, 500);

  const user = toUser(row);
  return json({ user: publicUser(user) }, 201, { "Set-Cookie": await startSession(env, user.id) });
}

async function startSession(env: Env, userId: number): Promise<string> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, isoNow(), expires)
    .run();
  return cookie(token, SESSION_DAYS * 86_400);
}

/**
 * Record an attempt on `account` from `ip`, then say whether either is over
 * its limit. The row stays unless the attempt succeeds (see clearAttempt).
 */
async function recordAttempt(env: Env, ip: string, account: string): Promise<{ id: number; locked: string | null }> {
  const row = await env.DB.prepare("INSERT INTO login_attempts (ip_hash, attempted_at, account) VALUES (?, ?, ?) RETURNING rowid AS id")
    .bind(ip, isoNow(), account)
    .first<{ id: number }>();
  const counts = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM login_attempts WHERE ip_hash = ?1 AND attempted_at > ?2) AS mine,
            (SELECT COUNT(*) FROM login_attempts WHERE account = ?3 AND attempted_at > ?4) AS theirs`,
  )
    .bind(ip, new Date(Date.now() - 15 * 60_000).toISOString(), account, new Date(Date.now() - 3_600_000).toISOString())
    .first<{ mine: number; theirs: number }>();
  const locked =
    (counts?.mine ?? 0) > MAX_FAILURES
      ? "Too many failed attempts — try again in 15 minutes."
      : (counts?.theirs ?? 0) > MAX_ACCOUNT_FAILURES
        ? "Too many failed attempts on this account — try again in an hour."
        : null;
  return { id: row?.id ?? -1, locked };
}

async function login(request: Request, env: Env, ip: string): Promise<Response> {
  const body = await readJson(request, 4096);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password || username.length > 64 || password.length > 200) {
    return json({ error: "Enter a username and a password." }, 400);
  }

  const account = username.toLowerCase();
  const attempt = await recordAttempt(env, ip, account);
  if (attempt.locked) return json({ error: attempt.locked }, 429);

  const user = await env.DB.prepare(
    `SELECT id, username, role, ai_access, disabled, password_hash, password_salt, password_iterations
       FROM users WHERE username = ?`,
  )
    .bind(username)
    .first<Row & { disabled: number; password_hash: string; password_salt: string; password_iterations: number }>();

  // Hash even for an unknown name, so the response time does not reveal
  // which usernames exist.
  const hash = await derive(password, user?.password_salt ?? "00".repeat(16), user?.password_iterations ?? ITERATIONS);
  if (!user || !equal(hash, user.password_hash)) return json({ error: "Wrong username or password." }, 401);

  // Only after the password matched, so this does not reveal which accounts exist.
  if (user.disabled) return json({ error: "This account has been suspended." }, 403);

  const setCookie = await startSession(env, user.id);
  const statements = [
    // This attempt, and the account's own failures — never the visitor's
    // failures on other accounts, or signing in to one's own account would
    // reset the lockout on the ones being guessed.
    env.DB.prepare("DELETE FROM login_attempts WHERE rowid = ? OR account = ?").bind(attempt.id, account),
    env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(isoNow(), user.id),
  ];
  // A hash from before the iterations were raised is upgraded now, while the password is at hand.
  const rounds = iterations(env);
  if (user.password_iterations < rounds) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    statements.push(
      env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?")
        .bind(await derive(password, salt, rounds), salt, rounds, user.id),
    );
  }
  await env.DB.batch(statements);
  return json({ user: publicUser(toUser(user)) }, 200, { "Set-Cookie": setCookie });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const token = readCookie(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ user: null }, 200, { "Set-Cookie": cookie("", 0) });
}

/** The signed-in user's password checked against `password`, counted like a sign-in. */
async function confirmPassword(env: Env, user: User, password: string, ip: string): Promise<Response | null> {
  const account = user.username.toLowerCase();
  const attempt = await recordAttempt(env, ip, account);
  if (attempt.locked) return json({ error: attempt.locked }, 429);
  const row = await env.DB.prepare("SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ password_hash: string; password_salt: string; password_iterations: number }>();
  if (!row || !equal(await derive(password, row.password_salt, row.password_iterations), row.password_hash)) {
    return json({ error: "The current password is wrong." }, 403);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE rowid = ?").bind(attempt.id).run();
  return null;
}

async function changePassword(request: Request, env: Env, ip: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in first." }, 401);
  const body = await readJson(request, 4096);
  const current = typeof body?.current === "string" ? body.current.slice(0, 200) : "";
  const next = typeof body?.next === "string" ? body.next : "";
  if (next.length < MIN_PASSWORD || next.length > 200) {
    return json({ error: `The new password needs at least ${MIN_PASSWORD} characters.` }, 400);
  }

  const wrong = await confirmPassword(env, user, current, ip);
  if (wrong) return wrong;
  const passwordError = await checkNewPassword(next, env);
  if (passwordError) return json({ error: passwordError }, 400);

  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const rounds = iterations(env);
  const token = readCookie(request)!;
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?",
    ).bind(await derive(next, salt, rounds), salt, rounds, user.id),
    // Every other session ends: whoever else knew the old password is out.
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, await sha256(token)),
  ]);
  return json({ ok: true });
}

/** The statements that delete an account and everything it saved. */
export function deleteUserStatements(env: Env, userId: number): D1PreparedStatement[] {
  // D1 enforces foreign keys, but the cascade is spelled out so it does not depend on that.
  return [
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM user_state WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM news_chat_usage WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM chat_conversations WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ];
}

/** POST /api/auth/delete {password}: the user deletes their own account (GDPR Art. 17). */
async function deleteAccount(request: Request, env: Env, ip: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in first." }, 401);
  const body = await readJson(request, 4096);
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  const wrong = await confirmPassword(env, user, password, ip);
  if (wrong) return wrong;
  if (user.role === "admin") {
    const admins = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").first<{ n: number }>();
    if ((admins?.n ?? 0) <= 1) {
      return json({ error: "You are the only admin. Make another account admin first, so the site keeps one." }, 400);
    }
  }
  await env.DB.batch(deleteUserStatements(env, user.id));
  console.log(`user ${user.username} deleted their account`);
  return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
}

/** GET /api/auth/export: everything stored for the signed-in account (GDPR Art. 15/20). */
async function exportAccount(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in first." }, 401);
  const [account, state, chats, usage] = await Promise.all([
    env.DB.prepare("SELECT username, email, role, ai_access, created_at, last_login_at FROM users WHERE id = ?").bind(user.id).first<any>(),
    env.DB.prepare("SELECT app, body, version, updated_at FROM user_state WHERE user_id = ?").bind(user.id).all<any>(),
    env.DB.prepare("SELECT id, title, messages, created_at, updated_at FROM chat_conversations WHERE user_id = ?").bind(user.id).all<any>(),
    env.DB.prepare("SELECT day, count FROM news_chat_usage WHERE user_id = ?").bind(user.id).all<any>(),
  ]);
  const parse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  };
  const doc = {
    exportedAt: isoNow(),
    account: account && { ...account, ai_access: !!account.ai_access },
    savedWork: (state.results ?? []).map((r) => ({ app: r.app, version: r.version, updatedAt: r.updated_at, data: parse(r.body) })),
    chats: (chats.results ?? []).map((c) => ({ id: c.id, title: c.title, createdAt: c.created_at, updatedAt: c.updated_at, messages: parse(c.messages) })),
    aiUsage: usage.results ?? [],
  };
  return json(doc, 200, { "Content-Disposition": `attachment; filename="bqe-${user.username}.json"` });
}

/** The signed-in user, or null for a guest (or a suspended account). */
export async function currentUser(request: Request, env: Env): Promise<User | null> {
  const token = readCookie(request);
  if (!token) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT u.id, u.username, u.role, u.ai_access FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
    )
      .bind(await sha256(token), isoNow())
      .first<Row>();
    return row ? toUser(row) : null;
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
    env.DB.prepare("DELETE FROM signup_attempts WHERE attempted_at < ?").bind(dayAgo),
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

export async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export function randomToken(): string {
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
