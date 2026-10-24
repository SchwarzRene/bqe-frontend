"use strict";
// ---------------------------------------------------------------- helpers
const $ = (s, r) => (r || document).querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "html") e.innerHTML = v;
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
// ---------------------------------------------------------------- icons (inline SVG, stroke = currentColor, so they follow the text color)
const ICONS = {
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3M7.5 15h9"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  sliders: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1"/>',
  zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  gauge: '<path d="M4.5 18a9 9 0 1 1 15 0M12 14l4-4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  play: '<path d="M7 4l13 8-13 8V4z"/>',
  rocket: '<path d="M5 15c-1 1-2 4-2 6 2 0 5-1 6-2M14 4c4-1 6-1 6-1s0 2-1 6l-6 6-5-5 6-6z"/><circle cx="15" cy="9" r="1.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  down: '<path d="M3 7l6 6 4-4 8 8M15 17h6v-6"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
};
function icon(name, cls) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ic" + (cls ? " " + cls : "")); s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[name] || "";
  return s;
}
// a button / tab with an icon and a text span that can be changed later (`.t`)
const labeled = (name, text) => [icon(name), h("span", { class: "t" }, text)];
// big tab tile: round icon badge, title (`.t`, updated later for counts) and a one-line description
// header of a section card: icon badge, title and a short hint
const sechead = (name, title, sub) => h("div", { class: "sechead" }, h("span", { class: "secicon" }, icon(name)), h("div", {}, h("b", {}, title), sub ? h("small", {}, sub) : null));
const lab = (name, text) => h("span", { class: "lab" }, icon(name), text);
const bigLabeled = (name, text, sub) => [h("span", { class: "bticon" }, icon(name)), h("span", { class: "btext" }, h("span", { class: "t" }, text), h("small", { class: "sub" }, sub))];

// ---------------------------------------------------------------- date picker
// A calendar input. The stores keep "YYYY.MM.DD" (what the server parses), the input shows / picks YYYY-MM-DD.
// Limited to the days the selected dataset has (applyDateLimits); the x button clears it (= start / end of the data).
const DATE_INPUTS = [];
function dateInput(store, key, opts) {
  opts = opts || {};
  const iso = s => { const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(s || ""); return m ? m[1] + "-" + m[2] + "-" + m[3] : ""; };
  const inp = h("input", { type: "date", class: "dateinp", title: opts.title || "" });
  inp.value = iso(store[key]);
  const set = v => { store[key] = v; saveForm(); if (opts.onChange) opts.onChange(); };
  inp.addEventListener("input", () => set(inp.value ? inp.value.replace(/-/g, ".") : ""));
  const clear = h("button", { type: "button", class: "dateclear", title: "clear" + (opts.empty ? " (" + opts.empty + ")" : ""), onclick: () => { inp.value = ""; set(""); } }, icon("x"));
  DATE_INPUTS.push(inp);
  return { input: inp, el: h("span", { class: "datebox" }, inp, clear) };
}
function applyDateLimits(d) {
  const lim = s => (s || "").slice(0, 10).replace(/\./g, "-");
  for (const i of DATE_INPUTS) {
    if (!i.isConnected) continue;
    if (!d) { i.removeAttribute("min"); i.removeAttribute("max"); continue; }
    i.min = lim(d.first); i.max = lim(d.last);
    // a date outside the data (e.g. the built-in default From) is pulled in: before the data -> first day, after it -> empty (= start / end of the data)
    if (i.value && i.min && i.max && (i.value < i.min || i.value > i.max)) { i.value = i.value < i.min ? i.min : ""; i.dispatchEvent(new Event("input")); }
  }
}
// Export the current parameters (with the ticked search ranges) as an MT5 .set file: UTF-16LE with BOM and CRLF, like MT5 writes them.
// Chrome / Edge let you pick the folder and name; other browsers just download it.
async function exportSetFile() {
  const text = paramsAsSetText().replace(/\r?\n/g, "\r\n");
  const bytes = new Uint8Array(2 + text.length * 2); bytes[0] = 0xFF; bytes[1] = 0xFE;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); bytes[2 + i * 2] = c & 255; bytes[3 + i * 2] = c >> 8; }
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const name = ((form.setFile || form.strategy || "parameters").replace(/\.set$/i, "").replace(/[^\w.-]+/g, "_") || "parameters") + ".set";
  if (window.showSaveFilePicker) {
    try {
      const fh = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "MT5 settings", accept: { "application/octet-stream": [".set"] } }] });
      const w = await fh.createWritable(); await w.write(blob); await w.close();
      toast("Exported " + fh.name); return;
    } catch (e) { if (e && e.name === "AbortError") return; /* no permission / not supported here: fall back to a normal download */ }
  }
  const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
  toast("Downloaded " + name + " (your browser puts it in its download folder)");
}
function toast(msg, err) {
  const t = h("div", { class: "toast" + (err ? " err" : "") }, msg);
  $("#toasts").append(t); setTimeout(() => t.remove(), err ? 9000 : 3500);
}
async function api(path, opt) {
  opt = opt || {};
  const o = { method: opt.method || (opt.body !== undefined ? "POST" : "GET"), headers: {} };
  if (opt.body !== undefined) { const raw = typeof opt.body === "string" || opt.body instanceof Blob; o.body = raw ? opt.body : JSON.stringify(opt.body); if (!raw) o.headers["Content-Type"] = "application/json"; }
  const r = await fetch("/api/" + path, o);
  let j = null; try { j = await r.json(); } catch (e) { /* not json */ }
  if (!r.ok) throw new Error((j && j.error) || r.statusText);
  return j;
}
// progress of a queued / running pass -> {frac, text}
function fmtSecs(s) { return s < 90 ? Math.max(1, Math.round(s)) + " s" : Math.round(s / 60) + " min"; }
function progressState(p) {
  if (!p || p.elapsed_s == null) return { frac: 0, text: "waiting for a free worker ..." };
  const frac = p.total ? Math.min(1, p.done / p.total) : 0;
  if (!p.total) return { frac: 0, text: "preparing ..." };
  if (frac >= 1) return { frac: 1, text: "saving results ..." };
  const eta = frac > 0.03 ? p.elapsed_s * (1 - frac) / frac : null;
  return { frac, text: Math.floor(frac * 100) + " %" + (eta != null ? "  -  about " + fmtSecs(eta) + " left" : "  -  estimating ...") + "  (" + num(p.done / 1e6, 0) + "M / " + num(p.total / 1e6, 0) + "M ticks)" };
}
function progressBar(p) {
  const s = progressState(p);
  return h("div", {}, h("div", { class: "progress" }, h("div", { style: "width:" + (s.frac * 100) + "%" })), h("div", { class: "small muted", style: "margin-top:4px" }, s.text));
}
function guard(fn) { return async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); console.error(e); } }; }
const money = v => v == null || !isFinite(v) ? "-" : v.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v, d) => v == null || !isFinite(v) ? "-" : v.toLocaleString("en", { maximumFractionDigits: d == null ? 2 : d });
const signCls = v => v > 0 ? "good" : v < 0 ? "bad" : "";
const fmt = ms => fmtTime(ms);
const dateOnly = ms => fmtTime(ms).slice(0, 10).replace(/-/g, ".");
function ago(sec) { return new Date(sec * 1000).toLocaleString(); }
function dur(ms) { const m = Math.round(ms / 60000); if (m < 60) return m + "m"; if (m < 2880) return (m / 60).toFixed(1) + "h"; return (m / 1440).toFixed(1) + "d"; }

let schema = null;
let timers = [];
function every(fn, ms) { const t = setInterval(guard(fn), ms); timers.push(t); return t; }
function clearTimers() { timers.forEach(clearInterval); timers = []; }

// ---------------------------------------------------------------- persisted form state
const defaultForm = () => ({ name: "", dataset: "", symbol: "", configFile: "", setFile: "", strategy: "", from: "2026.01.01", to: "", warmup: "", timeframe: "", config: {}, extra: {}, params: {}, ranges: {}, opt: {} });
let form = defaultForm();
try { const s = JSON.parse(localStorage.getItem("mt5bt.form") || "null"); if (s) form = Object.assign(defaultForm(), s); } catch (e) { /* ignore */ }
function saveForm() { try { localStorage.setItem("mt5bt.form", JSON.stringify(form)); } catch (e) { /* ignore */ } }
function cfgFields() { return schema.config.flatMap(g => g.fields); }
function strategyDef(n) { return schema.strategies.find(s => s.name === n); }
function canonicalParam(strategy, key) {
  const d = strategyDef(strategy); const k = key.toLowerCase();
  const m = d && d.params.find(p => p.key.toLowerCase() === k); return m ? m.key : null;
}
function ensureDefaults() {
  for (const f of cfgFields()) if (form.config[f.key] === undefined) form.config[f.key] = f.default;
  // first strategy of the list unless the saved form names one this server does not have
  if (!strategyDef(form.strategy) && schema.strategies.length) { form.strategy = schema.strategies[0].name; form.params = {}; }
  const d = strategyDef(form.strategy);
  if (d && !Object.keys(form.params).length) for (const p of d.params) form.params[p.key] = p.default;
}

// ---------------------------------------------------------------- History: switch between the lists
function historyBar(active) {
  const items = [["runs", "Run history", "single forward passes", "list"], ["optimizations", "Optimizer history", "parameter searches", "target"], ["sweeps", "Sweeps", "parameter grids", "grid"]];
  return h("nav", { class: "histbar", "aria-label": "history" }, ...items.map(([k, l, s, ic]) =>
    h("a", { href: "#" + k, class: k === active ? "active" : "" }, icon(ic, "big"), h("b", {}, l), h("small", {}, s))));
}
// ---------------------------------------------------------------- router
const views = {
  data: viewData, new: viewNew, runs: viewRuns, sweeps: viewSweeps,
  run: viewRun, compare: viewCompare, sweep: viewSweep, studio: viewStudio,
  optimizations: viewOptimizations, optimization: viewOptimization,
};
async function route() {
  clearTimers();
  const [name, arg] = (location.hash.slice(1) || "runs").split("/");
  const tab = { run: "history", runs: "history", compare: "history", sweep: "history", sweeps: "history", optimization: "history", optimizations: "history", new: "research" }[name] || name;
  document.querySelectorAll(".hub [data-tab]").forEach(a => a.classList.toggle("active", a.dataset.tab === tab));
  const v = $("#view"); v.innerHTML = ""; v.className = "";
  const fn = views[name] || viewRuns;
  try { await fn(v, arg); } catch (e) { v.append(h("div", { class: "card bad" }, "Error: " + e.message)); console.error(e); }
}
window.addEventListener("hashchange", route);

async function boot() {
  schema = await (await fetch("/api/schema")).json();
  ensureDefaults();
  try { const i = await api("info"); window.CORES = i.threads; $("#status").textContent = "workspace: " + i.workspace + "  |  " + i.threads + " parallel passes"; } catch (e) { /* ignore */ }
  await route();
  if (window.hideSplash) window.hideSplash(); // the first page is on screen: the loading splash may leave (after its minimum time)
}

// ---------------------------------------------------------------- DATA view
function uploadXhr(url, file, onProgress) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open("POST", url);
    x.upload.onprogress = e => onProgress && onProgress(e.loaded, e.total);
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (e) { /* */ } x.status < 300 ? res(j) : rej(new Error(j.error || x.statusText)); };
    x.onerror = () => rej(new Error("upload failed")); x.send(file);
  });
}
async function pollJob(id, onUpdate) {
  for (;;) {
    const j = await api("jobs/" + id); onUpdate(j);
    if (j.status !== "running") return j;
    await new Promise(r => setTimeout(r, 700));
  }
}

// Data & files: a list of datasets; click one to extend it or manage the config / symbol / parameter files.
async function viewData(v, arg) {
  if (arg === "new") return viewDataNew(v);
  if (arg) return viewDataDetail(v, decodeURIComponent(arg));
  v.append(h("div", { class: "row", style: "margin-bottom:14px" }, h("h1", { style: "margin:0" }, "Data & files"), h("span", { class: "spacer" }),
    h("a", { class: "btn newrun", href: "#data/new" }, "+ New dataset")));
  const list = await api("datasets");
  if (!list.length) {
    v.append(h("div", { class: "card" }, h("h2", {}, "No dataset yet"), h("div", { class: "muted", style: "margin-bottom:10px" }, "Import MT5 tick CSV files to get started."), h("a", { class: "btn newrun", href: "#data/new" }, "+ New dataset")));
    return;
  }
  const grid = h("div", { class: "dsgrid" }); v.append(grid);
  for (const d of list) {
    const go = () => { location.hash = "#data/" + encodeURIComponent(d.name); };
    if (d.missing) { grid.append(h("div", { class: "card dscard", onclick: go }, h("b", {}, d.name), h("div", { class: "bad small" }, "tick file missing"))); continue; }
    const spark = h("div", { class: "spark" });
    grid.append(h("div", { class: "card dscard", onclick: go },
      h("div", { class: "row" }, h("span", { class: "dsname" }, d.name), h("span", { class: "spacer" }), h("span", { class: "muted small" }, "open >")),
      h("div", { class: "muted" }, d.first.slice(0, 10).replace(/-/g, ".") + "  -  " + d.last.slice(0, 10).replace(/-/g, ".")),
      spark,
      h("div", { class: "row small", style: "gap:6px" }, h("span", { class: "chip plain" }, num(d.ticks / 1e6, 1) + "M ticks"), h("span", { class: "chip plain" }, num(d.size_mb / 1000, 1) + " GB"), h("span", { class: "chip plain" }, d.digits + " digits"))));
    api("datasets/" + encodeURIComponent(d.name) + "/coverage").then(c => {
      new CatChart(spark, { height: 56, signColors: false, yFmt: () => "", pad: { l: 4, r: 4, t: 4, b: 4 }, hideAxes: true }).set(c.map(m => m.month), c.map(m => m.ticks), c.map(m => m.first ? m.first.slice(0, 16) + " .. " + m.last.slice(0, 16) : "no data"));
    }).catch(() => { });
  }
}

