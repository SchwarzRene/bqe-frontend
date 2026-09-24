import { api } from "./api.js";
import { fromChartTime, isChartActive, toChartTime } from "./charts.js";
import { price as formatPrice } from "./format.js";
import { $$, debounce, esc, toast } from "./ui.js";

const TOOLS = [
  ["cursor", "↖", "Pan & zoom (Esc)"],
  ["trend", "╱", "Trend line — drag on the chart"],
  ["hline", "―", "Horizontal level — click a price"],
  ["rect", "▭", "Zone — drag a box"],
  ["text", "T", "Text note — click where it belongs"],
  ["erase", "⌫", "Eraser — click a drawing to remove it"],
];
const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#a855f7", "#8b909b"];
const HIT_WIDTH = 12;
let overlayCount = 0;

/**
 * Add a drawing layer over a candle chart and auto-save it under `scope`
 * ("trade:<id>" / "symbol:<id>").
 *
 * Anchors are stored as (real epoch seconds, price) rather than bar indexes, so a
 * drawing made on 5m candles lands in the same place on 1h or daily candles.
 */
export async function attachDrawings({ toolbar, container, chart, series, data, intervalSeconds, digits, scope }) {
  const state = { tool: "cursor", color: COLORS[0], drawings: [], draft: null, version: 0 };
  state.drawings = await api.drawings(scope).catch(() => []);
  if (!isChartActive(chart)) return;

  const svg = createOverlay(container);
  const mapper = createMapper(chart, series, data, intervalSeconds);
  const save = debounce(() => persist(scope, state.drawings, toolbar), 500);
  const changed = () => { state.version++; save(); };

  renderToolbar(toolbar, state, svg, changed);
  wirePointer(svg, state, mapper, changed, toolbar);
  wireKeys(svg, state, changed, toolbar);
  startRenderLoop({ chart, svg, container, state, mapper, digits });
}

function createOverlay(container) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("draw-layer");
  svg.dataset.clipId = `draw-clip-${++overlayCount}`;
  container.append(svg);
  return svg;
}

/**
 * Convert between (time, price) anchors and pixels. The time axis of
 * lightweight-charts is linear in bar index, not in time, so times are mapped to
 * a fractional bar index by interpolating between neighbouring candles (and
 * extrapolating with the candle interval beyond the data).
 */
function createMapper(chart, series, data, step) {
  const times = data.map((d) => d.time);
  const last = times.length - 1;
  const timeScale = chart.timeScale();

  const axis = () => {
    const x0 = timeScale.logicalToCoordinate(0);
    const x1 = timeScale.logicalToCoordinate(1);
    return x0 == null || x1 == null ? null : { x0, spacing: x1 - x0 };
  };
  const timeToIndex = (t) => {
    if (t <= times[0]) return (t - times[0]) / step;
    if (t >= times[last]) return last + (t - times[last]) / step;
    let lo = 0, hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid; else hi = mid;
    }
    return lo + (t - times[lo]) / (times[hi] - times[lo]);
  };
  const indexToTime = (i) => {
    if (i <= 0) return times[0] + i * step;
    if (i >= last) return times[last] + (i - last) * step;
    const lo = Math.floor(i);
    return times[lo] + (i - lo) * (times[lo + 1] - times[lo]);
  };

  return {
    x(t) {
      const a = axis();
      return a ? a.x0 + timeToIndex(toChartTime(t)) * a.spacing : null;
    },
    y: (p) => series.priceToCoordinate(p),
    point(x, y) {
      const a = axis();
      const p = series.coordinateToPrice(y);
      if (!a || p == null || !a.spacing) return null;
      return { t: Math.round(fromChartTime(indexToTime((x - a.x0) / a.spacing))), p };
    },
    signature() {
      const a = axis();
      const ref = data[last].close;
      return `${a?.x0}|${a?.spacing}|${series.priceToCoordinate(ref)}|${series.priceToCoordinate(ref * 1.01)}`;
    },
  };
}

function renderToolbar(toolbar, state, svg, changed) {
  toolbar.innerHTML = `
    <div class="draw-toolbar">
      ${TOOLS.map(([id, icon, title]) => `<button type="button" class="tool" data-tool="${id}" title="${esc(title)}">${icon}</button>`).join("")}
      <span class="tool-sep"></span>
      ${COLORS.map((c) => `<button type="button" class="swatch" data-color="${c}" style="background:${c}" title="Color"></button>`).join("")}
      <span class="tool-sep"></span>
      <button type="button" class="btn small ghost" data-undo title="Undo (⌘Z / Ctrl+Z)">Undo</button>
      <button type="button" class="btn small ghost danger" data-clear>Clear</button>
      <span class="draw-status muted" data-status></span>
    </div>`;
  $$("[data-tool]", toolbar).forEach((btn) => btn.addEventListener("click", () => setTool(state, svg, toolbar, btn.dataset.tool)));
  $$("[data-color]", toolbar).forEach((btn) =>
    btn.addEventListener("click", () => { state.color = btn.dataset.color; syncToolbar(state, toolbar); }),
  );
  toolbar.querySelector("[data-undo]").addEventListener("click", () => undo(state, changed));
  toolbar.querySelector("[data-clear]").addEventListener("click", () => {
    if (!state.drawings.length || !confirm("Remove all drawings on this chart?")) return;
    state.drawings = [];
    changed();
  });
  setTool(state, svg, toolbar, "cursor");
}

function setTool(state, svg, toolbar, tool) {
  state.tool = tool;
  state.draft = null;
  // In cursor mode the overlay lets events through so the chart can pan and zoom.
  svg.style.pointerEvents = tool === "cursor" ? "none" : "all";
  svg.style.cursor = tool === "erase" ? "pointer" : tool === "text" ? "text" : "crosshair";
  syncToolbar(state, toolbar);
}

