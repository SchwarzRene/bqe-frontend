// Backtest Lab UI. All computation happens in engine.js, in this browser tab.
import { STRATEGIES, defaultParams, runBacktest, parseTicksCsv, parseDate } from "./engine.js";

const $ = (id) => document.getElementById(id);
const EXAMPLE_URL = "/research/backtest-lab/data/example_ticks.csv";
const EXAMPLE_DIGITS = 5;

let data = null;            // parsed ticks
let params = null;          // current strategy parameters
let stratName = "sma_crossover";
let optRun = 0;             // token to cancel a running optimisation

// ------------------------------------------------------------------ helpers
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "∞");
const signCls = (x) => (x > 0 ? "pos" : x < 0 ? "neg" : "");
const dateStr = (ms) => new Date(ms).toISOString().slice(0, 10);
const timeStr = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
const setStatus = (el, msg, err = false) => { el.textContent = msg; el.classList.toggle("err", err); };
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

function config() {
  const num = (id) => Number($(id).value);
  return {
    initialBalance: num("c_initialBalance"), leverage: num("c_leverage"), commissionPerLot: num("c_commissionPerLot"),
    slippagePoints: num("c_slippagePoints"), swapLong: num("c_swapLong"), swapShort: num("c_swapShort"),
    openMs: num("c_openMs"), closeMs: num("c_closeMs"), jitterMs: num("c_jitterMs"), seed: num("c_seed"),
  };
}
const window_ = () => [parseDate($("from").value), parseDate($("to").value)];

// ------------------------------------------------------------------ data
function setData(d, label) {
  data = d;
  const first = d.t[0], last = d.t[d.count - 1];
  $("dataInfo").textContent = `${label}: ${d.count.toLocaleString("en-US")} ticks, ${timeStr(first)} → ${timeStr(last)} UTC` +
    (d.bad ? `, ${d.bad} bad lines skipped` : "") + (d.backwards ? `, ⚠ ${d.backwards} ticks go backwards in time` : "") + ".";
  // default window: skip the first days (indicator warm-up) and keep the last 30 % as forward test
  const span = last - first, warm = Math.min(5 * 86400000, span * 0.1);
  $("from").value = dateStr(first + warm);
  $("to").value = dateStr(last + 86400000);
  $("splitDate").value = dateStr(first + warm + (last + 86400000 - first - warm) * 0.65);
  $("run").disabled = false; $("optimize").disabled = false;
}

async function loadExample() {
  setStatus($("runStatus"), "");
  try {
    const res = await fetch(EXAMPLE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setData(parseTicksCsv(await res.text(), EXAMPLE_DIGITS), "Example dataset (random EURUSD-like walk)");
    $("useExample").hidden = true;
    applyExampleWindow();
  } catch (e) {
    $("dataInfo").textContent = "Could not load the example dataset: " + e.message;
    $("dataInfo").classList.add("neg");
  }
}
// the window used in the README / tests: Jan 15 – Feb 20, forward test from Feb 5
function applyExampleWindow() {
  $("from").value = "2024-01-15"; $("to").value = "2024-02-21"; $("splitDate").value = "2024-02-05";
}

$("ownFile").addEventListener("change", async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const digits = Number($("ownDigits").value);
  setStatus($("runStatus"), "Reading file…");
  try {
    const d = parseTicksCsv(await f.text(), digits);
    if (d.count < 100) throw new Error("fewer than 100 valid ticks found (check the format and the digits)");
    setData(d, `${f.name}`);
    $("useExample").hidden = false;
    setStatus($("runStatus"), "");
  } catch (e) { setStatus($("runStatus"), e.message, true); }
});
$("useExample").addEventListener("click", () => { $("ownFile").value = ""; loadExample(); });

