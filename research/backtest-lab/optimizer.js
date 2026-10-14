"use strict";
// ---------------------------------------------------------------- OPTIMIZER
// 1. buildOptimizePanel(): the "Optimize" tab of the New-run form (search space + search settings)
// 2. viewOptimizations(): list page
// 3. viewOptimization(id): live progress, results table, charts, forward test, actions
// Uses the globals of app.js (h, api, form, strategyDef, ...) at call time only.

const defaultOpt = () => ({ algo: "auto", max_passes: "5000", population: "64", generations: "200", patience: "15", seed: "1", criterion: "custom", min_trades: "30", threads: "", forward_from: "", forward_to: "", forward_top: "10" });
const isNumStr = x => x !== "" && x != null && isFinite(+x);
function rangeCount(r) {
  const s = +r.start, st = +r.step, e = +r.stop;
  if (!isNumStr(r.start) || !isNumStr(r.step) || !isNumStr(r.stop) || !(st > 0) || !(e > s)) return 0;
  return Math.floor((e - s) / st + 1e-9) + 1;
}
function bigNum(n) {
  if (!isFinite(n)) return "-";
  if (n < 1e6) return Math.round(n).toLocaleString("en");
  return n.toExponential(2).replace("e+", " x 10^");
}
function autoRange(cur) {
  const v = +cur;
  if (Number.isInteger(v) && !String(cur).includes(".")) {
    const a = Math.max(v > 0 ? 1 : Math.round(v * 1.5), Math.round(v * 0.5)), b = Math.max(a + 1, Math.round(v * 1.5));
    return { start: String(a), step: String(Math.max(1, Math.round((b - a) / 10))), stop: String(b) };
  }
  const a = v === 0 ? 0 : +(v * 0.5).toPrecision(3), b = v === 0 ? 1 : +(v * 1.5).toPrecision(3);
  return { start: String(a), step: String(+((b - a) / 10).toPrecision(2)), stop: String(b) };
}
// `.set` text of the current parameters, with ranges for the ticked ones (so saved presets keep the search space)
function paramsAsSetText() {
  return Object.entries(form.params).map(([k, val]) => {
    const r = form.ranges && form.ranges[k];
    return r && rangeCount(r) ? k + "=" + val + "||" + r.start + "||" + r.step + "||" + r.stop + "||" + (r.on ? "Y" : "N") : k + "=" + val;
  }).join("\n") + "\n";
}
// ranges read from a loaded .set file -> form.ranges (only parameters of the current strategy)
function applySetRanges(ranges) {
  form.ranges = {};
  let n = 0;
  for (const r of ranges || []) {
    const k = canonicalParam(form.strategy, r.name); if (!k) continue;
    const ok = r.step > 0 && r.stop > r.start;
    form.ranges[k] = { on: !!(r.optimize && ok), start: String(r.start), step: String(r.step), stop: String(r.stop) };
    if (form.ranges[k].on) n++;
  }
  return n;
}

