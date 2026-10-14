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

`engine.js` ports the execution rules of the Rust engine (`stock-backtesting-engine`, `src/engine.rs`):
buy at ask / sell at bid, requests due at `send + latency + seeded jitter` fill at the quote valid at
that moment, SL/TP server-side, BID bars, rollover swap with weekday factors, margin and stop-out,
money rounded to cents per deal. The jitter generator is the same xorshift64*, so a seed gives the
same delays.

`test/backtest-lab.test.ts` (run by `npm test`) pins `engine.js` to numbers produced by
`mt5bt run` on this dataset — final balance, gross profit/loss, commission, swap, trade count and
drawdown for all three strategies under default and stressed (400/250 ms latency, jitter,
slippage, requotes) settings. If you change the engine, re-run the Rust binary and update the
expected values, or the test tells you the two have drifted apart.

Not ported: pending orders, trade-session calendars, partial closes, non-USD accounts.

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
