// The news pages: General, Stocks, Commodities. Each is a pulse row or
// overview, the top stories with a side column, then the headlines.

import { agenda, byImportance, catOf, impOf } from './calendar.js';
import { countdown, esc, hl, impDots, itemSources, keyLabel, safeUrl, time, todayKey, tzLabel, dayKey } from './format.js';
import { briefing, CODE, data, events, items, keep, OVERVIEW_KEY, R_NAME, ranks, regionOf, state } from './state.js';

const GROUP_WORDS = {
  Agriculture: /\b(soy|soybeans?|corn|wheat|coffee|grains?|crop|harvest|usda|wasde)\b/i,
  Energy: /\b(oil|crude|brent|wti|opec|gas|lng|eia|energy)\b/i,
  Metals: /\b(gold|silver|copper|metals?|aluminium|aluminum)\b/i,
};
const EARN = /\b(earnings|results|quarter(ly)?|revenue|profit|guidance|eps|outlook)\b/i;

function stories(page) {
  const b = briefing();
  if (!b) return [];
  return b.pages[page].topStories.map((s) => ({
    title: s.summary, why: s.why, imp: s.importance, isNew: s.status === 'new',
    region: CODE[s.region] || 'global', topic: s.topic, sources: itemSources(s.ids),
  }));
}

// --------------------------------------------------------------------------
// pieces
// --------------------------------------------------------------------------

function overview(page, title) {
  const b = briefing();
  const text = b ? b.pages[page].overview[OVERVIEW_KEY[state.region]] || b.pages[page].overview.all : '';
  const themes = b ? b.pages[page].themes : [];
  return `
    <section class="card overview" aria-labelledby="ov-h">
      <div class="card-head">
        <div><div class="eyebrow">${b ? esc(b.label) : 'Briefing'}</div><h1 class="h1" id="ov-h" style="margin-top:4px">${esc(title)}</h1></div>
        <span class="meta">${b ? `Written ${time(b.generatedAt)} ${tzLabel()}` : ''}</span>
      </div>
      <p>${b ? esc(text) : 'The first briefing is being prepared. It is written with the first headline fetch after a deploy, then at 02:30, 08:00, 12:30 and 16:30 New York time.'}</p>
      ${themes.length ? `<div class="themes">${themes.map((x) => `<span class="pill gold">${esc(x)}</span>`).join('')}</div>` : ''}
    </section>`;
}

function storyList(page) {
  const s = stories(page).filter((x) => keep(x.region)).slice(0, 5);
  const body = s.length ? s.map((x, i) => `
    <article class="story">
      <div class="rank" aria-hidden="true">${i + 1}</div>
      <div>
        <div class="tags">
          ${impDots(x.imp)}
          ${x.isNew ? '<span class="pill new">New</span>' : '<span class="pill">Continuing</span>'}
          <span class="pill">${R_NAME[x.region]}</span>
          <span class="pill">${esc(x.topic)}</span>
        </div>
        <h3>${esc(x.title)}</h3>
        ${x.why ? `<p class="why"><b>Why it matters:</b> ${esc(x.why)}</p>` : ''}
        <div class="src">${x.sources.map((src) => `<a href="${esc(safeUrl(src.url))}" target="_blank" rel="noopener">${esc(src.label)} ↗</a>`).join('')}</div>
      </div>
    </article>`).join('') : `<p class="empty">${briefing() ? 'No top stories for this region.' : 'Top stories appear with the first briefing.'}</p>`;
  return `<section class="card" aria-labelledby="ts-h"><div class="card-head"><h2 class="h2" id="ts-h">Top stories</h2><span class="meta">Ranked by importance</span></div>${body}</section>`;
}

function headlineCats(page) {
  const all = items().slice().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  if (page === 'general') {
    return [
      { name: 'World', items: all.filter((i) => i.category === 'world') },
      { name: 'Economy', items: all.filter((i) => i.category === 'markets') },
      { name: 'Central banks', items: all.filter((i) => i.category === 'policy') },
    ];
  }
  if (page === 'stocks') {
    return [
      { name: 'Markets', items: all.filter((i) => i.category === 'markets' && !EARN.test(i.title)) },
      { name: 'Companies', items: all.filter((i) => i.category === 'company' && !EARN.test(i.title)) },
      { name: 'Earnings', items: all.filter((i) => (i.category === 'company' || i.category === 'markets') && EARN.test(i.title)) },
    ];
  }
  const c = all.filter((i) => i.category === 'commodities');
  return Object.keys(GROUP_WORDS).map((name) => ({ name, items: c.filter((i) => GROUP_WORDS[name].test(i.title)) }))
    .concat([{ name: 'All', items: c }]);
}

