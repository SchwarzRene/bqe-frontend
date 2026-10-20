// The Meal Diary's daily allowance of model calls, per user (diary_ai_usage):
// photo descriptions and the day's summary and ideas draw on the same count,
// like Market News's chat and analyst share news_chat_usage. A call that got
// no answer is given back.

import type { Env } from "../env";
import { json, utcDay } from "../http";

const DEFAULT_DAILY_LIMIT = 20;

export type Spent = { ok: true; remaining: number; refund: () => Promise<void> } | { ok: false; response: Response };

export async function spend(env: Env, userId: number, now = Date.now()): Promise<Spent> {
  const limit = Number(env.DIARY_AI_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT;
  const day = utcDay(new Date(now));
  const used = await env.DB.prepare(
    `INSERT INTO diary_ai_usage (user_id, day, count) VALUES (?, ?, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1 RETURNING count`,
  )
    .bind(userId, day)
    .first<{ count: number }>();
  const count = used?.count ?? 1;
  const refund = async () => {
    await env.DB.prepare("UPDATE diary_ai_usage SET count = count - 1 WHERE user_id = ? AND day = ? AND count > 0").bind(userId, day).run().catch(() => {});
  };
  if (count > limit) {
    await refund();
    return { ok: false, response: json({ error: `That's today's ${limit} AI requests for the diary — the limit resets at midnight UTC.`, remaining: 0 }, 429) };
  }
  return { ok: true, remaining: Math.max(0, limit - count), refund };
}
