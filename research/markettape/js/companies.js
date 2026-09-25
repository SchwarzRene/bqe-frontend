// My companies: a live chart per followed company, and the list to edit.
//
// Prices come from the Worker's market endpoints, the ones the Trading
// Journal uses (Yahoo behind an edge cache): /api/market/quote for the price
// and the change on the day, /api/market/candles for the chart. Quotes are
// re-read every minute, charts every five.
//
// The list starts as the watchlist in worker/news/sources.json. A changed
// list is kept in the browser, and on the account when signed in
// (/api/state/news), so it follows the user to other devices.

import { openAnalysis } from './analysis.js';
import { esc } from './format.js';
import { briefing, data } from './state.js';

const LIST_KEY = 'bqe:market-news:companies';
const RANGES = {
  '1D': { interval: '5m', days: 5, lastSession: true },
  '5D': { interval: '30m', days: 8 },
  '1M': { interval: '1d', days: 32 },
};

export const companies = { list: null, range: '1D', selected: null, editing: false, error: '', adding: false };
const quotes = new Map(); // symbol -> {price, previous_close, currency, name} | {error}
const candles = new Map(); // `${symbol}|${range}` -> [{time, close}] | {error}
let store = null;
let onChange = () => {};

// --------------------------------------------------------------------------
// the list
// --------------------------------------------------------------------------

const clean = (list) => (Array.isArray(list) ? list : [])
  .filter((c) => c && typeof c.symbol === 'string' && /^[A-Z0-9^=.\-]{1,20}$/.test(c.symbol))
  .map((c) => ({ symbol: c.symbol, name: String(c.name || c.symbol).slice(0, 60) }))
  .slice(0, 30);

function defaults() {
  return ((data.D && data.D.watchlist) || []).map((w) => ({ symbol: w.symbol, name: w.name }));
}

/** The companies shown: the user's list, or the watchlist until they change it. */
export function followed() {
  return companies.list || defaults();
}

/** Load the user's list: from the account when signed in, else from this browser. */
export async function initCompanies(rerender) {
  onChange = rerender;
  try {
    const saved = JSON.parse(localStorage.getItem(LIST_KEY) || 'null');
    if (saved) companies.list = clean(saved);
  } catch { /* no storage: the watchlist */ }
  if (window.BQE) {
    store = window.BQE.store('news');
    try {
      const doc = await store.load();
      if (doc && Array.isArray(doc.companies)) companies.list = clean(doc.companies);
    } catch { /* keep the local list */ }
  }
  onChange();
}

function save() {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(companies.list)); } catch { /* fine */ }
  if (store && store.signedIn) store.save({ companies: companies.list });
}

async function add(raw) {
  const symbol = raw.trim().toUpperCase();
  companies.error = '';
  if (!/^[A-Z0-9^=.\-]{1,20}$/.test(symbol)) { companies.error = 'Enter a ticker such as TSLA, SAP.DE or 7203.T.'; return onChange(); }
  if (followed().some((c) => c.symbol === symbol)) { companies.error = `${symbol} is already on the list.`; return onChange(); }
  companies.adding = true;
  onChange();
  const q = await fetchQuote(symbol, true);
  companies.adding = false;
  if (q.error) { companies.error = q.error; return onChange(); }
  companies.list = followed().concat({ symbol, name: q.name || symbol });
  companies.selected = symbol;
  save();
  onChange();
  loadCharts();
}

function remove(symbol) {
  companies.list = followed().filter((c) => c.symbol !== symbol);
  if (companies.selected === symbol) companies.selected = null;
  save();
  onChange();
}

function reset() {
  companies.list = null;
  try { localStorage.removeItem(LIST_KEY); } catch { /* fine */ }
  if (store && store.signedIn) store.save({ companies: null });
  onChange();
  loadCharts();
}

// --------------------------------------------------------------------------
// data
// --------------------------------------------------------------------------

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'status ' + res.status);
  return body;
}

async function fetchQuote(symbol, fresh = false) {
  if (!fresh && quotes.has(symbol)) return quotes.get(symbol);
  let q;
  try {
    q = await getJson('/api/market/quote?ticker=' + encodeURIComponent(symbol));
  } catch (err) {
    q = { error: err.message };
  }
  quotes.set(symbol, q);
  return q;
}

/** The last trading session: bars after the last gap of more than three hours. */
function lastSession(bars) {
  for (let i = bars.length - 1; i > 0; i--) {
    if (bars[i].time - bars[i - 1].time > 3 * 3600) return bars.slice(i);
  }
  return bars;
}