// ------------------------------------------------------------------ strategy form
function buildParamForm() {
  const s = STRATEGIES[stratName];
  $("stratDesc").textContent = s.description;
  const box = $("params"); box.replaceChildren();
  for (const d of s.params) {
    const row = document.createElement("div"); row.className = "field";
    const label = document.createElement("label"); label.textContent = d.label; label.htmlFor = "p_" + d.key;
    let input;
    if (d.type === "select") {
      input = document.createElement("select");
      for (const o of d.options) input.add(new Option(o, o));
      input.value = params[d.key];
    } else {
      input = document.createElement("input"); input.type = "number"; input.step = d.step; input.min = d.min; input.value = params[d.key];
    }
    input.id = "p_" + d.key;
    input.addEventListener("change", () => { params[d.key] = d.type === "select" ? input.value : Number(input.value); });
    row.append(label, input); box.append(row);
  }
  // optimiser ranges
  const rg = $("ranges"); rg.replaceChildren();
  for (const d of s.params.filter((p) => p.opt)) {
    const row = document.createElement("div"); row.className = "rangegrid"; row.dataset.key = d.key;
    const name = document.createElement("span"); name.textContent = d.label;
    row.append(name);
    const [start, stop, step] = d.opt; // engine.js stores [start, stop, step]; the form is start / step / stop
    [start, step, stop].forEach((v, i) => {
      const inp = document.createElement("input"); inp.type = "number"; inp.value = v; inp.step = d.step;
      inp.setAttribute("aria-label", `${d.label} ${["start", "step", "stop"][i]}`);
      row.append(inp);
    });
    rg.append(row);
  }
}
function selectStrategy(name) {
  stratName = name; params = defaultParams(name); buildParamForm();
}
for (const [k, s] of Object.entries(STRATEGIES)) $("strategy").add(new Option(s.label, k));
$("strategy").addEventListener("change", (e) => selectStrategy(e.target.value));

// ------------------------------------------------------------------ single run
function stat(k, v, cls = "") {
  const d = document.createElement("div"); d.className = "stat";
  d.innerHTML = '<div class="k"></div><div class="v"></div>';
  d.firstChild.textContent = k; d.lastChild.textContent = v; if (cls) d.lastChild.className = "v " + cls;
  return d;
}

let charts = {};
function chartBase(el) {
  const c = LightweightCharts.createChart(el, {
    autoSize: true,
    layout: { background: { color: "#070B15" }, textColor: "#A8B6C9" },
    grid: { vertLines: { color: "rgba(240,180,41,0.06)" }, horzLines: { color: "rgba(240,180,41,0.06)" } },
    rightPriceScale: { borderColor: "rgba(240,180,41,0.18)" },
    timeScale: { borderColor: "rgba(240,180,41,0.18)", timeVisible: true, secondsVisible: false },
  });
  return c;
}

function drawCharts(r, tf) {
  for (const k of Object.keys(charts)) { charts[k].remove(); }
  charts = {};
  // equity
  const eq = chartBase($("equityChart"));
  const bal = eq.addLineSeries({ color: "#7C8DA6", lineWidth: 1, priceLineVisible: false, title: "balance" });
  const equity = eq.addLineSeries({ color: "#F0B429", lineWidth: 2, priceLineVisible: false, title: "equity" });
  const seen = new Set(); const eqd = [], bld = [];
  for (const [t, b, e] of r.curve) {
    const s = Math.floor(t / 1000); if (seen.has(s)) continue; seen.add(s);
    eqd.push({ time: s, value: e }); bld.push({ time: s, value: b });
  }
  equity.setData(eqd); bal.setData(bld); eq.timeScale().fitContent();
  // price
  const pc = chartBase($("priceChart"));
  const candles = pc.addCandlestickSeries({ upColor: "#6EE796", downColor: "#F87171", borderVisible: false, wickUpColor: "#6EE796", wickDownColor: "#F87171", priceLineVisible: false });
  const [fromMs, toMs] = window_();
  const ms = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440 }[tf] * 60000;
  const bars = []; let cur = null;
  const { t, bid, count, digits } = data, inv = 10 ** -digits;
  for (let i = 0; i < count; i++) {
    if (t[i] < fromMs) continue; if (t[i] >= toMs) break;
    const o = t[i] - (t[i] % ms), p = bid[i] * inv;
    if (cur && cur.time === o / 1000) { if (p > cur.high) cur.high = p; if (p < cur.low) cur.low = p; cur.close = p; }
    else { cur = { time: o / 1000, open: p, high: p, low: p, close: p }; bars.push(cur); }
  }
  candles.setData(bars);
  const markers = [];
  for (const d of r.deals) {
    const time = Math.floor(d.time / 1000 / (ms / 1000)) * (ms / 1000);
    const long = d.side > 0;
    if (d.kind === "in") markers.push({ time, position: long ? "belowBar" : "aboveBar", shape: long ? "arrowUp" : "arrowDown", color: long ? "#6EE796" : "#F87171", size: 1 });
    else markers.push({ time, position: long ? "aboveBar" : "belowBar", shape: "circle", color: d.net >= 0 ? "#FFD166" : "#7C8DA6", size: 1 });
  }
  markers.sort((a, b) => a.time - b.time);
  if (markers.length <= 800) candles.setMarkers(markers);
  pc.timeScale().fitContent();
  charts = { eq, pc };
}

