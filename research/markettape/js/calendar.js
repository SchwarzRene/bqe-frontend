// The calendar: a month or week grid of every scheduled event, filterable by
// category and importance, and a day panel with everything on the day.
//
// Busy days are ranked by the model once a day (worker/news/rank.ts): the
// grid shows that day's key events first, and the day panel its summary.
// Days without a ranking use the importance from the calendar's own config.

import { addDays, dayKey, esc, hl, impDots, keyLabel, mondayOf, safeUrl, time, todayKey, weekday } from './format.js';
import { data, events, keep, R_NAME, ranks, regionOf, state } from './state.js';

export const CATS = [
  { id: 'cb', label: 'Central banks', color: 'var(--c-cb)' },
  { id: 'speech', label: 'Speeches', color: 'var(--c-speech)' },
  { id: 'data', label: 'Economic data', color: 'var(--c-data)' },
  { id: 'earnings', label: 'Earnings', color: 'var(--c-earnings)' },
  { id: 'commodities', label: 'Commodities', color: 'var(--c-commodities)' },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
const BANK_TYPES = new Set(['fed', 'eu-central-bank', 'asia-central-bank']);
const PREVIEW = 3; // events per day cell in the month view

/** The category an event is filtered by. Speakers from Yahoo are titled "Country: Name". */
export function catOf(e) {
  if (e.type === 'earnings') return 'earnings';
  if (e.type === 'commodities') return 'commodities';
  const speech = /\b(speaks?|speech|testimony|testifies|remarks)\b/i.test(e.title) || (/^[^:]{2,40}: /.test(e.title) && !/\brate\b/i.test(e.title));
  if (BANK_TYPES.has(e.type)) return speech ? 'speech' : 'cb';
  if (e.type === 'russia') return /\b(key rate|rate decision)\b/i.test(e.title) ? 'cb' : speech ? 'speech' : 'data';
  return 'data';
}

export const impOf = (e) => (ranks() && ranks().events[e.id] ? ranks().events[e.id].importance : e.importance);
export const isKey = (e) => !!(ranks() && ranks().events[e.id] && ranks().events[e.id].key);
/** Most important first: the model's key events, then importance, then time. */
export const byImportance = (a, b) => (isKey(b) - isKey(a)) || (impOf(b) - impOf(a)) || a.start.localeCompare(b.start);
const byTime = (a, b) => a.start.localeCompare(b.start);

/** Events passing the region, category and importance filters. */
export function calEvents(opts = {}) {
  const cats = opts.cats || state.cal.cats;
  const minImp = opts.minImp || state.cal.minImp;
  return events().filter((e) => keep(regionOf(e)) && cats.includes(catOf(e)) && impOf(e) >= minImp);
}

/** Events by the viewer's day. */
export function byDay(list) {
  const out = new Map();
  list.forEach((e) => {
    const k = dayKey(Date.parse(e.start));
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(e);
  });
  out.forEach((l) => l.sort(byTime));
  return out;
}

/** The few events a small space shows for a day, in time order. */
export function preview(list, n = PREVIEW) {
  return list.slice().sort(byImportance).slice(0, n).sort(byTime);
}

/** The first and last day the loaded calendar covers. */
function coverage() {
  const all = events();
  if (!all.length) return null;
  return { from: dayKey(Date.parse(all[0].start)), to: dayKey(Date.parse(all[all.length - 1].start)) };
}

const isLive = (e, now = Date.now()) => Date.parse(e.start) <= now && now < Date.parse(e.end);
const catStyle = (e) => `--c:${CAT[catOf(e)].color}`;

// --------------------------------------------------------------------------
// the Calendar page
// --------------------------------------------------------------------------

export function renderCalendarPage() {
  const cal = state.cal;
  if (!cal.cursor) cal.cursor = todayKey();
  if (!cal.selected) cal.selected = todayKey();
  const all = events().filter((e) => keep(regionOf(e)));
  const counts = Object.fromEntries(CATS.map((c) => [c.id, all.filter((e) => catOf(e) === c.id && impOf(e) >= cal.minImp).length]));
  const days = byDay(calEvents());
  const title = cal.view === 'month'
    ? keyLabel(cal.cursor, { month: 'long', year: 'numeric' })
    : `${keyLabel(mondayOf(cal.cursor), { day: 'numeric', month: 'short' })} – ${keyLabel(addDays(mondayOf(cal.cursor), 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const r = ranks();
  const cov = coverage();

  return `
    <section class="stack" aria-labelledby="cal-h" style="gap:16px">
      <div class="cal-bar">
        <div class="cal-nav">
          <button type="button" class="icon-btn" data-cal-step="-1" aria-label="Previous ${cal.view}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
          </button>
          <button type="button" class="btn" data-cal-today>Today</button>
          <button type="button" class="icon-btn" data-cal-step="1" aria-label="Next ${cal.view}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
          </button>
          <h1 class="cal-title" id="cal-h">${esc(title)}</h1>
        </div>
        <div class="cal-nav">
          <div class="seg" role="group" aria-label="Importance">
            ${[[1, 'All'], [2, 'Notable+'], [3, 'Key only']].map(([v, l]) => `<button type="button" data-cal-imp="${v}" aria-pressed="${cal.minImp === v}">${l}</button>`).join('')}
          </div>
          <div class="seg" role="group" aria-label="View">
            ${[['month', 'Month'], ['week', 'Week']].map(([v, l]) => `<button type="button" data-cal-view="${v}" aria-pressed="${cal.view === v}">${l}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="filters">
        <div class="cats" role="group" aria-label="Categories">
          ${CATS.map((c) => `<button type="button" data-cal-cat="${c.id}" aria-pressed="${cal.cats.includes(c.id)}"><span class="dot" style="background:${c.color}"></span>${c.label}<small>${counts[c.id]}</small></button>`).join('')}
          ${cal.cats.length < CATS.length ? '<button type="button" class="reset" data-cal-cat="all">Show all</button>' : ''}
        </div>
      </div>
      <div class="cal-layout">
        <div class="stack" style="gap:10px">
          <div class="cal">${cal.view === 'month' ? monthGrid(days, cov) : weekGrid(days, cov)}</div>
          <div class="cal-foot">
            <span>${r ? `<span class="eyebrow" style="font-size:10px">AI</span> Busy days ranked by AI at ${time(r.generatedAt)} ${state.tz === 'vie' ? 'Vienna' : 'New York'}; the grid shows their key events first.` : 'Busy days show their most important events first.'}</span>
            <span>${cov ? `Calendar covers ${keyLabel(cov.from, { day: 'numeric', month: 'short' })} – ${keyLabel(cov.to, { day: 'numeric', month: 'short' })}` : ''}</span>
          </div>
        </div>
        ${dayPanel(cal.selected)}
      </div>
    </section>`;
}

function cellChips(list) {
  const shown = preview(list);
  const now = Date.now();
  return shown.map((e) => `<div class="chip${isKey(e) || impOf(e) === 3 ? ' key' : ''}${Date.parse(e.end) < now ? ' done' : ''}" style="${catStyle(e)}" title="${esc(time(e.start) + ' ' + e.title)}"><span class="ct">${time(e.start)}</span><span class="cn">${esc(e.title)}</span></div>`).join('') +
    (list.length > shown.length ? `<div class="plus">+${list.length - shown.length} more</div>` : '') +
    `<div class="dots" aria-hidden="true">${list.slice(0, 8).map((e) => `<span class="dot" style="background:${CAT[catOf(e)].color}"></span>`).join('')}</div>`;
}

function monthGrid(days, cov) {
  const cal = state.cal;
  const month = cal.cursor.slice(0, 7);
  const first = mondayOf(month + '-01');
  const today = todayKey();
  const r = ranks();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const k = addDays(first, i);
    if (i >= 35 && k.slice(0, 7) !== month) break; // five rows when the month fits
    const list = days.get(k) || [];
    const cls = ['cell'];
    if (k.slice(0, 7) !== month) cls.push('out');
    if (k === today) cls.push('today');
    if (k === cal.selected) cls.push('sel');
    if (weekday(k) >= 5) cls.push('weekend');
    if (!cov || k < cov.from || k > cov.to) cls.push('nodata');
    const ai = r && r.days[k];
    cells.push(`<div class="${cls.join(' ')}" role="button" tabindex="0" data-cal-day="${k}" aria-pressed="${k === cal.selected}" aria-label="${esc(keyLabel(k, { weekday: 'long', day: 'numeric', month: 'long' }))}, ${list.length} event${list.length === 1 ? '' : 's'}">
      <div class="top-row"><span class="num">${Number(k.slice(8))}</span>${ai ? '<span class="ai" title="Ranked by AI">AI</span>' : ''}</div>
      ${cellChips(list)}
    </div>`);
  }
  return `<div class="cal-head">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div>${d}</div>`).join('')}</div><div class="cal-grid">${cells.join('')}</div>`;
}

function weekGrid(days) {
  const cal = state.cal;
  const monday = mondayOf(cal.cursor);
  const today = todayKey();
  const now = Date.now();
  const cols = [];
  for (let i = 0; i < 7; i++) {
    const k = addDays(monday, i);
    const list = days.get(k) || [];
    cols.push(`<div class="wcol${k === today ? ' today' : ''}${k === cal.selected ? ' sel' : ''}">
      <button type="button" class="wh" data-cal-day="${k}"><b>${esc(keyLabel(k, { weekday: 'short', day: 'numeric' }))}</b><span>${list.length || ''}</span></button>
      <div class="wb">${list.length ? list.map((e) => `
        <div class="wev${isKey(e) || impOf(e) === 3 ? ' key' : impOf(e) === 1 ? ' minor' : ''}" style="${catStyle(e)}" data-cal-day="${k}">
          <div class="wt"><span>${time(e.start)}${isLive(e, now) ? ' · live' : ''}</span>${impDots(impOf(e))}</div>
          <div class="wn">${esc(e.title)}</div>
          ${e.result ? `<div class="wr">${esc(e.result)}</div>` : ''}
        </div>`).join('') : '<span class="meta" style="padding:4px">—</span>'}</div>
    </div>`);
  }
  return `<div class="week">${cols.join('')}</div>`;
}

// --------------------------------------------------------------------------
// the day panel
// --------------------------------------------------------------------------

function eventDetail(e, now = Date.now()) {
  const heads = (e.itemIds || []).map((id) => data.byId.get(id)).filter(Boolean);
  const live = isLive(e, now);
  return `<div class="dev${isKey(e) ? ' key' : ''}">
    <span class="tm">${time(e.start)}</span>
    <div>
      <div class="nm">${esc(e.title)}</div>
      <div class="sub"><span class="dot" style="background:${CAT[catOf(e)].color}"></span>${CAT[catOf(e)].label} · ${R_NAME[regionOf(e)]} ${impDots(impOf(e))}${isKey(e) ? ' <span class="pill gold">Key</span>' : ''}</div>
      ${e.result ? `<div class="res">${esc(e.result)}</div>` : live ? '<div class="res now">Live now</div>' : ''}
      ${e.streamUrl && Date.parse(e.end) > now ? `<a class="more-link" style="font-size:12px" href="${esc(safeUrl(e.streamUrl))}" target="_blank" rel="noopener">${live ? 'Watch live ↗' : 'Stream ↗'}</a>` : ''}
      ${heads.length ? `<details class="evheads"><summary>${heads.length} related headline${heads.length > 1 ? 's' : ''}</summary>${heads.map(hl).join('')}</details>` : ''}
    </div>
  </div>`;
}

function dayPanel(k) {
  const list = (byDay(calEvents()).get(k) || []);
  const everything = (byDay(events().filter((e) => keep(regionOf(e)))).get(k) || []);
  const hidden = everything.length - list.length;
  const r = ranks();
  const summary = r && r.days[k];
  const key = list.filter(isKey).sort(byImportance);
  const now = Date.now();
  const title = keyLabel(k, { weekday: 'long', day: 'numeric', month: 'long' });
  return `
    <aside class="card daypanel" aria-labelledby="day-h" id="daypanel">
      <div class="card-head" style="margin-bottom:0">
        <h2 class="h2" id="day-h">${esc(title)}${k === todayKey() ? ' <span class="pill gold">Today</span>' : ''}</h2>
        <span class="meta">${list.length} event${list.length === 1 ? '' : 's'}</span>
      </div>
      ${summary ? `<div class="aisum"><span class="eyebrow">AI · the day in one line</span>${esc(summary)}</div>` : ''}
      <div class="dsec">
        <span class="eyebrow">Schedule${key.length ? ' · key events marked' : ''}</span>
        ${list.length ? list.map((e) => eventDetail(e, now)).join('') : '<p class="empty">Nothing scheduled that matches the filters.</p>'}
      </div>
      ${hidden > 0 ? `<p class="hidden-note">${hidden} more hidden by the filters. <button type="button" data-cal-cat="all" data-cal-imp="1">Show everything</button></p>` : ''}
    </aside>`;
}

// --------------------------------------------------------------------------
// the agenda on the news pages: the next days' most important events
// --------------------------------------------------------------------------

export function agenda({ title, cats, days = 5, perDay = 3, calLink }) {
  const today = todayKey();
  const now = Date.now();
  const grouped = byDay(calEvents({ cats, minImp: 1 }).filter((e) => Date.parse(e.end) > now - 3600000));
  const rows = [];
  for (let i = 0, found = 0; i < 14 && found < days; i++) {
    const k = addDays(today, i);
    const list = grouped.get(k);
    if (!list || !list.length) continue;
    found++;
    const shown = preview(list, perDay);
    rows.push(`<div class="day">
      <div class="d"><span class="${k === today ? 'today' : ''}">${k === today ? 'Today' : esc(keyLabel(k, { weekday: 'short', day: 'numeric', month: 'short' }))}</span></div>
      ${shown.map((e) => `<div class="ev"><span class="tm">${time(e.start)}</span><span><span class="dot" style="background:${CAT[catOf(e)].color}"></span><span class="nm">${esc(e.title)}</span>${e.result ? `<span class="res"> · ${esc(e.result)}</span>` : isLive(e, now) ? '<span class="res"> · live</span>' : ''}</span></div>`).join('')}
      ${list.length > shown.length ? `<a class="more" href="#calendar" data-cal-open="${k}" data-cal-preset="${esc(calLink || '')}">+${list.length - shown.length} more</a>` : ''}
    </div>`);
  }
  return `<section class="card agenda" aria-labelledby="ag-h">
    <div class="card-head"><h2 class="h2" id="ag-h">${esc(title)}</h2><a class="more-link" href="#calendar" data-cal-open="${today}" data-cal-preset="${esc(calLink || '')}">Open calendar →</a></div>
    ${rows.length ? rows.join('') : '<p class="empty">Nothing scheduled for this region.</p>'}
  </section>`;
}