function headlines(page) {
  const cats = headlineCats(page).map((c) => ({ ...c, items: c.items.filter((h) => keep(regionOf(h))) }));
  const tab = Math.min(state.hlTab[page] || 0, cats.length - 1);
  const list = cats[tab].items;
  const first = list.slice(0, 16), rest = list.slice(16);
  return `<section class="card" id="headlines" aria-labelledby="hl-h">
    <div class="card-head"><h2 class="h2" id="hl-h">Headlines</h2><span class="meta">Last 24 hours, newest first</span></div>
    <div class="htabs" role="tablist" aria-label="Headline sections">
      ${cats.map((c, i) => `<button type="button" role="tab" data-hl-tab="${i}" aria-selected="${i === tab}">${esc(c.name)}<span>${c.items.length}</span></button>`).join('')}
    </div>
    ${list.length ? `<div class="hlist" role="tabpanel">${first.map(hl).join('')}</div>` +
      (rest.length ? `<details class="more" data-key="hl-more-${page}-${tab}"><summary>Show ${rest.length} more</summary><div class="hlist">${rest.map(hl).join('')}</div></details>` : '')
      : '<p class="empty">Nothing for this region.</p>'}
  </section>`;
}

// --------------------------------------------------------------------------
// the pulse row: on now, next up, today
// --------------------------------------------------------------------------

export function liveCard() {
  const now = Date.now();
  const onNow = events().filter((e) => keep(regionOf(e)) && Date.parse(e.start) <= now && now < Date.parse(e.end))
    .sort(byImportance).slice(0, 2);
  return `<div class="eyebrow">On now</div>
    ${onNow.length ? onNow.map((e) => `
      <div class="title">${esc(e.title)}</div>
      <div class="sub">${R_NAME[regionOf(e)]} · since ${time(e.start)}, until about ${time(e.end)}</div>
      ${e.streamUrl ? `<a class="btn primary" href="${esc(safeUrl(e.streamUrl))}" target="_blank" rel="noopener">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>Watch live</a>` : ''}`).join('')
      : '<div class="none">Nothing live right now for this region.</div>'}`;
}

export function nextCard(filter = () => true) {
  const now = Date.now();
  const next = events().filter((e) => keep(regionOf(e)) && filter(e) && Date.parse(e.start) > now).slice(0, 4);
  return `<div class="card-head"><span class="eyebrow">Next up</span><a class="more-link" href="#calendar" data-cal-open="${todayKey()}">Calendar →</a></div>
    ${next.length ? `<div class="nextlist">${next.map((e) => `
      <div class="row"><span class="tm">${dayKey(Date.parse(e.start)) === todayKey() ? time(e.start) : esc(keyLabel(dayKey(Date.parse(e.start)), { weekday: 'short' }))}</span><span class="t">${esc(e.title)}</span><span class="cd">${countdown(Date.parse(e.start) - now)}</span></div>`).join('')}</div>`
      : '<p class="empty">No more events scheduled for this region.</p>'}`;
}

function todayCard() {
  const k = todayKey();
  const r = ranks();
  const list = events().filter((e) => keep(regionOf(e)) && dayKey(Date.parse(e.start)) === k).sort(byImportance);
  const key = list.slice(0, 3);
  return `<section class="card tight" aria-labelledby="td-h">
    <div class="card-head"><h2 class="eyebrow" id="td-h">Today on the calendar</h2><span class="meta">${list.length} event${list.length === 1 ? '' : 's'}</span></div>
    ${r && r.days[k] ? `<p class="daysum"><span class="spark" aria-hidden="true">✦</span>${esc(r.days[k])}</p>` : ''}
    ${key.length ? `<div class="nextlist">${key.map((e) => `<div class="row"><span class="tm">${time(e.start)}</span><span class="t">${esc(e.title)}</span><span class="cd" style="color:var(--muted)">${impDots(impOf(e))}</span></div>`).join('')}</div>` : '<p class="empty">A quiet day.</p>'}
  </section>`;
}

function pulse() {
  return `<section class="pulse" aria-label="Calendar at a glance">
    <div class="card tight live" id="live-now">${liveCard()}</div>
    <div class="card tight" id="next-up">${nextCard()}</div>
    ${todayCard()}
  </section>`;
}

// --------------------------------------------------------------------------
// pages
// --------------------------------------------------------------------------

