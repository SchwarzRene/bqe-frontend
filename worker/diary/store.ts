// What the Meal Diary's files share: the meal slots, what a valid date is, and
// the two reads the AI also needs (a day's meals, the user's notes).

import type { Env } from "../env";

export const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Slot = (typeof SLOTS)[number];

export const MAX_DESCRIPTION = 500;
export const MAX_NOTES = 600;
export const MAX_MEALS_PER_DAY = 20;
export const MAX_MEALS_PER_USER = 5000;
export const DAY_MS = 86_400_000;

export interface Meal {
  id: number;
  day: string;
  time: string;
  slot: Slot;
  description: string;
  /** When the photo was uploaded (it goes into the photo's URL), or null without one. */
  photo: string | null;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A real calendar date. Entries may go back two years and ahead by the day or two a time zone can be ahead of UTC. */
export function validDay(day: unknown, now = Date.now()): day is string {
  if (typeof day !== "string") return false;
  const m = DAY_RE.exec(day);
  if (!m) return false;
  const at = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (new Date(at).toISOString().slice(0, 10) !== day) return false;
  return at <= now + 2 * DAY_MS && at >= now - 731 * DAY_MS;
}

export const toMeal = (r: any): Meal => ({
  id: r.id,
  day: r.day,
  time: r.time,
  slot: r.slot,
  description: r.description,
  photo: r.photo ?? null,
});

/** A day's meals in the order they were eaten. */
export async function mealsOn(env: Env, userId: number, day: string): Promise<Meal[]> {
  const rows = await env.DB.prepare(
    `SELECT m.id, m.day, m.time, m.slot, m.description, p.updated_at AS photo
       FROM diary_meals m LEFT JOIN diary_photos p ON p.meal_id = m.id
      WHERE m.user_id = ? AND m.day = ? ORDER BY m.time, m.id`,
  )
    .bind(userId, day)
    .all<any>();
  return (rows.results ?? []).map(toMeal);
}

export async function readSettings(env: Env, userId: number): Promise<{ notes: string }> {
  const row = await env.DB.prepare("SELECT notes FROM diary_settings WHERE user_id = ?").bind(userId).first<{ notes: string }>();
  return { notes: row?.notes ?? "" };
}

