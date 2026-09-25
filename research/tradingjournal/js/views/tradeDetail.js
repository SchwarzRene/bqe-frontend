import { api } from "../api.js";
import { candleChart, disposeCharts, showChartMessage } from "../charts.js";
import { attachDrawings } from "../drawing.js";
import { date, dateTime, duration, money, pnlClass, price, rMultiple } from "../format.js";
import { INTERVAL_SECONDS, TIMEFRAMES } from "../timeframes.js";
import { $, $$, esc, toast } from "../ui.js";
import { openEntryForm } from "./journalForm.js";
import { openTradeForm } from "./tradeForm.js";

export async function renderTradeDetail(root, id) {
  const trade = await api.trade(id);
  const rerender = () => renderTradeDetail(root, id);
  root.innerHTML = layout(trade);

  $("[data-edit]", root).addEventListener("click", () => openTradeForm({ trade, onSaved: rerender }));
  $("[data-close-trade]", root)?.addEventListener("click", () => openTradeForm({ trade, closing: true, onSaved: rerender }));
  $("[data-delete]", root).addEventListener("click", () => deleteTrade(trade));
  $("[data-journal]", root).addEventListener("click", () => openEntryForm({ linkTradeIds: [trade.id], defaultTitle: `${trade.symbol_name} ${trade.direction} review`, onSaved: rerender }));

  await drawChart($("[data-chart]", root), trade);
}

function layout(t) {
  const shownPnl = t.status === "closed" ? t.pnl : t.unrealized_pnl;
  return `
    <a class="back-link" href="#/trades">← All trades</a>
    <div class="detail-head">
      <div>
        <div class="detail-title">
          <h1>${esc(t.symbol_name)}</h1>
          <span class="badge ${t.direction}">${t.direction}</span>
          <span class="badge ${t.status}">${t.status}</span>
          ${t.setup ? `<span class="tag">${esc(t.setup)}</span>` : ""}
        </div>
        <div class="muted">${esc(t.ticker)} · opened ${dateTime(t.entry_time)}${t.exit_time ? ` · closed ${dateTime(t.exit_time)}` : ""}</div>
      </div>
      <div style="text-align:right">
        <div class="detail-pnl ${pnlClass(shownPnl)}">${money(shownPnl)}</div>
        <div class="muted">${t.status === "open" ? (shownPnl == null ? "live price unavailable" : '<span class="live-dot"></span>unrealized') : rMultiple(t.r_multiple)}</div>
      </div>
    </div>
    <div class="page-head" style="margin-bottom:12px">
      <div class="actions">
        ${t.status === "open" ? '<button class="btn primary" data-close-trade>Close trade</button>' : ""}
        <button class="btn" data-edit>Edit</button>
        <button class="btn" data-journal>✎ Journal about this trade</button>
        <button class="btn danger" data-delete>Delete</button>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Price action <span class="muted" data-ticker style="text-transform:none;letter-spacing:0"></span></h3><div class="chips" data-timeframes></div></div>
      <div data-draw-toolbar></div>
      <div class="chart tall" data-chart></div>
      <div class="hint">Mark up why you entered — levels, zones, trend lines and notes are saved with this trade and stay in place across timeframes.</div>
    </div>
    <div class="grid grid-2 section">
      <div class="card"><h3 style="margin-bottom:12px">Details</h3><div class="facts">${facts(t)}</div></div>
      <div class="card">
        <h3 style="margin-bottom:8px">Notes</h3>
        <div class="notes">${t.notes ? esc(t.notes) : '<span class="muted">No notes.</span>'}</div>
        <h3 style="margin:16px 0 8px">Journal entries</h3>
        ${journalLinks(t.journal_entries)}
      </div>
    </div>`;
}