function buildOptimizePanel(getBase, hooks) {
  form.opt = Object.assign(defaultOpt(), form.opt || {});
  form.ranges = form.ranges || {};
  const root = h("div"), tableBox = h("div"), summary = h("div", { class: "card", style: "margin:10px 0" });
  const enabled = () => Object.entries(form.ranges).filter(([k, r]) => r.on && form.params[k] !== undefined);
  function update() {
    const en = enabled(); let size = 1; const bad = [];
    for (const [k, r] of en) { const n = rangeCount(r); if (!n) bad.push(k); size *= Math.max(n, 1); }
    const max = +form.opt.max_passes || 5000;
    summary.innerHTML = "";
    if (!en.length) { summary.append(h("div", { class: "muted" }, "Tick the parameters to search (and give each a start / step / stop). All other parameters stay at the value shown on the Strategy tab.")); return; }
    const algo = form.opt.algo === "auto" ? (size <= max ? "grid" : "genetic") : form.opt.algo;
    summary.append(h("div", {}, h("b", {}, en.length + " parameters, " + bigNum(size) + " combinations"), "  ->  ", h("b", {}, algo), algo === "grid" ? " (every combination is run)" : " (searches up to " + bigNum(max) + " passes)",
      algo === "grid" && size > max ? h("span", { class: "bad" }, "  - more than 'Max passes'; raise it or use genetic") : null,
      bad.length ? h("div", { class: "bad small" }, "Invalid range (need numbers, step > 0, stop > start): " + bad.join(", ")) : null));
  }
  function render() {
    tableBox.innerHTML = "";
    const d = strategyDef(form.strategy);
    const keys = [...new Set([...(d ? d.params.map(p => p.key) : []), ...Object.keys(form.params)])].filter(k => isNumStr(form.params[k]));
    const t = h("table", {}, h("tr", {}, ...["Search", "Parameter", "Current value", "Start", "Step", "Stop", "Values", ""].map(x => h("th", {}, x))));
    for (const k of keys) {
      const r = form.ranges[k] || (form.ranges[k] = { on: false, start: "", step: "", stop: "" });
      const cnt = h("td", { class: "num" }, rangeCount(r) || "");
      const cb = h("input", { type: "checkbox", checked: r.on });
      const inp = f => { const x = h("input", { class: "numin", value: r[f] || "" }); x.addEventListener("input", () => { r[f] = x.value; cnt.textContent = rangeCount(r) || ""; saveForm(); update(); }); return x; };
      const ins = { start: inp("start"), step: inp("step"), stop: inp("stop") };
      cb.onchange = () => { r.on = cb.checked; if (r.on && !rangeCount(r)) { Object.assign(r, autoRange(form.params[k])); for (const f of ["start", "step", "stop"]) ins[f].value = r[f]; cnt.textContent = rangeCount(r) || ""; } saveForm(); update(); };
      t.append(h("tr", {}, h("td", {}, cb), h("td", {}, h("b", {}, k)), h("td", { class: "num" }, form.params[k]), h("td", {}, ins.start), h("td", {}, ins.step), h("td", {}, ins.stop), cnt,
        h("td", {}, h("button", { title: "fill start / step / stop with +-50% around the current value", onclick: () => { Object.assign(r, autoRange(form.params[k])); for (const f of ["start", "step", "stop"]) ins[f].value = r[f]; cnt.textContent = rangeCount(r) || ""; saveForm(); update(); } }, "+-50%"))));
    }
    tableBox.append(h("div", { class: "tablewrap", style: "max-height:380px" }, t));
    update();
  }
  // load parameter values AND search ranges (Name=value||start||step||stop||Y) from a .set file, right here
  const setPick = h("select", { title: "saved .set files" }, h("option", { value: "" }, "(choose a saved .set file)"), ...((hooks && hooks.files) || []).map(n => h("option", { value: n, selected: n === form.setFile }, n)));
  const applySet = guard(async name => { hooks.setSel.value = name; await hooks.setSel.onchange(); render(); });
  setPick.onchange = () => { if (setPick.value) applySet(setPick.value); };
  const upSet = h("input", { type: "file", accept: ".set,.txt", style: "display:none", onchange: guard(async () => {
    const f = upSet.files[0]; if (!f) return;
    await api("files/set/" + encodeURIComponent(f.name), { method: "POST", body: new Blob([await f.arrayBuffer()]) });
    for (const s of [hooks.setSel, setPick]) if (![...s.options].some(o => o.value === f.name)) s.append(h("option", { value: f.name }, f.name));
    setPick.value = f.name; upSet.value = ""; await applySet(f.name);
  }) });
  const setBar = h("div", { class: "setbar" }, h("b", { class: "small" }, "Parameters from a .set file"), setPick, h("button", { class: "primary", onclick: () => upSet.click() }, "Upload .set file"), upSet,
    h("span", { class: "muted small" }, "fills the parameter values and the search ranges (Y-flagged lines are ticked) from the file"));
  const opt = form.opt;
  const fld = (label, key, w, help) => { const x = h("input", { value: opt[key], style: "width:" + w + "px" }); x.oninput = () => { opt[key] = x.value; saveForm(); update(); }; return h("label", { class: "f", title: help || "" }, label, x); };
  const sel = (label, key, options, help) => { const x = h("select", {}, ...options.map(([v, l]) => h("option", { value: v, selected: v === opt[key] }, l))); x.onchange = () => { opt[key] = x.value; saveForm(); update(); }; return h("label", { class: "f", title: help || "" }, label, x); };
  const runBtn = h("button", { class: "primary", onclick: guard(async () => {
    const base = getBase(); if (!base.dataset) throw new Error("choose a dataset");
    const en = enabled(); if (!en.length) throw new Error("tick at least one parameter to search");
    const bad = en.filter(([, r]) => !rangeCount(r)).map(([k]) => k); if (bad.length) throw new Error("invalid range: " + bad.join(", "));
    const body = Object.assign({}, base, { name: form.name || ("opt " + (base.strategy || "")), ranges: en.map(([k, r]) => ({ name: k, start: r.start, step: r.step, stop: r.stop })), opt: Object.assign({}, form.opt) });
    const r = await api("optimizations", { body }); location.hash = "#optimization/" + r.id;
  }) }, "Run optimization");
  root.append(
    h("h2", {}, "Optimizer: search the best parameter values"),
    h("div", { class: "muted small" }, "Each pass is a complete, tick-accurate backtest. Passes run in parallel on all cores over one shared tick mapping. In-sample period = the From / To above (indicator warm-up is loaded automatically). Numeric parameters only; everything else stays fixed."),
    setBar, tableBox, summary,
    h("div", { class: "row gap-lg", style: "flex-wrap:wrap; align-items:flex-end" },
      sel("Algorithm", "algo", [["auto", "auto (grid if it fits, else genetic)"], ["grid", "grid (all combinations)"], ["genetic", "genetic"]], "genetic = MT5-style: selection, crossover, mutation; never repeats a pass"),
      sel("Optimize for", "criterion", [["custom", "strategy criterion (OnTester)"], ["profit", "net profit"], ["pf", "profit factor"], ["recovery", "recovery factor (profit / drawdown)"]], "custom = the EA's own OnTester value; falls back to net profit"),
      fld("Max passes", "max_passes", 80, "hard cap of backtest passes"),
      fld("Min trades", "min_trades", 60, "passes with fewer trades are rejected"),
      fld("Population", "population", 60, "genetic only"), fld("Generations", "generations", 70, "genetic only"), fld("Patience", "patience", 60, "genetic: stop after this many generations without improvement"),
      fld("Seed", "seed", 50, "same seed = same search"), fld("Threads", "threads", 55, "empty = all cores")),
    h("h3", {}, "Forward test (optional)"),
    h("div", { class: "muted small" }, "The best candidates are re-run on a later period they were not optimized on. Leave empty to skip."),
    h("div", { class: "row gap-lg", style: "align-items:flex-end" }, fld("Forward from", "forward_from", 110, "e.g. 2026.01.01"), fld("Forward to", "forward_to", 110, "empty = end of data"), fld("Test best N", "forward_top", 60, "")),
    h("div", { class: "row", style: "margin-top:14px" }, runBtn, h("span", { class: "muted small" }, "Results page shows live progress; you can leave and come back.")));
  return { el: root, render };
}

