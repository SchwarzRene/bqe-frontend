// Market News: loads /api/news, renders the chosen page, and handles the
// page's controls. The pages are in pages.js and calendar.js, the region map
// in map.js, Ask AI and sign-in in chat.js.

import { addDays, esc, longDate, todayKey, time, tzLabel } from './format.js';
import { CATS, renderCalendarPage } from './calendar.js';
import { chat, initChat, renderSuggest, session, setUser } from './chat.js';
import { globeLabel, mapKeys, renderMap } from './map.js';
import { analysisOpen, closeAnalysis } from './analysis.js';
import { companiesCard, handleCompanies, handleCompanySubmit, initCompanies, loadCharts } from './companies.js';
import { liveCard, nextCard, renderCommodities, renderGeneral, renderStocks } from './pages.js';
import { allRegions, briefing, data, events, loadPrefs, PAGES, savePrefs, state, toggleRegion, TZS } from './state.js';

const $ = (id) => document.getElementById(id);
const TAB_EMOJI = { general: '📰', stocks: '📈', commodities: '🛢️', calendar: '📅' };

// ---------- Chrome ----------
function renderChrome() {
  const b = briefing();
  const parts = [];
  if (b) parts.push(`Briefing ${time(b.generatedAt)}`);
  if (data.D && data.D.fetchedAt) parts.push(`headlines ${time(data.D.fetchedAt)}`);
  $('updated').textContent = parts.length ? `${parts.join(' · ')} ${tzLabel()}` : 'Not loaded yet';
  const set = $('settings');
  set.innerHTML = `<span class="emoji" aria-hidden="true">⚙</span><span class="lbl">Time</span>${tzLabel()}
    <svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
  set.setAttribute('aria-expanded', String(state.settingsOpen));
  $('setbox').hidden = !state.settingsOpen;
  $('today').textContent = longDate(Date.now());
  $('tz').innerHTML = TZS.map(([id, label]) => `<button type="button" data-tz="${id}" aria-pressed="${state.tz === id}">${label}</button>`).join('');
  const upcoming = events().filter((e) => Date.parse(e.start) > Date.now()).length;
  $('tabs').innerHTML = PAGES.map(([id, label]) =>
    `<a href="#${id}"${state.page === id ? ' aria-current="page"' : ''}><span class="tab-emoji" aria-hidden="true">${TAB_EMOJI[id]}</span>${label}${id === 'calendar' && upcoming ? `<span class="n">${upcoming}</span>` : ''}</a>`).join('');
  const globe = $('globe');
  globe.innerHTML = globeLabel();
  globe.setAttribute('aria-expanded', String(state.mapOpen));
  globe.classList.toggle('filtered', !allRegions());
  renderMap($('mapbox'), renderChrome);
}

// ---------- Page ----------
function render() {
  renderChrome();
  const main = $('page');
  const open = [...main.querySelectorAll('details[open]')].map((d) => d.dataset.key || d.querySelector('summary').textContent);
  let html = '';
  if (data.notice) html += `<p class="notice" role="status">${esc(data.notice)}</p>`;
  if (!data.D) {
    html += data.loadError ? `<p class="notice error">${esc(data.loadError)}</p>` : '<p class="meta" style="padding:24px 0">Loading today’s briefing…</p>';
  } else {
    html += ({ general: renderGeneral, stocks: renderStocks, commodities: renderCommodities, calendar: renderCalendarPage })[state.page]();
    if (data.D.stale && data.D.stale.length) html += `<p class="meta">No headlines for a day from: ${esc(data.D.stale.join(', '))}.</p>`;
  }
  main.innerHTML = html;
  main.querySelectorAll('details').forEach((d) => {
    if (open.includes(d.dataset.key || d.querySelector('summary').textContent)) d.open = true;
  });
  document.title = `Market News – ${PAGES.find((p) => p[0] === state.page)[1]}`;
  if (chat.open) renderSuggest();
}

// ---------- Data ----------
async function load() {
  try {
    const res = await fetch('/api/news', { cache: 'no-cache' });
    if (!res.ok) throw new Error('status ' + res.status);
    data.D = await res.json();
    data.byId = new Map(data.D.items.map((i) => [i.id, i]));
    data.loadError = '';
  } catch (err) {
    if (!data.D) data.loadError = 'Market News could not be loaded (' + err.message + '). Check the connection and press Refresh.';
  }
  render();
  if (state.page === 'stocks') loadCharts();
}

// ---------- Controls ----------
function selectDay(k) {
  state.cal.selected = k;
  render();
  // On narrow screens the day panel is below the grid.
  const panel = $('daypanel');
  if (panel && window.matchMedia('(max-width: 1180px)').matches) panel.scrollIntoView({ block: 'start' });
}

/** Redraw only the companies card, e.g. when its prices arrive. */
function renderCompanies() {
  const el = $('companies');
  if (el) el.innerHTML = companiesCard();
}

document.addEventListener('submit', (e) => { handleCompanySubmit(e); });

document.addEventListener('click', (e) => {
  if (handleCompanies(e)) return;
  const t = e.target.closest('[data-region], [data-tz], [data-hl-tab], [data-hl-sort], [data-cal-day], [data-cal-step], [data-cal-today], [data-cal-view], [data-cal-imp], [data-cal-cat], [data-cal-open]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.region) {
    // Regions combine: a click adds or removes one; "All regions" clears the filter.
    toggleRegion(ds.region);
    savePrefs(); render();
  } else if (ds.tz) {
    state.tz = ds.tz; savePrefs(); render();
  } else if (ds.hlSort) {
    state.hlSort = ds.hlSort; savePrefs(); render();
  } else if (ds.hlTab) {
    state.hlTab[state.page] = Number(ds.hlTab); render();
  } else if (ds.calOpen) {
    // "Open calendar" from a news page: that day, and that page's categories.
    state.cal.selected = ds.calOpen;
    state.cal.cursor = ds.calOpen;
    if (ds.calPreset) state.cal.cats = ds.calPreset.split(',');
    savePrefs();
    if (location.hash === '#calendar') render(); // else the hash change renders
  } else if (ds.calDay) {
    selectDay(ds.calDay);
  } else if (ds.calStep) {
    const n = Number(ds.calStep);
    const c = state.cal.cursor || todayKey();
    state.cal.cursor = state.cal.view === 'week' ? addDays(c, 7 * n) : shiftMonth(c, n);
    render();
  } else if ('calToday' in ds) {
    state.cal.cursor = state.cal.selected = todayKey(); render();
  } else if (ds.calView) {
    state.cal.view = ds.calView;
    state.cal.cursor = state.cal.selected || state.cal.cursor;
    savePrefs(); render();
  } else if (ds.calImp || ds.calCat) {
    if (ds.calImp) state.cal.minImp = Number(ds.calImp);
    if (ds.calCat === 'all') state.cal.cats = CATS.map((c) => c.id);
    else if (ds.calCat) {
      const on = state.cal.cats.includes(ds.calCat);
      state.cal.cats = on ? state.cal.cats.filter((c) => c !== ds.calCat) : state.cal.cats.concat(ds.calCat);
    }
    savePrefs(); render();
  }
});

function shiftMonth(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && analysisOpen()) { closeAnalysis(); return; }
  mapKeys(e);
  const cell = e.target.closest && e.target.closest('.cell[data-cal-day]');
  if (cell && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectDay(cell.dataset.calDay); }
  const row = e.target.closest && e.target.closest('.co-row[data-co-select], .co-feature[data-co-select]');
  if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
  if (e.key === 'Escape' && state.mapOpen && !chat.open) { state.mapOpen = false; renderChrome(); $('globe').focus(); }
  if (e.key === 'Escape' && state.settingsOpen && !chat.open) { state.settingsOpen = false; renderChrome(); $('settings').focus(); }
});

// The region map and the settings fold open one at a time.
$('globe').addEventListener('click', () => { state.mapOpen = !state.mapOpen; state.settingsOpen = false; renderChrome(); });
$('settings').addEventListener('click', () => { state.settingsOpen = !state.settingsOpen; state.mapOpen = false; renderChrome(); });

// Page routing via the URL hash; in-page anchors (#headlines) keep the current page.
function route() {
  const h = location.hash.replace('#', '');
  if (PAGES.some((p) => p[0] === h)) {
    state.page = h;
    render();
    if (h === 'stocks') loadCharts();
    window.scrollTo(0, 0);
  }
}
window.addEventListener('hashchange', route);

// A guest's Refresh re-reads the stored briefing. A signed-in user's asks
// the Worker to fetch and write a new one (at most one per 15 minutes).
const refreshBtn = $('refresh');
refreshBtn.addEventListener('click', async () => {
  data.notice = '';
  if (session.user) {
    refreshBtn.disabled = true;
    data.notice = 'Fetching headlines and writing a fresh briefing…';
    render();
    try {
      const res = await fetch('/api/news/refresh', { method: 'POST', credentials: 'same-origin' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) setUser(null);
      data.notice = res.ok ? '' : (body.error || 'The briefing could not be refreshed.') + ' Showing the latest one.';
    } catch {
      data.notice = 'The briefing could not be refreshed. Showing the latest one.';
    }
    refreshBtn.disabled = false;
  }
  await load();
});

// "On now" and the countdowns move with the clock; the data is re-read every 5 minutes.
setInterval(() => {
  if (!data.D) return;
  const live = $('live-now'), next = $('next-up');
  if (live) live.innerHTML = liveCard();
  if (next) next.innerHTML = nextCard();
}, 30000);
setInterval(load, 5 * 60000);
// The company charts: the price every minute, the chart itself every five.
let chartTicks = 0;
setInterval(() => {
  if (state.page !== 'stocks' || document.hidden) return;
  chartTicks++;
  loadCharts({ fresh: chartTicks % 5 === 0, quotesOnly: chartTicks % 5 !== 0 });
}, 60000);

loadPrefs();
initChat();
initCompanies(renderCompanies);
route();
render();
load();