// ---------- stepper + animated bar for uploads / conversions
function progressPanel(labels) {
  const steps = labels.map((s, i) => h("div", { class: "pstep" }, h("span", { class: "pdot" }, String(i + 1)), h("span", { class: "plbl" }, s)));
  const fill = h("div", { class: "pfill" }), bar = h("div", { class: "pbar" }, fill), txt = h("div", { class: "ptext" });
  const box = h("div", { class: "pcard", style: "display:none" }, h("div", { class: "psteps" }, ...steps), bar, txt);
  let t0 = Date.now();
  const clock = () => { const s = Math.round((Date.now() - t0) / 1000); return s < 60 ? s + " s" : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  return {
    el: box,
    start() { t0 = Date.now(); box.style.display = ""; box.className = "pcard"; },
    // step = index of the active step, frac = 0..1 or null (unknown -> shimmer)
    set(step, frac, text) {
      steps.forEach((e, i) => { e.className = "pstep " + (i < step ? "done" : i === step ? "active" : ""); });
      box.className = "pcard";
      bar.classList.toggle("indet", frac == null);
      if (frac != null) fill.style.width = Math.round(frac * 100) + "%";
      const eta = frac != null && frac > 0.04 && frac < 1 ? "  -  about " + fmtSecs((Date.now() - t0) / 1000 * (1 - frac) / frac) + " left" : "";
      txt.textContent = text + (frac != null ? "  " + Math.floor(frac * 100) + " %" : "") + eta + "   (" + clock() + ")";
    },
    ok(text) { steps.forEach(e => { e.className = "pstep done"; }); bar.classList.remove("indet"); fill.style.width = "100%"; box.className = "pcard ok"; txt.textContent = text + "   (" + clock() + ")"; },
    err(text) { bar.classList.remove("indet"); box.className = "pcard err"; txt.textContent = text; },
  };
}

// ---------- import: one button -> file chooser -> upload, convert and merge start right away with the progress card
function importForm(mode, target, onDone) {
  const fileInput = h("input", { type: "file", multiple: true, accept: ".csv,.txt", style: "display:none" });
  const nameIn = h("input", { placeholder: "e.g. xauusd", style: "width:200px" });
  const digitsIn = h("input", { type: "number", value: "2", style: "width:70px" });
  const pathsIn = h("textarea", { rows: 3, placeholder: "C:\\data\\ticks-2026.csv      (CSV or .tickbin, one path per line, oldest first)" });
  const panel = progressPanel(mode === "append" ? ["Upload", "Convert", "Merge", "Done"] : ["Upload", "Convert", "Done"]);
  const label = mode === "append" ? "Add data to dataset ..." : "Choose files and create ...";
  const pickBtn = h("button", { class: "primary" }, label);
  const pathBtn = h("button", {}, "Import these paths");
  const buttons = [pickBtn, pathBtn];
  const mergeStep = mode === "append" ? 2 : -1;

  function needName() {
    const name = mode === "append" ? target : nameIn.value.trim();
    if (!name) throw new Error("enter a dataset name first");
    return name;
  }
  // files = File objects to upload first; paths = files already on this computer
  async function run(files, paths) {
    const name = needName();
    files = [...files].sort((a, b) => a.name.localeCompare(b.name));
    panel.start(); buttons.forEach(b => { b.disabled = true; });
    try {
      const names = [], total = files.reduce((a, f) => a + f.size, 0) || 1; let done = 0;
      for (const f of files) {
        await uploadXhr("/api/upload?name=" + encodeURIComponent(f.name), f, l => panel.set(0, (done + l) / total, "Uploading " + f.name));
        done += f.size; names.push("upload:" + f.name);
      }
      panel.set(1, null, "Starting conversion");
      const j = await api("datasets/convert", { body: { mode, name, digits: +digitsIn.value, files: [...names, ...paths] } });
      const job = await pollJob(j.job, s => {
        const step = s.phase === "joining" ? mergeStep : 1;
        panel.set(step, s.frac != null ? s.frac : null, step === mergeStep ? "Merging into the dataset" : "Converting " + String(s.message || "").replace(/^converting /, ""));
      });
      if (job.status === "error") throw new Error(job.message);
      const r = job.result;
      panel.ok(mode === "append"
        ? "Done: " + num(r.ticks_added, 0) + " ticks added" + (r.ticks_replaced ? ", " + num(r.ticks_replaced, 0) + " existing ticks in that time range replaced" : "") + "; the dataset now has " + num(r.ticks, 0) + " ticks"
        : "Done: " + num(r.ticks, 0) + " ticks, " + r.first.slice(0, 10) + " .. " + r.last.slice(0, 10));
      (r.warnings || []).forEach(w => toast(w, true));
      setTimeout(() => onDone(name), 1800);
    } catch (e) {
      panel.err("Failed: " + e.message); buttons.forEach(b => { b.disabled = false; }); throw e;
    }
  }
  pickBtn.addEventListener("click", guard(async () => { needName(); fileInput.value = ""; fileInput.click(); }));
  fileInput.addEventListener("change", guard(async () => { if (fileInput.files.length) await run(fileInput.files, []); }));
  pathBtn.addEventListener("click", guard(async () => {
    const paths = pathsIn.value.split("\n").map(s => s.trim()).filter(Boolean);
    if (!paths.length) throw new Error("enter at least one path");
    await run([], paths);
  }));
  const intro = mode === "append"
    ? h("div", { class: "small muted" }, "Pick MT5 tick CSV files; the import starts right away. Data in the same time range is replaced by the new data, older and newer data is kept.")
    : h("div", { class: "row gap-lg" }, h("label", { class: "f" }, "Dataset name", nameIn), h("label", { class: "f" }, "Price digits", digitsIn));
  return h("div", {}, intro,
    h("div", { class: "row", style: "margin-top:10px" }, pickBtn, fileInput, h("span", { class: "muted small" }, "MT5 tick export: <DATE>,<TIME>,<BID>,<ASK>,<LAST>,<VOLUME>,<FLAGS>")),
    panel.el,
    h("details", { style: "margin-top:10px" }, h("summary", { class: "small" }, "Large files? Import from paths on this computer instead of uploading"),
      h("div", { class: "muted small", style: "margin:4px 0" }, "CSV or already converted .tickbin files, one per line, oldest first."), pathsIn, h("div", { style: "margin-top:6px" }, pathBtn)));
}

// ---------- trade sessions: a 24 h clock for the selected weekday + a week calendar (sessions[0] = Sunday, minutes of the day)
function sessionsViz(sessions) {
  const DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]];
  const hm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const span = day => (sessions[day] || []).map(x => hm(x[0]) + " - " + hm(x[1])).join(",  ") || "closed";
  const NS = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); kids.forEach(c => e.append(c.nodeType ? c : document.createTextNode(c))); return e; };
  let sel = 1; // Monday
  const clockBox = h("div", { class: "clockbox" }), rows = h("div", { class: "weekrows" });
  const R = 52, C = 70;
  const pt = (min, r) => { const a = (min / 1440) * 2 * Math.PI - Math.PI / 2; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
  function arc(a, b) {
    const [x1, y1] = pt(a, R), [x2, y2] = pt(Math.min(b, 1439.99), R);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${(b - a) > 720 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  function drawClock() {
    clockBox.innerHTML = "";
    const s = svg("svg", { viewBox: "0 0 140 140", width: 150, height: 150 });
    s.append(svg("circle", { cx: C, cy: C, r: R, fill: "none", stroke: "var(--line)", "stroke-width": 12 }));
    for (const [a, b] of sessions[sel] || []) s.append(svg("path", { d: arc(a, b), fill: "none", stroke: "var(--good)", "stroke-width": 12, "stroke-linecap": "butt" }));
    for (let hr = 0; hr < 24; hr++) { const [x1, y1] = pt(hr * 60, R + 9), [x2, y2] = pt(hr * 60, R + (hr % 6 === 0 ? 14 : 11)); s.append(svg("line", { x1, y1, x2, y2, stroke: "var(--muted)", "stroke-width": hr % 6 === 0 ? 1.5 : 0.8 })); }
    for (const hr of [0, 6, 12, 18]) { const [x, y] = pt(hr * 60, R + 22); s.append(svg("text", { x, y: y + 3, "text-anchor": "middle", "font-size": 9, fill: "var(--muted)" }, String(hr))); }
    s.append(svg("text", { x: C, y: C - 2, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "var(--ink)" }, DAYS.find(d => d[1] === sel)[0]));
    s.append(svg("text", { x: C, y: C + 12, "text-anchor": "middle", "font-size": 8, fill: "var(--muted)" }, (sessions[sel] || []).length ? "open" : "closed"));
    clockBox.append(s, h("div", { class: "small muted", style: "text-align:center" }, span(sel)));
  }
  function drawRows() {
    rows.innerHTML = "";
    const axis = h("div", { class: "weekrow axis" }, h("span", { class: "wday" }), h("div", { class: "wtrack" }, ...[0, 6, 12, 18, 24].map(hr => h("span", { class: "wtick", style: "left:" + (hr / 24 * 100) + "%" }, String(hr)))), h("span", { class: "wtime" }));
    rows.append(axis);
    for (const [name, day] of DAYS) {
      const bars = (sessions[day] || []).map(([a, b]) => h("div", { class: "wbar", style: "left:" + (a / 1440 * 100) + "%;width:" + ((b - a) / 1440 * 100) + "%" }));
      rows.append(h("div", { class: "weekrow" + (day === sel ? " sel" : ""), onclick: () => { sel = day; drawClock(); drawRows(); } },
        h("span", { class: "wday" }, name), h("div", { class: "wtrack" }, ...[6, 12, 18].map(hr => h("i", { class: "wgrid", style: "left:" + (hr / 24 * 100) + "%" })), ...bars),
        h("span", { class: "wtime small" }, (sessions[day] || []).length ? span(day) : "closed")));
    }
  }
  drawClock(); drawRows();
  return h("div", { class: "sessviz" }, clockBox, rows);
}

async function viewDataNew(v) {
  v.append(h("div", { class: "row", style: "margin-bottom:14px" }, h("a", { href: "#data" }, "< Datasets"), h("h1", { style: "margin:0" }, "New dataset")));
  const regIn = h("input", { placeholder: "C:\\path\\to\\existing.tickbin", style: "flex:1" }), regName = h("input", { placeholder: "name", style: "width:160px" });
  v.append(h("div", { class: "card" }, importForm("new", null, name => { location.hash = "#data/" + encodeURIComponent(name); })),
    h("div", { class: "card" }, h("details", {}, h("summary", {}, "Register an existing .tickbin (no copy)"),
      h("div", { class: "row", style: "margin-top:6px" }, regName, regIn, h("button", { onclick: guard(async () => { if (!regName.value.trim()) throw new Error("enter a name"); await api("datasets/register", { body: { name: regName.value.trim(), path: regIn.value } }); toast("Registered"); location.hash = "#data/" + encodeURIComponent(regName.value.trim()); }) }, "Register")))));
}

async function viewDataDetail(v, name) {
  const list = await api("datasets");
  const d = list.find(x => x.name === name);
  if (!d) { v.append(h("div", { class: "card bad" }, "Unknown dataset '" + name + "'. "), h("a", { href: "#data" }, "< Datasets")); return; }
  const hist = d.history || [];
  v.append(h("div", { class: "row", style: "margin-bottom:10px" }, h("a", { href: "#data" }, "< Datasets"), h("h1", { style: "margin:0" }, d.name),
    d.missing ? null : [h("span", { class: "muted small" }, d.first.slice(0, 10) + "  -  " + d.last.slice(0, 10)), h("span", { class: "chip plain" }, num(d.ticks / 1e6, 1) + "M ticks"), h("span", { class: "chip plain" }, num(d.size_mb / 1000, 2) + " GB"), h("span", { class: "chip plain" }, d.digits + " digits")],
    h("span", { class: "spacer" }),
    h("button", { class: "danger", onclick: guard(async () => { if (!confirm("Remove dataset '" + d.name + "' (the tick file is deleted unless it was registered from elsewhere)?")) return; await api("datasets/" + encodeURIComponent(d.name), { method: "DELETE" }); location.hash = "#data"; }) }, "Remove dataset")));
  if (d.missing) { v.append(h("div", { class: "card bad" }, "Tick file missing: " + d.path)); return; }
  const cov = h("div"), gaps = h("div", { class: "small warn gapline" });
  v.classList.add("wide"); // this page uses the whole window
  const col1 = h("div", { class: "dcol" }), colAdd = h("div", { class: "dcol" }), col2 = h("div", { class: "dcol" }), col3 = h("div", { class: "dcol" });
  const priceHost = h("div"), tilesHost = h("div", { class: "tiles", style: "margin:8px 0" }), heatHost = h("div", { class: "heatwrap" }), qualHost = h("div");
  col1.append(h("div", { class: "card pricecard" },
    h("h2", {}, "Price & coverage"),
    h("div", { class: "small muted" }, "Daily bid price (line: close, band: high - low)"), priceHost, tilesHost,
    h("div", { class: "small muted", style: "margin-top:6px" }, "Monthly performance in % (bid) and ticks per month"), heatHost,
    h("div", { class: "small muted", style: "margin-top:6px" }, "Ticks per month (a missing or very low bar is a gap)"), cov, gaps,
    h("details", { style: "margin-top:6px" }, h("summary", { class: "small" }, "Where this data came from" + (hist.length ? " (" + hist.length + " import" + (hist.length > 1 ? "s" : "") + ")" : "")),
      hist.length ? h("table", {}, h("tr", {}, ...["Imported", "Files", "Ticks added", "Skipped (overlap)"].map(x => h("th", {}, x))), ...hist.map(x => h("tr", {}, h("td", {}, ago(x.at)), h("td", {}, (x.files || []).join(", ")), h("td", { class: "num" }, num(x.ticks_added, 0)), h("td", { class: "num" }, num(x.ticks_skipped, 0)))))
        : h("div", { class: "small muted" }, Array.isArray(d.source) ? d.source.join(", ") : String(d.source || "")),
      h("div", { class: "small muted", style: "margin-top:6px" }, "File: " + d.path))));
  api("datasets/" + encodeURIComponent(d.name) + "/coverage").then(c => {
    new CatChart(cov, { height: 70, signColors: false, yFmt: x => num(x / 1e6, 1) + "M", pad: { l: 50, r: 10, t: 6, b: 24 } }).set(c.map(m => m.month), c.map(m => m.ticks), c.map(m => m.first ? m.first.slice(0, 16) + " .. " + m.last.slice(0, 16) : "no data"));
    const med = c.map(m => m.ticks).sort((a, b) => a - b)[Math.floor(c.length / 2)] || 0;
    const bad = c.filter((m, i) => i > 0 && i < c.length - 1 && m.ticks < med * 0.3).map(m => m.month + " (" + num(m.ticks, 0) + ")");
    if (bad.length) { gaps.textContent = "Possible gaps: " + bad.join(", "); gaps.title = gaps.textContent; } // one line, cut off with "..." when longer
  }).catch(() => { });

  // symbol specification + broker/account settings are chosen per dataset and used by 'New run' for it
  const files = await api("files");
  const labelOf = Object.fromEntries(schema.config.flatMap(g => g.fields.map(f => [f.key, f])));
  // MT5 writes "no limit" as a huge number: show it as a word
  const nice = value => (/^\d+(\.\d+)?$/.test(String(value)) && +value >= 1e9) ? "unlimited" : value;
  const tile = (label, value, unit, changed) => h("div", { class: "tile" + (changed ? " changed" : "") }, h("div", { class: "tl" }, label), h("div", { class: "tv" }, nice(value), unit && nice(value) !== "unlimited" ? h("span", { class: "tu" }, " " + unit) : null));
  const units = { "latency.feed_ms": "ms", "latency.open_ms": "ms", "latency.close_ms": "ms", "latency.modify_ms": "ms", "latency.jitter_ms": "ms", "costs.slippage_points": "pts", "costs.deviation_points": "pts", "costs.commission_per_lot": "/ lot / side", "account.initial_balance": "USD", "symbol.stops_level": "pts", "symbol.rollover_offset_min": "min" };
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], hm = m => pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);

  // values edited by hand on this page: saved with the dataset (the symbol / config files stay untouched) and applied in Research
  const ov = Object.assign({}, d.overrides || {});
  let ovTimer = null;
  const saveOvNow = async () => { clearTimeout(ovTimer); await api("datasets/" + encodeURIComponent(d.name) + "/settings", { body: { overrides: ov } }); d.overrides = Object.assign({}, ov); };
  const saveOv = () => { clearTimeout(ovTimer); ovTimer = setTimeout(guard(async () => { await saveOvNow(); toast("Saved - Research uses the edited values"); }), 600); };
  function settingsCard(kind, title, help, groups) {
    const card = h("div", { class: "card" }), body = h("div");
    const cur = d[kind] || "";
    const keysHere = schema.config.filter(x => groups.includes(x.group)).flatMap(g => g.fields.map(f => f.key));
    const resetBtn = h("button", { title: "forget the values edited here and use the file again", onclick: guard(async () => { for (const k of keysHere) delete ov[k]; await saveOvNow(); toast("Edits removed"); show(sel.value).catch(() => {}); }) }, "Reset edits");
    const sel = h("select", {}, h("option", { value: "" }, "(none)"), ...files[kind].map(n => h("option", { value: n, selected: n === cur }, n)));
    const up = h("input", { type: "file", accept: kind === "symbol" ? ".json" : ".cfg,.ini,.txt", style: "display:none", onchange: guard(async () => {
      const f = up.files[0]; if (!f) return;
      await api("files/" + kind + "/" + encodeURIComponent(f.name), { method: "POST", body: new Blob([await f.arrayBuffer()]) });
      await api("datasets/" + encodeURIComponent(d.name) + "/settings", { body: { [kind]: f.name } }); toast("Saved " + f.name); route();
    }) });
    sel.onchange = guard(async () => { await api("datasets/" + encodeURIComponent(d.name) + "/settings", { body: { [kind]: sel.value } }); toast(sel.value ? "Using " + sel.value : "Cleared"); show(sel.value); });
    card.append(h("div", { class: "row" }, h("h2", { style: "margin:0" }, title), h("span", { class: "spacer" }), sel, h("button", { onclick: () => up.click() }, "Upload"), up, resetBtn),
      body);
    async function show(name) {
      body.innerHTML = "";
      const p = name ? await api("files/" + kind + "/" + encodeURIComponent(name) + "/parsed") : null;
      const e = p ? p.entries : {};
      const store = {};
      for (const g of schema.config.filter(x => groups.includes(x.group))) {
        const fl = h("div", { class: "fields" });
        for (const f of g.fields) {
          const fileVal = e[f.key] !== undefined ? String(e[f.key]) : String(f.default);
          store[f.key] = ov[f.key] !== undefined ? ov[f.key] : fileVal;
          const lbl = fieldInput(Object.assign({}, f, { label: f.label + (units[f.key] ? " (" + units[f.key] + ")" : "") }), store, () => {
            if (String(store[f.key]) === fileVal) delete ov[f.key]; else ov[f.key] = String(store[f.key]);
            lbl.classList.toggle("overridden", ov[f.key] !== undefined); saveOv();
          });
          lbl.classList.toggle("overridden", ov[f.key] !== undefined);
          fl.append(lbl);
        }
        body.append(h("h3", {}, g.group.replace(" (ms)", "")), fl);
      }
      if (kind === "symbol" && p && p.sessions) body.append(h("h3", {}, "Trade sessions (server time)"), sessionsViz(p.sessions));
      const known = new Set(schema.config.flatMap(g => g.fields.map(f => f.key)));
      const rest = Object.entries(e).filter(([k]) => !known.has(k));
      if (rest.length) body.append(h("details", { style: "margin-top:8px" }, h("summary", { class: "small" }, rest.length + " more values in the file"), h("div", { class: "small muted" }, rest.map(([k, val]) => k + " = " + val).join("   "))));
    }
    show(cur).catch(err => body.append(h("div", { class: "bad small" }, err.message)));
    return card;
  }
  // four equal boxes that fill the window: coverage | add data | symbol | broker & account
  const addCard = h("div", { class: "card addcard" }, h("h2", {}, "Add data"), importForm("append", d.name, () => route()),
    h("h2", { style: "margin-top:16px" }, "Data quality"), qualHost);
  colAdd.append(addCard);
  col2.append(settingsCard("symbol", "Symbol specification", "", ["Symbol"]));
  col3.append(settingsCard("config", "Broker & account", "", ["Account", "Costs", "Latency (ms)", "Tester"]));
  const fit = h("div", { class: "datafit" }, col1, colAdd, col2, col3);
  v.append(fit);
  loadDatasetStats(d, priceHost, tilesHost, qualHost, heatHost);
  const resize = () => { if (!fit.isConnected) { window.removeEventListener("resize", resize); return; } if (innerWidth > 1100) fit.style.height = Math.max(520, v.getBoundingClientRect().bottom - fit.getBoundingClientRect().top - (parseFloat(getComputedStyle(v).paddingBottom) || 0) - 2) + "px"; else fit.style.height = ""; };
  window.addEventListener("resize", resize); resize(); setTimeout(resize, 400);
}