// Score of every finished pass in the order the passes finished: dots, the best score so far and a moving average,
// so you can see whether the search keeps finding better candidates. pts rows: [score, net, DD %, trades, [values]]
function scoreByPassChart(host, names) {
  const chart = new XYChart(host, { height: 240, time: false, yFmt: v => num(v, 2) });
  host.append(legend([{ color: cssVar("--c1"), name: "score of a pass" }, { color: cssVar("--c2"), name: "best score so far" }, { color: cssVar("--c3"), name: "moving average" }]));
  return {
    set(pts) {
      const n = pts.length; if (!n) return;
      const xs = pts.map((_, i) => i + 1), sc = pts.map(p => p[0]);
      let m = -Infinity; const best = sc.map(v => (m = Math.max(m, v)));
      const w = Math.max(5, Math.min(200, Math.round(n / 25)));
      const avg = [], win = []; let sum = 0;
      for (const v of sc) { win.push(v); sum += v; if (win.length > w) sum -= win.shift(); avg.push(sum / win.length); }
      const step = n > 4000 ? Math.ceil(n / 4000) : 1, c1 = cssVar("--c1"), dots = [];
      pts.forEach((p, i) => { if (i % step) return;
        dots.push({ x: i + 1, y: p[0], r: 3, color: c1, info: "<b>pass " + (i + 1) + "</b>  score " + num(p[0], 3) + "<br>net " + money(p[1]) + "  DD " + num(p[2], 2) + " %  trades " + p[3] + (names && p[4] ? "<br>" + names.map((nm, k) => nm + "=" + p[4][k]).join("  ") : "") }); });
      chart.set([{ type: "markers", scatter: true, pts: dots },
        { type: "line", name: "best so far", x: xs, y: best, step: true, color: cssVar("--c2"), width: 2 },
        { type: "line", name: "average of the last " + w, x: xs, y: avg, color: cssVar("--c3"), width: 1.6 }]);
    },
  };
}

// small right-click menu: items = [{label, onclick, hidden?}]
function showContextMenu(ev, title, items) {
  ev.preventDefault();
  document.querySelectorAll(".ctxmenu").forEach(m => m.remove());
  const menu = h("div", { class: "ctxmenu" }, title ? h("div", { class: "ctxtitle" }, title) : null,
    ...items.filter(i => !i.hidden).map(i => h("button", { class: "ctxitem", onclick: () => { close(); i.onclick(); } }, i.label)));
  document.body.append(menu);
  const w = menu.offsetWidth, hh = menu.offsetHeight;
  menu.style.left = Math.max(4, Math.min(ev.clientX, innerWidth - w - 8)) + "px";
  menu.style.top = Math.max(4, Math.min(ev.clientY, innerHeight - hh - 8)) + "px";
  function close() { menu.remove(); document.removeEventListener("mousedown", away, true); document.removeEventListener("keydown", esc, true); window.removeEventListener("scroll", close, true); }
  const away = e => { if (!menu.contains(e.target)) close(); }, esc = e => { if (e.key === "Escape") close(); };
  setTimeout(() => { document.addEventListener("mousedown", away, true); document.addEventListener("keydown", esc, true); window.addEventListener("scroll", close, true); }, 0);
}

// ---------------------------------------------------------------- list
const statusBadge = s => h("span", { class: "badge " + s }, s);
async function viewOptimizations(v) {
  v.append(h("div", { class: "row" }, h("h1", { style: "margin:0" }, "Optimizations"), h("span", { class: "spacer" }), h("a", { class: "btn primary", href: "#new/optimize" }, "+ New optimization")));
  const box = h("div", { class: "card" }); v.append(box);
  async function load() {
    const list = await api("optimizations"); box.innerHTML = "";
    if (!list.length) { box.append(h("div", { class: "muted" }, "No optimizations yet. Tick parameters on the Optimize tab of 'New run'.")); return; }
    const t = h("table", {}, h("tr", {}, ...["Name", "Strategy / data", "Search space", "Algorithm", "State", "Best score", "Best net profit", "Started", ""].map(x => h("th", {}, x))));
    for (const o of list) {
      const p = o.progress, s = o.summary || {};
      const state = (o.status === "running" || o.status === "queued") && p ? h("div", {}, statusBadge(o.status), " ", p.done + " / " + (p.total || "?") + " passes", p.phase === "forward" ? " (forward test)" : "")
        : h("div", {}, statusBadge(o.status), s.passes != null ? " " + s.passes + " passes" : "", o.status === "error" ? h("div", { class: "small bad" }, o.error) : null);
      t.append(h("tr", { class: "click", onclick: () => location.hash = "#optimization/" + o.id },
        h("td", {}, h("b", {}, o.name)), h("td", {}, o.strategy, h("span", { class: "sub" }, o.dataset)),
        h("td", {}, o.space.params.length + " parameters, " + bigNum(o.space.size) + " combinations"), h("td", {}, o.algo), h("td", {}, state),
        h("td", { class: "num" }, p && p.best != null ? num(p.best, 3) : s.best_score != null ? num(s.best_score, 3) : ""), h("td", { class: "num" }, s.best_net_profit != null ? money(s.best_net_profit) : ""),
        h("td", {}, ago(o.created)),
        h("td", { onclick: e => e.stopPropagation() }, h("button", { class: "danger", onclick: guard(async () => { if (!confirm("Delete this optimization and its results?")) return; await api("optimizations/" + o.id, { method: "DELETE" }); load(); }) }, "delete"))));
    }
    box.append(h("div", { class: "tablewrap" }, t));
  }
  await load(); every(load, 2500);
}

