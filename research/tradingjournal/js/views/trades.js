import { api } from "../api.js";
import { money, pnlClass } from "../format.js";
import { $, esc } from "../ui.js";
import { openTradeForm } from "./tradeForm.js";
import { tradeTable, wireTradeRows } from "./tradeTable.js";

// Filters survive re-renders within the session (e.g. after adding a trade).
const filters = { status: "", symbol_id: "", setup: "" };

export async function renderTrades(root) {
  const [symbols, setups] = await Promise.all([api.symbols(), api.setups()]);
  root.innerHTML = `
    <div class="page-head">
      <h1>Trades</h1>
      <div class="actions">
        <button class="btn" data-refresh>↻ Refresh prices</button>
        <button class="btn primary" data-new>+ New trade</button>
      </div>
    </div>
    <div class="toolbar">
      <select data-filter="status">
        <option value="">All trades</option><option value="open">Open</option><option value="closed">Closed</option>
      </select>
      <select data-filter="symbol_id">
        <option value="">All symbols</option>
        ${symbols.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}
      </select>
      <select data-filter="setup">
        <option value="">All setups</option>
        ${setups.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}
      </select>
      <span class="muted" data-summary></span>
    </div>
    <div class="card" data-list><div class="loading">Loading trades…</div></div>`;

  for (const [key, value] of Object.entries(filters)) {
    const select = $(`[data-filter="${key}"]`, root);
    select.value = value;
    select.addEventListener("change", () => { filters[key] = select.value; loadList(root, symbols); });
  }
  $("[data-new]", root).addEventListener("click", () => openTradeForm({ onSaved: () => loadList(root, symbols) }));
  $("[data-refresh]", root).addEventListener("click", () => loadList(root, symbols));
  await loadList(root, symbols);
}

async function loadList(root, symbols) {
  const list = $("[data-list]", root);
  const trades = await api.trades(filters);
  $("[data-summary]", root).innerHTML = summaryText(trades);

  if (!trades.length) {
    list.innerHTML = emptyState(symbols.length > 0, Object.values(filters).some(Boolean));
    $("[data-empty-new]", list)?.addEventListener("click", () => openTradeForm({ onSaved: () => loadList(root, symbols) }));
    return;
  }
  list.innerHTML = tradeTable(trades);
  wireTradeRows(list);
}

function summaryText(trades) {
  const closed = trades.filter((t) => t.status === "closed");
  const net = closed.reduce((sum, t) => sum + t.pnl, 0);
  return `${trades.length} trades · net <span class="num ${pnlClass(net)}">${money(net)}</span>`;
}

function emptyState(hasSymbols, filtered) {
  if (filtered) return `<div class="empty">No trades match these filters.</div>`;
  if (!hasSymbols) {
    return `<div class="empty"><h2>Start by adding a symbol</h2>
      <p>Symbols link your trades to real market data.</p>
      <a class="btn primary" href="#/symbols">Go to Symbols</a></div>`;
  }
  return `<div class="empty"><h2>No trades yet</h2><p>Log your first trade to start building your history.</p>
    <button class="btn primary" data-empty-new>+ New trade</button></div>`;
}