// price chart, headline statistics and data-quality numbers of a dataset (one pass over the ticks on the server, cached afterwards)
async function loadDatasetStats(d, priceHost, tilesHost, qualHost, heatHost) {
  const wait = h("div", { class: "small muted" }, "analysing the ticks ... (a few seconds the first time)");
  priceHost.append(wait);
  let s;
  try { s = await api("datasets/" + encodeURIComponent(d.name) + "/stats"); } catch (e) { wait.textContent = "statistics unavailable: " + e.message; return; }
  wait.remove();
  const days = s.days, x = days.map(b => b[0]);
  new XYChart(priceHost, { height: 190, yFmt: v => num(v, 0) }).set([
    { type: "band", name: "high-low", x, lo: days.map(b => b[3]), hi: days.map(b => b[2]) },
    { type: "line", name: "close", x, y: days.map(b => b[4]), color: cssVar("--c1"), width: 1.4 }]);
  const mini = (label, val, sub) => h("div", { class: "tile" }, h("div", { class: "tl" }, label), h("div", { class: "tv" }, val), sub ? h("div", { class: "tl ts" }, sub) : null);
  const chg = s.price.first ? (s.price.last / s.price.first - 1) * 100 : 0;
  tilesHost.append(
    mini("First -> last bid", num(s.price.first, 0) + " -> " + num(s.price.last, 0), (chg >= 0 ? "+" : "") + num(chg, 0) + " %"),
    mini("Lowest / highest", num(s.price.min, 0) + " / " + num(s.price.max, 0)),
    mini("Avg daily range", num(s.range.avg_daily, 1), "avg |daily move| " + num(s.range.avg_abs_return_pct, 2) + " %"),
    mini("Biggest daily range", num(s.range.max_daily, 0), fmt(s.range.max_daily_day).slice(0, 10)),
    mini("Ticks per trading day", num(s.ticks_per_day / 1000, 0) + " k", "one every " + num(s.avg_tick_interval_ms, 0) + " ms"),
    mini("Spread", num(s.spread.avg, 1) + " pts", s.spread.min + " .. " + s.spread.max + " pts"));
  // monthly performance heatmap (close of the month vs close of the previous month) with the tick count of each month
  try {
    const cov = await api("datasets/" + encodeURIComponent(d.name) + "/coverage"), tk = Object.fromEntries(cov.map(m => [m.month, m.ticks]));
    const last = new Map(), first = new Map(); // month -> last close / first open
    for (const b of days) { const k = fmt(b[0]).slice(0, 7); if (!first.has(k)) first.set(k, b[1]); last.set(k, b[4]); }
    const keys = [...last.keys()].sort(), ret = new Map(); let prev = null;
    for (const k of keys) { const base = prev != null ? prev : first.get(k); ret.set(k, (last.get(k) / base - 1) * 100); prev = last.get(k); }
    const years = [...new Set(keys.map(k => k.slice(0, 4)))], MN = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
    const col = p => p == null ? "" : `background: color-mix(in srgb, var(${p >= 0 ? "--good" : "--bad"}) ${Math.round(Math.min(1, Math.abs(p) / 10) * 70 + 8)}%, transparent)`;
    const compact = years.length > 12; // many years: one line per cell, the tick count moves into the tooltip
    const t = h("table", { class: "mheat" + (compact ? " compact" : "") }, h("tr", {}, h("th", {}, ""), ...MN.map(m => h("th", {}, m)), h("th", {}, "Year")));
    for (const y of years) {
      const yk = keys.filter(k => k.startsWith(y)), yr = yk.reduce((a, k) => a * (1 + ret.get(k) / 100), 1) * 100 - 100;
      t.append(h("tr", {}, h("th", {}, y), ...MN.map((_, mi) => {
        const k = y + "-" + String(mi + 1).padStart(2, "0"), p = ret.get(k);
        return h("td", { style: col(p), title: p == null ? "no data" : k + ": " + (p >= 0 ? "+" : "") + num(p, 2) + " %,  " + num(tk[k] || 0, 0) + " ticks" },
          p == null ? "" : [h("div", { class: "hp" }, (p >= 0 ? "+" : "") + num(p, 1)), h("div", { class: "ht" }, num((tk[k] || 0) / 1e6, 1) + "M")]);
      }), h("td", { class: "hy", style: col(yr) }, (yr >= 0 ? "+" : "") + num(yr, 0) + "%")));
    }
    heatHost.append(t);
  } catch (e) { /* the heatmap is optional */ }
  // data quality: when the market is active
  const hrs = h("div"), wds = h("div");
  qualHost.append(h("div", { class: "small muted" }, "Ticks by hour of the day (server time)"), hrs, h("div", { class: "small muted", style: "margin-top:6px" }, "Ticks by weekday"), wds);
  new CatChart(hrs, { height: 80, signColors: false, yFmt: v => num(v / 1e6, 0) + "M", pad: { l: 40, r: 6, t: 4, b: 18 } }).set(s.ticks_by_hour.map((_, i) => pad2(i)), s.ticks_by_hour, s.ticks_by_hour.map(v => num(v, 0) + " ticks"));
  const order = [1, 2, 3, 4, 5, 6, 0], dn = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  new CatChart(wds, { height: 70, signColors: false, yFmt: v => num(v / 1e6, 0) + "M", pad: { l: 40, r: 6, t: 4, b: 18 } }).set(dn, order.map(i => s.ticks_by_weekday[i]), order.map(i => num(s.ticks_by_weekday[i], 0) + " ticks"));
}
// ---------------------------------------------------------------- STRATEGY EDITOR (MQL5 -> Rust via headless Claude)
const MQL_TEMPLATE = `//+------------------------------------------------------------------+
//| Paste your MetaTrader 5 Expert Advisor here                      |
//+------------------------------------------------------------------+
input int FastPeriod = 10;
input int SlowPeriod = 30;

int OnInit() { return INIT_SUCCEEDED; }
void OnTick() { /* ... */ }
`;
async function viewStudio(v, sel) {
  v.append(h("h1", {}, "Strategy editor"));
  v.append(h("div", { class: "muted small", style: "margin:-6px 0 12px;max-width:880px" }, "Paste or edit a MetaTrader 5 Expert Advisor (.mq5). 'Compile' sends it to Claude Code on this computer, which ports it to a Rust strategy for this engine, builds it, and restarts the server with it. It then shows up as a strategy in 'New run'. Conversion takes a few minutes and uses your Claude Code account."));
  const wrap = h("div", { class: "studio" }), listBox = h("div", { class: "card studio-list" }), edBox = h("div");
  wrap.append(listBox, edBox); v.append(wrap);
  let current = sel ? decodeURIComponent(sel) : null, isNew = false;

  async function drawList() {
    const items = await api("studio");
    listBox.innerHTML = "";
    listBox.append(h("div", { class: "row", style: "margin-bottom:8px" }, h("b", {}, "Strategies"), h("span", { class: "spacer" }),
      h("button", { onclick: () => { current = null; isNew = true; drawEditor(); drawList(); } }, "+ New")));
    if (!items.length && !isNew) listBox.append(h("div", { class: "muted small" }, "None yet."));
    for (const it of items) {
      const st = it.last && it.last.status === "error" ? h("span", { class: "badge error" }, "failed") : it.compiled ? h("span", { class: "badge done" }, "compiled") : h("span", { class: "badge" }, "not compiled");
      listBox.append(h("div", { class: "listitem" + (it.name === current ? " active" : ""), onclick: () => { current = it.name; isNew = false; location.hash = "#studio/" + encodeURIComponent(it.name); } }, h("span", {}, it.name), st));
    }
  }

  async function drawEditor() {
    edBox.innerHTML = "";
    if (!current && !isNew) { edBox.append(h("div", { class: "card muted" }, "Choose a strategy on the left or create a new one.")); return; }
    let data = { name: current || "", source: MQL_TEMPLATE, rust: "", last: {} };
    if (current) data = await api("studio/" + encodeURIComponent(current));
    const nameIn = h("input", { value: data.name, placeholder: "strategy name, e.g. my_ea", style: "width:260px", disabled: !!current });
    const ta = h("textarea", { class: "code", spellcheck: "false", rows: 30 }); ta.value = data.source || MQL_TEMPLATE;
    ta.addEventListener("keydown", e => { if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText("    ", s, ta.selectionEnd, "end"); } });
    const info = h("span", { class: "small muted" });
    const upd = () => { info.textContent = ta.value.split("\n").length + " lines, " + ta.value.length + " characters"; }; ta.addEventListener("input", upd); upd();
    const logBox = h("pre", { class: "log", style: "max-height:260px" });
    const logDet = h("details", { style: "margin-top:8px; display:none" }, h("summary", { class: "small" }, "Live log"), logBox);
    const panel = progressPanel(["Prepare", "Claude ports", "Build", "Smoke test", "Restart"]);
    const noteIn = h("textarea", { rows: 2, placeholder: "Optional instructions for Claude, e.g. \"the EA is meant for M15\" or \"ignore the news filter\"", style: "margin-top:10px" });
    const saveBtn = h("button", { onclick: guard(async () => { await save(); toast("Saved"); drawList(); }) }, "Save");
    const compileBtn = h("button", { class: "primary", onclick: guard(compile) }, "Compile with Claude");

    async function save() {
      const nm = nameIn.value.trim(); if (!nm) throw new Error("enter a strategy name");
      const r = await api("studio/" + encodeURIComponent(nm), { body: { source: ta.value } });
      current = r.name; isNew = false; nameIn.value = r.name; nameIn.disabled = true; return r.name;
    }
    async function compile() {
      const nm = await save();
      saveBtn.disabled = compileBtn.disabled = true; logBox.textContent = ""; logDet.style.display = ""; panel.start(); panel.set(0, null, "Starting");
      let job = null, restarting = false, waitRestart = 0;
      try {
        const j = await api("studio/" + encodeURIComponent(nm) + "/compile", { body: { note: noteIn.value } });
        for (;;) {
          await new Promise(r => setTimeout(r, 1000));
          try { job = await api("jobs/" + j.job); } catch (e) { if (restarting) break; throw e; }
          const log = job.log || [];
          logBox.textContent = log.join("\n"); logBox.scrollTop = logBox.scrollHeight;
          let step = 0; for (const l of log) { const m = /^\[(\d)\/5\]/.exec(l); if (m) step = +m[1] - 1; }
          const last = [...log].reverse().find(l => !/^\[\d\/5\]/.test(l)) || (log[log.length - 1] || "");
          if (job.restarting) { restarting = true; step = 4; if (++waitRestart > 30) break; }
          panel.set(step, null, restarting ? "Restarting the server with the new strategy" : (last.length > 140 ? last.slice(0, 140) + " ..." : last) || "Working");
          if (job.status !== "running") { if (!job.restarting) break; }
        }
        if (job && job.status === "error") throw new Error(job.message);
        // server restarts itself: wait until it answers again
        for (let i = 0; i < 90; i++) { try { await api("info"); if (i > 1) break; } catch (e) { /* still down */ } await new Promise(r => setTimeout(r, 1000)); }
        schema = await (await fetch("/api/schema")).json();
        panel.ok("Strategy \u0027" + nm + "\u0027 is ready - pick it in \u0027New run\u0027");
        toast("Strategy \u0027" + nm + "\u0027 is ready");
        setTimeout(route, 1500);
      } catch (e) {
        panel.err("Failed: " + e.message);
        saveBtn.disabled = compileBtn.disabled = false;
      }
    }

    const last = data.last || {};
    const lastBox = h("div", { class: "small", style: "margin-top:6px" });
    if (last.status === "ok") lastBox.append(h("div", { class: "good" }, "Last conversion succeeded (" + ago(last.at) + ", " + Math.round(last.seconds || 0) + " s)"), h("pre", { class: "log" }, last.summary || ""));
    else if (last.status === "error") lastBox.append(h("div", { class: "bad" }, "Last conversion failed (" + ago(last.at) + ")"), h("pre", { class: "log" }, last.error || ""));
    const rustPre = h("pre", { class: "log", style: "max-height:420px" }, data.rust || "");
    edBox.append(h("div", { class: "card" },
      h("div", { class: "row", style: "margin-bottom:8px" }, h("label", { class: "f" }, "Name", nameIn), h("span", { class: "spacer" }), info,
        current ? h("button", { class: "danger", onclick: guard(async () => { if (!confirm("Delete strategy '" + current + "' (source and generated Rust)?")) return; await api("studio/" + encodeURIComponent(current), { method: "DELETE" }); toast("Deleted - gone after the next rebuild"); location.hash = "#studio"; }) }, "Delete") : null),
      ta, noteIn, h("div", { class: "row", style: "margin-top:10px" }, compileBtn, saveBtn,
        current ? h("button", { onclick: () => { form.strategy = current; form.params = {}; const d = strategyDef(current); if (d) for (const q of d.params) form.params[q.key] = q.default; saveForm(); location.hash = "#new"; } }, "Use in a new run") : null),
      panel.el, logDet, lastBox),
      data.rust ? h("div", { class: "card" }, h("details", {}, h("summary", {}, "Generated Rust (read-only)"), rustPre)) : null);
  }
  await drawList(); await drawEditor();
}

// ---------------------------------------------------------------- NEW RUN view
function autoName() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  const s = strategyDef(form.strategy);
  return (s ? s.name : form.strategy) + " " + (form.from || "start") + ".." + (form.to || "end") + "  " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
