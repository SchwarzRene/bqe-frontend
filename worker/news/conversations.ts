// Saved Ask AI conversations, one row per conversation per user.
//
//   GET    /api/chats        the user's conversations, newest first (no messages)
//   GET    /api/chats/:id    one conversation with its messages
//   DELETE /api/chats/:id    delete one
//   DELETE /api/chats        delete all of them
//
// Written only by POST /api/chat (see chat.ts), after the model has answered:
// the question and the answer are appended to the conversation the page
// names, or start a new one.

import { currentUser } from "../auth";
import type { Env } from "../env";
import { crossSite, hex, isoNow, json } from "../http";

export const MAX_CONVERSATIONS = 50; // per user; the oldest go first
const MAX_MESSAGES = 200; // per conversation; the oldest go first
const ID_RE = /^[0-9a-f]{32}$/;

export interface StoredMessage {
  role: "user" | "assistant";
  text: string;
  sources?: { label: string; url: string }[];
  at: string;
}

export const isConversationId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);

export async function handleConversations(request: Request, env: Env, id: string | null): Promise<Response> {
  if (id !== null && !isConversationId(id)) return json({ error: "not found" }, 404);
  if (request.method !== "GET" && request.method !== "DELETE") return json({ error: "method not allowed" }, 405, { Allow: "GET, DELETE" });
  if (request.method === "DELETE" && crossSite(request)) return json({ error: "forbidden" }, 403);
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in to see your chats." }, 401);

  if (request.method === "DELETE") {
    const stmt = id
      ? env.DB.prepare("DELETE FROM chat_conversations WHERE id = ? AND user_id = ?").bind(id, user.id)
      : env.DB.prepare("DELETE FROM chat_conversations WHERE user_id = ?").bind(user.id);
    const result = await stmt.run();
    return json({ ok: true, deleted: result.meta.changes });
  }

  if (!id) {
    const rows = await env.DB.prepare(
      `SELECT id, title, created_at, updated_at, json_array_length(messages) AS n FROM chat_conversations
        WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC`,
    )
      .bind(user.id)
      .all<{ id: string; title: string; created_at: string; updated_at: string; n: number }>();
    return json({
      conversations: (rows.results ?? []).map((r) => ({
        id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at, messages: Number(r.n) || 0,
      })),
    });
  }

  const row = await env.DB.prepare("SELECT id, title, messages, created_at, updated_at FROM chat_conversations WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .first<{ id: string; title: string; messages: string; created_at: string; updated_at: string }>();
  if (!row) return json({ error: "That chat no longer exists." }, 404);
  return json({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, messages: JSON.parse(row.messages) });
}

/**
 * Append a question and its answer to the user's conversation `id`, or start
 * a new one when `id` is missing or not theirs. Returns the conversation's id.
 */
export async function saveTurn(
  env: Env,
  userId: number,
  id: string | null,
  question: string,
  answer: string,
  sources: { label: string; url: string }[],
): Promise<string> {
  const now = isoNow();
  const turn: StoredMessage[] = [
    { role: "user", text: question, at: now },
    { role: "assistant", text: answer, sources: sources.map((s) => ({ label: s.label, url: s.url })), at: now },
  ];

  const existing = id
    ? await env.DB.prepare("SELECT messages FROM chat_conversations WHERE id = ? AND user_id = ?")
        .bind(id, userId)
        .first<{ messages: string }>()
    : null;
  if (id && existing) {
    const messages = [...(JSON.parse(existing.messages) as StoredMessage[]), ...turn].slice(-MAX_MESSAGES);
    await env.DB.prepare("UPDATE chat_conversations SET messages = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(JSON.stringify(messages), now, id, userId)
      .run();
    return id;
  }

  const newId = hex(crypto.getRandomValues(new Uint8Array(16)));
  const title = question.replace(/\s+/g, " ").trim().slice(0, 80) || "Chat";
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO chat_conversations (id, user_id, title, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(newId, userId, title, JSON.stringify(turn), now, now),
    // Keep the newest MAX_CONVERSATIONS.
    env.DB.prepare(
      `DELETE FROM chat_conversations WHERE user_id = ?1 AND id NOT IN
         (SELECT id FROM chat_conversations WHERE user_id = ?1 ORDER BY updated_at DESC, rowid DESC LIMIT ${MAX_CONVERSATIONS})`,
    ).bind(userId),
  ]);
  return newId;
}
