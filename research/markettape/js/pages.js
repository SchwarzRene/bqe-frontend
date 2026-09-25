// The news pages: General, Stocks, Commodities. Each is a pulse row or
// overview, the top stories with a side column, then the headlines.

import { agenda, byImportance, catOf, impOf } from './calendar.js';
import { companiesCard } from './companies.js';
import { countdown, esc, hl, IMG, impDots, itemSources, keyLabel, safeUrl, time, todayKey, topicImage, tzLabel, dayKey } from './format.js';
import { allRegions, briefing, byHeadlineImportance, CODE, data, events, items, keep, OVERVIEW_KEY, R_NAME, ranks, regionOf, state } from './state.js';

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
  // One region: its own overview. Several: each one's, labelled. None picked: the overall one.
  const ov = b ? b.pages[page].overview : null;
  const parts = !ov ? [] : allRegions() ? [['', ov.all]]
    : state.regions.map((c) => [state.regions.length > 1 ? R_NAME[c] : '', ov[OVERVIEW_KEY[c]]]).filter((x) => x[1]);
  const text = parts.length ? parts.map(([label, t]) => (label ? `<strong>${esc(label)}:</strong> ` : '') + esc(t)).join('<br>') : (ov ? esc(ov.all) : '');
  const themes = b ? b.pages[page].themes : [];
  return `
    <section class="card overview has-art" aria-labelledby="ov-h">
      <img class="ov-art" src="${IMG}banner-${page}.webp" alt="" aria-hidden="true" decoding="async">
      <div class="card-head">
        <div><div class="eyebrow">${b ? esc(b.label) : 'Briefing'}</div><h1 class="h1" id="ov-h" style="margin-top:4px">${esc(title)}</h1></div>
        <span class="meta">${b ? `Written ${time(b.generatedAt)} ${tzLabel()}` : ''}</span>
      </div>
      <p>${b ? text : 'The first briefing is being prepared. It is written with the first headline fetch after a deploy, then at 02:30, 08:00, 12:30 and 16:30 New York time.'}</p>
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
      <img class="story-art" src="${topicImage(x.topic, x.title)}" alt="" aria-hidden="true" loading="lazy" decoding="async">
    </article>`).join('') : `<p class="empty">${briefing() ? 'No top stories for the selected regions.' : 'Top stories appear with the first briefing.'}</p>`;
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
  const sort = state.hlSort === 'top' ? byHeadlineImportance : (a, b) => b.publishedAt.localeCompare(a.publishedAt);
  const cats = headlineCats(page).map((c) => ({ ...c, items: c.items.filter((h) => keep(regionOf(h))).sort(sort) }));
  const tab = Math.min(state.hlTab[page] || 0, cats.length - 1);
  const list = cats[tab].items;
  const first = list.slice(0, 16), rest = list.slice(16);
  return `<section class="card" id="headlines" aria-labelledby="hl-h">
    <div class="card-head"><h2 class="h2" id="hl-h">Headlines</h2>
      <div class="seg small" role="group" aria-label="Order">${[['top', 'Most important'], ['new', 'Newest']].map(([v, l]) => `<button type="button" data-hl-sort="${v}" aria-pressed="${state.hlSort === v}">${l}</button>`).join('')}</div>
    </div>
    <div class="htabs" role="tablist" aria-label="Headline sections">
      ${cats.map((c, i) => `<button type="button" role="tab" data-hl-tab="${i}" aria-selected="${i === tab}">${esc(c.name)}<span>${c.items.length}</span></button>`).join('')}
    </div>
    ${list.length ? `<div class="hlist" role="tabpanel">${first.map(hl).join('')}</div>` +
      (rest.length ? `<details class="more" data-key="hl-more-${page}-${tab}"><summary>Show ${rest.length} more</summary><div class="hlist">${rest.map(hl).join('')}</div></details>` : '')
      : '<p class="empty">Nothing for the selected regions.</p>'}
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
      : `<div class="none">Nothing live right now for the selected regions.</div><img class="quiet-art" src="${IMG}empty-quiet.webp" alt="" aria-hidden="true" decoding="async">`}`;
}

