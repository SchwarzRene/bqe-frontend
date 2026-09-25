// One place that talks to the Gemini API for Market News: strict-JSON calls
// (the briefing), search-grounded calls (the calendar) and multi-turn calls
// with function tools (the chat). The key is the same GEMINI_API_KEY secret
// the Market Tape job uses; it never leaves the Worker.

import type { Env } from "../env";
import { describeGeminiError, extractJson } from "../markettape";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_MODEL = "gemini-3.7-flash";

export class GeminiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function model(env: Env, purpose: "briefing" | "chat" = "briefing"): string {
  if (purpose === "chat" && env.GEMINI_CHAT_MODEL) return env.GEMINI_CHAT_MODEL;
  return env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * POST generateContent and return the parsed body. A short per-minute rate
 * limit is waited out once, as Google asks; anything else throws.
 */
export async function generate(env: Env, modelName: string, body: unknown, label: string, retried = false): Promise<any> {
  if (!env.GEMINI_API_KEY) throw new GeminiError("GEMINI_API_KEY is not set", 503);
  const res = await fetch(`${BASE}/${encodeURIComponent(modelName)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const problem = describeGeminiError(res.status, await res.text());
    console.warn(`news ${label}: gemini ${res.status} (${modelName}): ${problem.summary}`);
    if (problem.retryAfterMs != null && !retried) {
      await new Promise((resolve) => setTimeout(resolve, problem.retryAfterMs!));
      return generate(env, modelName, body, label, true);
    }
    throw new GeminiError(problem.summary, res.status);
  }
  return res.json();
}

export function textOf(body: any): string {
  const parts: any[] = body?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => (typeof p?.text === "string" && !p.thought ? p.text : "")).join("");
}

/** A call whose answer must match `schema` (Gemini's structured output). */
export async function askJson(env: Env, opts: { system: string; prompt: string; schema: unknown; label: string }): Promise<unknown> {
  const body = await generate(env, model(env), {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: opts.schema,
      temperature: 0.3,
      // Generous: on thinking models the thinking counts against it too,
      // and a cut-off answer is invalid JSON.
      maxOutputTokens: 16384,
    },
  }, opts.label);
  const text = textOf(body);
  try {
    return JSON.parse(text);
  } catch {
    return extractJson(text);
  }
}

/**
 * A call with Google Search grounding. Grounding cannot be combined with a
 * response schema, so the prompt asks for JSON and extractJson digs it out.
 */
export async function askGrounded(env: Env, prompt: string, label: string): Promise<unknown> {
  const body = await generate(env, model(env), {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
  }, label);
  return extractJson(textOf(body));
}