async function fetchCandles(symbol, range) {
  const r = RANGES[range];
  const now = Math.floor(Date.now() / 1000);
  let out;
  try {
    const body = await getJson(`/api/market/candles?ticker=${encodeURIComponent(symbol)}&interval=${r.interval}&period1=${now - r.days * 86400}&period2=${now}`);
    const bars = (body.candles || []).map((c) => ({ time: c.time, close: c.close }));
    out = r.lastSession ? lastSession(bars) : bars;
  } catch (err) {
    out = { error: err.message };
  }
  candles.set(symbol + '|' + range, out);
  return out;
}

/** Fetch what the card needs and redraw it. `quotesOnly`: new prices, the charts as they are. */
export async function loadCharts({ fresh = false, quotesOnly = false } = {}) {
  const list = followed();
  if (!list.length) return;
  await Promise.all(list.map(async (c) => {
    if (fresh || quotesOnly) quotes.delete(c.symbol);
    await fetchQuote(c.symbol);
    const key = c.symbol + '|' + companies.range;
    if (fresh || !candles.has(key)) await fetchCandles(c.symbol, companies.range);
  }));
  onChange();
}

// --------------------------------------------------------------------------
// drawing
// --------------------------------------------------------------------------

const fmtPrice = (v, currency) => {
  if (v == null) return '–';
  const digits = v >= 1000 ? 0 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + (currency && currency !== 'USD' ? ' ' + currency : '');
};

/** The change shown: over the day for 1D (vs. the previous close), else over the range. */
function change(symbol) {
  const q = quotes.get(symbol);
  const bars = candles.get(symbol + '|' + companies.range);
  if (companies.range === '1D') {
    if (!q || q.error || q.previous_close == null) return null;
    return (q.price / q.previous_close - 1) * 100;
  }
  if (!Array.isArray(bars) || bars.length < 2) return null;
  const last = q && !q.error ? q.price : bars[bars.length - 1].close;
  return (last / bars[0].close - 1) * 100;
}

function line(bars, w, h, pad = 2, base = null) {
  const vals = bars.map((b) => b.close).concat(base != null ? [base] : []);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i) => (bars.length === 1 ? w / 2 : pad + (i / (bars.length - 1)) * (w - 2 * pad));
  const y = (v) => pad + (1 - (v - min) / span) * (h - 2 * pad);
  const pts = bars.map((b, i) => `${x(i).toFixed(1)},${y(b.close).toFixed(1)}`);
  return { d: 'M' + pts.join('L'), area: `M${x(0).toFixed(1)},${h}L${pts.join('L')}L${x(bars.length - 1).toFixed(1)},${h}Z`, baseY: base != null ? y(base) : null };
}

