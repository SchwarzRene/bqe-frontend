import { initData } from "./api.js";
import { disposeCharts } from "./charts.js";
import { $, $$, errorBox, toast } from "./ui.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderJournal } from "./views/journal.js";
import { renderSymbols } from "./views/symbols.js";
import { renderTradeDetail } from "./views/tradeDetail.js";
import { renderTrades } from "./views/trades.js";

const ROUTES = {
  dashboard: renderDashboard,
  trades: renderTrades,
  trade: renderTradeDetail,
  journal: renderJournal,
  symbols: renderSymbols,
};
// Detail pages highlight their parent section in the nav.
const NAV_PARENT = { trade: "trades" };
const THEME_KEY = "tj-theme";

async function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
  const routeName = ROUTES[name] ? name : "dashboard";
  highlightNav(NAV_PARENT[routeName] || routeName);
  disposeCharts();

  // A fresh container per navigation: a slow render from the previous page then
  // writes into a detached node instead of clobbering the new one.
  const container = document.createElement("div");
  container.innerHTML = `<div class="loading">Loading…</div>`;
  $("#view").replaceChildren(container);
  try {
    await ROUTES[routeName](container, arg);
  } catch (error) {
    container.innerHTML = errorBox(error);
  }
}

function highlightNav(active) {
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === active));
}

// The theme is a display preference, not journal data, so it may stay in
// this browser for guests too.
function applyStoredTheme() {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    if (theme) document.documentElement.dataset.theme = theme;
  } catch { /* storage unavailable — fall back to the OS theme */ }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme
    || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  // Charts read colors at creation time, so re-render to pick up the new theme.
  route();
}

function showSaveStatus(status, detail) {
  const el = $("#save-status");
  el.classList.toggle("error", status === "error" || status === "conflict");
  if (status === "saving") el.textContent = "Saving…";
  else if (status === "saved") el.textContent = "Saved";
  else if (status === "conflict") {
    el.textContent = "Not saved";
    toast("This journal was changed in another tab. Reload to continue — changes here are not saved.", "error");
  } else {
    el.textContent = "Not saved";
    toast(`Could not save: ${detail}`, "error");
  }
}

async function start() {
  applyStoredTheme();
  $("#theme-toggle").addEventListener("click", toggleTheme);
  window.BQE?.mountAccountChip($("#account"), { note: "Your trades, journal and drawings are saved to your account." });
  try {
    const { signedIn } = await initData(showSaveStatus);
    $("#guest-note").hidden = signedIn;
  } catch (error) {
    $("#view").innerHTML = errorBox(error);
    return;
  }
  window.addEventListener("hashchange", route);
  route();
}

start();
