// One place that talks to the Gemini API. Market News makes exactly two
// kinds of model call: the scheduled briefing (strict JSON, headlines only)
// and the chat (signed-in users only). The key is the GEMINI_API_KEY secret
// and never leaves the Worker.

import type { Env } from "../env";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export class GeminiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function model(env: Env, purpose: "briefing" | "chat" = "briefing"): string {
  if (purpose === "chat" && env.GEMINI_CHAT_MODEL) return env.GEMINI_CHAT_MODEL;
  return env.GEMINI_MODEL || DEFAULT_MODEL;
}

// Waits before retrying an overloaded model (HTTP 500/503). Exported for tests.
export const RETRY_DELAYS_MS = [1500, 4000];
// 3.5 Flash-Lite first: the usual main model, so a different main model (the
// chat's, or one set in the dashboard) still falls back to it. When it is the
// main model itself, it is not asked twice.
export const DEFAULT_FALLBACK_MODELS = "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.6-flash,gemini-2.5-flash";

// Worth another model: overloaded, over its own quota, or not available on this key.
const TRY_FALLBACK = new Set([404, 429, 500, 503]);

/**
 * POST generateContent and return the parsed body. An overloaded model is
 * retried twice, a short per-minute rate limit is waited out once, and if the
 * model still cannot answer, the fallback models (GEMINI_FALLBACK_MODEL, a
 * comma-separated list tried in order; "off" for none) get the same request.
 * Anything else throws.
 */
export async function generate(env: Env, modelName: string, body: unknown, label: string): Promise<any> {
  if (!env.GEMINI_API_KEY) throw new GeminiError("GEMINI_API_KEY is not set", 503);
  const fallback = (env.GEMINI_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODELS).trim();
  const listed = fallback === "off" ? [] : fallback.split(",").map((m) => m.trim()).filter(Boolean);
  const models = [...new Set([modelName, ...listed])];
  let last: unknown;
  for (const m of models) {
    try {
      return await attempt(env, m, body, label);
    } catch (err) {
      last = err;
      if (!(err instanceof GeminiError && TRY_FALLBACK.has(err.status))) throw err;
    }
  }
  throw last;
}

async function attempt(env: Env, modelName: string, body: unknown, label: string): Promise<any> {
  let waitedForQuota = false;
  for (let i = 0; ; i++) {
    const res = await fetch(`${BASE}/${encodeURIComponent(modelName)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) return res.json();
    const problem = describeGeminiError(res.status, await res.text());
    console.warn(`news ${label}: gemini ${res.status} (${modelName}): ${problem.summary}`);
    if ((res.status === 500 || res.status === 503) && i < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[i]);
      continue;
    }
    // A short per-minute limit clears by itself: wait as long as Google asks, once.
    if (problem.retryAfterMs != null && !waitedForQuota) {
      waitedForQuota = true;
      await sleep(problem.retryAfterMs);
      continue;
    }
    throw new GeminiError(problem.summary, res.status);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function textOf(body: any): string {
  const parts: any[] = body?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => (typeof p?.text === "string" && !p.thought ? p.text : "")).join("");
}

/** A call whose answer must match `schema` (Gemini's structured output). Null if it is not JSON. */
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
  const text = textOf(body).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The part of a Gemini error that says what to do about it. A 429 names the
 * exact quota that was hit and its size; "limit 0" means this model has no
 * free-tier allowance on this key at all, which no amount of waiting fixes.
 */
export function describeGeminiError(status: number, text: string): { summary: string; retryAfterMs: number | null } {
  let error: any;
  try {
    error = JSON.parse(text)?.error;
  } catch {
    return { summary: text.slice(0, 500), retryAfterMs: null };
  }
  const details: any[] = Array.isArray(error?.details) ? error.details : [];
  const violations: any[] = details.flatMap((d) => (Array.isArray(d?.violations) ? d.violations : []));
  const quotas = violations
    .filter((v) => v?.quotaId || v?.quotaMetric)
    .map((v) => `${v.quotaId || v.quotaMetric} limit ${v.quotaValue ?? "?"}`);
  const delay = details.find((d) => typeof d?.retryDelay === "string")?.retryDelay as string | undefined;
  const delayMs = delay && /^\d+(\.\d+)?s$/.test(delay) ? Math.ceil(parseFloat(delay) * 1000) : null;

  const noFreeTier = violations.some((v) => String(v?.quotaValue) === "0");
  const daily = violations.some((v) => /PerDay/i.test(String(v?.quotaId)));
  const parts = [error?.status || `HTTP ${status}`];
  if (quotas.length) parts.push(quotas.join("; "));
  if (noFreeTier) parts.push("this model has no free-tier quota on this key: pick another model or enable billing");
  else if (daily) parts.push("the daily quota is used up: it resets at midnight Pacific time");
  if (delay) parts.push(`retry after ${delay}`);
  if (!quotas.length && error?.message) parts.push(String(error.message).slice(0, 300));

  const retryable = status === 429 && !noFreeTier && !daily && delayMs != null && delayMs <= 60_000;
  return { summary: parts.join(" — "), retryAfterMs: retryable ? delayMs : null };
}
