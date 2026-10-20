// The photo of a meal: PUT /api/diary/meals/:id/photo with the picture as the
// request body, GET it back, DELETE it. One per meal; a new PUT replaces it.
//
// The page shrinks every photo to a JPEG of at most ~1280 px before sending
// (which also drops the camera's location and other metadata), so the limits
// here are a guard against anything else talking to the API, not a size the
// page comes near. What the file claims to be is ignored: the type comes from
// its first bytes, and only JPEG, PNG and WebP are accepted — never SVG or
// anything else a browser would run.

import type { Env } from "../env";
import { image, isoNow, json, readBytes } from "../http";

export const MAX_PHOTO_BYTES = 700_000; // base64 makes it ~930 kB, inside D1's 2 MB row
export const MAX_PHOTO_BYTES_PER_USER = 25_000_000;

/** The image type of `b` from its first bytes, or null when it is none of the three. */
export function sniffImage(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  if (b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function handlePhoto(request: Request, env: Env, userId: number, mealId: number): Promise<Response> {
  const method = request.method;
  if (method !== "GET" && method !== "PUT" && method !== "DELETE") {
    return json({ error: "method not allowed" }, 405, { Allow: "GET, PUT, DELETE" });
  }
  const meal = await env.DB.prepare("SELECT id FROM diary_meals WHERE id = ? AND user_id = ?").bind(mealId, userId).first();
  if (!meal) return json({ error: "That entry no longer exists." }, 404);

  if (method === "GET") {
    const row = await env.DB.prepare("SELECT mime, data FROM diary_photos WHERE meal_id = ? AND user_id = ?")
      .bind(mealId, userId)
      .first<{ mime: string; data: string }>();
    if (!row) return json({ error: "No photo." }, 404);
    return image(fromBase64(row.data), row.mime);
  }

  if (method === "DELETE") {
    await env.DB.prepare("DELETE FROM diary_photos WHERE meal_id = ? AND user_id = ?").bind(mealId, userId).run();
    return json({ ok: true });
  }

  const bytes = await readBytes(request, MAX_PHOTO_BYTES);
  if (!bytes) return json({ error: `The photo is too large (over ${Math.round(MAX_PHOTO_BYTES / 1000)} kB).` }, 413);
  const mime = sniffImage(bytes);
  if (!mime) return json({ error: "Send a JPEG, PNG or WebP picture." }, 415);

  const used = await env.DB.prepare("SELECT COALESCE(SUM(bytes), 0) AS n FROM diary_photos WHERE user_id = ? AND meal_id != ?")
    .bind(userId, mealId)
    .first<{ n: number }>();
  if ((used?.n ?? 0) + bytes.length > MAX_PHOTO_BYTES_PER_USER) {
    return json({ error: "Your photos take 25 MB — delete some old ones to add more." }, 413);
  }
  const updatedAt = isoNow();
  await env.DB.prepare(
    `INSERT INTO diary_photos (meal_id, user_id, mime, bytes, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (meal_id) DO UPDATE SET mime = excluded.mime, bytes = excluded.bytes, updated_at = excluded.updated_at, data = excluded.data`,
  )
    .bind(mealId, userId, mime, bytes.length, updatedAt, toBase64(bytes))
    .run();
  return json({ ok: true, bytes: bytes.length, photo: updatedAt });
}