export function nextCard(filter = () => true) {
  const now = Date.now();
  const next = events().filter((e) => keep(regionOf(e)) && filter(e) && Date.parse(e.start) > now).slice(0, 5);
  const r = ranks();
  const day = r && r.days[todayKey()];
  return `<div class="card-head"><span class="eyebrow">Next up</span><a class="more-link" href="#calendar" data-cal-open="${todayKey()}">Calendar →</a></div>
    ${day ? `<p class="daysum"><span class="spark" aria-hidden="true">✦</span><span><b>Today:</b> ${esc(day)}</span></p>` : ''}
    ${next.length ? `<div class="nextlist">${next.map((e) => `
      <div class="row"><span class="tm">${dayKey(Date.parse(e.start)) === todayKey() ? time(e.start) : esc(keyLabel(dayKey(Date.parse(e.start)), { weekday: 'short' }))}</span><span class="t">${esc(e.title)} ${impDots(impOf(e))}</span><span class="cd">${countdown(Date.parse(e.start) - now)}</span></div>`).join('')}</div>`
      : '<p class="empty">No more events scheduled for the selected regions.</p>'}`;
}

function pulse() {
  return `<section class="pulse" aria-label="Calendar at a glance">
    <div class="card tight live" id="live-now">${liveCard()}</div>
    <div class="card tight" id="next-up">${nextCard()}</div>
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
          ${elsewhere.length ? elsewhere.map((x) => `<div class="item"><span class="eyebrow">${x.page === 'stocks' ? 'Stocks' : 'Commodities'}</span><a href="#${x.page}">${esc(x.title)}</a></div>`).join('') : '<p class="empty">Nothing for the selected regions.</p>'}
        </section>
        ${agenda({ title: 'Coming up', cats: ['cb', 'speech', 'data'], calLink: 'cb,speech,data' })}
      </aside>
    </div>
    ${headlines('general')}`;
}

export function renderStocks() {
  return `
    <div class="grid-main">
      <div class="stack">${overview('stocks', 'Stocks today')}${storyList('stocks')}</div>
      <aside class="stack">
        <section class="card companies" id="companies" aria-labelledby="co-h">${companiesCard()}</section>
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
        const list = own.concat(more).filter((h) => keep(regionOf(h))).sort(byHeadlineImportance).slice(0, 4);
        const next = events().find((e) => e.id === g.nextEventId && Date.parse(e.start) > now) ||
          events().find((e) => catOf(e) === 'commodities' && Date.parse(e.start) > now && GROUP_WORDS[g.name].test(e.title));
        return `<div class="card group">
          <div class="group-art"><img src="${IMG}group-${g.name.toLowerCase()}.webp" alt="" aria-hidden="true" loading="lazy" decoding="async"><h2 class="h2">${esc(g.name)}</h2></div>
          <p class="sum">${esc(g.summary || (b ? 'No notable news today.' : 'The summary appears with the first briefing.'))}</p>
          ${g.rows.length ? `<div>${g.rows.map((r) => `<div class="line-row"><span class="k">${esc(r.name)}</span><span>${esc(r.line || 'No notable news today')}</span></div>`).join('')}</div>` : ''}
          <div>
            <div class="eyebrow" style="padding-bottom:2px">Top headlines</div>
            ${list.length ? list.map(hl).join('') : '<p class="empty">Nothing for the selected regions.</p>'}
          </div>
          ${next ? `<div class="nextbox"><span class="eyebrow">Next</span> <b>${esc(next.title)}</b> · ${esc(keyLabel(dayKey(Date.parse(next.start)), { weekday: 'short', day: 'numeric' }))} ${time(next.start)}</div>` : ''}
        </div>`;
      }).join('')}
    </section>
    ${headlines('commodities')}`;
}
