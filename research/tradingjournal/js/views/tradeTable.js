import { dateTime, money, pnlClass, price, rMultiple } from "../format.js";
import { $$, esc } from "../ui.js";

/** Render a clickable trades table; rows navigate to the trade detail page. */
export function tradeTable(trades, { compact = false } = {}) {
  const rows = trades.map((t) => {
    const livePnl = t.status === "closed" ? t.pnl : t.unrealized_pnl;
    const exitCell = t.status === "closed"
      ? price(t.exit_price, t.digits)
      : `<span class="muted">${t.current_price != null ? "now " + price(t.current_price, t.digits) : "open"}</span>`;
    return `
      <tr class="clickable" data-trade="${t.id}">
        <td class="mono">${dateTime(t.entry_time)}</td>
        <td><strong>${esc(t.symbol_name)}</strong></td>
        <td><span class="badge ${t.direction}">${t.direction}</span></td>
        ${compact ? "" : `<td class="r num">${t.volume}</td>`}
        ${compact ? "" : `<td class="r num">${price(t.entry_price, t.digits)}</td>`}
        ${compact ? "" : `<td class="r num">${exitCell}</td>`}
        <td class="r num ${pnlClass(livePnl)}">${money(livePnl)}${t.status === "open" && livePnl != null ? " <span class='muted'>(live)</span>" : ""}</td>
        ${compact ? "" : `<td class="r num ${pnlClass(t.r_multiple)}">${rMultiple(t.r_multiple)}</td>`}
        ${compact ? "" : `<td>${esc(t.setup)}</td>`}
        <td><span class="badge ${t.status}">${t.status}</span></td>
      </tr>`;
  });
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Opened</th><th>Symbol</th><th>Side</th>
        ${compact ? "" : "<th class='r'>Volume</th><th class='r'>Entry</th><th class='r'>Exit</th>"}
        <th class="r">P&amp;L</th>
        ${compact ? "" : "<th class='r'>R</th><th>Setup</th>"}
        <th>Status</th>
      </tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table></div>`;
}

export function wireTradeRows(root) {
  $$("[data-trade]", root).forEach((row) =>
    row.addEventListener("click", () => { location.hash = `#/trade/${row.dataset.trade}`; }),
  );
}