function fieldInput(f, store, onChange) {
  const cur = store[f.key] ?? f.default;
  let inp;
  if (f.type === "select") inp = h("select", {}, ...f.options.map(o => h("option", { value: o, selected: o === cur }, o)));
  else if (f.type === "bool") inp = h("select", {}, ...["true", "false"].map(o => h("option", { value: o, selected: o === cur }, o)));
  else inp = h("input", { type: "text", inputmode: "decimal", value: cur });
  const label = h("label", { class: "f", title: f.help || "" }, f.label, inp);
  const upd = () => { store[f.key] = inp.value; label.classList.toggle("changed", inp.value !== f.default); saveForm(); onChange && onChange(); };
  inp.addEventListener("input", upd); inp.addEventListener("change", upd);
  label.classList.toggle("changed", String(cur) !== f.default);
  label._set = val => { inp.value = val; upd(); };
  return label;
}

async function viewNew(v, arg) {
  const [ds, files] = await Promise.all([api("datasets"), api("files")]);
  v.append(h("h1", { class: "withicon" }, icon("flask"), "Research"));
  if (!ds.length) v.append(h("div", { class: "card warn" }, "No tick dataset yet - add one under Data & files first."));
  const sel = (list, cur, none) => h("select", {}, h("option", { value: "" }, none), ...list.map(n => h("option", { value: n, selected: n === cur }, n)));

  // --- basics
  const dsSel = sel(ds.map(d => d.name), form.dataset, "(choose)");
  if (!form.dataset && ds.length) { form.dataset = ds[0].name; dsSel.value = form.dataset; }
  dsSel.onchange = () => { form.dataset = dsSel.value; saveForm(); showRange(); applyDatasetSettings(); };
  const rangeInfo = h("span", { class: "small muted" });
  function showRange() { const d = ds.find(x => x.name === form.dataset); applyDateLimits(d && !d.missing ? d : null); updateSetupInfo(); rangeInfo.textContent = d && !d.missing ? "data: " + d.first.slice(0, 10).replace(/-/g, ".") + " .. " + d.last.slice(0, 10).replace(/-/g, ".") : ""; }
  const bind = (key, inp) => { inp.value = form[key] || ""; inp.addEventListener("input", () => { form[key] = inp.value; saveForm(); }); return inp; };
  const strategySel = h("select", {}, ...schema.strategies.map(s => h("option", { value: s.name, selected: s.name === form.strategy }, s.label)));
  const paramsBox = h("div"), cfgBox = h("div");

  // preset selectors
  const symSel = sel(files.symbol, form.symbol, "(none)");
  const cfgSel = sel(files.config, form.configFile, "(none)");
  const setSel = sel(files.set, form.setFile, "(none)");
  if (!form.symbol && files.symbol.length) { /* leave none; user chooses */ }

  function applyEntries(entries) {
    let n = 0;
    const known = new Set(cfgFields().map(f => f.key));
    for (const [k, val] of Object.entries(entries)) { if (known.has(k)) form.config[k] = val; else form.extra[k] = val; n++; }
    saveForm(); renderCfg();
    return n;
  }
  symSel.onchange = guard(async () => {
    form.symbol = symSel.value; saveForm(); if (!form.symbol) return;
    const p = await api("files/symbol/" + encodeURIComponent(form.symbol) + "/parsed");
    toast("Loaded " + applyEntries(p.entries) + " symbol values from " + p.name);
  });
  cfgSel.onchange = guard(async () => {
    form.configFile = cfgSel.value; saveForm(); if (!form.configFile) return;
    const p = await api("files/config/" + encodeURIComponent(form.configFile) + "/parsed");
    toast("Loaded " + applyEntries(p.entries) + " config values");
  });
  setSel.onchange = guard(async () => {
    form.setFile = setSel.value; saveForm(); if (!form.setFile) return;
    const p = await api("files/set/" + encodeURIComponent(form.setFile) + "/parsed");
    form.params = {}; let skipped = 0;
    const d = strategyDef(form.strategy); if (d) for (const q of d.params) form.params[q.key] = q.default;
    for (const [k, val] of Object.entries(p.entries)) { const c = canonicalParam(form.strategy, k); if (c) form.params[c] = val; else skipped++; }
    const nr = applySetRanges(p.ranges);
    saveForm(); renderParams(); optPanel.render();
    toast("Loaded parameters" + (nr ? ", " + nr + " with a search range (ticked under the parameters)" : "") + (skipped ? " (" + skipped + " keys do not belong to this strategy and were ignored)" : ""));
  });
  strategySel.onchange = () => {
    form.strategy = strategySel.value; form.params = {}; form.ranges = {}; const d = strategyDef(form.strategy);
    for (const q of d.params) form.params[q.key] = q.default; saveForm(); renderParams();
  };
  // upload shortcuts
  function uploader(kind, selEl, text) {
    const inp = h("input", { type: "file", style: "display:none", onchange: guard(async () => {
      const f = inp.files[0]; if (!f) return;
      await api("files/" + kind + "/" + encodeURIComponent(f.name), { method: "POST", body: new Blob([await f.arrayBuffer()]) });
      selEl.append(h("option", { value: f.name }, f.name)); selEl.value = f.name; selEl.onchange(); inp.value = "";
    }) });
    return h("span", {}, h("button", { onclick: () => inp.click() }, text), inp);
  }
  function saver(kind, text, build) {
    return h("button", { onclick: guard(async () => {
      const name = prompt("Save as (file name):", kind === "set" ? "my_params.set" : "my_config.cfg"); if (!name) return;
      await api("files/" + kind + "/" + encodeURIComponent(name), { method: "POST", body: build() });
      toast("Saved " + name); const s = kind === "set" ? setSel : cfgSel;
      if (![...s.options].some(o => o.value === name)) s.append(h("option", { value: name }, name)); s.value = name;
      if (kind === "set") form.setFile = name; else form.configFile = name; saveForm();
    }) }, text);
  }

  // --- settings are split into tabs; only what differs from the defaults is surfaced as chips
  const TABS = [["strategy", "Strategy", null], ["optimize", "Optimizer", null], ["costs", "Account & costs", ["Account", "Costs"]], ["latency", "Latency", ["Latency (ms)"]], ["symbol", "Symbol", ["Symbol"]], ["tester", "Tester", ["Tester"]], ["sweep", "Sweep", null]];
  const groupTab = {}; for (const [t, , gs] of TABS) for (const g of gs || []) groupTab[g] = t;
  const keyTab = {}; for (const g of schema.config) for (const f of g.fields) keyTab[f.key] = groupTab[g.group];
  const panels = Object.fromEntries(TABS.map(([t]) => [t, h("div")]));
  const tabBtns = {}, tabBody = h("div", { class: "tabbody" }), chipsBox = h("div", { class: "chips" });
  // two levels: Strategy (parameters + what to search) | Optimizer (search settings) | Extra, and Extra holds the rest (account & costs, latency, symbol, tester, sweep)
  const EXTRA = ["costs", "latency", "symbol", "tester", "sweep"];
  let lastExtra = "costs";
  const extraBtn = h("button", { class: "bigtab", onclick: () => showTab(lastExtra) }, ...bigLabeled("layers", "Extra", "costs, latency, symbol, tester, sweep"));
  const subTabs = h("div", { class: "tabs sub" });
  const searchIn = h("input", { placeholder: "filter fields ...", style: "width:180px" });
  const onlyChanged = h("input", { type: "checkbox" });
  let activeTab = "strategy";

  function changedList() {
    const out = [];
    for (const f of cfgFields()) { const val = form.config[f.key]; if (val !== undefined && String(val) !== f.default) out.push({ label: f.label, val, tab: keyTab[f.key] }); }
    const d = strategyDef(form.strategy);
    for (const [k, val] of Object.entries(form.params)) { const def = d && d.params.find(p => p.key === k); if (!def || String(def.default) !== String(val)) out.push({ label: k, val, tab: "strategy" }); }
    return out;
  }
  const optTabLabel = n => { tabBtns.optimize.querySelector(".t").textContent = "Optimizer" + (n ? "  (" + n + " ticked)" : ""); };
  function refresh() {
    const ch = changedList(), per = {};
    for (const c of ch) per[c.tab] = (per[c.tab] || 0) + 1;
    for (const [t, l] of TABS) tabBtns[t].querySelector(".t").textContent = l + (per[t] ? "  (" + per[t] + ")" : "");
    try { optTabLabel(optPanel.count()); } catch (e) { /* the panel does not exist yet during start-up */ }
    const nExtra = EXTRA.reduce((s, t) => s + (per[t] || 0), 0); extraBtn.querySelector(".t").textContent = "Extra" + (nExtra ? "  (" + nExtra + ")" : "");
    chipsBox.innerHTML = "";
    chipsBox.append(h("span", { class: "muted small" }, ch.length ? "Differs from defaults (" + ch.length + "):" : "Everything is at its default."));
    for (const c of ch.slice(0, 40)) chipsBox.append(h("button", { class: "chip", title: "open this setting", onclick: () => { searchIn.value = c.label; showTab(c.tab); } }, c.label + " = " + c.val));
    if (ch.length > 40) chipsBox.append(h("span", { class: "muted small" }, "+" + (ch.length - 40) + " more"));
  }
  function applyFilter() {
    const q = searchIn.value.trim().toLowerCase();
    tabBody.classList.toggle("only-changed", onlyChanged.checked);
    let groupShown = null;
    tabBody.querySelectorAll("tr.prow, tr.grouprow").forEach(tr => {
      if (tr.classList.contains("grouprow")) { if (groupShown) groupShown.style.display = groupShown._any ? "" : "none"; groupShown = tr; tr._any = false; return; }
      const show = (!q || tr.dataset.key.toLowerCase().includes(q)) && (!onlyChanged.checked || tr.classList.contains("changed"));
      tr.style.display = show ? "" : "none"; if (show && groupShown) groupShown._any = true;
    });
    if (groupShown) groupShown.style.display = groupShown._any ? "" : "none";
    tabBody.querySelectorAll(".fields label.f").forEach(l => { l.style.display = !q || l.textContent.toLowerCase().includes(q) || (l.title || "").toLowerCase().includes(q) ? "" : "none"; });
  }
  function showTab(t) {

    activeTab = t; tabBody.innerHTML = ""; if (t === "strategy" || t === "optimize") optPanel.render();
    const inExtra = EXTRA.includes(t); if (inExtra) { lastExtra = t; subTabs.innerHTML = ""; for (const k of EXTRA) subTabs.append(tabBtns[k]); tabBody.append(subTabs); }
    tabBody.append(panels[t]);
    extraBtn.classList.toggle("active", inExtra);
    for (const [k] of TABS) tabBtns[k].classList.toggle("active", k === t);
    applyFilter();
    const curDs = ds.find(x => x.name === form.dataset); applyDateLimits(curDs && !curDs.missing ? curDs : null); // the date inputs of this tab are only attached now
  }
  searchIn.addEventListener("input", applyFilter); onlyChanged.addEventListener("change", applyFilter);

  function renderCfg() {
    for (const [t, , gs] of TABS) {
      if (!gs) continue;
      panels[t].innerHTML = "";
      for (const g of schema.config.filter(x => gs.includes(x.group))) {
        const fl = h("div", { class: "fields" });
        for (const f of g.fields) fl.append(fieldInput(f, form.config, refresh));
        if (gs.length > 1) panels[t].append(h("h3", {}, g.group)); // (appending null would print the word "null")
        panels[t].append(fl);
      }
    }
    const ex = Object.keys(form.extra);
    if (ex.length) panels.symbol.append(h("h3", {}, "Other keys from loaded files (passed through)"), h("div", { class: "small muted" }, ex.map(k => k + "=" + form.extra[k]).join("   ")));
    refresh(); applyFilter();
  }
  function renderParams() { optPanel.render(); refresh(); applyFilter(); } // the parameter table lives in the search panel

  // the symbol specification / broker config chosen on the dataset page are applied when the dataset is picked
  const setupInfo = h("div", { class: "setupinfo" });
  function updateSetupInfo() {
    setupInfo.replaceChildren(icon("folder"), "Symbol specification:", h("b", {}, form.symbol || "none"), h("span", { class: "sep" }, "|"), "Broker config:", h("b", {}, form.configFile || "none"), h("span", { class: "sep" }, "|"), (() => { const d = ds.find(x => x.name === form.dataset); const c = d && d.overrides ? Object.keys(d.overrides).length : 0; return c ? c + " value" + (c === 1 ? "" : "s") + " edited" : "no edits"; })(), h("span", { class: "sep" }, "|"), "set per dataset under",
      h("a", { href: "#data/" + encodeURIComponent(form.dataset || "") }, "Data & files"));
  }
  // values edited by hand on the Data & files page (saved with the dataset) go on top of the symbol / config files
  function applyDsOverrides() {
    const d = ds.find(x => x.name === form.dataset); const o = d && d.overrides;
    if (o && Object.keys(o).length) applyEntries(o);
    updateSetupInfo();
  }
  async function applyDatasetSettings() {
    const d = ds.find(x => x.name === form.dataset); if (!d) return;
    const jobs = [];
    if (d.symbol && files.symbol.includes(d.symbol) && form.symbol !== d.symbol) { symSel.value = d.symbol; jobs.push(symSel.onchange()); }
    if (d.config && files.config.includes(d.config) && form.configFile !== d.config) { cfgSel.value = d.config; jobs.push(cfgSel.onchange()); }
    await Promise.all(jobs);
    applyDsOverrides();
  }
  const nameIn = bind("name", h("input", { placeholder: "optional label", style: "width:220px" }));
  const fromDate = dateInput(form, "from", { title: "first day of trading (empty = start of the data)", empty: "start of the data" });
  const toDate = dateInput(form, "to", { title: "last day (empty = end of the data)", empty: "end of the data" });
  const warmIn = bind("warmup", h("input", { placeholder: "auto", style: "width:70px" }));
  // chart timeframe of the run (MQL5 PERIOD_CURRENT): one fixed list for runs, sweeps and the optimizer; overrides the strategy's own ChartTimeframe / Timeframe parameter
  const TIMEFRAMES = ["M1", "M2", "M3", "M4", "M5", "M6", "M10", "M12", "M15", "M20", "M30", "H1", "H2", "H3", "H4", "H6", "H8", "H12", "D1"];
  const tfIn = bind("timeframe", h("select", { title: "Chart timeframe of this run (like the chart period in the MT5 tester). Applies to runs, sweeps and optimizations and overrides the strategy's own ChartTimeframe / Timeframe parameter." }, h("option", { value: "" }, "strategy default"), ...TIMEFRAMES.map(x => h("option", { value: x }, x))));

  function buildRequest() {
    const config = Object.assign({}, form.extra, form.config);
    return { name: form.name || autoName(), dataset: form.dataset, symbol: form.symbol, strategy: form.strategy, config, params: Object.assign({}, form.params), from: form.from, to: form.to, timeframe: form.timeframe || "", warmup_days: form.warmup ? +form.warmup : null, search_ui: { ranges: JSON.parse(JSON.stringify(form.ranges || {})), opt: Object.assign({}, form.opt || {}) } };
  }
  // one normal forward pass with the values of the parameter table (what is ticked for search is ignored)
  const runOnce = guard(async () => {
    if (!form.dataset) throw new Error("choose a dataset");
    const r = await api("runs", { body: buildRequest() }); location.hash = "#run/" + r.id;
  });
  const optPanel = buildOptimizePanel(buildRequest, { files: files.set, setSel, onUpdate: n => { runBtn.replaceChildren(...labeled(n ? "rocket" : "play", n ? "Run optimization" : "Run forward pass")); runOnceBtn.style.display = n ? "" : "none"; optTabLabel(n); }, onParamChange: () => refresh() });
  const runBtn = h("button", { class: "primary", onclick: guard(async () => {
    if (!form.dataset) throw new Error("choose a dataset");
    if (optPanel.count()) return optPanel.start(); // parameters ticked for search: this is an optimization
    return runOnce();
  }) }, ...labeled("play", "Run forward pass"));
  // next to "Run optimization": the same values as one plain forward pass (hidden while nothing is ticked, then the main button does exactly that)
  const runOnceBtn = h("button", { title: "one normal forward pass with the values in the Value column (no search)", style: "display:none", onclick: runOnce }, ...labeled("play", "Run forward pass"));

  function cfgToText() {
    const bySec = {};
    for (const [k, val] of Object.entries(Object.assign({}, form.extra, form.config))) { const [s, key] = k.split("."); (bySec[s] = bySec[s] || []).push(key + "=" + val); }
    return Object.entries(bySec).map(([s, l]) => "[" + s + "]\n" + l.join("\n")).join("\n\n") + "\n";
  }

  // --- sweep
  const axes = [];
  const axesBox = h("div"), countEl = h("span", { class: "muted" });
  function axisValues(a) {
    if (a.mode === "list") return a.list.split(",").map(s => s.trim()).filter(Boolean);
    const from = +a.from, to = +a.to, step = +a.step; if (!(step > 0) || !isFinite(from) || !isFinite(to) || to < from) return [];
    const dec = Math.max(0, ...[a.from, a.step].map(x => (String(x).split(".")[1] || "").length));
    const out = []; for (let x = from, i = 0; x <= to + step * 1e-9 && i < 10000; i++, x = from + step * (i)) out.push(x.toFixed(dec)); return out;
  }
  function sweepKeys(target) { return target === "param" ? [...new Set([...(strategyDef(form.strategy)?.params.map(p => p.key) || []), ...Object.keys(form.params)])] : cfgFields().map(f => f.key); }
  function renderAxes() {
    axesBox.innerHTML = "";
    axes.forEach((a, i) => {
      const keySel = h("select", {}, ...sweepKeys(a.target).map(k => h("option", { value: k, selected: k === a.key }, k)));
      keySel.onchange = () => { a.key = keySel.value; };
      const tSel = h("select", {}, h("option", { value: "config", selected: a.target === "config" }, "setting"), h("option", { value: "param", selected: a.target === "param" }, "parameter"));
      tSel.onchange = () => { a.target = tSel.value; a.key = sweepKeys(a.target)[0]; renderAxes(); };
      const mSel = h("select", {}, h("option", { value: "range", selected: a.mode === "range" }, "range"), h("option", { value: "list", selected: a.mode === "list" }, "list"));
      mSel.onchange = () => { a.mode = mSel.value; renderAxes(); };
      const f = (k, w, ph) => { const x = h("input", { value: a[k] || "", style: "width:" + w + "px", placeholder: ph }); x.oninput = () => { a[k] = x.value; updCount(); }; return x; };
      axesBox.append(h("div", { class: "row", style: "margin:6px 0" }, h("b", {}, "Axis " + (i + 1)), tSel, keySel, mSel,
        a.mode === "range" ? [f("from", 70, "from"), "to", f("to", 70, "to"), "step", f("step", 60, "step")] : [f("list", 260, "0, 5, 10, 25")],
        h("button", { onclick: () => { axes.splice(i, 1); renderAxes(); } }, "remove")));
    });
    updCount();
  }
  function updCount() { const n = axes.reduce((p, a) => p * axisValues(a).length, 1); countEl.textContent = axes.length ? n + " passes" : ""; return n; }
  const sweepPanel = h("div", {}, h("h2", {}, "Sweep: run many passes over one or more values"),
    h("div", { class: "muted small" }, "Uses all settings above as the base and varies up to 3 settings/parameters, e.g. open delay 0..50 ms, or a strategy period. Result: table + heatmap. Passes run in parallel on one shared tick mapping."),
    axesBox,
    h("div", { class: "row", style: "margin-top:8px" },
      h("button", { onclick: () => { if (axes.length < 3) { axes.push({ target: "config", key: "latency.open_ms", mode: "range", from: "0", to: "50", step: "10", list: "" }); renderAxes(); } } }, "+ add axis"),
      h("button", { class: "primary", onclick: guard(async () => {
        if (!axes.length) throw new Error("add an axis first");
        const body = { base: buildRequest(), axes: axes.map(a => ({ target: a.target, key: a.key, values: axisValues(a) })) };
        if (!body.base.dataset) throw new Error("choose a dataset");
        body.base.name = form.name || "sweep";
        const r = await api("sweeps", { body }); location.hash = "#sweep/" + r.id;
      }) }, "Run sweep"), countEl));
  // --- assemble: run bar (always visible) -> what differs -> tabbed settings
  const TAB_ICONS = { strategy: "sliders", optimize: "target", costs: "wallet", latency: "zap", symbol: "tag", tester: "gauge", sweep: "grid" };
  const BIG_SUB = { strategy: "parameters and what to search", optimize: "algorithm, criterion, limits" };
  for (const [t, l] of TABS) tabBtns[t] = h("button", { class: BIG_SUB[t] ? "bigtab" : "", onclick: () => showTab(t) }, ...(BIG_SUB[t] ? bigLabeled(TAB_ICONS[t], l, BIG_SUB[t]) : labeled(TAB_ICONS[t], l)));
  panels.strategy.append(
    h("div", { class: "row gap-lg", style: "margin-bottom:6px" }, h("label", { class: "f" }, "Strategy", strategySel), h("label", { class: "f" }, "Parameter file (.set)", setSel),
      h("div", { class: "row", style: "align-self:flex-end" }, uploader("set", setSel, "Upload .set"), saver("set", "Save as .set", paramsAsSetText), h("button", { title: "save the parameters (and search ranges) as an MT5 .set file wherever you like", onclick: guard(exportSetFile) }, icon("download"), "Export .set"))));
  panels.sweep.append(sweepPanel);
  panels.strategy.append(optPanel.el);
  panels.optimize.append(optPanel.settings);

  const runBar = h("div", { class: "runbar setup" },
    sechead("play", "Test setup", "what to run on, and when"),
    h("label", { class: "f" }, lab("database", "Tick dataset"), dsSel), h("label", { class: "f" }, lab("calendar", "From (trading starts)"), fromDate.el), h("label", { class: "f" }, lab("calendar", "To (empty = end)"), toDate.el), h("label", { class: "f" }, lab("gauge", "Timeframe"), tfIn),
    h("label", { class: "f" }, lab("history", "Warm-up days"), warmIn), h("label", { class: "f grow" }, lab("tag", "Label"), nameIn), h("div", { class: "runbtns" }, runOnceBtn, runBtn), setupInfo);  const presets = h("div", { class: "row gap-lg presets" },
    h("label", { class: "row small" }, "Symbol", symSel, uploader("symbol", symSel, "upload")),
    h("label", { class: "row small" }, "Config", cfgSel, uploader("config", cfgSel, "upload"), saver("config", "save", cfgToText)),
    h("span", { class: "spacer" }),
    h("button", { onclick: () => { form = Object.assign(defaultForm(), { dataset: form.dataset, from: form.from, to: form.to, timeframe: form.timeframe }); ensureDefaults(); const d = strategyDef(form.strategy); for (const q of d.params) form.params[q.key] = q.default; saveForm(); route(); } }, "Reset all to defaults"));
  const tools = h("div", { class: "row small", style: "margin:8px 0" }, searchIn, h("label", { class: "row" }, onlyChanged, "only changed"), rangeInfo);
  // symbol / broker config are chosen per dataset on the Data & files page (applyDatasetSettings); the old selectors stay as hidden logic. Only "Reset all" is kept, in the header.
  const resetBtn = presets.lastElementChild;
  const cfgHead = sechead("cog", "Configuration", "strategy parameters, the search, and the extra settings"); cfgHead.append(h("span", { class: "spacer" }), resetBtn);
  // the "differs from defaults" summary is secondary: it goes below the fields
  v.append(runBar,
    h("div", { class: "card sec" }, cfgHead, h("div", { class: "bigtabs" }, tabBtns.strategy, tabBtns.optimize, extraBtn), tools, tabBody),
    h("div", { class: "card sec" }, chipsBox));
  renderCfg(); renderParams(); showTab(arg && panels[arg] ? arg : "strategy"); showRange();
  if (skipOverridesOnce) skipOverridesOnce = false; else if (form.symbol || form.configFile) applyDsOverrides();

  if (!form.symbol && !form.configFile) applyDatasetSettings();
}

