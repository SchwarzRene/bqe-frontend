// Market News: briefing validation.

import { describe, expect, it } from "vitest";
import { validateBriefing, pickInput } from "../../worker/news/briefing";
import { cfg } from "./fixtures";

describe("news briefing", () => {
  const ids = new Set(["a1", "b2", "c3"]);
  const page = (story: object) => ({ overview: { all: "Rates set the tone.", us: "x", europe: "y", asia: "z", russia: "w" }, themes: ["Rates", "", "ECB", "China", "Oil"], topStories: [story] });
  const good = {
    general: page({ ids: ["a1", "zz"], summary: "US growth revised up", why: "Fewer cuts", importance: 7, region: "mars", topic: "Macro", status: "continuing" }),
    stocks: page({ ids: ["b2"], summary: "Chips rebound", why: "", importance: 2, region: "global", topic: "Chips", status: "new" }),
    commodities: page({ ids: [], summary: "no ids", why: "", importance: 1, region: "us", topic: "x", status: "new" }),
    companies: [{ ticker: "nvda", line: "Recovering with the sector", ids: ["b2"] }, { ticker: "EBS.VI", line: "Filler without a source", ids: [] }],
    commodityGroups: [{ name: "Energy", summary: "Oil drifts lower", nextEventId: "ev1", ids: ["c3"], rows: [{ name: "crude oil", line: "Lower" }] }],
  };

  it("keeps only what points at input ids, and fills every watchlist ticker and group", () => {
    const b = validateBriefing(good, ids, new Set(["ev1"]), cfg)!;
    expect(b.pages.general.topStories[0]).toMatchObject({ ids: ["a1"], importance: 2, region: "global", status: "continuing" });
    expect(b.pages.general.themes).toEqual(["Rates", "ECB", "China", "Oil"]);
    expect(b.pages.commodities.topStories).toEqual([]);
    expect(b.companies).toEqual([
      { ticker: "NVDA", name: "Nvidia", line: "Recovering with the sector", ids: ["b2"] },
      { ticker: "EBS.VI", name: "Erste Group", line: null, ids: [] },
    ]);
    expect(b.commodityGroups.map((g) => g.name)).toEqual(["Agriculture", "Energy", "Metals"]);
    expect(b.commodityGroups[1]).toMatchObject({ summary: "Oil drifts lower", nextEventId: "ev1", rows: [{ name: "Crude oil", line: "Lower" }] });
    expect(b.commodityGroups[0].rows).toEqual([{ name: "Soybeans", line: null }]);
  });

  it("keeps the model's importance per headline, for input ids and 1-5 only", () => {
    const b = validateBriefing({ ...good, headlines: [{ id: "a1", i: 5 }, { id: "b2", i: 2 }, { id: "zz", i: 4 }, { id: "c3", i: 9 }] }, ids, new Set(), cfg)!;
    expect(b.headlineRanks).toEqual({ a1: 5, b2: 2 });
  });

  it("rejects a briefing without a usable general page", () => {
    expect(validateBriefing({ ...good, general: page({ ids: ["zz"], summary: "x" }) }, ids, new Set(), cfg)).toBeNull();
    expect(validateBriefing("nope", ids, new Set(), cfg)).toBeNull();
  });

  it("picks the input by score with recency as of now", () => {
    const now = Date.parse("2026-09-24T12:00:00Z");
    const it = (id: string, score: number, at: string) => ({ id, title: "", url: "", source: "", alsoIn: [], category: "", region: "", tickers: [], publishedAt: at, score, importance: null, tone: null });
    const picked = pickInput([it("old", 60, "2026-09-23T13:00:00Z"), it("new", 50, "2026-09-24T11:30:00Z"), it("low", 10, "2026-09-24T11:59:00Z")], now, 2);
    expect(picked.map((p) => p.id)).toEqual(["new", "old"]);
  });
});
