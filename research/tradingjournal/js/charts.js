import { esc } from "./ui.js";

const active = new Set();

/** Remove every live chart; called on navigation so detached charts don't leak. */
export function disposeCharts() {
  active.forEach((chart) => chart.remove());
  active.clear();
}

/**
 * lightweight-charts renders timestamps as UTC. Shifting by the local offset
 * makes the axis show the user's wall-clock time, matching how trades are entered.
 */
export const toChartTime = (epochSeconds) => epochSeconds - new Date(epochSeconds * 1000).getTimezoneOffset() * 60;
// Inverse of `toChartTime` (exact except inside a DST switch hour).
export const fromChartTime = (chartSeconds) => chartSeconds + new Date(chartSeconds * 1000).getTimezoneOffset() * 60;
export const isChartActive = (chart) => active.has(chart);
const localIsoToEpoch = (iso) => Math.floor(new Date(iso).getTime() / 1000);

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function createChart(container, extraOptions = {}) {
  const LWC = window.LightweightCharts;
  if (!LWC) {
    container.innerHTML = `<div class="chart-empty">Chart library didn't load — check your internet connection.</div>`;
    return null;
  }
  container.innerHTML = "";
  const chart = LWC.createChart(container, {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: cssVar("--muted"), fontFamily: cssVar("--mono"), fontSize: 11 },
    grid: { vertLines: { color: cssVar("--chart-grid") }, horzLines: { color: cssVar("--chart-grid") } },
    rightPriceScale: { borderColor: cssVar("--border") },
    timeScale: { borderColor: cssVar("--border"), timeVisible: true, secondsVisible: false },
    crosshair: { mode: LWC.CrosshairMode.Normal },
    // A vertical swipe over a chart scrolls the page instead of panning the chart.
    handleScroll: { vertTouchDrag: false },
    ...extraOptions,
  });
  active.add(chart);
  return chart;
}

function priceFormat(digits) {
  return { type: "price", precision: digits, minMove: 1 / 10 ** digits };
}

export function showChartMessage(container, message) {
  container.innerHTML = `<div class="chart-empty">${esc(message)}</div>`;
}

/** Render candles; returns `{chart, series, data}` (data in chart time) or undefined if nothing was drawn. */
export function candleChart(container, candles, { digits = 2, lines = [], markers = [], showDaysOnly = false } = {}) {
  if (!candles.length) return showChartMessage(container, "No candles available for this period.");
  const chart = createChart(container, { timeScale: { borderColor: cssVar("--border"), timeVisible: !showDaysOnly } });
  if (!chart) return;
  const series = chart.addCandlestickSeries({
    upColor: cssVar("--profit"), downColor: cssVar("--loss"),
    borderUpColor: cssVar("--profit"), borderDownColor: cssVar("--loss"),
    wickUpColor: cssVar("--profit"), wickDownColor: cssVar("--loss"),
    priceFormat: priceFormat(digits),
  });
  const data = candles.map((c) => ({ ...c, time: toChartTime(c.time) }));
  series.setData(data);

  for (const line of lines) {
    if (line.price == null) continue;
    series.createPriceLine({ price: line.price, color: line.color, lineWidth: 1, lineStyle: line.dashed ? 2 : 0, axisLabelVisible: true, title: line.title });
  }
  const snapped = markers
    .map((m) => ({ ...m, time: snapToBar(data, toChartTime(localIsoToEpoch(m.iso))) }))
    .filter((m) => m.time !== null)
    .sort((a, b) => a.time - b.time);
  series.setMarkers(snapped.map(({ iso, ...m }) => m));
  fitAfterLayout(chart);
  return { chart, series, data };
}

/** Area chart of cumulative P&L; `points` are `{time: localIso, equity}` from /api/stats. */
export function equityChart(container, points) {
  if (!points.length) return showChartMessage(container, "Close your first trade to see the equity curve.");
  const chart = createChart(container);
  if (!chart) return;
  const series = chart.addBaselineSeries({
    baseValue: { type: "price", price: 0 },
    topLineColor: cssVar("--profit"), bottomLineColor: cssVar("--loss"),
    topFillColor1: hexWithAlpha(cssVar("--profit"), 0.28), topFillColor2: hexWithAlpha(cssVar("--profit"), 0.02),
    bottomFillColor1: hexWithAlpha(cssVar("--loss"), 0.02), bottomFillColor2: hexWithAlpha(cssVar("--loss"), 0.28),
    lineWidth: 2, priceFormat: priceFormat(2),
  });
  series.setData(strictlyIncreasing(points));
  fitAfterLayout(chart);
}

/**
 * autoSize applies the real width asynchronously; fitting before that squeezes
 * all bars against the right edge, so fit again once layout has settled.
 */
function fitAfterLayout(chart) {
  chart.timeScale().fitContent();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (active.has(chart)) chart.timeScale().fitContent();
  }));
}

/**
 * Chart times must be unique and increasing, but several trades can close in the
 * same minute — nudge duplicates forward by a second each. A zero point is
 * prepended so the curve starts from the starting balance.
 */
function strictlyIncreasing(points) {
  const data = [];
  let last = -Infinity;
  for (const point of points) {
    const time = Math.max(toChartTime(localIsoToEpoch(point.time)), last + 1);
    data.push({ time, value: point.equity });
    last = time;
  }
  return [{ time: data[0].time - 60, value: 0 }, ...data];
}

/** Map a timestamp onto the candle that contains it, or null if it's outside the data. */
function snapToBar(data, time) {
  if (!data.length || time < data[0].time - 86400 * 7) return null;
  let match = data[0].time;
  for (const bar of data) {
    if (bar.time > time) break;
    match = bar.time;
  }
  return match;
}

function hexWithAlpha(hex, alpha) {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) return hex;
  const n = parseInt(match[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
