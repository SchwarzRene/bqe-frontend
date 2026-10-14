// Adapter between the Backtest Lab page and the real mt5bt engine.
//
// The engine itself is Rust (SchwarzRene/stock-backtesting-engine), compiled to WebAssembly
// (mt5bt.wasm, built by wasm/build.sh in that repo). Nothing here simulates trading: this file
// only copies tick text and a JSON request into the module and turns the JSON answer into the
// objects the page draws. The strategies, order execution, latency model, commission, swap and
// margin logic all run inside the .wasm.

export const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];

const COMMON = [
  { key: "timeframe", label: "Timeframe", type: "select", options: TIMEFRAMES },
  { key: "lots", label: "Lots", step: 0.01, min: 0.01, def: 0.1 },
  { key: "stopLossPoints", label: "Stop loss (points)", step: 10, min: 0, def: 300 },
  { key: "takeProfitPoints", label: "Take profit (points)", step: 10, min: 0, def: 600 },
];

/** Form metadata. `opt` = [start, stop, step] for the optimiser. Parameter names are the engine's .set names with a lower-case first letter. */
export const STRATEGIES = {
  sma_crossover: {
    label: "SMA crossover",
    description: "Fast SMA crosses slow SMA on closed bars: buy on the up-cross, sell on the down-cross, always in the market.",
    params: [
      { key: "fastPeriod", label: "Fast period", step: 1, min: 1, def: 10, opt: [5, 30, 5] },
      { key: "slowPeriod", label: "Slow period", step: 1, min: 2, def: 40, opt: [40, 90, 10] },
      ...COMMON,
    ],
    defaults: { timeframe: "M15", magic: 1 },
  },
  rsi_reversion: {
    label: "RSI mean reversion",
    description: "Wilder RSI on closed bars: buy when it falls below the oversold level, sell when it rises above the overbought level.",
    params: [
      { key: "rsiPeriod", label: "RSI period", step: 1, min: 2, def: 14, opt: [7, 21, 7] },
      { key: "oversold", label: "Oversold", step: 1, min: 1, def: 30, opt: [20, 35, 5] },
      { key: "overbought", label: "Overbought", step: 1, min: 1, def: 70, opt: [65, 80, 5] },
      ...COMMON,
    ],
    defaults: { timeframe: "M15", magic: 2, takeProfitPoints: 300 },
  },
  donchian_breakout: {
    label: "Donchian breakout",
    description: "Buy a close above the highest high of the previous N bars, sell a close below the lowest low.",
    params: [{ key: "lookback", label: "Lookback (bars)", step: 1, min: 2, def: 20, opt: [10, 60, 10] }, ...COMMON],
    defaults: { timeframe: "H1", magic: 3, stopLossPoints: 400, takeProfitPoints: 800 },
  },
};

export function defaultParams(name) {
  const s = STRATEGIES[name];
  const p = { magic: 1 };
  for (const d of s.params) if (d.def !== undefined) p[d.key] = d.def;
  return { ...p, ...s.defaults };
}

/** Form field -> engine config key (the section.key names of broker.cfg). */
export const CONFIG_KEYS = {
  initialBalance: "account.initial_balance", leverage: "account.leverage",
  commissionPerLot: "costs.commission_per_lot", slippagePoints: "costs.slippage_points",
  swapLong: "symbol.swap_long", swapShort: "symbol.swap_short",
  openMs: "latency.open_ms", closeMs: "latency.close_ms", jitterMs: "latency.jitter_ms", seed: "latency.seed",
};

/** Engine parameter name as it appears in a .set file. */
export const setName = (key) => key[0].toUpperCase() + key.slice(1);

// ------------------------------------------------------------------ the module

const enc = new TextEncoder(), dec = new TextDecoder();
let wasm = null;
let brokerCfg = [];

/** Load the engine. `wasmSource` is a URL or the bytes; `brokerText` is the contents of broker.cfg. */
export async function initEngine(wasmSource, brokerText) {
  const bytes = typeof wasmSource === "string" ? await (await fetch(wasmSource)).arrayBuffer() : wasmSource;
  wasm = (await WebAssembly.instantiate(bytes, {})).instance.exports;
  brokerCfg = parseCfg(brokerText);
  return { wasmBytes: bytes.byteLength };
}