// ---------------------------------------------------------------- detail
const OPT_METRICS = [["score", "Score", x => num(x, 3), 1], ["net", "Net profit", x => money(x), 1], ["pf", "Profit factor", x => num(x, 2), 1], ["ddr", "Max drawdown %", x => num(x, 2), -1], ["trades", "Trades", x => num(x, 0), 0]];

async function viewOptimization(v, id) {
  const top = h("div"), live = h("div"), body = h("div"); v.append(top, live, body);
  const liveTbl = h("div"), liveSc = h("div"); live.append(liveTbl, liveSc);
  let meta = null, res = null, rows = [], bodyDone = false;
  const samples = []; // [time ms, passes done] while running: the recent pass rate gives the time estimate
  let livePts = [], liveChart = null, liveNote = null, liveDrawn = -1, liveProg = null; // passes streamed while the search runs
  let sortKey = "rank", sortDir = 1, showN = 100, hmA = 0, hmB = 1, hmMetric = "score";
  const running = () => meta && (meta.status === "running" || meta.status === "queued");
  const paramText = (names, vals) => names.map((n, i) => n + "=" + vals[i]).join("  ");

  async function load() {
    const m = await api("optimizations/" + id + "?" + (meta && running() ? "results=0&" : "") + "since=" + livePts.length);
    meta = m;
    if (m.progress && m.progress.points) for (const pt of m.progress.points) livePts.push(pt);
    if (!running() && !res) { res = m.results || (await api("optimizations/" + id)).results; if (res) prepare(); }
    renderTop(); renderLive();
    if (!running() && res && !bodyDone) { bodyDone = true; renderBody(); }
    return !running();
  }
  function prepare() { rows = res.rows.map((r, i) => ({ rank: i + 1, score: r[0], net: r[1], pf: r[2], trades: r[3], dda: r[4], ddr: r[5], bal: r[6], v: r[7], f: r[8] })); }

  function renderTop() {
    top.innerHTML = "";
    const p = meta.progress, s = meta.summary || {};
    top.append(h("div", { class: "row" }, h("a", { href: "#optimizations" }, "< Optimizations"), h("h1", { style: "margin:0" }, meta.name), statusBadge(meta.status), h("span", { class: "spacer" }),
      running() ? h("button", { class: "danger", onclick: guard(async () => { await api("optimizations/" + id + "/cancel", { method: "POST", body: "" }); toast("Stopping after the running passes finish ..."); }) }, "Stop") : null,
      h("button", { class: "danger", onclick: guard(async () => { if (!confirm("Delete this optimization?")) return; await api("optimizations/" + id, { method: "DELETE" }); location.hash = "#optimizations"; }) }, "delete")));
    top.append(h("div", { class: "muted small", style: "margin:4px 0 10px" }, meta.strategy + " on " + meta.dataset + "  |  " + meta.space.params.length + " parameters, " + bigNum(meta.space.size) + " combinations  |  " + meta.algo + "  |  " + meta.threads + " threads  |  started " + ago(meta.created)));
    if (meta.status === "error") top.append(h("div", { class: "card bad" }, "Error: " + meta.error));
    if (running()) {
      const total = p && p.total ? p.total : 0, done = p ? p.done : 0, frac = total ? Math.min(1, done / total) : 0, el = p && p.elapsed_s;
      const genetic = meta.algo === "genetic";
      // pass rate over the last ~30 s (falls back to the average since the start)
      const now = Date.now(); samples.push([now, done]); while (samples.length > 60) samples.shift();
      const old = samples.find(s => now - s[0] <= 30000) || samples[0];
      let rate = el && done ? done / el : 0;
      if (now - old[0] >= 4000 && done > old[1]) rate = (done - old[1]) / ((now - old[0]) / 1000);
      const searchLeft = rate > 0 && done > 0 ? Math.max(0, total - done) / rate : null;
      // forward test of the best candidates: ceil(top / threads) rounds of one pass-time each, scaled by the period length
      const o = meta.request.opt || {};
      let fwdLeft = 0;
      if (o.forward_from && p && p.phase !== "forward" && rate > 0) {
        const D = s => Date.parse(String(s).trim().replace(/\./g, "-")), isLen = D(meta.request.to || "") - D(meta.request.from || "");
        const fLen = D(o.forward_to || "") - D(o.forward_from);
        const ratio = isLen > 0 && fLen > 0 ? fLen / isLen : 1, th = meta.threads || 1;
        fwdLeft = Math.ceil((+o.forward_top || 10) / th) * (th / rate) * ratio;
      }
      const left = searchLeft != null && p && p.phase !== "forward" && p.phase !== "saving" ? searchLeft + fwdLeft : null;
      const clock = left != null ? new Date(now + left * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
      const head = !p || el == null ? "Waiting for free worker threads ..." : p.phase === "forward" ? "Forward test of the best candidates ..." : p.phase === "saving" ? "Saving results ..."
        : left == null ? "Estimating the remaining time ..." : (genetic ? "At most about " : "About ") + fmtSecs(left) + " left";
      const sub = !p || el == null ? "" : done + " of " + (genetic ? "up to " : "") + total + " passes" + (p.generation != null ? "  |  generation " + p.generation : "") + (p.best != null ? "  |  best score " + num(p.best, 3) : "")
        + (el ? "  |  " + fmtSecs(el) + " elapsed" : "") + (rate ? "  |  " + num(rate, 2) + " passes/s" : "")
        + (clock ? "  |  done around " + clock : "") + (genetic && left != null ? "  |  stops earlier when there is no improvement" : "") + (fwdLeft ? "  |  includes ~" + fmtSecs(fwdLeft) + " forward test" : "");
      top.append(h("div", { class: "card etacard" }, h("div", { class: "etahead" }, head), h("div", { class: "progress" }, h("div", { style: "width:" + (frac * 100) + "%" })), h("div", { class: "small muted", style: "margin-top:6px" }, sub)));    } else if (meta.status === "done" || meta.status === "cancelled") {
      const wall = meta.wall_s || 0;
      top.append(h("div", { class: "kpis" },
        kpi("Passes", num(s.passes, 0), (s.failed ? s.failed + " failed" : "") + (s.rejected ? (s.failed ? ", " : "") + s.rejected + " rejected (min trades)" : "")),
        kpi("Best score", s.best_score != null ? num(s.best_score, 3) : "-", meta.request.opt.criterion), kpi("Best net profit", s.best_net_profit != null ? money(s.best_net_profit) : "-", ""),
        kpi("Wall time", fmtSecs(wall), num(s.passes / Math.max(wall, 1e-9), 2) + " passes/s"), kpi("Search", meta.algo, bigNum(meta.space.size) + " combinations"),
        meta.status === "cancelled" ? kpi("Stopped", "early", "partial results") : null));
      for (const w of s.warnings || []) top.append(h("div", { class: "card warn small" }, w));
      if (res && res.failed) top.append(h("div", { class: "card warn small" }, res.failed + " passes failed. First error: " + res.first_error));
    }
  }
  const kpi = (l, val, sub) => h("div", { class: "kpi" }, h("div", { class: "l" }, l), h("div", { class: "v" }, val), h("div", { class: "s" }, sub || ""));

  function renderLive() {
    liveTbl.innerHTML = "";
    const p = meta.progress;
    if (!running() || !p) { liveSc.innerHTML = ""; liveChart = null; liveProg = null; liveDrawn = -1; return; } // finished: the page below has the full charts
    if (p.live_top && p.live_top.length) {
      const names = meta.space.params.map(x => x.name);
      const t = h("table", {}, h("tr", {}, ...["#", "Score", "Net profit", "PF", "Trades", "DD %", "Parameters"].map(x => h("th", {}, x))));
      p.live_top.forEach((r, i) => t.append(h("tr", {}, h("td", {}, i + 1), h("td", { class: "num" }, num(r.score, 3)), h("td", { class: "num " + signCls(r.net_profit) }, money(r.net_profit)), h("td", { class: "num" }, num(r.profit_factor, 2)), h("td", { class: "num" }, r.trades), h("td", { class: "num" }, num(r.max_dd_rel_pct, 2)), h("td", {}, names.map(n => n + "=" + r.params[n]).join("  ")))));
      liveTbl.append(h("div", { class: "card" }, h("h2", {}, "Best so far (live)"), h("div", { class: "tablewrap" }, t)));
    }
    drawLiveScatter(p);
  }
  // every finished pass as a dot (profit vs drawdown), growing while the search runs
  function drawLiveScatter(p) {
    if (!liveChart) {
      liveSc.innerHTML = "";
      const host = h("div"); liveNote = h("div", { class: "small muted" }, "waiting for the first finished passes ...");
      liveSc.append(h("div", { class: "card" }, h("h2", {}, "Passes so far: profit vs drawdown"), liveNote, host));
      liveChart = new XYChart(host, { height: 300, time: false, yFmt: x => money(x) });
      const ph = h("div"); liveSc.append(h("div", { class: "card" }, h("h2", {}, "Score by pass number: is the search improving?"), h("div", { class: "small muted" }, "Every dot is one finished pass (in the order they finish). Orange: the best score so far. Green: moving average. A rising orange line means the search still finds better candidates; a flat one means it has converged."), ph));
      liveProg = scoreByPassChart(ph, meta.space.params.map(x => x.name));
    }
    if (!livePts.length || livePts.length === liveDrawn) return;
    liveDrawn = livePts.length;
    const names = meta.space.params.map(x => x.name);
    const order = livePts.map((_, i) => i).sort((a, b) => livePts[b][0] - livePts[a][0]);
    const top = new Set(order.slice(0, 10));
    const step = livePts.length > 4000 ? Math.ceil(livePts.length / 4000) : 1; // keep the canvas fast: thin out, never the best 10
    const c1 = cssVar("--c1"), c2 = cssVar("--c2"), pts = [];
    livePts.forEach((r, i) => {
      const isTop = top.has(i); if (!isTop && i % step) return;
      pts.push({ x: r[2], y: r[1], r: isTop ? 7 : 4, color: isTop ? c2 : c1,
        info: "<b>score " + num(r[0], 3) + "</b><br>net " + money(r[1]) + "  DD " + num(r[2], 2) + " %  trades " + r[3] + "<br>" + names.map((n, k) => n + "=" + r[4][k]).join("  ") });
    });
    liveChart.set([{ type: "markers", scatter: true, pts }]);
    if (liveProg) liveProg.set(livePts);
    liveNote.textContent = livePts.length + " of " + p.done + " finished passes plotted" + (p.done > livePts.length ? " (" + (p.done - livePts.length) + " rejected by 'min trades' or failed are not shown)" : "") + ". Orange: the 10 best so far. Up and to the left is better. Hover a dot for its parameters.";
  }

  // ---- actions on a result row
  function requestFor(row, forward) {
    const req = JSON.parse(JSON.stringify(meta.request)); delete req.ranges; delete req.opt;
    req.params = Object.assign({}, req.params); res.param_names.forEach((n, i) => { req.params[n] = row.v[i]; });
    req.name = meta.name + " #" + row.rank + (forward ? " forward" : "");
    if (forward) { req.from = meta.request.opt.forward_from; req.to = meta.request.opt.forward_to || ""; }
    return req;
  }
  const runRow = (row, forward) => guard(async () => { const r = await api("runs", { body: requestFor(row, forward) }); location.hash = "#run/" + r.id; });
  const loadRow = row => () => {
    loadRequestIntoForm(requestFor(row, false));
    form.ranges = {}; for (const r of meta.request.ranges) form.ranges[r.name] = { on: true, start: String(r.start), step: String(r.step), stop: String(r.stop) };
    form.opt = Object.assign(defaultOpt(), meta.request.opt); saveForm(); location.hash = "#new/optimize";
  };
  async function setBlob(rank) { const r = await fetch("/api/optimizations/" + id + "/set?rank=" + rank); if (!r.ok) throw new Error((await r.json()).error); return r.blob(); }
  const downloadSet = rank => guard(async () => { const b = await setBlob(rank); h("a", { href: URL.createObjectURL(b), download: meta.name.replace(/[^\w.-]+/g, "_") + "-" + rank + ".set" }).click(); });
  const saveSet = rank => guard(async () => {
    const name = prompt("Save as preset (file name):", meta.name.replace(/[^\w.-]+/g, "_") + "-" + rank + ".set"); if (!name) return;
    await api("files/set/" + encodeURIComponent(name), { method: "POST", body: await setBlob(rank) }); toast("Saved preset " + name + " (select it under 'Parameter file (.set)')");
  });

  // right-click on a result row
  const rowMenu = r => ev => showContextMenu(ev, "Result #" + r.rank + "  (score " + num(r.score, 3) + ")", [
    { label: "Run forward pass with these parameters", onclick: runRow(r, false) },
    { label: "Run on the forward period (" + (meta.request.opt.forward_from || "-") + " ..)", onclick: runRow(r, true), hidden: !meta.request.opt.forward_from },
    { label: "Download as .set file", onclick: downloadSet(r.rank) },
    { label: "Save as .set preset", onclick: saveSet(r.rank) },
    { label: "Load into New run", onclick: loadRow(r) },
  ]);

  // ---- finished: results, charts
  function renderBody() {
    body.innerHTML = "";
    if (!rows.length) { body.append(h("div", { class: "card warn" }, "No pass produced a valid score" + (res.rejected ? " (" + res.rejected + " were rejected by 'min trades')" : "") + ".")); return; }
    const names = res.param_names, hasF = rows.some(r => r.f);
    const best = rows[0];
    // best candidate
    body.append(h("div", { class: "card" }, h("h2", {}, "Best candidate"),
      h("div", { class: "row", style: "flex-wrap:wrap; gap:6px" }, ...names.map((n, i) => h("span", { class: "chip plain" }, n + " = " + best.v[i]))),
      h("div", { class: "row", style: "margin-top:10px" },
        h("button", { class: "primary", onclick: runRow(best, false) }, "Run full report"), hasF ? h("button", { onclick: runRow(best, true) }, "Run forward period") : null,
        h("button", { onclick: downloadSet(1) }, "Download .set (MT5)"), h("button", { onclick: saveSet(1) }, "Save as preset"), h("button", { onclick: loadRow(best) }, "Load into New run"),
        h("a", { class: "btn", href: "/api/optimizations/" + id + "/csv", download: "optimization-" + id + ".csv" }, "All passes (CSV)"))));
    const progHost = h("div");
    body.append(h("div", { class: "card" }, h("h2", {}, "Score by pass number: did the search improve over time?"), h("div", { class: "small muted" }, "Every dot is one pass in the order they finished; orange = best score so far, green = moving average."), progHost));
    api("optimizations/" + id + "/passes").then(pts => scoreByPassChart(progHost, names).set(pts)).catch(() => { progHost.append(h("div", { class: "small muted" }, "No pass history was stored for this optimization (it ran before this feature).")); });
    if (hasF) body.append(forwardCard());
    body.append(tableCard());
    const charts = h("div"); body.append(charts); drawCharts(charts);
    body.append(h("div", { class: "card" }, h("details", {}, h("summary", {}, "Settings used"), h("pre", {}, JSON.stringify({ in_sample: [meta.request.from, meta.request.to], ranges: meta.request.ranges, opt: meta.request.opt, params: meta.request.params, config: meta.request.config }, null, 2)))));
  }
  function forwardCard() {
    const fr = rows.filter(r => r.f), n = Math.min(fr.length, 20);
    const t = h("table", {}, h("tr", {}, ...["#", "In-sample net", "In-sample PF", "In-sample DD %", "Forward net", "Forward PF", "Forward trades", "Forward DD %", "Forward / in-sample"].map(x => h("th", {}, x))));
    for (const r of fr.slice(0, n)) { const ratio = r.net > 0 && r.f[1] != null ? r.f[1] / r.net : null; t.append(h("tr", { class: "click", onclick: runRow(r, true), oncontextmenu: rowMenu(r) }, h("td", {}, r.rank), h("td", { class: "num " + signCls(r.net) }, money(r.net)), h("td", { class: "num" }, num(r.pf, 2)), h("td", { class: "num" }, num(r.ddr, 2)), h("td", { class: "num " + signCls(r.f[1]) }, money(r.f[1])), h("td", { class: "num" }, num(r.f[2], 2)), h("td", { class: "num" }, r.f[3]), h("td", { class: "num" }, num(r.f[4], 2)), h("td", { class: "num " + (ratio != null ? signCls(ratio - 0.5) : "") }, ratio != null ? num(ratio * 100, 0) + " %" : "-"))); }
    return h("div", { class: "card" }, h("h2", {}, "Forward test: the best " + n + " on " + (meta.request.opt.forward_from || "") + " .. " + (meta.request.opt.forward_to || "end")),
      h("div", { class: "small muted" }, "In-sample results are optimistic by construction; candidates whose forward result collapses are over-fitted. Click a row to open its forward-period report."), h("div", { class: "tablewrap" }, t));
  }
  function tableCard() {
    const names = res.param_names, hasF = rows.some(r => r.f);
    const cols = [["rank", "#", null], ["score", "Score", x => num(x, 3)], ["net", "Net profit", money], ["pf", "PF", x => num(x, 2)], ["trades", "Trades", x => num(x, 0)], ["ddr", "DD %", x => num(x, 2)],
      ...(hasF ? [["fnet", "Fwd net", money], ["fpf", "Fwd PF", x => num(x, 2)], ["ftr", "Fwd trades", x => num(x, 0)]] : []), ...names.map((n, i) => ["p" + i, n, null])];
    const get = (r, k) => k === "fnet" ? (r.f ? r.f[1] : null) : k === "fpf" ? (r.f ? r.f[2] : null) : k === "ftr" ? (r.f ? r.f[3] : null) : k[0] === "p" && k !== "pf" ? +r.v[+k.slice(1)] : r[k];
    const data = rows.slice(); data.sort((a, b) => { const x = get(a, sortKey), y = get(b, sortKey); return ((x == null ? -Infinity : x) > (y == null ? -Infinity : y) ? 1 : (x == null ? -Infinity : x) < (y == null ? -Infinity : y) ? -1 : 0) * sortDir; });
    const tb = h("table", {}, h("tr", {}, ...cols.map(([k, l]) => h("th", { class: "sortable", onclick: () => { sortDir = sortKey === k ? -sortDir : (k === "rank" || k === "ddr" ? 1 : -1); sortKey = k; renderBody(); } }, l + (sortKey === k ? (sortDir > 0 ? " ^" : " v") : ""))), h("th", {}, "")));
    for (const r of data.slice(0, showN)) tb.append(h("tr", { class: "click", onclick: runRow(r, false), oncontextmenu: rowMenu(r) },
      ...cols.map(([k, , f]) => { const x = k[0] === "p" && k !== "pf" ? r.v[+k.slice(1)] : get(r, k); return h("td", { class: f ? "num " + (k === "net" || k === "fnet" ? signCls(x) : "") : "" }, f ? (x == null ? "" : f(x)) : x); }),
      h("td", { onclick: e => e.stopPropagation(), style: "white-space:nowrap" }, h("button", { title: "download .set", onclick: downloadSet(r.rank) }, ".set"), " ", h("button", { title: "load into New run", onclick: loadRow(r) }, "load"))));
    return h("div", { class: "card" }, h("h2", {}, "All passes (" + rows.length + (res.total > rows.length ? " best of " + res.total : "") + ")"), h("div", { class: "small muted" }, "Click a header to sort, a row to open the full report of that pass. Right-click a row for more: download as .set, run a forward pass, ..."),
      h("div", { class: "tablewrap", style: "max-height:560px" }, tb), rows.length > showN ? h("div", { style: "margin-top:8px" }, h("button", { onclick: () => { showN += 200; renderBody(); } }, "show 200 more")) : null);
  }
  function drawCharts(host) {
    const names = res.param_names, vals = res.param_values;
    // 1. response of the score to every parameter (best score per value)
    const g = h("div", { class: "grid2" });
    const hosts = names.map((n, j) => { const d = h("div"); g.append(h("div", { class: "card" }, h("h2", {}, "Best score by " + n), d)); return d; });
    host.append(h("h2", { style: "margin-top:18px" }, "How each parameter influences the result"), g);
    names.forEach((n, j) => {
      const best = new Map(); for (const r of rows) { const x = r.v[j]; if (!best.has(x) || r.score > best.get(x)) best.set(x, r.score); }
      const pts = [...best.entries()].map(([x, y]) => ({ x: +x, y })).filter(p => isFinite(p.x)).sort((a, b) => a.x - b.x);
      if (pts.length) new XYChart(hosts[j], { height: 200, time: false, yFmt: x => num(x, 2) }).set([{ type: "line", name: "best score", x: pts.map(p => p.x), y: pts.map(p => p.y), color: cssVar("--c" + (1 + j % 8)) }]);
    });
    // 2. risk / return scatter
    const sc = h("div"), scCard = h("div", { class: "card" }, h("h2", {}, "Profit vs drawdown of all passes"), h("div", { class: "small muted" }, "Each dot is one pass. Highlighted: the 10 best by score. Up and to the left is better."), sc);
    host.append(scCard);
    let pool = rows; if (pool.length > 4000) pool = rows.slice(0, 2000).concat(rows.slice(2000).filter((_, i) => i % Math.ceil((rows.length - 2000) / 2000) === 0));
    const mk = r => ({ x: r.ddr, y: r.net, r: r.rank <= 10 ? 7 : 5, color: r.rank <= 10 ? cssVar("--c2") : cssVar("--c1"), info: "<b>#" + r.rank + "</b>  score " + num(r.score, 3) + "<br>net " + money(r.net) + "  DD " + num(r.ddr, 2) + " %  trades " + r.trades + "<br>" + paramText(names, r.v) });
    new XYChart(sc, { height: 300, time: false, yFmt: x => money(x) }).set([{ type: "markers", scatter: true, pts: pool.filter(r => isFinite(r.ddr) && isFinite(r.net)).map(mk) }]);
    // 3. two-parameter heatmap
    if (names.length >= 2) {
      const hm = h("div"), selA = h("select", { onchange: () => { hmA = +selA.value; if (hmA === hmB) hmB = (hmA + 1) % names.length; drawHeat(); } }, ...names.map((n, i) => h("option", { value: i, selected: i === hmA }, n)));
      const selB = h("select", { onchange: () => { hmB = +selB.value; if (hmA === hmB) hmA = (hmB + 1) % names.length; drawHeat(); } }, ...names.map((n, i) => h("option", { value: i, selected: i === hmB }, n)));
      const selM = h("select", { onchange: () => { hmMetric = selM.value; drawHeat(); } }, ...OPT_METRICS.map(m => h("option", { value: m[0], selected: m[0] === hmMetric }, m[1])));
      host.append(h("div", { class: "card" }, h("h2", {}, "Two-parameter map"), h("div", { class: "small muted" }, "Each cell shows the best value of the metric over all other parameters. Click a cell to filter nothing - it opens that pass."),
        h("div", { class: "row", style: "margin:6px 0" }, h("label", { class: "row" }, "Rows", selA), h("label", { class: "row" }, "Columns", selB), h("label", { class: "row" }, "Metric", selM)), hm));
      function drawHeat() {
        hm.innerHTML = ""; selA.value = hmA; selB.value = hmB;
        const m = OPT_METRICS.find(x => x[0] === hmMetric), sgn = m[3] < 0 ? -1 : 1;
        const cell = new Map();
        for (const r of rows) { const k = r.v[hmA] + "|" + r.v[hmB], x = r[hmMetric]; if (x == null || !isFinite(x)) continue; const c = cell.get(k); if (!c || sgn * x > sgn * c.x) cell.set(k, { x, r }); }
        const vs = [...cell.values()].map(c => c.x), lo = Math.min(...vs), hi = Math.max(...vs);
        const color = x => { if (hi === lo) return ""; let f = (x - lo) / (hi - lo); if (m[3] < 0) f = 1 - f; const col = f >= .5 ? "--good" : "--bad"; return `background: color-mix(in srgb, var(${col}) ${Math.round(Math.abs(f - .5) * 2 * 55)}%, transparent)`; };
        const rv = vals[hmA], cv = vals[hmB];
        const t = h("table", { class: "heat" }, h("tr", {}, h("th", {}, ""), ...cv.map(c => h("th", {}, c))));
        for (const a of rv) t.append(h("tr", {}, h("th", {}, a), ...cv.map(b => { const c = cell.get(a + "|" + b); return h("td", { style: c ? color(c.x) : "", onclick: c ? runRow(c.r, false) : null, title: c ? "#" + c.r.rank + "  " + paramText(names, c.r.v) : "" }, c ? m[2](c.x) : ""); })));
        hm.append(h("div", { class: "tablewrap", style: "max-height:520px" }, t));
      }
      drawHeat();
    }
  }
  const finished = await load();
  if (!finished) { const t = every(async () => { if (await load()) clearInterval(t); }, 1200); }
}