// ---------------------------------------------------------------- RUNS list
function headlineCells(hd) {
  if (!hd) return [h("td", { colspan: 6, class: "muted" }, "")];
  return [h("td", { class: "num " + signCls(hd.net_profit) }, money(hd.net_profit)), h("td", { class: "num" }, num(hd.profit_factor)), h("td", { class: "num" }, hd.trades),
    h("td", { class: "num" }, num(hd.win_rate, 1) + "%"), h("td", { class: "num" }, num(hd.max_dd_rel_pct) + "%"), h("td", { class: "num" }, num(hd.expected_payoff))];
}
async function viewRuns(v) {
  v.append(historyBar("runs"));
  const box = h("div"); v.append(box);
  let selected = new Set(), showSweeps = false, q = "";
  const search = h("input", { placeholder: "search runs ...", style: "width:200px", oninput: () => { q = search.value.toLowerCase(); draw(); search.focus(); } });
  let runs = [];
  async function load() { runs = await api("runs"); draw(); }
  function brief(r) {
    const b = r.brief || {}, p = [];
    p.push((b.from || "start") + " .. " + (b.to || "end"));
    if (b.open_ms !== undefined && b.open_ms !== null) p.push("open " + b.open_ms + " ms");
    if (b.commission !== undefined && b.commission !== null) p.push("comm " + b.commission);
    if (b.slippage && +b.slippage) p.push("slip " + b.slippage);
    return r.strategy + "  |  " + p.join("  |  ");
  }
  function draw() {
    box.innerHTML = "";
    const shown = runs.filter(r => (showSweeps || !r.sweep) && (!q || (r.name + " " + brief(r)).toLowerCase().includes(q)));
    box.append(h("div", { class: "row", style: "margin-bottom:12px" }, h("h1", { style: "margin:0" }, "Runs"), h("span", { class: "muted" }, shown.length + (shown.length === 1 ? " run" : " runs")), h("span", { class: "spacer" }), search,
      h("label", { class: "row small" }, h("input", { type: "checkbox", checked: showSweeps, onchange: e => { showSweeps = e.target.checked; draw(); } }), "include sweep passes"),
      h("button", { onclick: () => { if (selected.size < 2) return toast("Tick at least two runs to compare", true); location.hash = "#compare/" + [...selected].join(","); } }, "Compare ticked"), h("a", { class: "btn newrun", href: "#new" }, icon("plus"), "New run")));
    if (!runs.length) { box.append(h("div", { class: "card" }, h("h2", {}, "No runs yet"), h("div", { class: "muted", style: "margin-bottom:10px" }, "Start your first forward pass - everything is preset, you only need a dataset."), h("a", { class: "btn newrun", href: "#new" }, icon("plus"), "New run"))); return; }
    const t = h("table", {}, h("tr", {}, ...[["", ""], ["Run", ""], ["Net profit", "num"], ["Profit factor", "num"], ["Trades", "num"], ["Win %", "num"], ["Max DD", "num"], ["Started", ""], ["", ""]].map(([x, c]) => h("th", { class: c }, x))));
    for (const r of shown) {
      const hd = r.headline, go = () => location.hash = "#run/" + r.id;
      const cb = h("input", { type: "checkbox", checked: selected.has(r.id), disabled: r.status !== "done", onchange: e => { e.target.checked ? selected.add(r.id) : selected.delete(r.id); } });
      const st = r.status === "done" ? null : h("span", { class: "badge " + r.status }, r.status);
      const cell = (txt, cls) => h("td", { class: "num " + (cls || ""), onclick: go }, hd ? txt : "");
      t.append(h("tr", { class: "click" },
        h("td", { onclick: e => e.stopPropagation() }, cb),
        h("td", { onclick: go }, h("b", {}, r.name), " ", st, h("span", { class: "sub" }, r.status === "error" ? h("span", { class: "bad" }, r.error) : brief(r)),
          r.status === "running" || r.status === "queued" ? h("div", { style: "width:320px;margin-top:4px" }, progressBar(r.progress)) : null),
        cell(hd && money(hd.net_profit), "bigpl " + signCls(hd && hd.net_profit)), cell(hd && num(hd.profit_factor)), cell(hd && hd.trades), cell(hd && num(hd.win_rate, 1) + "%"), cell(hd && num(hd.max_dd_rel_pct) + "%"),
        h("td", { class: "small muted", onclick: go }, ago(r.created)),
        h("td", { onclick: e => e.stopPropagation(), style: "white-space:nowrap" }, r.status === "done" ? h("button", { title: "download the parameters as .set", onclick: guard(() => downloadRunSet(r.id)) }, ".set") : null, " ", h("button", { class: "danger", onclick: guard(async () => { await api("runs/" + r.id, { method: "DELETE" }); selected.delete(r.id); load(); }) }, "delete"))));
    }
    box.append(h("div", { class: "card", style: "padding:0" }, h("div", { class: "tablewrap", style: "max-height:none;border:none" }, t)));
  }
  await load();
  every(async () => { if (runs.some(r => r.status === "queued" || r.status === "running")) await load(); }, 700);
}

// ---------------------------------------------------------------- RUN detail
const D = { id: 0, time: 1, pos: 2, buy: 3, kind: 4, lots: 5, price: 6, comm: 7, swap: 8, profit: 9, net: 10, bal: 11 };
function buildTrades(deals) {
  const open = new Map(), trades = [];
  for (const d of deals) {
    if (d[D.kind] === "in") open.set(d[D.pos], d);
    else {
      const o = open.get(d[D.pos]);
      trades.push({ n: trades.length + 1, side: d[D.buy] ? "buy" : "sell", lots: d[D.lots], t0: o ? o[D.time] : d[D.time], t1: d[D.time], p0: o ? o[D.price] : null, p1: d[D.price], kind: d[D.kind], comm: d[D.comm] + (o ? o[D.comm] : 0), swap: d[D.swap], profit: d[D.profit], net: d[D.net], bal: d[D.bal] });
    }
  }
  return trades;
}
function groupSum(trades, keyFn, labels) {
  const m = new Map(); labels.forEach(l => m.set(l, { net: 0, n: 0, w: 0 }));
  for (const t of trades) { const k = keyFn(t); const g = m.get(k) || (m.set(k, { net: 0, n: 0, w: 0 }), m.get(k)); g.net += t.net; g.n++; if (t.net > 0) g.w++; }
  return [...m.entries()];
}

async function viewRun(v, id) {
  let run = await api("runs/" + id);
  const head = h("div"), body = h("div"); v.append(head, body);
  function renderHead() {
    head.innerHTML = "";
    head.append(h("div", { class: "row" }, h("a", { href: "#runs" }, "< Runs"), h("h1", { style: "margin:0" }, run.name), h("span", { class: "badge " + run.status }, run.status), h("span", { class: "spacer" }),
      h("button", { onclick: () => { loadRequestIntoForm(run.request); location.hash = "#new"; } }, "Edit & re-run"),
      run.status === "done" ? h("button", { title: "save the performance diagram of this run as a PNG image", onclick: guard(() => exportRunDiagram(run)) }, icon("download"), "Export diagram") : null,
      run.status === "done" ? h("button", { class: "primary", title: "save this run into a folder: the strategy source (.txt), the .set file, the performance diagram (PNG) and a summary", onclick: guard(() => exportRun(run)) }, icon("download"), "Export run") : null,
      h("button", { title: "the parameters of this run as an MT5 .set file", onclick: guard(() => downloadRunSet(run.id)) }, "Download .set"),
      h("button", { class: "danger", onclick: guard(async () => { if (!confirm("Delete this run?")) return; await api("runs/" + run.id, { method: "DELETE" }); location.hash = "#runs"; }) }, "Delete")),
      h("div", { class: "chips", style: "margin:8px 0 12px" }, ...keyChips(run.request).map(([l, val]) => h("span", { class: "chip plain" }, l + ": " + val))));
  }
  renderHead();
  if (run.status === "queued" || run.status === "running") {
    const pbox = h("div", { class: "card" }), draw = () => { pbox.innerHTML = ""; pbox.append(h("h2", {}, run.status === "queued" ? "Queued" : "Running forward pass"), progressBar(run.progress)); };
    draw(); body.append(pbox);
    const t = every(async () => { run = await api("runs/" + id); renderHead(); if (run.status !== "queued" && run.status !== "running") { clearInterval(t); route(); } else draw(); }, 400);
    return;
  }
  if (run.status === "error") { body.append(h("div", { class: "card bad" }, "Pass failed: " + run.error)); return; }
  await renderRunBody(body, run);
}

// MT5 .set file (UTF-16 LE with BOM, loads in the tester / on a chart) of the parameters a run used
async function downloadRunSet(id) {
  const run = await api("runs/" + id), pr = effectiveRunParams(run.request || {});
  const text = "; saved by mt5bt from run " + run.name + "\n" + Object.entries(pr).map(([k, val]) => k + "=" + val).join("\n") + "\n";
  const u = new Uint16Array(text.length + 1); u[0] = 0xFEFF; for (let i = 0; i < text.length; i++) u[i + 1] = text.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([u], { type: "application/octet-stream" }));
  h("a", { href: url, download: (run.name || id).replace(/[^\w.-]+/g, "_") + ".set" }).click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------------------------------------------------------------- Export run: folder with the .mq5, the .set, the performance diagram and a summary