function drawDeals(deals) {
  const rows = deals.filter((d) => d.kind !== "in").reverse().slice(0, 300);
  const t = $("deals");
  t.innerHTML = "<thead><tr><th>Closed</th><th>Side</th><th>Lots</th><th>Open</th><th>Close</th><th>Exit</th><th>Profit</th><th>Comm.</th><th>Swap</th><th>Net</th></tr></thead>";
  const body = document.createElement("tbody");
  const dg = data.digits, inv = 10 ** -dg;
  for (const d of rows) {
    const tr = document.createElement("tr");
    const cells = [timeStr(d.time), d.side > 0 ? "buy" : "sell", d.lots.toFixed(2), (d.openPrice * inv).toFixed(dg), (d.price * inv).toFixed(dg),
      { sl: "stop loss", tp: "take profit", out: "signal", stopout: "stop-out", end: "end of test" }[d.kind], fmt(d.profit), fmt(d.commission), fmt(d.swap), fmt(d.net)];
    cells.forEach((c, i) => { const td = document.createElement("td"); td.textContent = c; if (i === 9) td.className = signCls(d.net); tr.append(td); });
    body.append(tr);
  }
  t.append(body);
}

function showResult(r, tf, ms) {
  $("placeholder").hidden = true; $("out").hidden = false;
  const s = $("stats"); s.replaceChildren(
    stat("Net profit", fmt(r.netProfit), signCls(r.netProfit)),
    stat("Final balance", fmt(r.finalBalance)),
    stat("Profit factor", Number.isFinite(r.profitFactor) ? fmt(r.profitFactor, 3) : "∞"),
    stat("Trades", String(r.trades)),
    stat("Win rate", fmt(r.winRate, 1) + " %"),
    stat("Avg win / loss", `${fmt(r.avgWin)} / ${fmt(r.avgLoss)}`),
    stat("Expected payoff", fmt(r.expectedPayoff, 3), signCls(r.expectedPayoff)),
    stat("Max equity DD", `${fmt(r.maxDdAbs)} (${fmt(r.maxDdRel)} %)`),
    stat("Commission", fmt(r.commission)),
    stat("Swap", fmt(r.swap)),
    stat("Stop-outs", String(r.stopOuts), r.stopOuts ? "neg" : ""),
    stat("Run time", `${ms.toFixed(0)} ms`),
  );
  drawCharts(r, tf);
  drawDeals(r.deals);
  const rej = Object.entries(r.rejects).map(([k, v]) => `${v}× ${k}`).join(", ");
  setStatus($("runStatus"), rej ? "Rejected requests: " + rej : "");
}

$("run").addEventListener("click", async () => {
  if (!data) return;
  const [from, to] = window_();
  if (!(from < to)) return setStatus($("runStatus"), "“From” must be before “To”.", true);
  setStatus($("runStatus"), "Running…"); await nextFrame();
  try {
    const t0 = performance.now();
    const r = runBacktest(data, config(), stratName, params, from, to);
    showResult(r, params.timeframe, performance.now() - t0);
  } catch (e) { setStatus($("runStatus"), e.message, true); }
});

// ------------------------------------------------------------------ optimiser
function rangeValues(start, step, stop) {
  const out = [];
  if (!(step > 0) || stop < start) return [start];
  for (let v = start; v <= stop + 1e-9; v += step) out.push(Math.round(v * 1e8) / 1e8);
  return out;
}

