// Small dependency-free canvas charts: XYChart (lines, bands, candles, markers; drag to zoom) and CatChart (bars).
"use strict";

function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
const PALETTE = () => ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6", "--c7", "--c8"].map(cssVar);

function niceTicks(min, max, n) {
  if (!isFinite(min) || !isFinite(max)) return [];
  if (!(max > min)) { max = min + 1; }
  const raw = (max - min) / Math.max(1, n);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function fmtTime(ms, step) {
  const d = new Date(ms);
  const date = d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  const time = pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
  if (step === undefined) return date + " " + time + ":" + pad2(d.getUTCSeconds());
  if (step >= 28 * DAY) return date.slice(0, 7);
  if (step >= DAY) return date;
  return date.slice(5) + " " + time;
}
function timeTicks(min, max, n) {
  const range = max - min;
  if (!isFinite(range) || range <= 0) return { ticks: [], step: DAY };
  const steps = [MIN, 5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY];
  let step = steps.find(s => range / s <= n);
  const out = [];
  if (step) {
    for (let t = Math.ceil(min / step) * step; t <= max; t += step) out.push(t);
    return { ticks: out, step };
  }
  // month based
  const months = [1, 2, 3, 6, 12, 24, 60].find(m => range / (m * 30.4 * DAY) <= n) || 120;
  const d0 = new Date(min);
  let y = d0.getUTCFullYear(), m = d0.getUTCMonth();
  m = Math.ceil(m / months) * months;
  for (;;) {
    const t = Date.UTC(y + Math.floor(m / 12), m % 12, 1);
    if (t > max) break;
    if (t >= min) out.push(t);
    m += months;
  }
  return { ticks: out, step: 30 * DAY };
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

class BaseChart {
  constructor(host, opts) {
    this.host = host; this.opts = Object.assign({ height: 260, pad: { l: 62, r: 14, t: 10, b: 26 } }, opts || {});
    this.box = el("div", "chartbox");
    this.canvas = el("canvas");
    this.tip = el("div", "tip");
    this.box.append(this.canvas, this.tip);
    host.innerHTML = ""; host.append(this.box);
    this.canvas.style.height = this.opts.height + "px";
    this._ro = new ResizeObserver(() => this.draw());
    this._ro.observe(this.box);
  }
  setup() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.box.clientWidth, h = this.opts.height;
    if (!w) return null;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    }
    const g = this.canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    this.w = w; this.h = h;
    const p = this.opts.pad;
    this.plot = { x0: p.l, x1: w - p.r, y0: p.t, y1: h - p.b };
    return g;
  }
  showTip(html, x, y) {
    this.tip.innerHTML = html; this.tip.style.display = "block";
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let left = x + 14; if (left + tw > this.w) left = x - tw - 14;
    let top = Math.max(0, Math.min(this.h - th, y - th / 2));
    this.tip.style.left = left + "px"; this.tip.style.top = top + "px";
  }
  hideTip() { this.tip.style.display = "none"; }
}