const safeName = s => String(s || "run").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "run";
const utf8 = s => new TextEncoder().encode(s);
const utf8Bom = s => { const b = utf8(s), o = new Uint8Array(b.length + 3); o.set([0xEF, 0xBB, 0xBF]); o.set(b, 3); return o; };   // MetaEditor opens UTF-8 with BOM
function utf16Bom(text) { const o = new Uint8Array(2 + text.length * 2); o[0] = 0xFF; o[1] = 0xFE; for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); o[2 + i * 2] = c & 255; o[3 + i * 2] = c >> 8; } return o; }

function niceTicks(lo, hi, n) {
  if (!(hi > lo)) { hi = lo + 1; }
  const raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p, out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(v);
  return out;
}

// the performance diagram as a PNG (always light, for documents): balance line, equity band, drawdown, key numbers
async function renderRunPng(run, eq) {
  const W = 1600, H = 1040, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  const ink = "#1c2330", muted = "#6a7586", line = "#e1e5eb", blue = "#2f6fed", red = "#c7352f", green = "#138a4b", font = "Segoe UI, Helvetica, Arial, sans-serif";
  const st = (run.summary && run.summary.stats) || {}, rq = run.request || {};
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.fillStyle = ink; g.font = "700 40px " + font; g.fillText(run.name || run.id, 60, 78);
  g.fillStyle = muted; g.font = "400 22px " + font;
  const when = eq.t.length ? fmtDay(eq.t[0]) + "  to  " + fmtDay(eq.t[eq.t.length - 1]) : "";
  g.fillText([rq.strategy, rq.dataset, rq.timeframe ? rq.timeframe : null, when].filter(Boolean).join("   |   "), 60, 116);
  // key numbers
  const kpis = [["Net profit", money(st.net_profit), st.net_profit >= 0 ? green : red], ["Final balance", money(st.final_balance), ink], ["Trades", String(st.trades ?? "-"), ink], ["Win rate", num(st.win_rate, 1) + " %", ink],
    ["Profit factor", num(st.profit_factor, 2), ink], ["Max drawdown", num(st.max_dd_rel_pct, 2) + " %", red], ["Expected payoff", money(st.expected_payoff), ink]];
  const kw = (W - 120) / kpis.length;
  kpis.forEach(([l, v, col], i) => { const x = 60 + i * kw; g.fillStyle = "#f6f7f9"; g.fillRect(x, 150, kw - 12, 96); g.fillStyle = muted; g.font = "600 17px " + font; g.fillText(l.toUpperCase(), x + 16, 182); g.fillStyle = col; g.font = "700 30px " + font; g.fillText(v, x + 16, 226); });
  // plots
  const X0 = 140, X1 = W - 60, n = eq.t.length;
  const t0 = eq.t[0], t1 = eq.t[n - 1] || t0 + 1, px = t => X0 + (t - t0) / Math.max(1, t1 - t0) * (X1 - X0);
  const xTicks = () => { const out = [], d0 = new Date(t0), d1 = new Date(t1), months = (d1.getUTCFullYear() - d0.getUTCFullYear()) * 12 + d1.getUTCMonth() - d0.getUTCMonth() + 1, every = months > 120 ? 24 : months > 60 ? 12 : months > 30 ? 6 : months > 14 ? 3 : 1;
    for (let k = 0; k <= months; k += every) { const d = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + k, 1); if (d >= t0 && d <= t1) out.push(d); } return out; };
  const frame = (y0, y1, ticks, py, fmtY) => {
    g.strokeStyle = line; g.lineWidth = 1; g.fillStyle = muted; g.font = "400 16px " + font; g.textAlign = "right";
    for (const v of ticks) { const y = py(v); g.beginPath(); g.moveTo(X0, y); g.lineTo(X1, y); g.stroke(); g.fillText(fmtY(v), X0 - 12, y + 5); }
    g.textAlign = "center"; for (const d of xTicks()) { const x = px(d), dd = new Date(d); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.fillText(dd.getUTCFullYear() + "-" + String(dd.getUTCMonth() + 1).padStart(2, "0"), x, y1 + 24); } g.textAlign = "left";
  };
  // equity + balance
  const Y0 = 300, Y1 = 700, lo = Math.min(...eq.equity_min, ...eq.balance), hi = Math.max(...eq.equity_max, ...eq.balance), pad = (hi - lo) * 0.06 || 1;
  const py = v => Y1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad)) * (Y1 - Y0);
  g.fillStyle = ink; g.font = "700 22px " + font; g.fillText("Balance and equity", X0, Y0 - 14);
  frame(Y0, Y1, niceTicks(lo - pad, hi + pad, 6), py, v => num(v, 0));
  g.beginPath(); eq.t.forEach((t, i) => { const x = px(t), y = py(eq.equity_max[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); for (let i = n - 1; i >= 0; i--) g.lineTo(px(eq.t[i]), py(eq.equity_min[i])); g.closePath(); g.fillStyle = "rgba(47,111,237,.16)"; g.fill();
  if (st.initial_balance != null) { g.setLineDash([8, 8]); g.strokeStyle = "#9aa6b8"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X0, py(st.initial_balance)); g.lineTo(X1, py(st.initial_balance)); g.stroke(); g.setLineDash([]); }
  g.strokeStyle = blue; g.lineWidth = 2.6; g.lineJoin = "round"; g.beginPath(); eq.t.forEach((t, i) => { const x = px(t), y = py(eq.balance[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  // drawdown
  const D0 = 790, D1 = 960, dmax = Math.max(1, ...eq.dd_pct) * 1.08, pd = v => D0 + v / dmax * (D1 - D0);
  g.fillStyle = ink; g.font = "700 22px " + font; g.fillText("Drawdown (%)", X0, D0 - 14);
  frame(D0, D1, niceTicks(0, dmax, 4), pd, v => num(v, 1));
  g.beginPath(); g.moveTo(px(eq.t[0]), D0); eq.t.forEach((t, i) => g.lineTo(px(t), pd(eq.dd_pct[i]))); g.lineTo(px(eq.t[n - 1]), D0); g.closePath(); g.fillStyle = "rgba(199,53,47,.25)"; g.fill();
  g.strokeStyle = red; g.lineWidth = 1.8; g.beginPath(); eq.t.forEach((t, i) => { const x = px(t), y = pd(eq.dd_pct[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  g.fillStyle = muted; g.font = "400 16px " + font; g.fillText("exported from mt5bt  |  " + new Date().toISOString().slice(0, 16).replace("T", " "), 60, H - 28);
  return await new Promise(res => c.toBlob(res, "image/png"));
}
const fmtDay = ms => new Date(ms).toISOString().slice(0, 10);

// minimal ZIP writer (stored, no compression) for browsers without a folder picker
function crc32(bytes) {
  if (!crc32.t) { crc32.t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc32.t[n] = c >>> 0; } }
  let crc = -1; for (let i = 0; i < bytes.length; i++) crc = crc32.t[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); return (crc ^ -1) >>> 0;
}
function makeZip(files, folder) {
  const now = new Date(), dosT = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dosD = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const name = utf8(folder + "/" + f.name), crc = crc32(f.bytes), lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dosT, true); lh.setUint16(12, dosD, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, f.bytes.length, true); lh.setUint32(22, f.bytes.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.bytes);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosT, true); ch.setUint16(14, dosD, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, f.bytes.length, true); ch.setUint32(24, f.bytes.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + f.bytes.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

// Export only the performance diagram as a PNG: a save dialog (Chrome / Edge) lets you choose folder and name, other browsers download it.
async function exportRunDiagram(run) {
  if (run.status !== "done") throw new Error("the run has not finished");
  const eq = await api("runs/" + run.id + "/equity?n=1600");
  if (!eq.t || eq.t.length < 2) throw new Error("this run has no equity curve");
  const blob = await renderRunPng(run, eq), name = safeName(run.name || run.id) + "_performance.png";
  if (window.showSaveFilePicker) {
    try {
      const fh = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "PNG image", accept: { "image/png": [".png"] } }] });
      const w = await fh.createWritable(); await w.write(blob); await w.close(); toast("Saved " + fh.name); return;
    } catch (e) { if (e && e.name === "AbortError") return; /* no permission here: fall back to a download */ }
  }
  const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
  toast("Downloaded " + name + " (your browser puts it in its download folder)");
}

// the parameters a run REALLY used: the run-level timeframe overrides the strategy's own ChartTimeframe / Timeframe parameter
const effectiveRunParams = rq => { const p = Object.assign({}, rq.params || {}); if (rq.timeframe) for (const k of ["ChartTimeframe", "Timeframe"]) if (k in p) p[k] = rq.timeframe; return p; };
// Export: choose a folder (Chrome / Edge) and a subfolder for this run is written into it; other browsers get a ZIP.
async function exportRun(run) {
  if (run.status !== "done") throw new Error("the run has not finished");
  const rq = run.request || {}, base = safeName(run.name || run.id), day = new Date((run.created || Date.now() / 1000) * 1000).toISOString().slice(0, 10);
  const folder = day + "_" + base, notes = [];
  const files = [];
  // 1. the original MQL5 strategy code as a .txt file (only strategies ported in the Strategy editor keep their source)
  let src = ""; try { src = (await api("studio/" + encodeURIComponent(rq.strategy || ""))).source || ""; } catch (e) { /* none */ }
  if (src) files.push({ name: safeName(rq.strategy) + ".txt", bytes: utf8Bom(src) }); else notes.push("No MQL5 source is stored for strategy '" + rq.strategy + "' (built-in strategy), so no strategy .txt file was exported.");
  // 2. the parameters of the run as an MT5 .set file
  const used = effectiveRunParams(rq);
  const set = "; saved by mt5bt from run " + (run.name || run.id) + "\n" + Object.entries(used).map(([k, v]) => k + "=" + v).join("\n") + "\n";
  files.push({ name: base + ".set", bytes: utf16Bom(set.replace(/\n/g, "\r\n")) });
  // 3. the performance diagram
  const eq = await api("runs/" + run.id + "/equity?n=1600");
  if (eq.t && eq.t.length > 1) files.push({ name: base + "_performance.png", bytes: new Uint8Array(await (await renderRunPng(run, eq)).arrayBuffer()) }); else notes.push("The run has no equity curve, so no diagram was exported.");
  // 4. a short text summary with everything needed to understand the run later
  const cfg = Object.entries(rq.config || {}).map(([k, v]) => k + " = " + v).join("\n");
  const txt = ["Run: " + (run.name || run.id), "Exported: " + new Date().toISOString().slice(0, 16).replace("T", " "), "Strategy: " + rq.strategy, "Dataset: " + rq.dataset, "Period: " + (rq.from || "start of the data") + " .. " + (rq.to || "end of the data"), "Timeframe: " + (rq.timeframe || "strategy default"), "Warm-up days: " + (rq.warmup_days ?? "auto"),
    "", "---- results ----", (run.summary && run.summary.text) || "", "", "---- parameters ----", Object.entries(used).map(([k, v]) => k + " = " + v).join("\n"), "", "---- config ----", cfg, ...(notes.length ? ["", "---- notes ----", ...notes] : [])].join("\r\n");
  files.push({ name: "summary.txt", bytes: utf8Bom(txt) });
  if (window.showDirectoryPicker) {
    let root; try { root = await window.showDirectoryPicker({ mode: "readwrite" }); } catch (e) { if (e && e.name === "AbortError") return; root = null; }
    if (root) {
      const dir = await root.getDirectoryHandle(folder, { create: true });
      for (const f of files) { const w = await (await dir.getFileHandle(f.name, { create: true })).createWritable(); await w.write(f.bytes); await w.close(); }
      toast("Exported " + files.length + " files to " + root.name + "\\" + folder); return;
    }
  }
  const url = URL.createObjectURL(makeZip(files, folder)); const a = h("a", { href: url, download: folder + ".zip" }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 8000);
  toast("Downloaded " + folder + ".zip (" + files.length + " files; this browser cannot pick a folder)");
}

let skipOverridesOnce = false; // set by "Edit & re-run": the run's own config is reproduced exactly, dataset edits are not applied on top
function loadRequestIntoForm(r) {
  skipOverridesOnce = true;
  form = Object.assign(defaultForm(), { name: r.name || "", dataset: r.dataset, symbol: r.symbol || "", strategy: r.strategy, from: r.from || "", to: r.to || "", timeframe: r.timeframe || "", warmup: r.warmup_days || "", params: Object.assign({}, r.params), config: {}, extra: {} });
  const known = new Set(cfgFields().map(f => f.key));
  for (const [k, val] of Object.entries(r.config || {})) { if (known.has(k)) form.config[k] = String(val); else form.extra[k] = String(val); }
  if (r.search_ui) { form.ranges = JSON.parse(JSON.stringify(r.search_ui.ranges || {})); form.opt = Object.assign({}, r.search_ui.opt || {}); } // keep the ticked search parameters
  ensureDefaults(); saveForm();
}

// the handful of settings that matter at a glance
function keyChips(r) {
  const c = r.config || {}, out = [];
  const s = strategyDef(r.strategy);
  out.push(["Strategy", s ? s.name : r.strategy], ["Data", r.dataset], ["Period", (r.from || "start") + " .. " + (r.to || "end")]);
  if (c["latency.open_ms"] !== undefined) out.push(["Latency", "open " + c["latency.open_ms"] + " / close " + c["latency.close_ms"] + " ms" + (+c["latency.jitter_ms"] ? " +" + c["latency.jitter_ms"] + " jitter" : "")]);
  if (c["costs.commission_per_lot"] !== undefined) out.push(["Commission", c["costs.commission_per_lot"] + "/lot (" + c["costs.commission_mode"] + ")"]);
  if (c["costs.slippage_points"] && +c["costs.slippage_points"]) out.push(["Slippage", c["costs.slippage_points"] + " pts"]);
  if (c["account.initial_balance"] !== undefined) out.push(["Balance", c["account.initial_balance"] + " @ 1:" + c["account.leverage"]]);
  return out;
}

// everything that differs from the defaults, readable
function settingsView(run) {
  const r = run.request, defs = Object.fromEntries(cfgFields().map(f => [f.key, f]));
  const sdef = strategyDef(r.strategy);
  const cfgRows = Object.entries(r.config || {}).filter(([k, val]) => defs[k] && String(val) !== defs[k].default).map(([k, val]) => [defs[k].label, val, defs[k].default]);
  const parRows = Object.entries(r.params || {}).filter(([k, val]) => { const d = sdef && sdef.params.find(p => p.key === k); return !d || String(d.default) !== String(val); }).map(([k, val]) => { const d = sdef && sdef.params.find(p => p.key === k); return [k, val, d ? d.default : "-"]; });
  const tbl = rows => rows.length ? h("table", {}, h("tr", {}, h("th", {}, "Setting"), h("th", { class: "num" }, "Used"), h("th", { class: "num" }, "Default")), ...rows.map(x => h("tr", {}, h("td", {}, x[0]), h("td", { class: "num" }, h("b", {}, x[1])), h("td", { class: "num muted" }, x[2])))) : h("div", { class: "muted" }, "all defaults");
  return h("div", {},
    h("div", { class: "grid2" },
      h("div", { class: "card" }, h("h2", {}, "Test"), h("table", {}, ...[["Dataset", r.dataset], ["Strategy", r.strategy], ["Symbol file", r.symbol || "-"], ["From", r.from || "start of data"], ["To", r.to || "end of data"], ["Timeframe", r.timeframe || "strategy default"], ["Warm-up days", r.warmup_days ?? "auto"]].map(x => h("tr", {}, h("td", { class: "muted" }, x[0]), h("td", {}, x[1]))))),
      h("div", { class: "card" }, h("h2", {}, "Broker / costs / latency (differs from defaults)"), tbl(cfgRows)),
      h("div", { class: "card" }, h("h2", {}, "Strategy parameters (differs from defaults)"), tbl(parRows))),
    h("div", { class: "card" }, h("details", {}, h("summary", {}, "Complete configuration (JSON)"), h("pre", {}, JSON.stringify({ params: r.params, config: r.config }, null, 2)))),
    h("div", { class: "row" }, h("button", { class: "primary", onclick: () => { loadRequestIntoForm(r); location.hash = "#new"; } }, "Edit & re-run with these settings")));
}

async function renderRunBody(body, run) {
  const S = run.summary, st = S.stats;
  const deals = await api("runs/" + run.id + "/deals");
  const trades = buildTrades(deals);
  const ret = st.initial_balance ? st.net_profit / st.initial_balance * 100 : 0;
  const kpi = (l, val, sub, cls) => h("div", { class: "kpi" }, h("div", { class: "l" }, l), h("div", { class: "v " + (cls || "") }, val), sub ? h("div", { class: "s" }, sub) : null);
  const ov = h("div"), trTab = h("div"), an = h("div"), setTab = h("div");
  const panes = [["Overview", ov], ["Trades", trTab], ["Analysis", an], ["Settings", setTab]];
  const strip = h("div", { class: "tabs" });
  let firstTrades = true;
  function showPane(name) {
    panes.forEach(([n, el]) => { el.style.display = n === name ? "" : "none"; });
    [...strip.children].forEach(b => b.classList.toggle("active", b.dataset.n === name));
    if (name === "Trades" && firstTrades) { firstTrades = false; pxToggle.click(); }
    window.dispatchEvent(new Event("resize"));
  }
  for (const [n] of panes) strip.append(h("button", { "data-n": n, onclick: () => showPane(n) }, n === "Trades" ? "Trades (" + trades.length + ")" : n));
  body.append(strip, ov, trTab, an, setTab);
  if (S.warnings && S.warnings.length) ov.append(h("ul", { class: "warnlist" }, { class: "warnlist" }, ...S.warnings.map(w => h("li", {}, w))));
  ov.append(h("div", { class: "kpis" },
    kpi("Net profit", money(st.net_profit), num(ret, 1) + " % of " + money(st.initial_balance), signCls(st.net_profit)),
    kpi("Final balance", money(st.final_balance), "equity " + money(st.final_equity)),
    kpi("Profit factor", num(st.profit_factor), "gross " + money(st.gross_profit) + " / " + money(st.gross_loss)),
    kpi("Trades", st.trades, st.wins + " wins / " + st.losses + " losses"),
    kpi("Win rate", num(st.win_rate, 1) + " %", "avg win " + money(st.avg_win) + " / loss " + money(st.avg_loss)),
    kpi("Expected payoff", money(st.expected_payoff), "per trade"),
    kpi("Max drawdown", num(st.max_dd_rel_pct) + " %", money(st.max_dd_abs) + " abs, min equity " + money(st.min_equity), "bad"),
    kpi("Commission / swap", money(st.total_commission) + " / " + money(st.total_swap), "stop-outs " + st.stop_outs),
    kpi("Period", dateOnly(S.from_ms) + " - " + dateOnly(S.last_tick_ms), num(st.ticks, 0) + " ticks in " + num(st.elapsed_s, 2) + " s")));

  // ---- equity / drawdown / price, synchronised zoom
  let view = null; const full = [S.from_ms, S.last_tick_ms];
  const eqHost = h("div"), ddHost = h("div"), pxHost = h("div");
  const zoomInfo = h("span", { class: "small muted" }, "drag on a chart to zoom, double-click to reset");
  const tfSel = h("select", {}, ...[["auto", 60], ["M1", 60], ["M5", 300], ["M20", 1200], ["H1", 3600], ["H4", 14400], ["D1", 86400]].map(([n, s]) => h("option", { value: s }, n)));
  tfSel.value = "60"; tfSel.onchange = () => loadPrice();
  const onRange = (a, b) => { view = [Math.round(a), Math.round(b)]; zoomInfo.textContent = fmt(view[0]) + " .. " + fmt(view[1]); loadAll(); };
  const onReset = () => { view = null; zoomInfo.textContent = "drag on a chart to zoom, double-click to reset"; loadAll(); };
  const zoomOut = () => {
    const r = view || full, mid = (r[0] + r[1]) / 2, half = r[1] - r[0];
    const a = Math.max(full[0], Math.round(mid - half)), b = Math.min(full[1], Math.round(mid + half));
    if (a <= full[0] && b >= full[1]) onReset(); else onRange(a, b);
  };
  const zoomBar = () => h("span", { class: "row" }, h("button", { onclick: zoomOut, title: "show twice as much time" }, "Zoom out"), h("button", { onclick: onReset }, "Reset zoom"));
  const eqChart = new XYChart(eqHost, { height: 280, onRange, onReset });
  const ddChart = new XYChart(ddHost, { height: 130, onRange, onReset, yMin: undefined, yFmt: v => num(v, 1) + "%" });
  const pxChart = new XYChart(pxHost, { height: 340, onRange, onReset, yFmt: v => num(v, 2) });
  let priceOn = false;
  async function loadEquity() {
    const r = view || full;
    const e = await api("runs/" + run.id + "/equity?n=1500&from=" + r[0] + "&to=" + r[1]);
    eqChart.set([{ type: "band", name: "equity range", x: e.t, lo: e.equity_min, hi: e.equity_max },
      { type: "line", name: "balance", x: e.t, y: e.balance, step: true, color: cssVar("--c1") },
      { type: "hline", y: st.initial_balance, color: cssVar("--muted") }], r);
    ddChart.set([{ type: "line", name: "drawdown", x: e.t, y: e.dd_pct.map(x => -x), color: cssVar("--down"), area: true, areaBase: 0, width: 1.2 }], r);
  }
  async function loadPrice() {
    if (!priceOn) return;
    const r = view || full;
    const b = await api("runs/" + run.id + "/bars?n=700&tf=" + tfSel.value + "&from=" + r[0] + "&to=" + r[1]);
    const pts = [];
    for (const t of trades) {
      if (t.t0 >= r[0] && t.t0 <= r[1] && t.p0 != null) pts.push({ x: t.t0, y: t.p0, shape: t.side === "buy" ? "up" : "down", color: t.side === "buy" ? cssVar("--c1") : cssVar("--c2"), info: `<b>${t.side.toUpperCase()}</b> ${t.lots} lots @ ${t.p0}<div class="muted">${fmt(t.t0)}</div>` });
      if (t.t1 >= r[0] && t.t1 <= r[1]) pts.push({ x: t.t1, y: t.p1, shape: "dot", r: 4, color: t.net >= 0 ? cssVar("--up") : cssVar("--down"), info: `exit (${t.kind}) @ ${t.p1}<div class="${signCls(t.net)}">net ${money(t.net)}</div><div class="muted">${fmt(t.t1)}, held ${dur(t.t1 - t.t0)}</div>` });
    }
    pxChart.set([{ type: "candles", bars: b.bars }, { type: "markers", pts }], r);
  }
  const loadAll = guard(async () => { await loadEquity(); await loadPrice(); });
  const pxCard = h("div", { class: "card" }, h("div", { class: "row" }, h("h2", { style: "margin:0" }, "Price & trades"),
    h("label", { class: "row small" }, "min. bar", tfSel), h("span", { class: "spacer" }), zoomBar(),
    legend([{ color: cssVar("--c1"), name: "buy entry" }, { color: cssVar("--c2"), name: "sell entry" }, { color: cssVar("--up"), name: "winning exit" }, { color: cssVar("--down"), name: "losing exit" }])), pxHost);
  const pxToggle = h("button", { onclick: guard(async () => { priceOn = true; pxToggle.remove(); await loadPrice(); }) }, "Load price chart (reads the tick file)");
  pxCard.append(pxToggle);
  trTab.append(pxCard);
  ov.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", { style: "margin:0" }, "Equity"), legend([{ color: cssVar("--c1"), name: "balance" }, { color: cssVar("--band"), name: "equity min..max" }]), h("span", { class: "spacer" }), zoomInfo, zoomBar()), eqHost,
    h("h3", {}, "Drawdown"), ddHost));
  loadEquity();

  // ---- analytics
  const wins = trades.filter(t => t.net > 0), losses = trades.filter(t => t.net < 0);
  const mo = new Map(); for (const t of trades) { const k = fmt(t.t1).slice(0, 7); mo.set(k, (mo.get(k) || 0) + t.net); }
  const monthly = [...mo.entries()].sort();
  const mCard = h("div", { class: "card" }, h("h2", {}, "Profit by month (by close time)")); const mHost = h("div"); mCard.append(mHost);
  const wd = groupSum(trades, t => new Date(t.t1).getUTCDay(), [1, 2, 3, 4, 5]);
  const hr = groupSum(trades, t => new Date(t.t0).getUTCHours(), [...Array(24).keys()]);
  const wdCard = h("div", { class: "card" }, h("h2", {}, "Profit by weekday (close)")); const wdHost = h("div"); wdCard.append(wdHost);
  const hrCard = h("div", { class: "card" }, h("h2", {}, "Profit by entry hour (server time)")); const hrHost = h("div"); hrCard.append(hrHost);
  const nets = trades.map(t => t.net); const mn = Math.min(0, ...nets), mx = Math.max(0, ...nets), bins = 24, bw = (mx - mn) / bins || 1;
  const hist = Array(bins).fill(0); for (const x of nets) hist[Math.min(bins - 1, Math.floor((x - mn) / bw))]++;
  const hiCard = h("div", { class: "card" }, h("h2", {}, "Trade P&L distribution")); const hiHost = h("div"); hiCard.append(hiHost);
  const cum = []; let cs = 0; for (const t of trades) { cs += t.net; cum.push(cs); }
  const cuCard = h("div", { class: "card" }, h("h2", {}, "Cumulative net profit per trade")); const cuHost = h("div"); cuCard.append(cuHost);
  an.append(h("div", { class: "grid2" }, mCard, cuCard), h("div", { class: "grid2" }, wdCard, hrCard), h("div", { class: "grid2" }, hiCard, statsCard(trades, wins, losses)));
  new CatChart(mHost, { yFmt: v => num(v, 0) }).set(monthly.map(m => m[0]), monthly.map(m => m[1]));
  new CatChart(wdHost, { yFmt: v => num(v, 0) }).set(["Mon", "Tue", "Wed", "Thu", "Fri"], wd.filter(e => e[0] >= 1 && e[0] <= 5).sort((a, b) => a[0] - b[0]).map(e => e[1].net), wd.filter(e => e[0] >= 1 && e[0] <= 5).sort((a, b) => a[0] - b[0]).map(e => e[1].n + " trades, " + (e[1].n ? num(e[1].w / e[1].n * 100, 0) : 0) + "% win"));
  const hrs = hr.filter(e => e[0] >= 0 && e[0] < 24).sort((a, b) => a[0] - b[0]);
  new CatChart(hrHost, { yFmt: v => num(v, 0) }).set(hrs.map(e => pad2(e[0])), hrs.map(e => e[1].net), hrs.map(e => e[1].n + " trades"));
  new CatChart(hiHost, { yFmt: v => num(v, 0), signColors: false }).set(hist.map((_, i) => num(mn + (i + .5) * bw, 0)), hist, hist.map(() => "trades"));
  new XYChart(cuHost, { height: 200, time: false, yFmt: v => num(v, 0) }).set([{ type: "line", name: "cum. net", x: cum.map((_, i) => i + 1), y: cum, color: cssVar("--c3") }]);

  // ---- trades table
  trTab.append(tradesCard(trades, run));
  // ---- settings
  setTab.append(settingsView(run), h("div", { class: "card" }, h("details", {}, h("summary", {}, "Engine summary text"), h("pre", {}, S.text + "\n" + (S.info || []).join("\n")))));
  showPane("Overview");
}

function statsCard(trades, wins, losses) {
  const maxStreak = (pred) => { let m = 0, c = 0; for (const t of trades) { if (pred(t)) { c++; m = Math.max(m, c); } else c = 0; } return m; };
  const sideStat = s => { const x = trades.filter(t => t.side === s); const n = x.reduce((a, t) => a + t.net, 0); return `${x.length} trades, net ${money(n)}, win ${x.length ? num(x.filter(t => t.net > 0).length / x.length * 100, 0) : 0}%`; };
  const kinds = {}; for (const t of trades) { const k = kinds[t.kind] || (kinds[t.kind] = { n: 0, net: 0 }); k.n++; k.net += t.net; }
  const hold = trades.length ? trades.reduce((a, t) => a + (t.t1 - t.t0), 0) / trades.length : 0;
  const best = trades.length ? Math.max(...trades.map(t => t.net)) : 0, worst = trades.length ? Math.min(...trades.map(t => t.net)) : 0;
  const rows = [["Long", sideStat("buy")], ["Short", sideStat("sell")], ["Best / worst trade", money(best) + " / " + money(worst)],
    ["Max consecutive wins / losses", maxStreak(t => t.net > 0) + " / " + maxStreak(t => t.net < 0)], ["Average holding time", dur(hold)],
    ["Exits", Object.entries(kinds).map(([k, v]) => `${k}: ${v.n} (${money(v.net)})`).join(",  ")]];
  return h("div", { class: "card" }, h("h2", {}, "Trade statistics"), h("table", {}, ...rows.map(r => h("tr", {}, h("td", { class: "muted" }, r[0]), h("td", {}, r[1])))));
}

function tradesCard(trades, run) {
  const card = h("div", { class: "card" });
  let sortKey = "n", sortDir = 1, filter = "all", limit = 200;
  const cols = [["n", "#"], ["side", "Side"], ["lots", "Lots"], ["t0", "Open"], ["t1", "Close"], ["hold", "Held"], ["p0", "Entry"], ["p1", "Exit"], ["kind", "Exit via"], ["comm", "Comm."], ["swap", "Swap"], ["net", "Net"], ["bal", "Balance"]];
  const wrap = h("div", { class: "tablewrap" });
  function render() {
    let rows = trades.filter(t => filter === "all" || (filter === "win" ? t.net > 0 : filter === "loss" ? t.net < 0 : t.side === filter));
    const val = t => sortKey === "hold" ? t.t1 - t.t0 : t[sortKey];
    rows = rows.slice().sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sortDir);
    wrap.innerHTML = "";
    const t = h("table", {}, h("tr", {}, ...cols.map(([k, l]) => h("th", { class: "sortable" + (["n", "lots", "p0", "p1", "comm", "swap", "net", "bal", "hold"].includes(k) ? " num" : ""), onclick: () => { sortDir = sortKey === k ? -sortDir : 1; sortKey = k; render(); } }, l + (sortKey === k ? (sortDir > 0 ? " ^" : " v") : "")))));
    for (const r of rows.slice(0, limit)) t.append(h("tr", {}, h("td", { class: "num" }, r.n), h("td", {}, r.side), h("td", { class: "num" }, r.lots.toFixed(2)), h("td", {}, fmt(r.t0)), h("td", {}, fmt(r.t1)), h("td", { class: "num" }, dur(r.t1 - r.t0)),
      h("td", { class: "num" }, r.p0 ?? ""), h("td", { class: "num" }, r.p1), h("td", {}, r.kind), h("td", { class: "num" }, money(r.comm)), h("td", { class: "num" }, money(r.swap)), h("td", { class: "num " + signCls(r.net) }, money(r.net)), h("td", { class: "num" }, money(r.bal))));
    wrap.append(t);
    more.style.display = rows.length > limit ? "" : "none"; more.textContent = "show more (" + (rows.length - limit) + " hidden)";
  }
  const more = h("button", { onclick: () => { limit += 500; render(); } }, "");
  const fsel = h("select", { onchange: () => { filter = fsel.value; render(); } }, ...[["all", "all trades"], ["win", "winners"], ["loss", "losers"], ["buy", "long"], ["sell", "short"]].map(([v, l]) => h("option", { value: v }, l)));
  card.append(h("div", { class: "row" }, h("h2", { style: "margin:0" }, "Trades (" + trades.length + ")"), fsel, h("span", { class: "spacer" }),
    h("button", { onclick: () => {
      const csv = "n,side,lots,open,close,entry,exit,exit_via,commission,swap,net,balance\n" + trades.map(t => [t.n, t.side, t.lots, fmt(t.t0), fmt(t.t1), t.p0, t.p1, t.kind, t.comm.toFixed(2), t.swap.toFixed(2), t.net.toFixed(2), t.bal.toFixed(2)].join(",")).join("\n");
      const a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: run.name.replace(/[^\w.-]+/g, "_") + "-trades.csv" }); a.click();
    } }, "Download CSV")), h("div", { style: "height:8px" }), wrap, h("div", { style: "margin-top:8px" }, more));
  render();
  return card;
}

