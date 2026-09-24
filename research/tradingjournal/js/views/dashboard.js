import { api } from "../api.js";
import { equityChart } from "../charts.js";
import { date, money, percent, pnlClass, ratio, rMultiple, todayLocal } from "../format.js";
import { $, $$, esc } from "../ui.js";
import { openTradeForm } from "./tradeForm.js";
import { tradeTable, wireTradeRows } from "./tradeTable.js";

const PERIODS = [["30d", "30D"], ["90d", "90D"], ["ytd", "YTD"], ["all", "All"]];
const state = { period: "all" };

export async function renderDashboard(root) {
  const [stats, recent, entries] = await Promise.all([
    api.stats({ date_from: periodStart(state.period) }),
    api.trades(),
    api.journal(),
  ]);
  const s = stats.summary;
  root.innerHTML = `
    <div class="page-head">
      <h1>Dashboard</h1>
      <div class="actions">
        <div class="chips">${PERIODS.map(([k, l]) => `<button data-period="${k}" class="${k === state.period ? "active" : ""}">${l}</button>`).join("")}</div>
        <button class="btn primary" data-new>+ New trade</button>
      </div>
    </div>
    <div class="kpis">${kpis(s)}</div>
    <div class="grid grid-3-1">
      <div class="card"><div class="card-head"><h3>Equity curve</h3><span class="muted num">${s.trade_count} closed trades</span></div><div class="chart" data-equity></div></div>
      <div class="card"><h3 style="margin-bottom:12px">P&amp;L by weekday</h3>${weekdayBars(stats.by_weekday)}
        <h3 style="margin:18px 0 8px">Long vs short</h3>${breakdownTable(stats.by_direction, "Side")}</div>
    </div>
    <div class="grid grid-2 section">
      <div class="card"><h3 style="margin-bottom:8px">By symbol</h3>${breakdownTable(stats.by_symbol, "Symbol")}</div>
      <div class="card"><h3 style="margin-bottom:8px">By setup</h3>${breakdownTable(stats.by_setup, "Setup")}</div>
    </div>
    <div class="grid grid-3-1 section">
      <div class="card"><div class="card-head"><h3>Recent trades</h3><a class="btn small ghost" href="#/trades">View all →</a></div>
        <div data-recent>${recent.length ? tradeTable(recent.slice(0, 8), { compact: true }) : '<div class="empty">No trades yet.</div>'}</div></div>
      <div class="card"><div class="card-head"><h3>Latest lessons</h3><a class="btn small ghost" href="#/journal">Journal →</a></div>${latestEntries(entries)}</div>
    </div>`;

  $$("[data-period]", root).forEach((btn) =>
    btn.addEventListener("click", () => { state.period = btn.dataset.period; renderDashboard(root); }),
  );
  $("[data-new]", root).addEventListener("click", () => openTradeForm({ onSaved: () => renderDashboard(root) }));
  wireTradeRows($("[data-recent]", root));
  equityChart($("[data-equity]", root), stats.equity_curve);
}

function kpis(s) {
  const tile = (label, value, cls = "", sub = "", hero = false) =>
    `<div class="kpi ${hero ? "hero" : ""}"><div class="kpi-label">${label}</div><div class="kpi-value ${cls}">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;
  const streak = s.streak ? `${Math.abs(s.streak)} ${s.streak > 0 ? "win" : "loss"}${Math.abs(s.streak) > 1 ? (s.streak > 0 ? "s" : "es") : ""} in a row` : "";
  return [
    tile("Net P&amp;L", money(s.net_pnl), pnlClass(s.net_pnl), `${s.win_count}W · ${s.loss_count}L${s.breakeven_count ? ` · ${s.breakeven_count}BE` : ""}${streak ? " · " + streak : ""}`, true),
    tile("Win rate", percent(s.win_rate)),
    tile("Profit factor", ratio(s.profit_factor), s.profit_factor == null ? "" : s.profit_factor >= 1 ? "profit" : "loss"),
    tile("Expectancy", money(s.expectancy), pnlClass(s.expectancy), "per trade"),
    tile("Avg R", rMultiple(s.avg_r), pnlClass(s.avg_r)),
    tile("Avg win / loss", `<span class="profit">${money(s.avg_win)}</span>`, "", `<span class="loss">${money(s.avg_loss)}</span>`),
    tile("Max drawdown", money(s.max_drawdown ? -s.max_drawdown : 0), s.max_drawdown ? "loss" : ""),
    tile("Open trades", s.open_count, "", s.unrealized_pnl != null ? `<span class="${pnlClass(s.unrealized_pnl)}">${money(s.unrealized_pnl)} live</span>` : ""),
  ].join("");
}

function weekdayBars(days) {
  const visible = days.filter((d, i) => i < 5 || d.trades);
  const max = Math.max(...visible.map((d) => Math.abs(d.net_pnl)), 1);
  return `<div class="bars">${visible.map((d) => {
    const width = (Math.abs(d.net_pnl) / max) * 50;
    const left = d.net_pnl >= 0 ? 50 : 50 - width;
    const color = d.net_pnl >= 0 ? "var(--profit)" : "var(--loss)";
    return `<div class="bar-row"><span class="muted">${d.key}</span>
      <div class="bar-track"><span class="zero"></span><span class="bar-fill" style="left:${left}%;width:${width}%;background:${color}"></span></div>
      <span class="num r ${pnlClass(d.net_pnl)}" style="text-align:right">${d.trades ? money(d.net_pnl) : "—"}</span></div>`;
  }).join("")}</div>`;
}

function breakdownTable(rows, label) {
  if (!rows.length) return `<div class="muted">No closed trades in this period.</div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>${label}</th><th class="r">Trades</th><th class="r">Win rate</th><th class="r">Net P&amp;L</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(r.key)}</td><td class="r num">${r.trades}</td><td class="r num">${percent(r.win_rate)}</td><td class="r num ${pnlClass(r.net_pnl)}">${money(r.net_pnl)}</td></tr>`).join("")}</tbody>
  </table></div>`;
}

function latestEntries(entries) {
  if (!entries.length) return `<div class="muted">Nothing yet. After your next session, write down one thing you learned.</div>`;
  return entries.slice(0, 4).map((e) => `
    <a href="#/journal/${e.id}" style="display:block;text-decoration:none;padding:8px 0;border-bottom:1px solid var(--border)">
      <div class="muted" style="font-size:12px">${date(e.entry_date)}</div>
      <div style="font-weight:500">${esc(e.title)}</div>
    </a>`).join("");
}

function periodStart(period) {
  const today = todayLocal();
  if (period === "all") return "";
  if (period === "ytd") return `${today.slice(0, 4)}-01-01`;
  const days = period === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
