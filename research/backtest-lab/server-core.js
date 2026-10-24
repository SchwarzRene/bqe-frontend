// The web app's server, as a WebAssembly module with an in-memory file system.
//
// mt5bt.wasm is `mt5bt serve` (Rust: datasets, runs, sweeps, the optimizer, the backtest engine) built for
// WASI. This file instantiates it, gives it a RAM disk as its workspace, and turns
// request(method, url, body) into calls of its tiny C ABI. Used by the web worker (server-worker.js) and,
// unchanged, by the tests under Node.

import { WASI, PreopenDirectory, OpenFile, File, ConsoleStdout } from "/assets/vendor/browser_wasi_shim-0.4.2/index.js";

const enc = new TextEncoder(), dec = new TextDecoder();

export const WORKSPACE = "/work";

/** Start the server from the module's bytes. `log` receives anything the Rust side prints. */
export async function openServer(wasmBytes, log = () => {}) {
  const root = new PreopenDirectory("/", new Map());
  const fds = [new OpenFile(new File([])), ConsoleStdout.lineBuffered(log), ConsoleStdout.lineBuffered(log), root];
  const wasi = new WASI([], [], fds, { debug: false });
  const { instance } = await WebAssembly.instantiate(wasmBytes, { wasi_snapshot_preview1: wasi.wasiImport });
  wasi.initialize(instance);
  const x = instance.exports;

  const put = (bytes) => {
    const p = x.mt5_alloc(bytes.length);
    new Uint8Array(x.memory.buffer, p, bytes.length).set(bytes);
    return p;
  };
  const out = (n) => new Uint8Array(x.memory.buffer, x.mt5_out_ptr(), n).slice();

  const dir = enc.encode(WORKSPACE), dp = put(dir);
  const rc = x.mt5_open(dp, dir.length);
  x.mt5_free(dp, dir.length);
  if (rc) throw new Error("server failed to start: " + dec.decode(out(rc)));

  /** One API call. `body` is a Uint8Array (or null); the answer is { status, ctype, body: Uint8Array }. */
  function request(method, url, body = null) {
    const data = body && body.length ? body : new Uint8Array(0);
    const m = enc.encode(method), u = enc.encode(url);
    const a = put(m), b = put(u), c = put(data);
    const n = x.mt5_request(a, m.length, b, u.length, c, data.length);
    x.mt5_free(a, m.length); x.mt5_free(b, u.length); x.mt5_free(c, data.length);
    const res = out(n), dv = new DataView(res.buffer);
    const ctl = dv.getUint16(2, true);
    return { status: dv.getUint16(0, true), ctype: dec.decode(res.subarray(4, 4 + ctl)), body: res.subarray(4 + ctl) };
  }

  /** Convenience for scripts and tests: JSON in, JSON out; throws on an HTTP error. */
  function json(method, url, payload) {
    const body = payload === undefined ? null : enc.encode(JSON.stringify(payload));
    const r = request(method, url, body);
    const v = r.body.length ? JSON.parse(dec.decode(r.body)) : null;
    if (r.status >= 400) throw new Error((v && v.error) || `HTTP ${r.status}`);
    return v;
  }

  return { request, json, text: (bytes) => dec.decode(bytes), bytes: (s) => enc.encode(s) };
}

/**
 * Fill an empty workspace with the website's example: the random EURUSD-like tick dataset (uploaded and converted
 * exactly like a user's CSV), its broker config and ready-made parameter files. `load(name)` returns a file's bytes.
 */
export async function seedExample(server, load) {
  if (server.json("GET", "/api/datasets").length) return;
  const csv = await load("data/example_ticks.csv");
  server.request("POST", "/api/upload?name=example_ticks.csv", csv);
  const job = server.json("POST", "/api/datasets/convert", { files: ["upload:example_ticks.csv"], name: "example_eurusd", digits: 5 });
  const j = server.json("GET", "/api/jobs/" + job.job);
  if (j.status !== "done") throw new Error("example dataset: " + (j.message || j.status));
  server.request("POST", "/api/files/config/example_eurusd.cfg", await load("broker.cfg"));
  // the dataset remembers its broker config; Research picks it up when the dataset is selected
  server.json("POST", "/api/datasets/example_eurusd/settings", { config: "example_eurusd.cfg" });
  for (const s of ["sma_crossover", "rsi_reversion"]) {
    server.request("POST", `/api/files/set/${s}.set`, await load(`sets/${s}.set`));
    server.request("POST", `/api/files/set/${s}_opt.set`, await load(`sets/${s}_opt.set`));
  }
}