function gridFromForm() {
  const axes = [];
  for (const row of $("ranges").children) {
    const [a, b, c] = [...row.querySelectorAll("input")].map((i) => Number(i.value));
    axes.push([row.dataset.key, rangeValues(a, b, c)]);
  }
  let combos = [{}];
  for (const [k, vals] of axes) combos = combos.flatMap((c) => vals.map((v) => ({ ...c, [k]: v })));
  return { axes, combos };
}

$("stopOpt").addEventListener("click", () => { optRun++; });

$("optimize").addEventListener("click", async () => {
  if (!data) return;
  const [from, to] = window_(), split = parseDate($("splitDate").value);
  if (!(from < split && split < to)) return setStatus($("optStatus"), "Need From < split date < To.", true);
  const { axes, combos } = gridFromForm();
  if (combos.length > 20000) return setStatus($("optStatus"), `${combos.length} combinations is too many for the browser (max 20 000).`, true);
  const cfg = config(), minTrades = Number($("minTrades").value), token = ++optRun;
  $("optimize").disabled = true; $("stopOpt").disabled = false;
  const results = []; let failed = 0, done = 0; const t0 = performance.now();
  let lastYield = t0;
  for (const c of combos) {
    if (token !== optRun) break;
    const p = { ...params, ...c };
    try {
      const r = runBacktest(data, cfg, stratName, p, from, split);
      if (r.trades >= minTrades) results.push({ p, net: r.netProfit, trades: r.trades, pf: r.profitFactor, dd: r.maxDdRel });
    } catch { failed++; }
    done++;
    if (performance.now() - lastYield > 50) {
      $("optBar").style.width = (done / combos.length * 100) + "%";
      setStatus($("optStatus"), `${done} / ${combos.length} passes…`);
      await nextFrame(); lastYield = performance.now();
    }
  }
  $("optBar").style.width = token === optRun ? "100%" : "0%";
  results.sort((a, b) => b.net - a.net);
  const top = results.slice(0, 10);
  for (const r of top) {
    const f = runBacktest(data, cfg, stratName, r.p, split, to);
    r.fNet = f.netProfit; r.fTrades = f.trades;
  }
  showOptimisation(axes.map((a) => a[0]), top);
  const secs = (performance.now() - t0) / 1000;
  setStatus($("optStatus"), `${done} passes in ${secs.toFixed(1)} s (${(done / Math.max(secs, 1e-3)).toFixed(0)} passes/s)` +
    (token !== optRun ? " — stopped" : "") + (failed ? `, ${failed} invalid combinations skipped` : "") + (results.length ? "" : " — no candidate reached the minimum trade count"));
  $("optimize").disabled = false; $("stopOpt").disabled = true;
});

function showOptimisation(keys, rows) {
  const t = $("optTable");
  $("optWrap").hidden = !rows.length; $("optHint").hidden = !rows.length;
  const labels = Object.fromEntries(STRATEGIES[stratName].params.map((d) => [d.key, d.label]));
  t.innerHTML = "<thead><tr><th>#</th>" + keys.map((k) => `<th>${labels[k]}</th>`).join("") +
    "<th>In-sample net</th><th>Trades</th><th>PF</th><th>DD %</th><th>Forward net</th><th>Fwd trades</th></tr></thead>";
  const body = document.createElement("tbody");
  rows.forEach((r, i) => {
    const tr = document.createElement("tr"); tr.className = "pick"; tr.tabIndex = 0;
    const cells = [i + 1, ...keys.map((k) => r.p[k]), fmt(r.net), r.trades, Number.isFinite(r.pf) ? fmt(r.pf, 2) : "∞", fmt(r.dd), fmt(r.fNet), r.fTrades];
    cells.forEach((c, j) => {
      const td = document.createElement("td"); td.textContent = c;
      if (j === cells.length - 2) td.className = signCls(r.fNet);
      if (j === keys.length + 1) td.className = signCls(r.net);
      tr.append(td);
    });
    const apply = () => {
      Object.assign(params, r.p); buildParamForm();
      $("run").scrollIntoView({ behavior: "smooth", block: "center" });
      setStatus($("runStatus"), "Parameters loaded — press Run backtest.");
    };
    tr.addEventListener("click", apply);
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apply(); } });
    body.append(tr);
  });
  t.append(body);
}

// ------------------------------------------------------------------ boot
selectStrategy("sma_crossover");
loadExample();
