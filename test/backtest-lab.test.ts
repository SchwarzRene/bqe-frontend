// The Backtest Lab hosts the real mt5bt web app: research/backtest-lab/mt5bt.wasm is `mt5bt serve` built for
// WebAssembly (stock-backtesting-engine, wasm/build.sh), run here exactly as the page's web worker runs it.
// These tests drive its HTTP API the way the app does and check the numbers against the native binary.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-ignore - plain browser ES modules
import { openServer, seedExample } from "../research/backtest-lab/server-core.js";

const DIR = "research/backtest-lab/";
let s: any;

const PARAMS = { Timeframe: "M15", FastPeriod: "10", SlowPeriod: "40", Lots: "0.1", StopLossPoints: "300", TakeProfitPoints: "600", Magic: "1" };

beforeAll(async () => {
  s = await openServer(readFileSync(DIR + "mt5bt.wasm"));
  await seedExample(s, async (name: string) => readFileSync(DIR + name));
});

const config = () => s.json("GET", "/api/files/config/example_eurusd.cfg/parsed").entries;

describe("Backtest Lab (the mt5bt web app as WebAssembly)", () => {
  it("is seeded with the example dataset, broker config and parameter files", () => {
    const ds = s.json("GET", "/api/datasets");
    expect(ds.map((d: any) => d.name)).toEqual(["example_eurusd"]);
    expect(ds[0].digits).toBe(5);
    expect(s.json("GET", "/api/files").set).toContain("sma_crossover_opt.set");
    expect(s.json("GET", "/api/schema").strategies.map((x: any) => x.name)).toContain("rsi_reversion");
  });

  // mt5bt run --config broker.cfg --strategy sma_crossover --set sma_crossover.set --from 2024.01.15 --to 2024.02.20
  const NATIVE: Record<string, [Record<string, string>, number, number]> = {
    sma_crossover: [PARAMS, 10275.3, 62],
    rsi_reversion: [{ Timeframe: "M15", RsiPeriod: "14", Oversold: "30", Overbought: "70", Lots: "0.1", StopLossPoints: "300", TakeProfitPoints: "300", Magic: "2" }, 9771.7, 42],
  };
  for (const [strategy, [params, balance, trades]] of Object.entries(NATIVE)) {
    it(`${strategy}: a run gives the native binary's result`, () => {
      const { id } = s.json("POST", "/api/runs", { dataset: "example_eurusd", config: config(), strategy, params, from: "2024.01.15", to: "2024.02.20" });
      const run = s.json("GET", `/api/runs/${id}`);
      expect(run.status).toBe("done"); // jobs finish inside the request (no threads in WebAssembly)
      expect(Math.abs(run.summary.stats.final_balance - balance)).toBeLessThan(0.005);
      expect(run.summary.stats.trades).toBe(trades);
      expect(s.json("GET", `/api/runs/${id}/deals`).length).toBeGreaterThan(trades);
    });
  }

  it("optimises with a forward test and stores the passes", () => {
    const { id, size } = s.json("POST", "/api/optimizations", {
      dataset: "example_eurusd", config: config(), strategy: "sma_crossover", name: "t",
      params: PARAMS,
      ranges: [
        { name: "FastPeriod", value: "10", start: "5", step: "5", stop: "30", optimize: true },
        { name: "SlowPeriod", value: "40", start: "40", step: "10", stop: "90", optimize: true },
      ],
      from: "2024.01.15", to: "2024.02.05",
      opt: { algo: "grid", criterion: "profit", min_trades: 5, forward_from: "2024.02.05", forward_to: "2024.02.20", forward_top: 5 },
    });
    expect(size).toBe(36);
    const o = s.json("GET", `/api/optimizations/${id}`);
    expect(o.status).toBe("done");
    expect(o.results.total).toBe(36);
    expect(o.results.rows.length).toBeGreaterThan(5);
    // a row: [score, net, PF, trades, DD abs, DD %, balance, [parameter values], [forward net, ...]]
    expect(o.results.rows[0][7]).toHaveLength(2);
    expect(o.results.rows[0][8]).toHaveLength(5);
  });

  it("answers errors as JSON, and the strategy editor politely", () => {
    const r = s.request("GET", "/api/nope");
    expect(r.status).toBe(404);
    expect(s.text(r.body)).toContain("error");
    expect(s.json("GET", "/api/studio")).toEqual([]);
    expect(() => s.json("POST", "/api/studio/x/compile", {})).toThrow(/local server/);
    expect(() => s.json("POST", "/api/runs", { dataset: "missing", strategy: "sma_crossover" })).toThrow();
  });
});