function syncToolbar(state, toolbar) {
  $$("[data-tool]", toolbar).forEach((b) => b.classList.toggle("active", b.dataset.tool === state.tool));
  $$("[data-color]", toolbar).forEach((b) => b.classList.toggle("active", b.dataset.color === state.color));
}

function wirePointer(svg, state, mapper, changed, toolbar) {
  const local = (e) => {
    const rect = svg.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
  const finish = (drawing) => {
    state.drawings.push(drawing);
    changed();
    // Back to pan/zoom after each drawing, like most charting tools.
    setTool(state, svg, toolbar, "cursor");
  };

  svg.addEventListener("pointerdown", (e) => {
    const [x, y] = local(e);
    if (state.tool === "erase") {
      const hit = e.target.closest("[data-index]");
      if (hit) {
        state.drawings.splice(Number(hit.dataset.index), 1);
        changed();
      }
      return;
    }
    const point = mapper.point(x, y);
    if (!point) return;
    if (state.tool === "hline") return finish({ type: "hline", p: point.p, color: state.color });
    if (state.tool === "text") {
      const text = prompt("Note on the chart (e.g. why you entered here):");
      if (text && text.trim()) finish({ type: "text", a: point, text: text.trim().slice(0, 300), color: state.color });
      return;
    }
    state.draft = { type: state.tool, a: point, b: point, color: state.color, start: [x, y] };
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener("pointermove", (e) => {
    if (!state.draft) return;
    const point = mapper.point(...local(e));
    if (point) { state.draft.b = point; state.version++; }
  });

  svg.addEventListener("pointerup", (e) => {
    if (!state.draft) return;
    const { start, ...drawing } = state.draft;
    const [x, y] = local(e);
    state.draft = null;
    state.version++;
    // Ignore accidental clicks that didn't really drag.
    if (Math.hypot(x - start[0], y - start[1]) > 4) finish(drawing);
  });
}

function wireKeys(svg, state, changed, toolbar) {
  const onKey = (e) => {
    if (!svg.isConnected) return document.removeEventListener("keydown", onKey);
    if (document.querySelector("dialog[open]") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === "Escape") setTool(state, svg, toolbar, "cursor");
    if (e.key === "z" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undo(state, changed); }
  };
  document.addEventListener("keydown", onKey);
}

function undo(state, changed) {
  if (!state.drawings.length) return;
  state.drawings.pop();
  changed();
}

async function persist(scope, drawings, toolbar) {
  const status = toolbar.querySelector("[data-status]");
  try {
    await api.saveDrawings(scope, drawings);
    if (status) status.textContent = "Saved ✓";
  } catch (error) {
    toast(`Drawings not saved: ${error.message}`, "error");
  }
}

/**
 * Redraw only when the chart moved (pan, zoom, rescale) or the drawings changed.
 * The loop stops by itself once the chart is disposed on navigation.
 */
function startRenderLoop({ chart, svg, container, state, mapper, digits }) {
  let lastKey = "";
  const frame = () => {
    if (!isChartActive(chart) || !svg.isConnected) return;
    const width = chart.timeScale().width();
    const height = container.clientHeight - chart.timeScale().height();
    const key = `${mapper.signature()}|${width}|${height}|${state.version}`;
    if (key !== lastKey) {
      lastKey = key;
      svg.innerHTML = renderShapes(state, mapper, width, height, digits, svg.dataset.clipId);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function renderShapes(state, mapper, width, height, digits, clipId) {
  const shapes = state.drawings.map((d, i) => shape(d, i, mapper, width, digits));
  if (state.draft) shapes.push(shape(state.draft, null, mapper, width, digits));
  return `<defs><clipPath id="${clipId}"><rect x="0" y="0" width="${width}" height="${Math.max(height, 0)}"/></clipPath></defs>
    <g clip-path="url(#${clipId})">${shapes.join("")}</g>`;
}

function shape(d, index, mapper, width, digits) {
  const attrs = index === null ? `class="drawing draft"` : `class="drawing" data-index="${index}"`;
  const color = esc(d.color);
  if (d.type === "hline") {
    const y = mapper.y(d.p);
    if (y == null) return "";
    return `<g ${attrs}>
      <line x1="0" x2="${width}" y1="${y}" y2="${y}" stroke="transparent" stroke-width="${HIT_WIDTH}"/>
      <line x1="0" x2="${width}" y1="${y}" y2="${y}" stroke="${color}" stroke-width="1.5"/>
      <text x="${width - 6}" y="${y - 5}" text-anchor="end" fill="${color}" class="draw-label">${esc(formatPrice(roundTo(d.p, digits), digits))}</text></g>`;
  }
  const a = project(d.a, mapper);
  if (!a) return "";
  if (d.type === "text") {
    return `<g ${attrs}><circle cx="${a.x}" cy="${a.y}" r="3" fill="${color}"/>
      <text x="${a.x + 7}" y="${a.y + 4}" fill="${color}" class="draw-text">${esc(d.text)}</text></g>`;
  }
  const b = project(d.b, mapper);
  if (!b) return "";
  if (d.type === "rect") {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
    return `<g ${attrs}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="1.2"/></g>`;
  }
  return `<g ${attrs}>
    <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width="${HIT_WIDTH}"/>
    <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="${a.x}" cy="${a.y}" r="2.5" fill="${color}"/><circle cx="${b.x}" cy="${b.y}" r="2.5" fill="${color}"/></g>`;
}

function project(point, mapper) {
  const x = mapper.x(point.t);
  const y = mapper.y(point.p);
  return x == null || y == null ? null : { x, y };
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