function facts(t) {
  const items = [
    ["Volume", t.volume],
    ["Entry", price(t.entry_price, t.digits)],
    [t.status === "open" ? "Current" : "Exit", price(t.status === "open" ? t.current_price : t.exit_price, t.digits)],
    ["Stop loss", price(t.stop_loss, t.digits)],
    ["Take profit", price(t.take_profit, t.digits)],
    ["Risk", t.risk != null ? money(-t.risk) : "—"],
    ["R-multiple", rMultiple(t.r_multiple)],
    ["Fees", money(t.fees, { signed: false })],
    ["Duration", duration(t.duration_minutes)],
    ["Rating", t.rating ? "★".repeat(t.rating) + "☆".repeat(5 - t.rating) : "—"],
    ["P&L source", t.pnl_override != null ? "Broker (override)" : "Calculated"],
    ["Point value", t.point_value],
  ];
  return items.map(([label, value]) => `<div class="fact"><div class="label">${label}</div><div class="value">${value}</div></div>`).join("");
}

function journalLinks(entries) {
  if (!entries.length) return `<span class="muted">Nothing written yet — what did this trade teach you?</span>`;
  return entries
    .map((e) => `<a class="trade-chip" href="#/journal/${e.id}"><span class="muted">${date(e.entry_date)}</span> ${esc(e.title)}</a>`)
    .join("");
}

async function drawChart(container, t, requestedInterval = null) {
  const card = container.closest(".card");
  disposeCharts();
  $("[data-draw-toolbar]", card).innerHTML = "";
  container.innerHTML = `<div class="chart-empty">Loading candles…</div>`;
  try {
    const { candles, interval, available_intervals } = await api.tradeChart(t.id, requestedInterval);
    $("[data-ticker]", card).textContent = `· ${t.ticker}`;
    renderTimeframes($("[data-timeframes]", card), available_intervals, interval, (next) => drawChart(container, t, next));
    const entryColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    // Entry and exit are crosses rather than arrows: a vertical line at the
    // time (drawn by the drawing layer) through the price line at the price.
    const epoch = (iso) => Math.floor(new Date(iso).getTime() / 1000);
    const marks = [{ t: epoch(t.entry_time), p: t.entry_price, color: entryColor, label: `Entry ${price(t.entry_price, t.digits)}` }];
    if (t.exit_time) {
      marks.push({ t: epoch(t.exit_time), p: t.exit_price, color: "#8b909b", dashed: true, label: `Exit ${price(t.exit_price, t.digits)}` });
    }
    const rendered = candleChart(container, candles, {
      digits: t.digits,
      showDaysOnly: interval === "1d" || interval === "1wk",
      lines: [
        { price: t.entry_price, color: entryColor, title: "Entry" },
        { price: t.exit_price, color: "#8b909b", title: "Exit" },
        { price: t.stop_loss, color: "#ef4444", title: "SL", dashed: true },
        { price: t.take_profit, color: "#10b981", title: "TP", dashed: true },
      ],
    });
    if (rendered) {
      await attachDrawings({
        ...rendered, container, toolbar: $("[data-draw-toolbar]", card),
        intervalSeconds: INTERVAL_SECONDS[interval], digits: t.digits, scope: `trade:${t.id}`, marks,
      });
    }
  } catch (error) {
    showChartMessage(container, `Couldn't load market data: ${error.message}`);
  }
}

function renderTimeframes(container, available, current, onPick) {
  container.innerHTML = TIMEFRAMES
    .filter(([key]) => available.includes(key))
    .map(([key, label]) => `<button data-tf="${key}" class="${key === current ? "active" : ""}">${label}</button>`)
    .join("");
  $$("[data-tf]", container).forEach((btn) => btn.addEventListener("click", () => onPick(btn.dataset.tf)));
}

async function deleteTrade(trade) {
  if (!confirm(`Delete this ${trade.symbol_name} trade? This can't be undone.`)) return;
  try {
    await api.deleteTrade(trade.id);
    toast("Trade deleted");
    location.hash = "#/trades";
  } catch (error) {
    toast(error.message, "error");
  }
}
