// Market News: Gemini errors, retries and fallbacks.

import { afterEach, describe, expect, it, vi } from "vitest";
import { describeGeminiError, generate, RETRY_DELAYS_MS } from "../../worker/news/gemini";

afterEach(() => vi.unstubAllGlobals());

describe("describeGeminiError", () => {
  const body = (quotaId: string, quotaValue: string, retryDelay = "20s") =>
    JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [
      { violations: [{ quotaMetric: "generate_content_free_tier_requests", quotaId, quotaValue }] },
      { retryDelay },
    ] } });

  it("says so when the model has no free tier, and does not retry", () => {
    const r = describeGeminiError(429, body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "0"));
    expect(r.summary).toContain("no free-tier quota");
    expect(r.retryAfterMs).toBeNull();
  });

  it("waits out a short per-minute limit, not a daily one", () => {
    expect(describeGeminiError(429, body("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "10")).retryAfterMs).toBe(20_000);
    expect(describeGeminiError(429, body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "250")).retryAfterMs).toBeNull();
    expect(describeGeminiError(500, "not json").summary).toBe("not json");
  });
});

describe("Gemini overload", () => {
  const overloaded = () => new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE", message: "This model is currently experiencing high demand." } }), { status: 503 });
  const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
  const saved = [...RETRY_DELAYS_MS];
  afterEach(() => RETRY_DELAYS_MS.splice(0, RETRY_DELAYS_MS.length, ...saved));
  const env: any = { GEMINI_API_KEY: "k" };

  it("retries an overloaded model", async () => {
    RETRY_DELAYS_MS.splice(0, 2, 0, 0);
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (calls.push(url), calls.length < 3 ? overloaded() : ok("hi")));
    expect((await generate(env, "gemini-3.7-flash", {}, "t")).candidates[0].content.parts[0].text).toBe("hi");
    expect(calls.map((u) => u.split("/models/")[1])).toEqual(Array(3).fill("gemini-3.7-flash:generateContent"));
  });

  it("goes down the fallback list while models stay overloaded or do not exist, and gives up after it", async () => {
    RETRY_DELAYS_MS.splice(0, 2, 0, 0);
    const calls: string[] = [];
    const missing = () => new Response(JSON.stringify({ error: { code: 404, status: "NOT_FOUND", message: "not found" } }), { status: 404 });
    vi.stubGlobal("fetch", async (url: string) => (
      calls.push(url.split("/models/")[1].split(":")[0]),
      url.includes("gemini-3.6-flash") ? ok("from 3.6") : url.includes("gemini-3.1-flash-lite") ? missing() : overloaded()
    ));
    expect((await generate(env, "gemini-3.5-flash-lite", {}, "t")).candidates[0].content.parts[0].text).toBe("from 3.6");
    expect(calls).toEqual(["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash"]);

    // Another main model at its limit falls back to 3.5 Flash-Lite first.
    calls.length = 0;
    vi.stubGlobal("fetch", async (url: string) => (calls.push(url.split("/models/")[1].split(":")[0]), url.includes("gemini-3.5-flash-lite") ? ok("from 3.5") : overloaded()));
    expect((await generate(env, "gemini-3.6-flash", {}, "t")).candidates[0].content.parts[0].text).toBe("from 3.5");
    expect(calls).toEqual(["gemini-3.6-flash", "gemini-3.6-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]);

    vi.stubGlobal("fetch", async () => overloaded());
    await expect(generate({ ...env, GEMINI_FALLBACK_MODEL: "off" }, "gemini-3.7-flash", {}, "t")).rejects.toMatchObject({ status: 503 });
  });

  it("does not fall back on a request the model rejects", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (calls.push(url), new Response(JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: "bad" } }), { status: 400 })));
    await expect(generate(env, "gemini-3.7-flash", {}, "t")).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(1);
  });
});
