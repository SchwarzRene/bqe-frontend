// Pins the in-browser engine of research/backtest-lab to results produced by the Rust engine
// (`mt5bt run`, SchwarzRene/stock-backtesting-engine) on the same example dataset.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser ES module
import { parseTicksCsv, parseDate, runBacktest, defaultParams, STRATEGIES } from "../research/backtest-lab/engine.js";

const data = parseTicksCsv(readFileSync("research/backtest-lab/data/example_ticks.csv", "utf8"), 5);
const FROM = parseDate("2024.01.15");
const TO = parseDate("2024.02.20");
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.005);

describe("Backtest Lab engine", () => {
  it("parses the example dataset completely", () => {
    expect(data.count).toBe(70000);
    expect(data.bad).toBe(0);
    expect(data.backwards).toBe(0);
  });

  // mt5bt run --config broker.cfg --strategy X --set sets/X.set --from 2024.01.15 --to 2024.02.20
  const DEFAULT_COSTS: Record<string, Record<string, number>> = {
    sma_crossover: { finalBalance: 10275.3, grossProfit: 530.8, grossLoss: -255.5, commission: -43.4, swap: -5.8, trades: 62, wins: 28, maxDdAbs: 75.1 },
    rsi_reversion: { finalBalance: 9771.7, grossProfit: 286.3, grossLoss: -514.6, commission: -29.4, swap: -7.4, trades: 42, wins: 20, maxDdAbs: 287.7 },
    donchian_breakout: { finalBalance: 9989.6, grossProfit: 256.7, grossLoss: -267.1, commission: -14.7, swap: -9.0, trades: 21, wins: 5, maxDdAbs: 132.4 },
  };
  for (const [name, want] of Object.entries(DEFAULT_COSTS)) {
    it(`${name} equals the Rust engine (default costs, 20 ms + 5 ms jitter)`, () => {
      const r = runBacktest(data, {}, name, defaultParams(name), FROM, TO);
      for (const [k, v] of Object.entries(want)) near((r as any)[k], v);
    });
  }

  // + --opt latency.open_ms=400 latency.close_ms=250 latency.jitter_ms=300 latency.seed=7
  //   costs.commission_per_lot=7 costs.slippage_points=3 costs.deviation_points=40
  const STRESS = { openMs: 400, closeMs: 250, jitterMs: 300, seed: 7, commissionPerLot: 7, slippagePoints: 3, deviationPoints: 40 };
  const STRESS_WANT: Record<string, [number, number]> = {
    sma_crossover: [10195.9, 62],
    rsi_reversion: [9722.5, 42],
    donchian_breakout: [9963.2, 21],
  };
  for (const [name, [balance, trades]] of Object.entries(STRESS_WANT)) {
    it(`${name} equals the Rust engine (400/250 ms latency, seeded jitter, slippage, requotes)`, () => {
      const r = runBacktest(data, STRESS, name, defaultParams(name), FROM, TO);
      near(r.finalBalance, balance);
      expect(r.trades).toBe(trades);
    });
  }

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
