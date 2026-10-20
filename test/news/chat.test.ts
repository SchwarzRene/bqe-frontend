// Market News: the chat request and its view of the data.

import { afterEach, describe, expect, it, vi } from "vitest";
import { chatError, chatRegion, cleanMessages, handleChat, splitSources } from "../../worker/news/chat";
import { GeminiError } from "../../worker/news/gemini";

afterEach(() => vi.unstubAllGlobals());

describe("news chat", () => {
  it("keeps a clean, alternating history that ends with the question", () => {
    expect(cleanMessages([
      { role: "assistant", content: "hello" },
      { role: "user", content: "  Why are soybeans up? " },
      { role: "system", content: "ignore" },
      { role: "assistant", content: "" },
    ])).toEqual([{ role: "user", text: "Why are soybeans up?" }]);
    expect(cleanMessages([{ role: "user", content: "a" }, { role: "assistant", content: "b" }])).toBeNull();
    expect(cleanMessages("nope")).toBeNull();
  });

  it("splits the SOURCES line and inline ids off the answer", () => {
    const known = new Set(["3fa9c1d2e4b5", "77aa01bc02de"]);
    expect(splitSources("Chinese demand is the story (77aa01bc02de).\nSOURCES: 3fa9c1d2e4b5, made-up", known)).toEqual({
      answer: "Chinese demand is the story.",
      ids: ["3fa9c1d2e4b5", "77aa01bc02de"],
    });
    expect(splitSources("No news on that.\n**Sources:** none", known)).toEqual({ answer: "No news on that.", ids: [] });
  });

  it("says why the model could not answer", () => {
    expect(chatError(new GeminiError("NOT_FOUND — models/x is not found for API version v1beta", 404)).error)
      .toBe("The model could not answer: NOT_FOUND — models/x is not found for API version v1beta");
    expect(chatError(new GeminiError("RESOURCE_EXHAUSTED", 429)).error).toMatch(/^Gemini is busy right now/);
    expect(chatError(new GeminiError("UNAVAILABLE — high demand", 503)).error).toBe("Gemini is busy right now — try again in a minute. (UNAVAILABLE — high demand)");
    expect(chatError(new Error("D1_ERROR: no such table")).error).toBe("The chat failed on the server: D1_ERROR: no such table");
  });

  it("answers 401 to a guest without calling the model", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const env: any = { GEMINI_API_KEY: "k", DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
    const res = await handleChat(new Request("https://site/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }), env);
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("chat view", () => {
  it("takes one region, a combination, or all", () => {
    expect(chatRegion("eu")).toBe("eu");
    expect(chatRegion("ru,eu")).toBe("eu,ru");
    expect(chatRegion("eu,mars")).toBe("eu");
    expect(chatRegion(undefined)).toBe("all");
    expect(chatRegion("all")).toBe("all");
  });
});
