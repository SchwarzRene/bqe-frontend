// Escaping and time formatting. Times are shown in the viewer's chosen zone
// (Vienna or New York); days are YYYY-MM-DD strings in that zone.

import { data, R_NAME, regionOf, state, TZ_ID } from './state.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeUrl = (u) => (/^https?:\/\//.test(u || '') ? u : '#');
export const tzLabel = () => (state.tz === 'vie' ? 'Vienna' : 'New York');

// Building an Intl.DateTimeFormat is far dearer than using one.
const formats = new Map();
function fmt(opts) {
  const key = state.tz + JSON.stringify(opts);
  if (!formats.has(key)) formats.set(key, new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: TZ_ID[state.tz] }, opts)));
  return formats.get(key);
}
const keyFormats = new Map();

export const time = (iso) => fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
/** YYYY-MM-DD of `ms` in the viewer's zone. */
export function dayKey(ms) {
  if (!keyFormats.has(state.tz)) keyFormats.set(state.tz, new Intl.DateTimeFormat('en-CA', { timeZone: TZ_ID[state.tz] }));
  return keyFormats.get(state.tz).format(new Date(ms));
}
export const todayKey = () => dayKey(Date.now());

// Calendar arithmetic on YYYY-MM-DD, at noon UTC so no zone can shift the day.
const noon = (key) => Date.parse(key + 'T12:00:00Z');
export const addDays = (key, n) => new Date(noon(key) + n * 86400000).toISOString().slice(0, 10);
export const weekday = (key) => (new Date(noon(key)).getUTCDay() + 6) % 7; // 0 = Monday
export const mondayOf = (key) => addDays(key, -weekday(key));
const utc = (opts) => new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'UTC' }, opts));
export const keyLabel = (key, opts) => utc(opts).format(new Date(noon(key))).replace(',', '');
export const longDate = (ms) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms)).replace(',', '');

export function ago(iso) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 60) return min + ' min ago';
  if (min < 48 * 60) return Math.round(min / 60) + ' h ago';
  return Math.round(min / 1440) + ' d ago';
}

export function countdown(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return 'in ' + min + ' min';
  if (min < 24 * 60) return 'in ' + Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0') + ' min';
  return 'in ' + Math.round(min / 1440) + ' d';
}

/** The publishers behind a list of headline ids, each once. */
export function itemSources(ids) {
  const out = [];
  ids.forEach((id) => {
    const i = data.byId.get(id);
    if (!i) return;
    [{ source: i.source, url: i.url }].concat(i.alsoIn || []).forEach((s) => {
      if (!out.some((o) => o.label === s.source)) out.push({ label: s.source, url: s.url });
    });
  });
  return out.slice(0, 5);
}

/** One headline row. */
export const hl = (i) => `<div class="hl"><a href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener">${esc(i.title)}</a><span>${esc(i.source)}${(i.alsoIn || []).length ? ' +' + i.alsoIn.length : ''} · ${esc(ago(i.publishedAt))} · ${R_NAME[regionOf(i)]}</span></div>`;

/** Importance as three dots. */
export const impDots = (n) => `<span class="imp" aria-label="Importance ${n} of 3">${[1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