// ---------------------------------------------------------------- COMPARE
async function viewCompare(v, ids) {
  ids = ids.split(",");
  const runs = await Promise.all(ids.map(i => api("runs/" + i)));
  v.append(h("div", { class: "row" }, h("a", { href: "#runs" }, "< Runs"), h("h1", { style: "margin:0" }, "Compare " + runs.length + " runs")));
  const eq = await Promise.all(ids.map(i => api("runs/" + i + "/equity?n=1200")));
  const pal = PALETTE();
  const host = h("div"), legendHost = h("div");
  let showMean = true; try { showMean = localStorage.getItem("cmpMean") !== "0"; } catch (e) { /* ignore */ }
  const prof = runs.map((r, i) => ({ t: eq[i].t, y: eq[i].balance.map(b => b - r.summary.stats.initial_balance) }));
  // mean profit curve: every run is a step function on one common time grid (before a run starts its profit is 0, after it ends it stays at its final value)
  const meanCurve = () => {
    const t0 = Math.min(...prof.map(p => p.t[0])), t1 = Math.max(...prof.map(p => p.t[p.t.length - 1])), N = 1200, xs = [], ys = [];
    const at = (p, T) => { if (T < p.t[0]) return 0; let lo = 0, hi = p.t.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (p.t[m] <= T) lo = m; else hi = m - 1; } return p.y[lo]; };
    for (let k = 0; k < N; k++) { const T = t0 + (t1 - t0) * k / (N - 1); xs.push(T); ys.push(prof.reduce((s, p) => s + at(p, T), 0) / prof.length); }
    return { x: xs, y: ys };
  };
  const chart = new XYChart(host, { height: 340, yFmt: v => num(v, 0) });
  const meanColor = cssVar("--ink"), meanName = "Mean of the " + runs.length + " runs";
  function drawChart() {
    const series = runs.map((r, i) => ({ type: "line", name: r.name, color: pal[i % pal.length], step: true, x: prof[i].t, y: prof[i].y }));
    const items = runs.map((r, i) => ({ color: pal[i % pal.length], name: r.name }));
    if (showMean && runs.length > 1) { const m = meanCurve(); series.push({ type: "line", name: meanName, color: meanColor, width: 3, x: m.x, y: m.y }); items.push({ color: meanColor, name: meanName }); }
    legendHost.replaceChildren(legend(items)); chart.set(series);
  }
  const meanBox = h("input", { type: "checkbox", checked: showMean, onchange: () => { showMean = meanBox.checked; try { localStorage.setItem("cmpMean", showMean ? "1" : "0"); } catch (e) { /* ignore */ } drawChart(); drawTable(); } });
  v.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", { style: "margin:0" }, "Profit over time (balance - initial)"), h("span", { class: "spacer" }),
    runs.length > 1 ? h("label", { class: "row small", title: "the average profit curve of all compared runs (a run that starts later counts as 0 before its start)" }, meanBox, "Show the mean of the runs") : null), legendHost, host));
  drawChart();  const metrics = [["Net profit", s => s.net_profit, money, 1], ["Final balance", s => s.final_balance, money, 1], ["Profit factor", s => s.profit_factor, num, 1], ["Trades", s => s.trades, num, 0],
    ["Win rate %", s => s.win_rate, x => num(x, 1), 1], ["Avg win", s => s.avg_win, money, 1], ["Avg loss", s => s.avg_loss, money, 1], ["Expected payoff", s => s.expected_payoff, money, 1],
    ["Max DD %", s => s.max_dd_rel_pct, num, -1], ["Max DD abs", s => s.max_dd_abs, money, -1], ["Commission", s => s.total_commission, money, 1], ["Swap", s => s.total_swap, money, 1]];
  const tableHost = h("div", { class: "tablewrap", style: "max-height:none" });
  function drawTable() {
    const withMean = showMean && runs.length > 1;
    const t = h("table", {}, h("tr", {}, h("th", {}, "Metric"), ...runs.map((r, i) => h("th", { class: "num" }, h("a", { href: "#run/" + r.id }, r.name))), withMean ? h("th", { class: "num", title: "average of the values of the compared runs" }, "Mean") : null));
    for (const [l, f, fm, dir] of metrics) {
      const vals = runs.map(r => f(r.summary.stats)); const best = dir === 0 ? null : (dir > 0 ? Math.max(...vals) : Math.min(...vals));
      t.append(h("tr", {}, h("td", { class: "muted" }, l), ...vals.map(x => h("td", { class: "num" + (best !== null && x === best && runs.length > 1 ? " good" : "") }, fm(x))),
        withMean ? h("td", { class: "num", style: "font-weight:700" }, fm(vals.reduce((a, b) => a + b, 0) / vals.length)) : null));
    }
    tableHost.replaceChildren(t);
  }
  drawTable();  // differing settings
  const flat = r => Object.assign({ dataset: r.dataset, strategy: r.strategy, from: r.request.from, to: r.request.to }, r.request.config, Object.fromEntries(Object.entries(r.request.params || {}).map(([k, x]) => ["param:" + k, x])));
  const fl = runs.map(flat), keys = [...new Set(fl.flatMap(Object.keys))].filter(k => new Set(fl.map(f => String(f[k] ?? ""))).size > 1);
  const dt = h("table", {}, h("tr", {}, h("th", {}, "Setting"), ...runs.map(r => h("th", {}, r.name))), ...keys.map(k => h("tr", {}, h("td", { class: "muted" }, k), ...fl.map(f => h("td", {}, String(f[k] ?? ""))))));
  v.append(h("div", { class: "card" }, h("h2", {}, "Results"), tableHost),
    h("div", { class: "card" }, h("h2", {}, "Settings that differ"), keys.length ? h("div", { class: "tablewrap" }, dt) : h("div", { class: "muted" }, "none")));
}