/** broker.cfg: `[section]` headers and `key = value ; comment` lines -> [["section.key", "value"], ...] */
export function parseCfg(text) {
  const out = []; let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[;#].*$/, "").trim();
    if (!line) continue;
    const m = /^\[(.+)\]$/.exec(line);
    if (m) { section = m[1].trim(); continue; }
    const i = line.indexOf("=");
    if (i > 0) out.push([(section ? section + "." : "") + line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return out;
}

function call(fn, bytes, ...extra) {
  const p = wasm.mt5_alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, p, bytes.length).set(bytes);
  try { return fn(p, bytes.length, ...extra); } finally { wasm.mt5_free(p, bytes.length); }
}
const readOut = (n) => JSON.parse(dec.decode(new Uint8Array(wasm.memory.buffer, wasm.mt5_out_ptr(), n)));

// ------------------------------------------------------------------ data

/**
 * Hand an MT5 tick CSV to the engine. The bid prices are decoded once more in JS, only so the page can draw a
 * price chart; every number in a result comes from the engine.
 */
export function loadTicks(text, digits) {
  const info = readOut(call(wasm.mt5_load_csv, enc.encode(text), digits));
  if (info.error) throw new Error(info.error);
  const scale = 10 ** digits, n = info.count;
  const t = new Float64Array(n), bid = new Float64Array(n);
  let k = 0;
  for (const line of text.split("\n")) {
    if (!line || line.charCodeAt(0) === 60) continue;
    const c = line.split(","), d = c[0].split("."), tm = c[1] && c[1].split(/[:.]/);
    const b = parseFloat(c[2]);
    if (d.length < 3 || !tm || tm.length < 3 || !(b > 0) || !(parseFloat(c[3]) > 0) || k >= n) continue;
    t[k] = Date.UTC(+d[0], +d[1] - 1, +d[2], +tm[0], +tm[1], +tm[2], tm[3] ? +tm[3].padEnd(3, "0").slice(0, 3) : 0);
    bid[k++] = Math.round(b * scale) / scale;
  }
  return { digits, count: n, first: info.first_ms, last: info.last_ms, bad: info.bad, backwards: info.backwards, t, bid, k };
}

export function parseDate(s) {
  const m = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/.exec(String(s).trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
}
const pad = (x) => String(x).padStart(2, "0");
const engineDate = (ms) => {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};

// ------------------------------------------------------------------ one pass

const KINDS = { out: "out", out_sl: "sl", out_tp: "tp", stop_out: "stopout", end_of_test: "end", in: "in" };

/** The exact request the engine receives (also shown on the page as the equivalent `mt5bt run` command). */
export function buildRequest(cfg, strategy, params, fromMs, toMs, detail = true) {
  const overrides = Object.entries(cfg).filter(([k]) => CONFIG_KEYS[k]).map(([k, v]) => [CONFIG_KEYS[k], String(v)]);
  return {
    config: [...brokerCfg, ...overrides], strategy,
    params: Object.entries(params).map(([k, v]) => [setName(k), String(v)]),
    from: engineDate(fromMs), to: engineDate(toMs), detail,
  };
}

/** Run one backtest in the engine. `fromMs`/`toMs` bound the traded window; earlier ticks only warm up the indicators. */
export function runBacktest(_data, cfg, strategy, params, fromMs = -Infinity, toMs = Infinity, { detail = true } = {}) {
  const t0 = performance.now();
  const r = readOut(call(wasm.mt5_run, enc.encode(JSON.stringify(buildRequest(cfg, strategy, params, fromMs, toMs, detail)))));
  if (r.error) throw new Error(r.error);
  const s = r.stats, open = new Map();
  const deals = (r.deals || []).map((d) => {
    if (d.kind === "in") open.set(d.position, d.price);
    return { ...d, side: d.buy ? 1 : -1, kind: KINDS[d.kind] || d.kind, openPrice: open.get(d.position) };
  });
  return {
    initialBalance: s.initial_balance, finalBalance: s.final_balance, netProfit: s.net_profit,
    grossProfit: s.gross_profit, grossLoss: s.gross_loss, commission: s.commission, swap: s.swap,
    trades: s.trades, wins: s.wins, losses: s.losses, stopOuts: s.stop_outs,
    profitFactor: s.profit_factor ?? Infinity, winRate: s.win_rate, avgWin: s.avg_win, avgLoss: s.avg_loss,
    expectedPayoff: s.expected_payoff, maxDdAbs: s.max_dd_abs, maxDdRel: s.max_dd_rel_pct, minEquity: s.min_equity,
    rejects: Object.fromEntries(s.rejects), warnings: r.warnings, deals, curve: r.curve || [], ms: performance.now() - t0,
  };
}
