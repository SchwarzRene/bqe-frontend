// POST /api/contact — the contact form, stored in D1. Until now the form
// only pretended to send.
//
// Read submissions with:
//   npx wrangler d1 execute bqe --remote --command \
//     "SELECT id, created_at, name, email, subject, message FROM contact_messages WHERE answered_at IS NULL"
// and mark one answered (which starts the 30-day deletion clock):
//   npx wrangler d1 execute bqe --remote --command \
//     "UPDATE contact_messages SET answered_at = datetime('now') WHERE id = 1"

import type { Env } from "./env";
import { isoNow, json, utcDay } from "./http";

const SUBJECTS = new Set([
  "subscription", "general", "careers", "partnership", "media", "feedback", "accessibility",
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PER_HOUR = 5; // submissions per visitor per hour
const MAX_BODY = 16_384;

export interface ContactInput {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

/** The same rules form.js applies, re-checked because the browser is not trusted. */
export function validateContact(raw: any): { ok: true; value: ContactInput } | { ok: false; errors: Record<string, string> } {
  const get = (k: string) => (typeof raw?.[k] === "string" ? raw[k].trim() : "");
  const value = {
    name: get("name"), email: get("email"), phone: get("phone"), subject: get("subject"), message: get("message"),
  };
  const errors: Record<string, string> = {};
  if (value.name.length < 2 || value.name.length > 120) errors.name = "Please enter your full name.";
  if (!EMAIL_RE.test(value.email) || value.email.length > 254) errors.email = "Please enter a valid email address.";
  if (value.phone.length > 40) errors.phone = "Please shorten the phone number.";
  if (!SUBJECTS.has(value.subject)) errors.subject = "Please select a subject.";
  if (value.message.length < 10 || value.message.length > 2000) errors.message = "Please enter a message of 10 to 2000 characters.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export async function handleContact(request: Request, env: Env): Promise<Response> {
  // A browser posting from another site is either a mistake or a spam bot.
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "forbidden" }, 403);

  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "too large" }, 413);
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad request" }, 400);
  }

  // Honeypot: a field hidden from people. Pretend success so the bot moves on.
  if (typeof body?.website === "string" && body.website.trim()) return json({ ok: true }, 201);

  const checked = validateContact(body);
  if (!checked.ok) return json({ error: "invalid", fields: checked.errors }, 422);

  const ipHash = await hashIp(request.headers.get("CF-Connecting-IP") || "unknown");
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM contact_messages WHERE ip_hash = ? AND created_at > ?",
  )
    .bind(ipHash, hourAgo)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= PER_HOUR) return json({ error: "Too many messages — please try again later." }, 429);

  const v = checked.value;
  await env.DB.prepare(
    `INSERT INTO contact_messages (created_at, name, email, phone, subject, message, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(isoNow(), v.name, v.email, v.phone || null, v.subject, v.message, ipHash)
    .run();
  return json({ ok: true }, 201);
}

/** The retention the privacy policy promises. Run daily by cron. */
export async function pruneContact(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM contact_messages WHERE answered_at IS NOT NULL AND answered_at < datetime('now', '-30 days')"),
    env.DB.prepare("UPDATE contact_messages SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < ?").bind(
      new Date(Date.now() - 86_400_000).toISOString(),
    ),
  ]);
}

/** A salted hash that changes every day, so it cannot follow anyone across days. */
async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${utcDay()}|bqe-contact|${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