// ---------------------------------------------------------------- SWEEPS
async function viewSweeps(v) {
  v.append(historyBar("sweeps"), h("h1", {}, "Sweeps"));
  const box = h("div", { class: "card" }); v.append(box);
  async function load() {
    const list = await api("sweeps"); box.innerHTML = "";
    if (!list.length) { box.append(h("div", { class: "muted" }, "No sweeps yet. Define one under Extra > Sweep in Research.")); return; }
    const t = h("table", {}, h("tr", {}, ...["Sweep", "Axes", "Progress", "Started", ""].map(x => h("th", {}, x))));
    for (const s of list) t.append(h("tr", { class: "click", onclick: () => location.hash = "#sweep/" + s.id },
      h("td", {}, h("b", {}, s.name)), h("td", {}, s.axes.map(a => a.key + " (" + a.values.length + ")").join(" x ")), h("td", {}, s.done + s.failed + " / " + s.total + (s.failed ? " (" + s.failed + " failed)" : "")), h("td", {}, ago(s.created)),
      h("td", { onclick: e => e.stopPropagation() }, h("button", { class: "danger", onclick: guard(async () => { if (!confirm("Delete sweep and all its passes?")) return; await api("sweeps/" + s.id, { method: "DELETE" }); load(); }) }, "delete"))));
    box.append(h("div", { class: "tablewrap" }, t));
  }
  await load(); every(load, 3000);
}

const SWEEP_METRICS = [["net_profit", "Net profit", money, 1], ["profit_factor", "Profit factor", num, 1], ["max_dd_rel_pct", "Max drawdown %", num, -1], ["win_rate", "Win rate %", x => num(x, 1), 1],
  ["expected_payoff", "Expected payoff", money, 1], ["trades", "Trades", x => num(x, 0), 0], ["final_balance", "Final balance", money, 1], ["criterion", "Strategy criterion", x => num(x, 3), 1]];
function sweepProgress(s, done) {
  const running = s.runs.reduce((a, r) => a + (r.status === "running" && r.progress && r.progress.total ? Math.min(1, r.progress.done / r.progress.total) : 0), 0);
  const frac = Math.min(1, (done + running) / s.total), el = Date.now() / 1000 - s.created;
  const text = done >= s.total ? "finished" : Math.floor(frac * 100) + " %  -  " + done + " of " + s.total + " passes done" + (frac > 0.03 ? ", about " + fmtSecs(el * (1 - frac) / frac) + " left" : "");
  return h("div", { style: "margin:8px 0 14px" }, h("div", { class: "progress" }, h("div", { style: "width:" + (frac * 100) + "%" })), h("div", { class: "small muted", style: "margin-top:4px" }, text));
}
async function viewSweep(v, id) {
  const top = h("div"), body = h("div"); v.append(top, body);
  let metric = "net_profit", sortKey = null, sortDir = -1, third = 0;
  async function load() {
    const s = await api("sweeps/" + id);
    top.innerHTML = "";
    const done = s.done + s.failed;
    top.append(h("div", { class: "row" }, h("a", { href: "#sweeps" }, "< Sweeps"), h("h1", { style: "margin:0" }, s.name), h("span", { class: "muted" }, done + " / " + s.total + " passes")),
      sweepProgress(s, done));
    render(s); return done >= s.total;
  }
  function render(s) {
    body.innerHTML = "";
    const m = SWEEP_METRICS.find(x => x[0] === metric);
    const rows = s.runs.filter(r => r.status === "done");
    const axisLabels = s.axes.map(a => a.key);
    const msel = h("select", { onchange: () => { metric = msel.value; render(s); } }, ...SWEEP_METRICS.map(x => h("option", { value: x[0], selected: x[0] === metric }, x[1])));
    body.append(h("div", { class: "row", style: "margin-bottom:8px" }, h("label", { class: "row" }, "Metric", msel)));
    const val = r => r.headline ? r.headline[metric] : null;
    const vals = rows.map(val).filter(x => x != null && isFinite(x)); const lo = Math.min(...vals), hi = Math.max(...vals);
    const colorFor = x => { if (x == null || !isFinite(x) || hi === lo) return ""; let f = (x - lo) / (hi - lo); if (m[3] < 0) f = 1 - f; const col = f >= .5 ? "--good" : "--bad"; const a = Math.abs(f - .5) * 2 * .55; return `background: color-mix(in srgb, var(${col}) ${Math.round(a * 100)}%, transparent)`; };
    // chart / heatmap
    if (s.axes.length === 1) {
      const host = h("div"); body.append(h("div", { class: "card" }, h("h2", {}, m[1] + " vs " + axisLabels[0]), host));
      const pts = rows.map(r => ({ x: +r.coord[0], y: val(r) })).filter(p => isFinite(p.x) && p.y != null).sort((a, b) => a.x - b.x);
      if (pts.length) new XYChart(host, { height: 280, time: false, yFmt: v => m[2](v) }).set([{ type: "line", name: m[1], x: pts.map(p => p.x), y: pts.map(p => p.y), color: cssVar("--c1") }]);
    } else {
      const A = s.axes, rowsV = A[0].values, colsV = A[1].values;
      const thirdVals = A[2] ? A[2].values : [null];
      const card = h("div", { class: "card" }, h("h2", {}, m[1] + ": " + axisLabels[0] + " (rows) x " + axisLabels[1] + " (columns)"));
      if (A[2]) card.append(h("label", { class: "row small" }, axisLabels[2] + " =", h("select", { onchange: e => { third = +e.target.value; render(s); } }, ...thirdVals.map((x, i) => h("option", { value: i, selected: i === third }, x)))));
      const t = h("table", { class: "heat" }, h("tr", {}, h("th", {}, ""), ...colsV.map(c => h("th", {}, c))));
      for (const rv of rowsV) {
        t.append(h("tr", {}, h("th", {}, rv), ...colsV.map(cv => {
          const r = s.runs.find(x => x.coord[0] === rv && x.coord[1] === cv && (!A[2] || x.coord[2] === thirdVals[third]));
          const x = r && r.status === "done" ? val(r) : null;
          return h("td", { style: colorFor(x), title: r ? r.id : "", onclick: () => r && (location.hash = "#run/" + r.id) }, r ? (r.status === "done" ? m[2](x) : r.status === "error" ? "error" : "...") : "");
        })));
      }
      card.append(h("div", { class: "tablewrap", style: "max-height:none" }, t), h("div", { class: "small muted" }, "Click a cell to open that pass."));
      body.append(card);
    }
    // table
    const cols = [...axisLabels.map((l, i) => ["c" + i, l, null]), ...SWEEP_METRICS.map(x => [x[0], x[1], x[2]])];
    const data = s.runs.map(r => Object.assign({ r }, Object.fromEntries(r.coord.map((c, i) => ["c" + i, c])), r.headline || {}));
    if (sortKey) data.sort((a, b) => { const x = isNaN(+a[sortKey]) ? a[sortKey] : +a[sortKey], y = isNaN(+b[sortKey]) ? b[sortKey] : +b[sortKey]; return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
    const t = h("table", {}, h("tr", {}, ...cols.map(([k, l]) => h("th", { class: "sortable", onclick: () => { sortDir = sortKey === k ? -sortDir : -1; sortKey = k; render(s); } }, l + (sortKey === k ? (sortDir > 0 ? " ^" : " v") : ""))), h("th", {}, "")));
    for (const d of data) t.append(h("tr", { class: "click", onclick: () => location.hash = "#run/" + d.r.id },
      ...cols.map(([k, l, f]) => h("td", { class: f ? "num" : "" }, d.r.status === "done" ? (f ? f(d[k]) : d[k]) : (f ? "" : d[k]))),
      h("td", {}, d.r.status === "done" ? "" : h("span", { class: "badge " + d.r.status }, d.r.status))));
    body.append(h("div", { class: "card" }, h("h2", {}, "All passes"), h("div", { class: "tablewrap", style: "max-height:520px" }, t),
      h("div", { style: "margin-top:8px" }, h("button", { onclick: () => {
        const csv = cols.map(c => c[1]).join(",") + "\n" + data.map(d => cols.map(c => d[c[0]] ?? "").join(",")).join("\n");
        h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "sweep-" + s.id + ".csv" }).click();
      } }, "Download CSV"))));
  }
  const finished = await load();
  if (!finished) { const t = every(async () => { if (await load()) clearInterval(t); }, 700); }
}

// ---------------------------------------------------------------- roadmap activity rings
// A progress ring around the dot of Runs / Sweeps / Optimizer while such jobs run (polled from the light /api/activity).
const RING_C = 2 * Math.PI * 17;
function initRoadmap() {
  document.querySelectorAll("nav.roadmap a[data-icon] .dot").forEach(d => { d.textContent = ""; d.append(icon(d.parentElement.dataset.icon)); });
  document.querySelectorAll("nav.roadmap a .dot").forEach(d => d.insertAdjacentHTML("beforeend",
    '<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="track" cx="20" cy="20" r="17"/><circle class="arc" cx="20" cy="20" r="17"/></svg>'));
  document.querySelectorAll("nav.roadmap a .lbl").forEach(l => l.insertAdjacentHTML("beforeend", '<span class="pct"></span>'));
  const tick = async () => {
    let a; try { const r = await fetch("/api/activity"); if (!r.ok) return; a = await r.json(); } catch (e) { return; }
    // runs, sweeps and optimizations all live under History: one ring for all of them
    const act = Object.values(a).filter(s => s && s.active > 0), fr = act.map(s => s.frac).filter(x => x != null);
    setBusy("history", { active: act.reduce((n, s) => n + s.active, 0), frac: fr.length ? fr.reduce((x, y) => x + y, 0) / fr.length : null });
  };
  tick(); setInterval(tick, 1200);
}
function setBusy(tab, st) {
  const el = document.querySelector('nav.roadmap a[data-tab="' + tab + '"]'); if (!el) return;
  const busy = !!(st && st.active > 0), f = busy ? st.frac : null;
  el.classList.toggle("busy", busy); el.classList.toggle("spin", busy && f == null);
  const arc = el.querySelector(".arc"); if (arc) arc.style.strokeDashoffset = String(busy && f != null ? RING_C * (1 - Math.min(1, f)) : RING_C);
  const pct = el.querySelector(".pct"); if (pct) pct.textContent = busy && f != null ? Math.round(f * 100) + " %" : busy ? "waiting" : "";
  el.title = busy ? st.active + (st.active === 1 ? " job" : " jobs") + " running" + (f != null ? " - " + Math.round(f * 100) + " %" : " - waiting for a free worker") : "";
}

initRoadmap();
boot();
