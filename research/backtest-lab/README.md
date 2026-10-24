# Backtest Lab

The real **mt5bt** backtesting workbench — the web app, the engine and the optimizer from
`SchwarzRene/stock-backtesting-engine` — running **entirely in the visitor's browser**. No Worker route, no D1
table, no upload. Lives at **/research/backtest-lab/**.

## How it works

`mt5bt serve` is a small HTTP server in front of the engine. Here the same server code is compiled to
WebAssembly (`wasm32-wasip1`) and the page talks to it in-process instead of over the network:

```
app.js / optimizer.js / charts.js        the web app, unmodified, calls fetch("/api/...")
        │
bridge.js                                 intercepts /api/* (fetch and the upload XMLHttpRequest)
        │ postMessage
server-worker.js ── server-core.js        web worker: runs mt5bt.wasm on a RAM-disk workspace
        │
mt5bt.wasm                                Rust: datasets, runs, sweeps, optimizer, the tick-level engine
```

| File | Role |
|---|---|
| `index.html` | The app's page shell (loading splash, hub layout: pages in the left dock, stage on the right) plus a back link to /research/ and an "About this demo" note; phones get the dock as a scrolling strip |
| `splash.js` | The loading splash (inline in the engine repo's `web/index.html`; extracted here because the site's CSP forbids inline scripts) |
| `app.js`, `charts.js`, `optimizer.js`, `style.css`, `schema.json` | The web app, **copied unmodified** from the engine repo's `web/` |
| `mt5bt.wasm` | The server + engine (~1 MB), built from the Rust repo with `wasm/build.sh` |
| `bridge.js` | Routes the app's API calls to the worker |
| `server-worker.js`, `server-core.js` | Worker, and the WASI glue (in-memory file system from `assets/vendor/browser_wasi_shim-0.4.2/`) |
| `data/example_ticks.csv`, `broker.cfg`, `sets/*.set` | The seeded example: 70 000 random EURUSD-like ticks (a seeded random walk, **not market data**), its broker config (linked to the dataset, so Research applies it on its own) and ready-made parameter files, including optimiser ranges |

On load the worker starts the module and seeds the workspace *through the app's own API* (upload the CSV, convert
it, save the config and `.set` files, link the config to the dataset), so the example goes through exactly the path a user's data would.

## Limits compared with a local `mt5bt serve`

* **No threads in WebAssembly**: a job (run, sweep, optimisation) finishes inside the request that starts it, so
  there is no live progress or cancel while it runs; results appear when it is done. Optimizer results do not depend
  on thread count, so they are identical to the native ones.
* **Workspace in memory**: datasets, runs and files vanish when the tab closes. Upload your own tick CSV in
  *Data & files*; it is read locally and never leaves the browser.
* **Strategy editor** (Claude-assisted MQL5 → Rust port) needs cargo and the Claude CLI, so it is disabled with a message.
* "Register a file by path" refers to the visitor's own disk and does nothing here.

## Updating

In the Rust repo: `wasm/build.sh ../bqe-frontend` rebuilds `mt5bt.wasm` and copies it, together with the web UI
files, into this folder. `index.html` and `splash.js` are the website's own: when the engine repo's `web/index.html` changes (new pages, markup), update them by hand. Commit the result. `test/research/backtest-lab.test.ts` (run by `npm test`) loads that exact module,
drives the API the way the app does, and compares run results with the native binary, so a stale or broken build
fails CI.

The module's interface is five C functions (`mt5_open`, `mt5_request`, `mt5_out_ptr`, `mt5_alloc`, `mt5_free`),
documented at the top of `wasm/src/lib.rs` in the Rust repo.

## Notes

* **CSP**: instantiating WebAssembly needs `'wasm-unsafe-eval'` in `script-src` (set in `_headers`, allowed by name in
  `test/account/security.test.ts`). It does not permit `eval()` or `new Function()`. Workers and `fetch` stay on `'self'`.
* All files here are `no-cache` in `_headers`, so a deploy is never shadowed by a stale copy.
* To add a strategy: implement it in Rust (`src/strategies/`), add its parameters to `web/schema.json` in the Rust repo,
  rebuild, and add a `.set` file to `sets/` and to `seedExample()` if you want it pre-loaded.
