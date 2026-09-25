// The region picker: a world map that folds open under the globe button.
// The map (worldmap.svg, built by docs/tools/market-news-map.py) is loaded
// the first time it is opened, so a page that never opens it never pays for it.

import { esc } from './format.js';
import { events, items, REGIONS, regionOf, state } from './state.js';

let svg = null;
let loading = null;

function loadMap() {
  if (!loading) {
    loading = fetch('/research/markettape/worldmap.svg')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('status ' + r.status))))
      .then((text) => { svg = text; })
      .catch(() => { svg = ''; });
  }
  return loading;
}

const flag = { all: '🌍', us: '🇺🇸', eu: '🇪🇺', asia: '🌏', ru: '🇷🇺' };

/** The globe button's label. */
export function globeLabel() {
  const name = REGIONS.find((r) => r[0] === state.region)[1];
  return `<span class="emoji" aria-hidden="true">${flag[state.region]}</span><span class="lbl">Region</span>${esc(name)}
    <svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
}

/** Render the map panel into `el`; `onReady` is called once the map has loaded. */
export function renderMap(el, onReady) {
  if (!state.mapOpen) { el.hidden = true; return; }
  el.hidden = false;
  if (svg === null) {
    el.innerHTML = '<div class="mapwrap"><p class="meta">Loading the map…</p></div>';
    loadMap().then(onReady);
    return;
  }
  const now = Date.now();
  const count = (code) => {
    const inRegion = (x) => code === 'all' || regionOf(x) === code;
    return {
      heads: items().filter(inRegion).length,
      evs: events().filter((e) => inRegion(e) && Date.parse(e.start) > now && Date.parse(e.start) < now + 7 * 86400000).length,
    };
  };
  el.innerHTML = `
    <div class="mapwrap">${svg || '<p class="meta">The map could not be loaded; use the list.</p>'}</div>
    <div class="maplist" role="group" aria-label="Region">
      <p class="hint">Click a region on the map, or pick one here. Global news is always shown.</p>
      ${REGIONS.map(([id, label]) => {
        const c = count(id);
        return `<button type="button" data-region="${id}" aria-pressed="${state.region === id}"><span>${flag[id]} ${esc(label)}</span><small>${c.heads} news · ${c.evs} events</small></button>`;
      }).join('')}
    </div>`;
  const map = el.querySelector('svg');
  if (map) {
    map.classList.toggle('all', state.region === 'all');
    map.querySelectorAll('.region').forEach((p) => {
      const on = p.dataset.region === state.region;
      p.classList.toggle('on', on);
      p.setAttribute('aria-pressed', String(on));
    });
  }
}

/** Space and Enter on a focused map region act like a click. */
export function mapKeys(e) {
  const p = e.target.closest && e.target.closest('.worldmap .region');
  if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); p.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
}
