# Backtest Lab

A tick-level backtester that runs **entirely in the visitor's browser** — no Worker route, no
D1 table, no upload. Lives at **/research/backtest-lab/**.

| File | Role |
|---|---|
| `index.html` | Page: controls, results, optimiser, write-up. Self-contained styling (paper style guide). |
| `engine.js` | The engine: CSV parser, bars, order execution with latency, costs, the three strategies. Plain ES module, no dependencies, runs in the browser and in Node. |
| `lab.js` | The UI: forms, charts (vendored Lightweight Charts), trade table, grid optimiser with forward test. |
| `data/example_ticks.csv` | 70 000 random EURUSD-like ticks (2024-01-01 … 2024-02-20) in the MT5 export format. A seeded random walk, **not market data**. |

## Relation to the Rust engine

`engine.js` is a simplified port of the Rust engine's execution rules (ask/bid fills, latency with seeded
jitter, server-side SL/TP, rollover swap, margin/stop-out). It was spot-checked against the Rust binary on the
example data, but it is a showcase: `test/backtest-lab.test.ts` only smoke-tests it and does **not** pin
it to the Rust results, so the two may drift. Not ported: pending orders, trade sessions, partial closes,
non-USD accounts.

## Changing things

* **New strategy**: add it to `STRATEGIES` in `engine.js` (parameter list drives the form and the
  optimiser ranges) and, to keep the two in step, to `src/strategies/examples.rs` in the Rust repo.
* **New dataset**: any MT5 tick CSV works through the file picker (read locally, never uploaded). To
  replace the example, regenerate it with `research/example/make_data.py` in the Rust repo and
  update the expected numbers in the test.
* **CSP**: the page loads only same-origin scripts, so `_headers` needs no change; the engine
  deliberately avoids WebAssembly and Web Workers (a pass takes tens of milliseconds, a 180-pass
  grid under a second).
* Scripts are `no-cache` in `_headers` so a deploy is never shadowed by a stale copy.
