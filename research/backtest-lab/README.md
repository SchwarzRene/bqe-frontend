# Backtest Lab

The real mt5bt backtesting engine (Rust, `SchwarzRene/stock-backtesting-engine`) compiled to WebAssembly and
run **entirely in the visitor's browser** — no Worker route, no D1 table, no upload. Lives at
**/research/backtest-lab/**.

| File | Role |
|---|---|
| `mt5bt.wasm` | The engine (~250 KB): CSV parsing, bars, strategies, order execution with latency, costs, swap, margin. Built from the Rust repo with `wasm/build.sh`. |
| `engine.js` | Thin adapter: copies tick text and a JSON request into the module, turns the JSON answer into objects. Contains no trading logic. Also the form metadata for the three strategies. |
| `lab.js` | The UI: forms, charts (vendored Lightweight Charts), trade table, grid optimiser with forward test, the "run the same on your machine" command. |
| `broker.cfg` | The engine's own account/costs/latency config for the example symbol. Edited values from the form are applied on top (`--opt` style). |
| `data/example_ticks.csv` | 70 000 random EURUSD-like ticks (2024-01-01 … 2024-02-20) in the MT5 export format. A seeded random walk, **not market data**. |
| `index.html` | Page (self-contained styling, paper style guide). |

## Updating the engine

In the Rust repo: `wasm/build.sh ../bqe-frontend` builds `wasm32-unknown-unknown` and copies `mt5bt.wasm` here.
`test/backtest-lab.test.ts` (run by `npm test`) loads this exact file and checks it against what the native
`mt5bt` binary printed for the same data and settings, so a stale or broken build fails CI.

The module's interface is five C functions (`mt5_alloc`, `mt5_free`, `mt5_load_csv`, `mt5_run`, `mt5_out_ptr`),
documented at the top of `wasm/src/lib.rs` in the Rust repo. No wasm-bindgen, no imports.

## Notes

* **CSP**: instantiating WebAssembly needs `'wasm-unsafe-eval'` in `script-src` (set in `_headers`, allowed in
  `test/security.test.ts`). It does not permit `eval()` or `new Function()`.
* **Strategies**: the three shown are the engine's example strategies (`src/strategies/examples.rs`). To add one,
  implement it in Rust, rebuild the module, and add its parameters to `STRATEGIES` in `engine.js`.
* **Your own data**: any MT5 tick CSV works through the file picker (read locally, never uploaded).
* `engine.js`/`lab.js`/`mt5bt.wasm`/`broker.cfg` are `no-cache` in `_headers` so a deploy is never shadowed by a stale copy.
