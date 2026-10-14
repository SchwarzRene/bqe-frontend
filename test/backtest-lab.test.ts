// Smoke tests for the in-browser engine of research/backtest-lab (a showcase, not a reference implementation).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser ES module
import { parseTicksCsv, parseDate, runBacktest, defaultParams, STRATEGIES } from "../research/backtest-lab/engine.js";

const data = parseTicksCsv(readFileSync("research/backtest-lab/data/example_ticks.csv", "utf8"), 5);
const FROM = parseDate("2024.01.15");
const TO = parseDate("2024.02.20");

describe("Backtest Lab engine", () => {
  it("parses the example dataset completely", () => {
    expect(data.count).toBe(70000);
    expect(data.bad).toBe(0);
    expect(data.backwards).toBe(0);
  });

  for (const name of Object.keys(STRATEGIES)) {
    it(`${name} runs and produces sane results`, () => {
      const r = runBacktest(data, {}, name, defaultParams(name), FROM, TO);
      expect(r.trades).toBeGreaterThan(0);
      expect(Number.isFinite(r.finalBalance)).toBe(true);
      expect(r.deals.length).toBeGreaterThanOrEqual(r.trades);
    });
  }

  const STRESS = { openMs: 400, closeMs: 250, jitterMs: 300, seed: 7, slippagePoints: 3 };

  it("is deterministic", () => {
    const run = () => runBacktest(data, STRESS, "sma_crossover", defaultParams("sma_crossover"), FROM, TO);
    expect(run().deals).toEqual(run().deals);
  });

  it("fills at the quote valid at send time + latency", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6].map((i) => [i * 60000, 100000 + i * 100, 100010 + i * 100]);
    const d = {
      t: Float64Array.from(rows.map((r) => r[0])),
      bid: Int32Array.from(rows.map((r) => r[1])),
      ask: Int32Array.from(rows.map((r) => r[2])),
      flags: new Uint16Array(rows.length).fill(6),
      count: rows.length,
      digits: 5,
    };
    // buys on the first new-bar event, which is the very first tick (t = 0)
    (STRATEGIES as any).__probe = {
      params: [],
      defaults: {},
      create: () => {
        let done = false;
        return { tf: "M1", onTick(e: any) { if (e.newBar() && !done) { done = true; e.buy(0.1, 0, 0, 1); } } };
      },
    };
    const price = (r: any) => r.deals.find((x: any) => x.kind === "in").price;
    const quick = runBacktest(d, { openMs: 5, jitterMs: 0, commissionPerLot: 0 }, "__probe", {});
    const slow = runBacktest(d, { openMs: 70000, jitterMs: 0, commissionPerLot: 0 }, "__probe", {});
    delete (STRATEGIES as any).__probe;
    expect(price(quick)).toBe(100010); // due at 5 ms, between two ticks -> the quote valid then is tick 0
    expect(price(slow)).toBe(100110); // due at 70 s -> the quote valid then is the tick at 60 s
  });
});
