import { afterEach, describe, expect, it, vi } from "vitest";
import { describeGeminiError, serveTapeFile } from "../worker/markettape";

/** Just enough of D1 for the documents table. */
function fakeDb() {
  const docs = new Map<string, { body: string; updated: string }>();
  const db: any = {
    docs,
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            async first() {
              const row = docs.get(args[0]);
              return row ? { body: row.body } : null;
            },
            async run() {
              if (sql.includes("'markettape:bootstrap'")) {
                const [model, now, cutoff] = args;
                const row = docs.get("markettape:bootstrap");
                if (row && !(row.updated < cutoff) && row.body === model) return { meta: { changes: 0 } };
                docs.set("markettape:bootstrap", { body: model, updated: now });
                return { meta: { changes: 1 } };
              }
              docs.set(args[0], { body: args[1], updated: args[2] });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return db;
}

const gemini = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

function setup(key = "test-key") {
  const env: any = {
    DB: fakeDb(),
    GEMINI_API_KEY: key,
    ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
  };
  const ctx: any = { waitUntil: () => {} };
  const request = new Request("https://site/research/markettape/data/schedule.json");
  return { env, ctx, request };
}

afterEach(() => vi.unstubAllGlobals());

describe("Market Tape first rundown on demand", () => {
  it("builds the schedule during the first request and serves it", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      calls.push(url);
      const prompt = JSON.parse(init.body).contents[0].parts[0].text as string;
      return prompt.includes("Federal Reserve")
        ? gemini('```json\n[{"id":"fomc","title":"FOMC rate decision","date":"2026-10-28","timeET":"14:00","streamKind":"video","streamUrl":"https://www.federalreserve.gov/live"}]\n```')
        : gemini('[{"id":"nvda-q3","title":"Q3 results","ticker":"NVDA","date":"2026-11-18","timeET":"17:00"}]');
    });
    const { env, ctx, request } = setup();
    const res = await serveTapeFile(request, env, ctx, "schedule.json");
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.events.map((e: any) => e.id)).toEqual(["fomc", "nvda-q3"]);
    expect(calls).toHaveLength(2); // fed + earnings, no results pass
    expect(calls[0]).toContain("gemini-3.7-flash:generateContent");

    // Served from D1 now, with no further model calls.
    await serveTapeFile(request, env, ctx, "schedule.json");
    expect(calls).toHaveLength(2);
  });

  it("tries at most once per 30 minutes while it keeps failing", async () => {
    const fetch = vi.fn(async () => new Response("model not found", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    const { env, ctx, request } = setup();
    expect((await serveTapeFile(request, env, ctx, "schedule.json")).status).toBe(404);
    expect((await serveTapeFile(request, env, ctx, "schedule.json")).status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(2); // one run (fed + earnings), not two

    // Switching the model is the usual fix, so it is tried at once.
    env.GEMINI_MODEL = "another-model";
    await serveTapeFile(request, env, ctx, "schedule.json");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("does not bootstrap for results.json, and needs the key", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { env, ctx } = setup(""); // no key configured
    await serveTapeFile(new Request("https://site/research/markettape/data/results.json"), env, ctx, "results.json");
    expect(fetch).not.toHaveBeenCalled();
    const res = await serveTapeFile(new Request("https://site/research/markettape/data/schedule.json"), env, ctx, "schedule.json");
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("describeGeminiError", () => {
  const body = (quotaId: string, quotaValue: string, retryDelay = "20s") =>
    JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message: "You exceeded your current quota, please check your plan and billing details.",
        details: [
          { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId, quotaValue }] },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay },
        ],
      },
    });

  it("says so when the model has no free tier, and does not retry", () => {
    const r = describeGeminiError(429, body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "0"));
    expect(r.summary).toContain("limit 0");
    expect(r.summary).toContain("no free-tier quota");
    expect(r.retryAfterMs).toBeNull();
  });

  it("does not retry a used-up daily quota", () => {
    const r = describeGeminiError(429, body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "20"));
    expect(r.summary).toContain("daily quota is used up");
    expect(r.retryAfterMs).toBeNull();
  });

  it("retries a per-minute limit after the delay Google gives", () => {
    const r = describeGeminiError(429, body("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "5", "12.5s"));
    expect(r.retryAfterMs).toBe(12_500);
  });

  it("keeps non-JSON errors readable", () => {
    expect(describeGeminiError(500, "upstream exploded").summary).toBe("upstream exploded");
  });
});
