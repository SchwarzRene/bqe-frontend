// GET /api/news runs withHeadlines on every request, within the free plan's 10 ms of CPU. The fast
// version must answer exactly what the straightforward one did.

import { describe, expect, it } from "vitest";
import { withHeadlines } from "../worker/news/index";
import { eventWordsFor } from "../worker/news/store";

/** The original: a RegExp built for every event x headline x word. */
function reference(events: any[], items: any[]) {
  return events.map((e) => {
    const words = eventWordsFor([e.title], e.tickers);
    const start = Date.parse(e.start);
    const itemIds = words.length
      ? items
          .filter((i) => Math.abs(Date.parse(i.publishedAt) - start) < 18 * 3_600_000)
          .filter((i) => words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(i.title) || i.tickers.includes(w)))
          .slice(0, 5)
          .map((i) => i.id)
      : [];
    return { ...e, itemIds };
  });
}

// A small deterministic generator, so a failure is reproducible.
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const WORDS = ["CPI", "PPI", "NFP", "FOMC", "ECB", "BOE", "GDP", "PMI", "OPEC+", "EIA", "AAPL", "NVDA", "BRK.B", "SAP.DE", "C++", "US", "EU", "Q3", "RBA"];
const FILLER = ["Stocks", "rise", "as", "investors", "await", "data", "Fed", "oil", "gold", "record", "weighs", "output", "slip", "ahead", "of"];
const NOW = Date.parse("2026-10-19T18:00:00Z");

describe("withHeadlines", () => {
  it("returns exactly what the original did, over randomised events and headlines", () => {
    for (let round = 0; round < 30; round++) {
      const events = Array.from({ length: 40 }, (_, i) => ({
        id: `e${i}`, type: "economic", title: `${pick(WORDS)} ${pick(FILLER)} (${pick(WORDS)})`,
        start: rnd() < 0.05 ? "not a date" : new Date(NOW + (rnd() - 0.5) * 100 * 3_600_000).toISOString(),
        tickers: rnd() < 0.5 ? [pick(WORDS)] : [],
      }));
      const items = Array.from({ length: 120 }, (_, i) => ({
        id: `i${i}`, title: Array.from({ length: 7 }, () => (rnd() < 0.3 ? pick(WORDS) : pick(FILLER))).join(" "),
        publishedAt: rnd() < 0.03 ? "garbage" : new Date(NOW - rnd() * 24 * 3_600_000).toISOString(),
        tickers: rnd() < 0.3 ? [pick(WORDS).split(".")[0]] : [],
      }));
      expect(withHeadlines(events as any, items as any)).toEqual(reference(events, items));
    }
  });

  it("takes at most five headlines per event, in headline order", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, title: `CPI surprise ${i}`, publishedAt: new Date(NOW - i * 60_000).toISOString(), tickers: [] }));
    const out = withHeadlines([{ id: "e", title: "US CPI", start: new Date(NOW).toISOString(), tickers: [] } as any], items as any);
    expect(out[0].itemIds).toEqual(["i0", "i1", "i2", "i3", "i4"]);
  });

  it("is fast enough for the free plan at the live volumes (136 events, 250 headlines)", () => {
    const events = Array.from({ length: 136 }, (_, i) => ({
      id: `e${i}`, type: "economic", title: `${WORDS[i % 19]} ${WORDS[(i * 7) % 19]} release (${WORDS[(i * 3) % 19]})`,
      start: new Date(NOW + ((i % 40) - 14) * 3 * 3_600_000).toISOString(), tickers: [WORDS[(i * 5) % 19]],
    }));
    const items = Array.from({ length: 250 }, (_, i) => ({ id: `i${i}`, title: `${FILLER[i % 15]} ${WORDS[i % 19]} ${i}`, publishedAt: new Date(NOW - i * 5.5 * 60_000).toISOString(), tickers: i % 3 ? ["AAPL"] : [] }));
    withHeadlines(events as any, items as any); // warm up
    const start = performance.now();
    for (let k = 0; k < 10; k++) withHeadlines(events as any, items as any);
    const ms = (performance.now() - start) / 10;
    // measured ~24 ms before; a generous bound so a slow CI machine does not flake
    expect(ms).toBeLessThan(8);
  });
});
