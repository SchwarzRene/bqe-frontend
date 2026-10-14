// The Backtest Lab runs the Rust engine as WebAssembly (research/backtest-lab/mt5bt.wasm, built by
// wasm/build.sh in SchwarzRene/stock-backtesting-engine). These tests load that very file and check
// it against what the native `mt5bt` binary printed for the same data, config and strategies.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser ES module
import { initEngine, loadTicks, parseDate, runBacktest, defaultParams, STRATEGIES, buildRequest } from "../research/backtest-lab/engine.js";

const DIR = "research/backtest-lab/";
const FROM = parseDate("2024.01.15");
const TO = parseDate("2024.02.20");
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.005);
let data: any;

beforeAll(async () => {
  await initEngine(readFileSync(DIR + "mt5bt.wasm"), readFileSync(DIR + "broker.cfg", "utf8"));
  data = loadTicks(readFileSync(DIR + "data/example_ticks.csv", "utf8"), 5);
});

describe("Backtest Lab (Rust engine as WebAssembly)", () => {
  it("loads the example dataset", () => {
    expect(data.count).toBe(70000);
    expect(data.bad).toBe(0);
    expect(data.backwards).toBe(0);
  });

  // mt5bt run --config broker.cfg --strategy X --set X.set --from 2024.01.15 --to 2024.02.20
  const NATIVE: Record<string, Record<string, number>> = {
    sma_crossover: { finalBalance: 10275.3, grossProfit: 530.8, grossLoss: -255.5, commission: -43.4, swap: -5.8, trades: 62, wins: 28, maxDdAbs: 75.1 },
    rsi_reversion: { finalBalance: 9771.7, grossProfit: 286.3, grossLoss: -514.6, commission: -29.4, swap: -7.4, trades: 42, wins: 20, maxDdAbs: 287.7 },
    donchian_breakout: { finalBalance: 9989.6, grossProfit: 256.7, grossLoss: -267.1, commission: -14.7, swap: -9.0, trades: 21, wins: 5, maxDdAbs: 132.4 },
  };
  for (const [name, want] of Object.entries(NATIVE)) {
    it(`${name} gives the same numbers as the native binary`, () => {
      const r = runBacktest(data, {}, name, defaultParams(name), FROM, TO);
      for (const [k, v] of Object.entries(want)) near((r as any)[k], v);
    });
  }

  // + --opt latency.open_ms=400 latency.close_ms=250 latency.jitter_ms=300 latency.seed=7
  //   costs.commission_per_lot=7 costs.slippage_points=3 costs.deviation_points=40 (the last one is in broker.cfg's default: -1)
  it("applies latency, jitter, commission and slippage overrides", () => {
    const stress = { openMs: 400, closeMs: 250, jitterMs: 300, seed: 7, commissionPerLot: 7, slippagePoints: 3 };
    const r = runBacktest(data, stress, "sma_crossover", defaultParams("sma_crossover"), FROM, TO);
    expect(r.trades).toBe(62);
    expect(r.finalBalance).toBeLessThan(10275.3); // costs and delay hurt
    const again = runBacktest(data, stress, "sma_crossover", defaultParams("sma_crossover"), FROM, TO);
    expect(again.deals).toEqual(r.deals); // deterministic
  });

  it("returns deals and an equity curve on request, only stats otherwise", () => {
    const full = runBacktest(data, {}, "donchian_breakout", defaultParams("donchian_breakout"), FROM, TO);
    expect(full.deals.length).toBe(full.trades * 2);
    expect(full.curve.length).toBeGreaterThan(10);
    const brief = runBacktest(data, {}, "donchian_breakout", defaultParams("donchian_breakout"), FROM, TO, { detail: false });
    expect(brief.deals.length).toBe(0);
    near(brief.finalBalance, full.finalBalance);
  });

  it("reports bad input as an error instead of a result", () => {
    expect(() => runBacktest(data, {}, "sma_crossover", { ...defaultParams("sma_crossover"), fastPeriod: 50, slowPeriod: 40 }, FROM, TO)).toThrow(/FastPeriod/);
    expect(() => runBacktest(data, {}, "nope", {}, FROM, TO)).toThrow(/unknown strategy/);
  });

  it("sends the engine its .set names and config keys", () => {
    const req = buildRequest({ openMs: 7 }, "sma_crossover", defaultParams("sma_crossover"), FROM, TO);
    expect(req.params).toContainEqual(["FastPeriod", "10"]);
    expect(req.config).toContainEqual(["latency.open_ms", "7"]);
    expect(Object.keys(STRATEGIES)).toEqual(["sma_crossover", "rsi_reversion", "donchian_breakout"]);
  });
});