function chart(symbol, w, h, big) {
  const bars = candles.get(symbol + '|' + companies.range);
  if (!bars) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><rect class="loading" x="0" y="${h / 2 - 1}" width="${w}" height="2"/></svg>`;
  if (bars.error || bars.length < 2) return `<span class="nochart">${bars.error ? 'No chart' : 'No trades yet'}</span>`;
  const q = quotes.get(symbol);
  const base = companies.range === '1D' && q && !q.error ? q.previous_close : bars[0].close;
  const up = (change(symbol) ?? 0) >= 0;
  const { d, area, baseY } = line(bars, w, h, big ? 4 : 2, base);
  const id = 'g' + symbol.replace(/[^A-Za-z0-9]/g, '') + (big ? 'b' : 's');
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(symbol)} price, ${esc(companies.range)}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity="${big ? 0.28 : 0.2}"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    ${baseY != null ? `<line class="base" x1="0" x2="${w}" y1="${baseY.toFixed(1)}" y2="${baseY.toFixed(1)}"/>` : ''}
    <path d="${area}" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="currentColor" stroke-width="${big ? 1.8 : 1.4}" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function featured(c) {
  const q = quotes.get(c.symbol);
  const ch = change(c.symbol);
  const bars = candles.get(c.symbol + '|' + companies.range);
  const t = (s) => new Intl.DateTimeFormat('en-GB', companies.range === '1M' ? { day: 'numeric', month: 'short' } : { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(s * 1000));
  return `<div class="co-feature" role="button" tabindex="0" data-co-select="${esc(c.symbol)}" title="Open the analysis">
    <div class="co-fhead">
      <div><b>${esc(c.symbol)}</b> <span class="meta">${esc(c.name || (q && q.name) || c.symbol)}</span></div>
      <div class="co-price">${q && !q.error ? esc(fmtPrice(q.price, q.currency)) : ''}${ch != null ? ` <span class="${ch >= 0 ? 'pos' : 'neg'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</span>` : ''}</div>
    </div>
    ${chart(c.symbol, 320, 110, true)}
    ${Array.isArray(bars) && bars.length > 1 ? `<div class="co-axis"><span>${esc(t(bars[0].time))}</span><span>${esc(t(bars[bars.length - 1].time))}</span></div>` : ''}
  </div>`;
}

/** The card. Its buttons are handled by handleCompanies (main.js passes clicks through). */
export function companiesCard() {
  const list = followed();
  const lines = new Map(((briefing() && briefing().companies) || []).filter((c) => c.line).map((c) => [c.ticker, c.line]));
  const sel = list.find((c) => c.symbol === companies.selected) || list[0];
  const rows = list.map((c) => {
    const q = quotes.get(c.symbol);
    const ch = change(c.symbol);
    const news = lines.get(c.symbol);
    return `<div class="co-row${sel && sel.symbol === c.symbol ? ' sel' : ''}" role="button" tabindex="0" data-co-select="${esc(c.symbol)}">
      <div class="co-id"><b>${esc(c.symbol)}</b><span>${esc(c.name || (q && q.name) || c.symbol)}</span></div>
      ${chart(c.symbol, 96, 30, false)}
      <div class="co-q">${q ? (q.error ? '<span class="meta">–</span>' : `<span>${esc(fmtPrice(q.price, q.currency))}</span>`) : '<span class="meta">…</span>'}
        ${ch != null ? `<span class="${ch >= 0 ? 'pos' : 'neg'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</span>` : ''}</div>
      ${companies.editing ? `<button type="button" class="co-del" data-co-remove="${esc(c.symbol)}" aria-label="Remove ${esc(c.symbol)}">✕</button>` : news ? '<span class="co-news" aria-label="In today’s news"></span>' : '<span></span>'}
    </div>`;
  }).join('');
  return `
    <div class="card-head">
      <h2 class="h2" id="co-h">My companies</h2>
      <div class="co-tools">
        <div class="seg small" role="group" aria-label="Chart range">${Object.keys(RANGES).map((r) => `<button type="button" data-co-range="${r}" aria-pressed="${companies.range === r}">${r}</button>`).join('')}</div>
        <button type="button" class="btn small" data-co-edit aria-pressed="${companies.editing}">${companies.editing ? 'Done' : 'Edit'}</button>
      </div>
    </div>
    ${sel ? featured(sel) : ''}
    <div class="co-list">${rows || '<p class="empty">No companies yet. Add one below.</p>'}</div>
    ${companies.editing ? `<form class="co-add" data-co-add>
        <label class="sr-only" for="co-input">Ticker to add</label>
        <input id="co-input" name="ticker" placeholder="Add a ticker, e.g. TSLA or SAP.DE" autocomplete="off" spellcheck="false" ${companies.adding ? 'disabled' : ''}>
        <button type="submit" class="btn primary small" ${companies.adding ? 'disabled' : ''}>${companies.adding ? 'Checking…' : 'Add'}</button>
      </form>
      ${companies.error ? `<p class="co-err">${esc(companies.error)}</p>` : ''}
      <p class="note">${store && store.signedIn ? 'Saved to your account.' : 'Saved in this browser. Sign in to keep the list on every device.'}${companies.list ? ' <button type="button" class="linkish" data-co-reset>Reset to the default list</button>' : ''}</p>`
      : `<p class="note">Prices from Yahoo, delayed. A dot marks a company in today’s news. Tap a company for its analysis: charts, figures and an AI analyst’s note.</p>`}`;
}

/** Clicks, keys and the add form inside the card. True when handled. */
export function handleCompanies(e) {
  const t = e.target.closest('[data-co-select], [data-co-range], [data-co-edit], [data-co-remove], [data-co-reset]');
  if (!t) return false;
  const ds = t.dataset;
  if (ds.coRemove) { remove(ds.coRemove); e.stopPropagation(); }
  else if (ds.coSelect) {
    companies.selected = ds.coSelect;
    onChange();
    const c = followed().find((x) => x.symbol === ds.coSelect);
    if (c && !companies.editing) openAnalysis(c);
  }
  else if (ds.coRange) { companies.range = ds.coRange; onChange(); loadCharts(); }
  else if ('coEdit' in ds) { companies.editing = !companies.editing; companies.error = ''; onChange(); if (companies.editing) setTimeout(() => { const i = document.getElementById('co-input'); if (i) i.focus(); }); }
  else if ('coReset' in ds) reset();
  return true;
}

export function handleCompanySubmit(e) {
  const form = e.target.closest('[data-co-add]');
  if (!form) return false;
  e.preventDefault();
  add(form.ticker.value).then(() => { const i = document.getElementById('co-input'); if (i) i.focus(); });
  return true;
}