// ------------------------------------------------------------------ XYChart
// series: {type:'line', name, color, x[], y[], step?} | {type:'band', x[], lo[], hi[], color} |
//         {type:'candles', bars:[[t,o,h,l,c]...]} | {type:'markers', pts:[{x,y,shape,color,info}]} | {type:'hline', y, color}
class XYChart extends BaseChart {
  constructor(host, opts) {
    super(host, Object.assign({ time: true, yFmt: v => v.toLocaleString("en", { maximumFractionDigits: 2 }), onRange: null, onReset: null }, opts));
    this.series = []; this.xdom = null; this.sel = null; this.hover = null;
    const c = this.canvas;
    c.addEventListener("mousemove", e => this.onMove(e));
    c.addEventListener("mouseleave", () => { this.hover = null; this.sel = null; this.hideTip(); this.draw(); });
    c.addEventListener("mousedown", e => { const r = c.getBoundingClientRect(); this.sel = { a: e.clientX - r.left, b: e.clientX - r.left, on: true }; });
    window.addEventListener("mouseup", e => this.onUp(e));
    c.addEventListener("dblclick", () => { if (this.opts.onReset) this.opts.onReset(); });
    c.style.cursor = "crosshair";
  }
  set(series, xdom) { this.series = series; this.xdom = xdom || null; this.draw(); }
  dom() {
    let xmin = Infinity, xmax = -Infinity;
    for (const s of this.series) {
      if (s.pts) { for (const p of s.pts) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; } continue; }
      const xs = s.x || (s.bars && s.bars.map(b => b[0]));
      if (!xs || !xs.length) continue;
      xmin = Math.min(xmin, xs[0]); xmax = Math.max(xmax, xs[xs.length - 1]);
    }
    if (this.xdom) { xmin = this.xdom[0]; xmax = this.xdom[1]; }
    else if (isFinite(xmin) && xmax > xmin && this.series.some(s => s.type === "markers" && s.scatter)) { const pd = (xmax - xmin) * 0.04; xmin -= pd; xmax += pd; } // keep the outermost dots fully visible
    if (!isFinite(xmin) || !isFinite(xmax)) { xmin = 0; xmax = 1; }
    if (!(xmax > xmin)) { xmax = xmin + 1; }
    let ymin = Infinity, ymax = -Infinity;
    const take = (v) => { if (v < ymin) ymin = v; if (v > ymax) ymax = v; };
    for (const s of this.series) {
      if (s.type === "line") { for (let i = 0; i < s.x.length; i++) if (s.x[i] >= xmin && s.x[i] <= xmax && isFinite(s.y[i])) take(s.y[i]); }
      else if (s.type === "band") { for (let i = 0; i < s.x.length; i++) if (s.x[i] >= xmin && s.x[i] <= xmax) { take(s.lo[i]); take(s.hi[i]); } }
      else if (s.type === "candles") { for (const b of s.bars) { take(b[2]); take(b[3]); } }
      else if (s.type === "hline") take(s.y);
      else if (s.type === "markers" && s.scatter) { for (const p of s.pts) take(p.y); }
    }
    if (!(ymax >= ymin)) { ymin = 0; ymax = 1; }
    if (ymax === ymin) { ymax = ymin + 1; }
    const padY = (ymax - ymin) * 0.06;
    return { xmin, xmax, ymin: this.opts.yMin !== undefined ? this.opts.yMin : ymin - padY, ymax: ymax + padY };
  }
  sx(x) { return this.plot.x0 + (x - this.d.xmin) / (this.d.xmax - this.d.xmin) * (this.plot.x1 - this.plot.x0); }
  sy(y) { return this.plot.y1 - (y - this.d.ymin) / (this.d.ymax - this.d.ymin) * (this.plot.y1 - this.plot.y0); }
  ix(px) { return this.d.xmin + (px - this.plot.x0) / (this.plot.x1 - this.plot.x0) * (this.d.xmax - this.d.xmin); }
  draw() {
    const g = this.setup(); if (!g) return;
    const d = this.d = this.dom(), P = this.plot;
    g.font = "11px system-ui, sans-serif"; g.textBaseline = "middle";
    const grid = cssVar("--grid"), muted = cssVar("--muted");
    // y grid
    g.strokeStyle = grid; g.fillStyle = muted; g.lineWidth = 1; g.textAlign = "right";
    for (const t of niceTicks(d.ymin, d.ymax, Math.max(3, Math.floor((P.y1 - P.y0) / 42)))) {
      const y = Math.round(this.sy(t)) + .5;
      g.beginPath(); g.moveTo(P.x0, y); g.lineTo(P.x1, y); g.stroke();
      g.fillText(this.opts.yFmt(t), P.x0 - 6, y);
    }
    // x ticks
    g.textAlign = "center"; g.textBaseline = "top";
    let xt;
    if (this.opts.time) xt = timeTicks(d.xmin, d.xmax, Math.max(2, Math.floor((P.x1 - P.x0) / 110)));
    else xt = { ticks: niceTicks(d.xmin, d.xmax, 6), step: 0 };
    this.xstep = xt.step;
    for (const t of xt.ticks) {
      const x = Math.round(this.sx(t)) + .5;
      g.strokeStyle = grid; g.beginPath(); g.moveTo(x, P.y0); g.lineTo(x, P.y1); g.stroke();
      g.fillStyle = muted; g.fillText(this.opts.time ? fmtTime(t, xt.step) : String(t), x, P.y1 + 6);
    }
    g.save(); g.beginPath(); g.rect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0); g.clip();
    const pal = PALETTE(); let ci = 0;
    for (const s of this.series) {
      const col = s.color || pal[ci++ % pal.length]; s._col = col;
      if (s.type === "hline") {
        g.strokeStyle = col; g.setLineDash([4, 4]); const y = this.sy(s.y);
        g.beginPath(); g.moveTo(P.x0, y); g.lineTo(P.x1, y); g.stroke(); g.setLineDash([]);
      } else if (s.type === "band") {
        g.fillStyle = s.fill || cssVar("--band"); g.beginPath();
        let started = false;
        for (let i = 0; i < s.x.length; i++) { const x = this.sx(s.x[i]), y = this.sy(s.hi[i]); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); }
        for (let i = s.x.length - 1; i >= 0; i--) g.lineTo(this.sx(s.x[i]), this.sy(s.lo[i]));
        g.closePath(); g.fill();
      } else if (s.type === "line") {
        g.strokeStyle = col; g.lineWidth = s.width || 1.6; g.lineJoin = "round"; g.beginPath();
        let first = true, px = 0, py = 0;
        for (let i = 0; i < s.x.length; i++) {
          if (!isFinite(s.y[i])) continue;
          const x = this.sx(s.x[i]), y = this.sy(s.y[i]);
          if (first) { g.moveTo(x, y); first = false; }
          else { if (s.step) g.lineTo(x, py); g.lineTo(x, y); }
          px = x; py = y;
        }
        g.stroke();
        if (s.area) {
          g.lineTo(px, this.sy(s.areaBase !== undefined ? s.areaBase : d.ymin)); g.lineTo(this.sx(s.x[0]), this.sy(s.areaBase !== undefined ? s.areaBase : d.ymin)); g.closePath();
          g.globalAlpha = .15; g.fillStyle = col; g.fill(); g.globalAlpha = 1;
        }
      } else if (s.type === "candles") {
        const spacing = s.bars.length > 1 ? s.bars[1][0] - s.bars[0][0] : 60e3;
        const spPx = spacing / (d.xmax - d.xmin) * (P.x1 - P.x0), w = Math.max(1, Math.min(14, spPx * .7));
        for (const b of s.bars) {
          const x = this.sx(b[0]) + spPx / 2;
          const up = b[4] >= b[1]; g.strokeStyle = g.fillStyle = up ? cssVar("--up") : cssVar("--down");
          g.beginPath(); g.moveTo(Math.round(x) + .5, this.sy(b[2])); g.lineTo(Math.round(x) + .5, this.sy(b[3])); g.stroke();
          const y1 = this.sy(b[1]), y2 = this.sy(b[4]);
          g.fillRect(x - w / 2, Math.min(y1, y2), w, Math.max(1, Math.abs(y2 - y1)));
        }
      }
    }
    // markers on top
    this.markers = [];
    for (const s of this.series) if (s.type === "markers") {
      for (const p of s.pts) {
        if (p.x < d.xmin || p.x > d.xmax) continue;
        const x = this.sx(p.x), y = this.sy(p.y), r = p.r || 5;
        g.fillStyle = p.color; g.strokeStyle = cssVar("--panel"); g.lineWidth = 1;
        g.beginPath();
        if (p.shape === "up") { g.moveTo(x, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.closePath(); }
        else if (p.shape === "down") { g.moveTo(x, y + r); g.lineTo(x + r, y - r); g.lineTo(x - r, y - r); g.closePath(); }
        else g.arc(x, y, r - 1, 0, 7);
        g.fill(); g.stroke();
        this.markers.push({ x, y, info: p.info });
      }
    }
    g.restore();
    // hover line + selection
    if (this.hover != null) {
      g.strokeStyle = muted; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(this.hover, P.y0); g.lineTo(this.hover, P.y1); g.stroke(); g.setLineDash([]);
    }
    if (this.sel && this.sel.on && Math.abs(this.sel.b - this.sel.a) > 3) {
      g.fillStyle = cssVar("--band"); g.fillRect(Math.min(this.sel.a, this.sel.b), P.y0, Math.abs(this.sel.b - this.sel.a), P.y1 - P.y0);
    }
  }
  onMove(e) {
    const r = this.canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (this.sel && this.sel.on) { this.sel.b = px; this.draw(); return; }
    const P = this.plot; if (!P || px < P.x0 || px > P.x1) { this.hover = null; this.hideTip(); this.draw(); return; }
    // marker hit?
    let hit = null, best = 100;
    for (const m of this.markers || []) { const dd = (m.x - px) ** 2 + (m.y - py) ** 2; if (dd < best) { best = dd; hit = m; } }
    if (hit) { this.hover = null; this.draw(); this.showTip(hit.info, hit.x, hit.y); return; }
    const x = this.ix(px); this.hover = px; this.draw();
    const rows = [];
    let tstr = this.opts.time ? fmtTime(x) : x.toFixed(2);
    for (const s of this.series) {
      if (s.type === "line" && s.x.length) {
        const i = nearest(s.x, x); tstr = this.opts.time ? fmtTime(s.x[i]) : String(s.x[i]);
        rows.push(`<div><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s._col};margin-right:6px"></i>${s.name || ""} <b>${this.opts.yFmt(s.y[i])}</b></div>`);
      } else if (s.type === "band" && s.x.length) {
        const i = nearest(s.x, x);
        rows.push(`<div class="muted">${s.name || "range"} ${this.opts.yFmt(s.lo[i])} .. ${this.opts.yFmt(s.hi[i])}</div>`);
      } else if (s.type === "candles" && s.bars.length) {
        const i = nearest(s.bars.map(b => b[0]), x), b = s.bars[i]; tstr = fmtTime(b[0]);
        rows.push(`<div>O ${b[1]} H ${b[2]} L ${b[3]} C ${b[4]}</div>`);
      }
    }
    this.showTip(`<div class="muted">${tstr}</div>` + rows.join(""), px, py);
  }
  onUp(e) {
    if (!this.sel || !this.sel.on) return;
    const s = this.sel; this.sel = null;
    if (Math.abs(s.b - s.a) > 6 && this.opts.onRange) {
      const a = this.ix(Math.min(s.a, s.b)), b = this.ix(Math.max(s.a, s.b));
      this.opts.onRange(a, b);
    } else this.draw();
  }
}
function nearest(xs, x) {
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < x) lo = m; else hi = m; }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
}

