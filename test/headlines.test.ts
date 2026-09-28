import { describe, expect, it } from "vitest";
import { pickInput } from "../worker/news/briefing";
import { chatHeadlines } from "../worker/news/chat";
import { parseRanks, rankPrompt } from "../worker/news/headlines";
import { effectiveScore, type Item } from "../worker/news/store";

const known = new Set(["NVDA", "BRK-B", "SAP.DE", "GC=F"]);

describe("headline ranking", () => {
  it("reads the model's array out of prose or a code fence, checking every field", () => {
    const text = 'Here you go:\n```json\n[' +
      '{"id":"a","i":5,"t":["nvda","BRK.B","FAKE"],"s":"+"},' +
      '{"id":"b","i":9,"t":"GC=F","s":"up"},' +
      '{"id":"zz","i":3,"t":[],"s":"0"},' +
      '{"id":"a","i":1,"t":[],"s":"-"}' +
      ']\n```';
    const ranks = parseRanks(text, new Set(["a", "b", "c"]), known);
    expect([...ranks.keys()]).toEqual(["a", "b"]);
    // Symbols in Yahoo spelling, unknown ones dropped; the first answer for an id wins.
    expect(ranks.get("a")).toEqual({ importance: 5, tone: "+", tickers: ["NVDA", "BRK-B"] });
    // Out-of-range importance, a non-list and an unknown tone are dropped, not guessed.
    expect(ranks.get("b")).toEqual({ importance: null, tone: null, tickers: [] });
    expect(parseRanks("no json here", new Set(["a"]), known).size).toBe(0);
    expect(parseRanks("[{broken", new Set(["a"]), known).size).toBe(0);
  });

  it("asks for every headline and names the non-US and futures symbols", () => {
    const prompt = rankPrompt([{ id: "abc", source: "Wire", title: "Gold  hits\na record" }]);
    expect(prompt).toContain("abc | Wire | Gold hits a record");
    expect(prompt).toContain("SAP.DE (SAP)");
    expect(prompt).toContain("GC=F gold");
    expect(prompt).toContain("Reply with only a JSON array");
  });
});

const item = (id: string, score: number, importance: number | null, minutesAgo: number, now: number): Item => ({
  id, title: id, url: "", source: "", alsoIn: [], category: "markets", region: "us", tickers: [],
  publishedAt: new Date(now - minutesAgo * 60_000).toISOString(), score, importance, tone: null,
});

describe("ranked headlines in use", () => {
  it("weighs Gemma's importance over the rule score once a headline is ranked", () => {
    expect(effectiveScore({ score: 50, importance: null })).toBe(50);
    expect(effectiveScore({ score: 50, importance: 5 })).toBe(80);
    expect(effectiveScore({ score: 50, importance: 1 })).toBe(32);
  });

  it("puts important headlines into the briefing and the chat ahead of well-sourced trivia", () => {
    const now = Date.parse("2026-09-24T12:00:00Z");
    const items = [
      item("trivia", 70, 1, 10, now), // a top source, but irrelevant
      item("fed", 40, 5, 60, now), // a smaller source, market-moving
      item("unranked", 45, null, 5, now),
    ];
    expect(pickInput(items, now, 2).map((i) => i.id)).toEqual(["fed", "unranked"]);
    // The chat keeps the most important, then lists them newest first.
    expect(chatHeadlines(items, now, 2).map((i) => i.id)).toEqual(["unranked", "fed"]);
  });
});