export function renderGeneral() {
  const b = briefing();
  const elsewhere = b ? [
    ...b.pages.stocks.topStories.slice(0, 3).map((s) => ({ page: 'stocks', title: s.summary, region: CODE[s.region] || 'global' })),
    ...b.pages.commodities.topStories.slice(0, 3).map((s) => ({ page: 'commodities', title: s.summary, region: CODE[s.region] || 'global' })),
  ].filter((x) => keep(x.region)).slice(0, 4) : [];
  return `
    ${pulse()}
    <div class="grid-main">
      <div class="stack">${overview('general', 'The day so far')}${storyList('general')}</div>
      <aside class="stack">
        <section class="card elsewhere" aria-labelledby="el-h">
          <div class="card-head"><h2 class="h2" id="el-h">Elsewhere today</h2></div>
          ${elsewhere.length ? elsewhere.map((x) => `<div class="item"><span class="eyebrow">${x.page === 'stocks' ? 'Stocks' : 'Commodities'}</span><a href="#${x.page}">${esc(x.title)}</a></div>`).join('') : '<p class="empty">Nothing for this region.</p>'}
        </section>
        ${agenda({ title: 'Coming up', cats: ['cb', 'speech', 'data'], calLink: 'cb,speech,data' })}
      </aside>
    </div>
    ${headlines('general')}`;
}

export function renderStocks() {
  const b = briefing();
  const D = data.D;
  const companies = b ? b.companies : [];
  const regionOfTicker = (t) => CODE[((D.watchlist || []).find((w) => w.symbol === t) || {}).region] || 'us';
  const shown = companies.filter((c) => c.line && keep(regionOfTicker(c.ticker)));
  const hidden = companies.filter((c) => c.line && !keep(regionOfTicker(c.ticker))).map((c) => c.ticker);
  const quiet = companies.filter((c) => !c.line).map((c) => c.ticker);
  const note = !D.yahooOk ? 'Company news from Yahoo is unavailable right now; these lines come from the other feeds.'
    : (hidden.length ? hidden.join(', ') + ' hidden by the region filter. ' : '') + (quiet.length ? quiet.join(', ') + ': nothing notable today.' : '');
  return `
    <div class="grid-main">
      <div class="stack">${overview('stocks', 'Stocks today')}${storyList('stocks')}</div>
      <aside class="stack">
        <section class="card" aria-labelledby="co-h">
          <div class="card-head"><h2 class="h2" id="co-h">My companies</h2></div>
          ${shown.length ? shown.map((c) => `<div class="line-row"><span class="k">${esc(c.ticker)}</span><span>${esc(c.line)}</span></div>`).join('') : `<p class="empty">${b ? 'No watchlist news in this region.' : 'Company lines appear with the first briefing.'}</p>`}
          ${note ? `<div class="note">${esc(note)}</div>` : ''}
        </section>
        ${agenda({ title: 'Earnings ahead', cats: ['earnings'], calLink: 'earnings' })}
      </aside>
    </div>
    ${headlines('stocks')}`;
}

export function renderCommodities() {
  const b = briefing();
  const now = Date.now();
  const groups = b ? b.commodityGroups : ['Agriculture', 'Energy', 'Metals'].map((name) => ({ name, summary: '', ids: [], rows: [], nextEventId: null }));
  const commodityItems = items().filter((i) => i.category === 'commodities');
  return `
    <div class="grid-main">
      ${overview('commodities', 'Commodities today')}
      ${agenda({ title: 'Commodity reports', cats: ['commodities'], days: 4, perDay: 2, calLink: 'commodities' })}
    </div>
    <section class="groups" aria-label="Commodity groups">
      ${groups.map((g) => {
        const own = g.ids.map((id) => data.byId.get(id)).filter(Boolean);
        const more = commodityItems.filter((i) => GROUP_WORDS[g.name].test(i.title) && !g.ids.includes(i.id));
        const list = own.concat(more).filter((h) => keep(regionOf(h))).slice(0, 4);
        const next = events().find((e) => e.id === g.nextEventId && Date.parse(e.start) > now) ||
          events().find((e) => catOf(e) === 'commodities' && Date.parse(e.start) > now && GROUP_WORDS[g.name].test(e.title));
        return `<div class="card group">
          <h2 class="h2" style="font-size:19px">${esc(g.name)}</h2>
          <p class="sum">${esc(g.summary || (b ? 'No notable news today.' : 'The summary appears with the first briefing.'))}</p>
          ${g.rows.length ? `<div>${g.rows.map((r) => `<div class="line-row"><span class="k">${esc(r.name)}</span><span>${esc(r.line || 'No notable news today')}</span></div>`).join('')}</div>` : ''}
          <div>
            <div class="eyebrow" style="padding-bottom:2px">Headlines</div>
            ${list.length ? list.map(hl).join('') : '<p class="empty">Nothing for this region</p>'}
          </div>
          ${next ? `<div class="nextbox"><span class="eyebrow">Next</span> <b>${esc(next.title)}</b> · ${esc(keyLabel(dayKey(Date.parse(next.start)), { weekday: 'short', day: 'numeric' }))} ${time(next.start)}</div>` : ''}
        </div>`;
      }).join('')}
    </section>
    ${headlines('commodities')}`;
}
