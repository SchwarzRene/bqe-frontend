import { api } from "../api.js";
import { candleChart, disposeCharts, showChartMessage } from "../charts.js";
import { attachDrawings } from "../drawing.js";
import { price } from "../format.js";
import { INTERVAL_SECONDS, isDailyOrAbove, TIMEFRAMES } from "../timeframes.js";
import { $, $$, esc, toast } from "../ui.js";
import { openSymbolForm } from "./symbolForm.js";

const state = { selectedId: null, interval: "1h" };

export async function renderSymbols(root) {
  const symbols = await api.symbols();
  const reload = () => renderSymbols(root);
  if (!symbols.some((s) => s.id === state.selectedId)) state.selectedId = symbols[0]?.id ?? null;

  root.innerHTML = `
    <div class="page-head">
      <h1>Symbols</h1>
      <div class="actions"><button class="btn primary" data-new>+ Add symbol</button></div>
    </div>
    ${symbols.length ? layout(symbols) : emptyState()}`;

  $$("[data-new]", root).forEach((b) => b.addEventListener("click", () => openSymbolForm({ onSaved: (s) => { state.selectedId = s.id; reload(); } })));
  if (!symbols.length) return;

  wireTable(root, symbols, reload);
  loadQuotes(root, symbols);
  await drawSelected(root, symbols);
}

function layout(symbols) {
  const rows = symbols.map((s) => `
    <tr class="clickable ${s.id === state.selectedId ? "selected" : ""}" data-select="${s.id}">
      <td><strong>${esc(s.name)}</strong><div class="muted" style="font-size:12px">${esc(s.description)}</div></td>
      <td class="mono">${esc(s.ticker)}</td>
      <td>${esc(s.asset_class)}</td>
      <td class="r num" data-price="${esc(s.ticker)}">…</td>
      <td class="r num" data-change="${esc(s.ticker)}"></td>
      <td class="r num">${s.point_value}</td>
      <td class="r num">${s.trade_count}</td>
      <td class="r">
        <button class="btn small ghost" data-edit="${s.id}">Edit</button>
        <button class="btn small ghost danger" data-delete="${s.id}">Delete</button>
      </td>
    </tr>`).join("");
  return `
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Symbol</th><th>Ticker</th><th>Class</th><th class="r">Price</th><th class="r">Change</th><th class="r">Point value</th><th class="r">Trades</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>
    <div class="card section">
      <div class="card-head">
        <h2 data-chart-title></h2>
        <div class="chips">${TIMEFRAMES.map(([k, label]) => `<button data-tf="${k}" class="${k === state.interval ? "active" : ""}">${label}</button>`).join("")}</div>
      </div>
      <div data-draw-toolbar></div>
      <div class="chart tall" data-chart></div>
      <div class="hint">Drawings here belong to the symbol — handy for pre-market levels and planning.</div>
    </div>`;
}

function emptyState() {
  return `<div class="card empty">
    <h2>Add the symbols you trade</h2>
    <p>Type the name you see in MT5 (e.g. <span class="mono">EURUSD</span>, <span class="mono">NAS100</span>, <span class="mono">XAUUSD</span>, <span class="mono">BTCUSD</span>)<br>and the app maps it to a real market data feed.</p>
    <button class="btn primary" data-new>+ Add symbol</button></div>`;
}

function wireTable(root, symbols, reload) {
  const byId = Object.fromEntries(symbols.map((s) => [s.id, s]));
  $$("[data-select]", root).forEach((row) =>
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      state.selectedId = Number(row.dataset.select);
      $$("[data-select]", root).forEach((r) => r.classList.toggle("selected", r === row));
      drawSelected(root, symbols);
    }),
  );
  $$("[data-edit]", root).forEach((btn) => btn.addEventListener("click", () => openSymbolForm({ symbol: byId[btn.dataset.edit], onSaved: reload })));
  $$("[data-delete]", root).forEach((btn) => btn.addEventListener("click", () => deleteSymbol(byId[btn.dataset.delete], reload)));
  $$("[data-tf]", root).forEach((btn) =>
    btn.addEventListener("click", () => {
      state.interval = btn.dataset.tf;
      $$("[data-tf]", root).forEach((b) => b.classList.toggle("active", b === btn));
      drawSelected(root, symbols);
    }),
  );
}

async function loadQuotes(root, symbols) {
  const digitsByTicker = Object.fromEntries(symbols.map((s) => [s.ticker, s.digits]));
  const quotes = await api.symbolQuotes().catch(() => ({}));
  for (const [ticker, digits] of Object.entries(digitsByTicker)) {
    const q = quotes[ticker];
    const priceCell = $(`[data-price="${CSS.escape(ticker)}"]`, root);
    const changeCell = $(`[data-change="${CSS.escape(ticker)}"]`, root);
    if (!priceCell) continue;
    if (!q) { priceCell.innerHTML = `<span class="muted">n/a</span>`; continue; }
    priceCell.textContent = price(q.price, digits);
    if (q.previous_close) {
      const change = (q.price / q.previous_close - 1) * 100;
      changeCell.className = `r num ${change >= 0 ? "profit" : "loss"}`;
      changeCell.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
    }
  }
}

async function drawSelected(root, symbols) {
  const symbol = symbols.find((s) => s.id === state.selectedId);
  const container = $("[data-chart]", root);
  if (!symbol || !container) return;
  $("[data-chart-title]", root).textContent = `${symbol.name} · ${symbol.ticker}`;
  disposeCharts();
  $("[data-draw-toolbar]", root).innerHTML = "";
  container.innerHTML = `<div class="chart-empty">Loading ${esc(symbol.name)}…</div>`;
  try {
    const { candles, interval } = await api.symbolCandles(symbol.id, state.interval);
    const rendered = candleChart(container, candles, { digits: symbol.digits, showDaysOnly: isDailyOrAbove(interval) });
    if (rendered) {
      await attachDrawings({
        ...rendered, container, toolbar: $("[data-draw-toolbar]", root),
        intervalSeconds: INTERVAL_SECONDS[interval], digits: symbol.digits, scope: `symbol:${symbol.id}`,
      });
    }
  } catch (error) {
    showChartMessage(container, error.message);
  }
}

async function deleteSymbol(symbol, reload) {
  if (!confirm(`Delete ${symbol.name}?`)) return;
  try {
    await api.deleteSymbol(symbol.id);
    toast(`${symbol.name} deleted`);
    reload();
  } catch (error) {
    toast(error.message, "error");
  }
}
