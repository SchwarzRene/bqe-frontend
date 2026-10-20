// Market News: dedupe, scoring and the headline store.

import { describe, expect, it } from "vitest";
import { type RawItem } from "../../worker/news/feeds";
import { dedupe, eventWordsFor, isBlocked, isPromo, sameStory, scoreItem, staleSources, titleWords } from "../../worker/news/store";
import { cfg } from "./fixtures";

describe("news store", () => {
  const raw = (id: string, title: string, source: string, at = "2026-09-24T10:00:00Z"): RawItem => ({
    id, title, url: `https://ex.com/${id}`, source, sourceId: source, category: "markets", region: "us", tickers: [], publishedAt: at, weight: 20,
  });

  it("filters promo patterns and blocked publishers", () => {
    expect(isPromo("3 stocks to buy before the Fed", cfg)).toBe(true);
    expect(isPromo("Stocks fall before the Fed", cfg)).toBe(false);
    expect(isBlocked("The motley fool ", { ...cfg, blockedPublishers: ["The Motley Fool"] })).toBe(true);
    expect(isBlocked("Reuters", cfg)).toBe(false);
  });

  it("treats near-identical titles as one story", () => {
    const a = titleWords("US GDP growth revised up in third estimate");
    const b = titleWords("GDP growth revised up in third estimate, Commerce Dept says");
    expect(sameStory(a, b)).toBe(true);
    expect(sameStory(a, titleWords("Oil slips as supply talk returns"))).toBe(false);
  });

  it("dedupes: same URL dropped, a twin from another source folded into alsoIn", () => {
    const known = [{
      id: "k1", title: "ECB officials split on October rate cut", words: titleWords("ECB officials split on October rate cut"),
      source: "Euronews", alsoIn: [], tickers: [], publishedAt: "2026-09-24T08:00:00Z",
    }];
    const { added, merged } = dedupe(
      [
        raw("k1", "ECB officials split on October rate cut", "Euronews"),
        raw("n1", "ECB officials split on October rate cut, sources say", "Reuters"),
        raw("n2", "Oil slips as OPEC+ supply talk returns", "CNBC"),
        raw("n3", "Oil slips as OPEC+ supply talk returns", "MarketWatch", "2026-09-24T11:00:00Z"),
      ],
      known,
    );
    expect(added.map((a) => a.id)).toEqual(["n2"]);
    expect((added[0] as any).alsoIn).toEqual([{ source: "MarketWatch", url: "https://ex.com/n3" }]);
    expect(merged.map((m) => m.id)).toEqual(["k1"]);
    expect(merged[0].alsoIn).toEqual([{ source: "Reuters", url: "https://ex.com/n1" }]);
  });

  it("scores sources, recency, the watchlist and today's events", () => {
    const now = Date.parse("2026-09-24T12:00:00Z");
    const base = { weight: 20, source: "CNBC", alsoIn: [], publishedAt: "2026-09-24T12:00:00Z", tickers: [], title: "US CPI rises" };
    expect(scoreItem(base, now)).toBe(45);
    expect(scoreItem({ ...base, alsoIn: [{}, {}, {}] }, now)).toBe(75);
    expect(scoreItem({ ...base, tickers: ["NVDA"] }, now, ["CPI"])).toBe(70);
    expect(scoreItem({ ...base, publishedAt: "2026-09-23T12:00:00Z" }, now)).toBe(20);
  });

  it("names sources that have been silent for 24 hours", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    const doc = { updated: "", sources: {
      a: { lastOk: "2026-09-25T11:00:00Z", lastError: null, count: 3 },
      b: { lastOk: "2026-09-24T10:00:00Z", lastError: "HTTP 404", count: 0 },
      c: { lastOk: null, lastError: "HTTP 403", count: 0 },
    } };
    expect(staleSources(doc, now)).toEqual(["b", "c"]);
  });

  it("takes acronyms and tickers from event titles", () => {
    expect(eventWordsFor(["US CPI, August", "OPEC+ meeting", "EIA natural gas storage"], ["SAP.DE"]).sort()).toEqual(["CPI", "EIA", "OPEC", "SAP"]);
  });
});