// ------------------------------------------------------------------ CatChart: vertical bars with category labels
class CatChart extends BaseChart {
  constructor(host, opts) {
    super(host, Object.assign({ height: 200, yFmt: v => v.toLocaleString("en", { maximumFractionDigits: 2 }), pad: { l: 62, r: 10, t: 10, b: 30 }, signColors: true }, opts));
    this.labels = []; this.values = []; this.hoverIdx = -1;
    this.canvas.addEventListener("mousemove", e => {
      const r = this.canvas.getBoundingClientRect(), px = e.clientX - r.left;
      const P = this.plot; if (!P) return;
      const i = Math.floor((px - P.x0) / ((P.x1 - P.x0) / this.labels.length));
      if (i >= 0 && i < this.labels.length) { this.hoverIdx = i; this.draw(); this.showTip(`<div class="muted">${this.labels[i]}</div><b>${this.opts.yFmt(this.values[i])}</b>${this.extra && this.extra[i] ? "<div class='muted'>" + this.extra[i] + "</div>" : ""}`, px, e.clientY - r.top); }
    });
    this.canvas.addEventListener("mouseleave", () => { this.hoverIdx = -1; this.hideTip(); this.draw(); });
  }
  set(labels, values, extra) { this.labels = labels; this.values = values; this.extra = extra; this.draw(); }
  draw() {
    const g = this.setup(); if (!g) return;
    const P = this.plot, n = this.labels.length;
    let lo = Math.min(0, ...this.values), hi = Math.max(0, ...this.values);
    if (!n) { g.fillStyle = cssVar("--muted"); g.fillText("no data", P.x0 + 10, P.y0 + 20); return; }
    if (hi === lo) hi = lo + 1;
    const pad = (hi - lo) * .06; if (hi > 0) hi += pad; if (lo < 0) lo -= pad;
    const sy = v => P.y1 - (v - lo) / (hi - lo) * (P.y1 - P.y0);
    g.font = "11px system-ui, sans-serif"; g.textBaseline = "middle"; g.textAlign = "right";
    for (const t of (this.opts.hideAxes ? [] : niceTicks(lo, hi, 4))) {
      const y = Math.round(sy(t)) + .5; g.strokeStyle = cssVar("--grid"); g.beginPath(); g.moveTo(P.x0, y); g.lineTo(P.x1, y); g.stroke();
      g.fillStyle = cssVar("--muted"); g.fillText(this.opts.yFmt(t), P.x0 - 6, y);
    }
    const bw = (P.x1 - P.x0) / n, w = Math.max(1, bw * .72);
    g.textAlign = "center"; g.textBaseline = "top";
    const every = Math.ceil(n / Math.max(1, Math.floor((P.x1 - P.x0) / 46)));
    for (let i = 0; i < n; i++) {
      const v = this.values[i], x = P.x0 + i * bw + (bw - w) / 2;
      g.fillStyle = this.opts.signColors ? (v >= 0 ? cssVar("--up") : cssVar("--down")) : cssVar("--c1");
      if (i === this.hoverIdx) g.globalAlpha = .75;
      g.fillRect(x, Math.min(sy(0), sy(v)), w, Math.max(1, Math.abs(sy(v) - sy(0))));
      g.globalAlpha = 1;
      if (!this.opts.hideAxes && i % every === 0) { g.fillStyle = cssVar("--muted"); g.fillText(this.labels[i], P.x0 + i * bw + bw / 2, P.y1 + 8); }
    }
    if (!this.opts.hideAxes) { g.strokeStyle = cssVar("--muted"); g.beginPath(); g.moveTo(P.x0, Math.round(sy(0)) + .5); g.lineTo(P.x1, Math.round(sy(0)) + .5); g.stroke(); }
  }
}

function legend(items) {
  const d = el("div", "legend");
  d.innerHTML = items.map(i => `<span><i style="background:${i.color}"></i>${i.name}</span>`).join("");
  return d;
}
