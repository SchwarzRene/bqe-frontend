// ===== Verfügbare Jahres-Snapshots (müssen zu data/world_*.geojson passen) =====
const YEARS = [
  -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300, -200, -100, -1,
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300,
  1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1880,
  1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010
];

const START_YEAR = 1715; // Einstieg im Zeitalter des Absolutismus

// ===== Karte =====
const map = L.map('map', {
  center: [35, 15],
  zoom: 3,
  minZoom: 2,
  maxZoom: 8,
  zoomControl: false,
  worldCopyJump: true,
  preferCanvas: true
});
L.control.zoom({ position: 'bottomright' }).addTo(map);

let currentLayer = null;
let selectedLayer = null;
const geoCache = new Map();

// ===== Hilfsfunktionen =====
function fileForYear(y) {
  return 'data/world_' + (y < 0 ? 'bc' + Math.abs(y) : y) + '.geojson';
}

function formatYear(y) {
  return y < 0 ? Math.abs(y).toLocaleString('de-DE') + ' v. Chr.' : y + ' n. Chr.';
}

function germanName(name) {
  return NAME_DE[name] || name;
}

// Stabile Farbe pro Reichsname
function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const sat = 45 + (h >> 8) % 25;   // 45–70 %
  const light = 42 + (h >> 16) % 18; // 42–60 %
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== GeoJSON laden & rendern =====
async function loadYear(year) {
  const url = fileForYear(year);
  if (!geoCache.has(url)) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Kartendaten fehlen: ' + url);
    geoCache.set(url, await resp.json());
  }
  return geoCache.get(url);
}

function entityName(props) {
  return props.SUBJECTO || props.NAME || 'Unbekannt';
}

// ===== Ereignis-Marker =====
const eventLayer = L.layerGroup().addTo(map);
let eventsVisible = true;

function updateEvents(year) {
  eventLayer.clearLayers();
  if (!eventsVisible) return;
  EVENTS.filter(ev => year >= ev.show[0] && year <= ev.show[1]).forEach(ev => {
    const marker = L.marker([ev.lat, ev.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div class="event-marker" title="${escapeHtml(ev.title)}">${ev.icon}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    });
    marker.bindPopup(
      `<div class="event-popup"><h4>${ev.icon} ${escapeHtml(ev.title)}</h4><p>${ev.text}</p>` +
      `<a href="https://de.wikipedia.org/wiki/${encodeURIComponent(ev.wiki.replace(/ /g, '_'))}" target="_blank" rel="noopener">Mehr auf Wikipedia ↗</a></div>`,
      { maxWidth: 320 }
    );
    eventLayer.addLayer(marker);
  });
}

let loadToken = 0;
async function showYear(year) {
  const token = ++loadToken;
  document.getElementById('year-label').textContent = formatYear(year);
  updateEraPanel(year);
  updateEvents(year);

  let geo;
  try { geo = await loadYear(year); }
  catch (e) { console.error(e); return; }
  if (token !== loadToken) return; // Nutzer hat weitergeschoben

  if (currentLayer) map.removeLayer(currentLayer);
  selectedLayer = null;

  currentLayer = L.geoJSON(geo, {
    style: f => ({
      fillColor: colorFor(entityName(f.properties)),
      fillOpacity: 0.72,
      color: '#0e1621',
      weight: 0.8
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      const name = p.NAME || '?';
      const ent = entityName(p);
      let tip = '<b>' + escapeHtml(germanName(name)) + '</b>';
      if (ent !== name) tip += '<br><small>Teil von: ' + escapeHtml(germanName(ent)) + '</small>';
      layer.bindTooltip(tip, { sticky: true, className: 'region-tip' });

      layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.92, weight: 1.6, color: '#e8b04b' }));
      layer.on('mouseout', () => {
        if (layer !== selectedLayer) currentLayer.resetStyle(layer);
      });
      layer.on('click', () => {
        if (selectedLayer && selectedLayer !== layer) currentLayer.resetStyle(selectedLayer);
        selectedLayer = layer;
        layer.setStyle({ fillOpacity: 0.95, weight: 2.2, color: '#ffffff' });
        openSidebar(p, year);
      });
    }
  }).addTo(map);
}

// ===== Epochen-Panel =====
function currentEra(year) {
  return ERAS.find(e => year >= e.from && year < e.to) || ERAS[ERAS.length - 1];
}

let lastEra = null;
function updateEraPanel(year) {
  const era = currentEra(year);
  if (era === lastEra) return;
  lastEra = era;

  document.getElementById('era-range').textContent =
    formatYear(era.from) + ' – ' + formatYear(Math.min(era.to, 2025));
  document.getElementById('era-title').textContent = era.title;
  document.getElementById('era-hegemon').innerHTML = '🏆 <b>Vorherrschaft:</b> ' + era.hegemon;
  document.getElementById('era-text').innerHTML = era.text;
  document.getElementById('era-denken').innerHTML = era.denken;

  const kon = document.getElementById('era-konflikte');
  kon.innerHTML = era.konflikte.map(k => '<li>' + k + '</li>').join('');
  const schlag = document.getElementById('era-schlaglichter');
  schlag.innerHTML = era.schlaglichter.map(s => '<li>' + s + '</li>').join('');

  // Chronik: datierte Ereignisse dieser Epoche
  const entries = CHRONICLE
    .filter(e => e.y >= era.from && e.y < era.to)
    .sort((a, b) => a.y - b.y);
  document.getElementById('era-chronik').innerHTML = entries.map(e => {
    const yr = e.y < 0 ? Math.abs(e.y) + ' v. Chr.' : e.y;
    const link = e.w
      ? ` <a class="chron-link" href="https://de.wikipedia.org/wiki/${encodeURIComponent(e.w.replace(/ /g, '_'))}" target="_blank" rel="noopener" title="Wikipedia: ${escapeHtml(e.w)}">↗</a>`
      : '';
    return `<div class="chron-row"><span class="chron-year">${yr}</span><span class="chron-text">${escapeHtml(e.t)}${link}</span></div>`;
  }).join('');
  document.getElementById('era-chronik-wrap').style.display = entries.length ? '' : 'none';

  document.getElementById('era-body').scrollTop = 0;
}

document.getElementById('era-header').addEventListener('click', () => {
  document.getElementById('era-panel').classList.toggle('collapsed');
});

// ===== Sidebar (Länder-Bericht) =====
function findReport(name, subject, year) {
  // Erst auf den Regionsnamen matchen (spezifischer), dann auf die Oberherrschaft
  for (const r of REPORTS)
    if (year >= r.from && year <= r.to && r.match.test(name)) return r;
  if (subject && subject !== name)
    for (const r of REPORTS)
      if (year >= r.from && year <= r.to && r.match.test(subject)) return r;
  return null;
}

function wikiChips(titles) {
  return titles.map(t =>
    `<a href="https://de.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}" target="_blank" rel="noopener">${escapeHtml(t)} ↗</a>`
  ).join('');
}

async function openSidebar(props, year) {
  const name = props.NAME || 'Unbekannt';
  const ent = entityName(props);
  const sb = document.getElementById('sidebar');
  sb.classList.remove('hidden');
  sb.scrollTop = 0;

  document.getElementById('sb-title').textContent = germanName(name);
  let sub = formatYear(year);
  if (ent !== name) sub += ' · Teil von: ' + germanName(ent);
  if (props.PARTOF && props.PARTOF !== name && props.PARTOF !== ent)
    sub += ' · Zugehörig zu: ' + germanName(props.PARTOF);
  document.getElementById('sb-subtitle').textContent = sub;

  // Kuratierter Bericht
  const report = findReport(name, ent, year);
  const repEl = document.getElementById('sb-report');
  if (report) {
    repEl.innerHTML = '<h3 style="margin-top:0">📜 ' + escapeHtml(report.title) + '</h3>'
      + report.html
      + '<div class="wiki-links"><b style="font-size:.8rem;color:var(--text-dim)">Vertiefen:</b><br>' + wikiChips(report.wiki) + '</div>';
  } else {
    repEl.innerHTML = '<p style="color:var(--text-dim);font-size:.9rem">Zu dieser Region liegt für ' + formatYear(year) +
      ' kein kuratierter Bericht vor – die Wikipedia-Zusammenfassung unten liefert den Einstieg. Beachte auch das Epochen-Panel links!</p>';
  }

  // Wikipedia-Zusammenfassung
  const loading = document.getElementById('sb-wiki-loading');
  const content = document.getElementById('sb-wiki-content');
  loading.classList.remove('hidden');
  content.innerHTML = '';

  const wikiTitle = WIKI_DE[name] || NAME_DE[name] || WIKI_DE[ent] || NAME_DE[ent] || name;
  const summary = await fetchWiki(wikiTitle) || await fetchWiki(name) || await fetchWiki(name, 'en');
  loading.classList.add('hidden');

  if (summary) {
    const img = summary.thumbnail ? `<img src="${summary.thumbnail.source}" alt="">` : '';
    const url = summary.content_urls.desktop.page;
    content.innerHTML = img + '<p>' + escapeHtml(summary.extract) + '</p>' +
      `<a href="${url}" target="_blank" rel="noopener">Ganzen Wikipedia-Artikel lesen ↗</a>` +
      '<p class="wiki-src" style="clear:both">Quelle: Wikipedia (' + (summary.lang || 'de') + ')</p>';
  } else {
    content.innerHTML = '<p class="wiki-src">Keine Wikipedia-Zusammenfassung gefunden.</p>';
  }
}

async function fetchWiki(title, lang = 'de') {
  try {
    const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j.type && j.type.includes('not_found')) return null;
    j.lang = lang;
    return j;
  } catch { return null; }
}

document.getElementById('sidebar-close').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('hidden');
  if (selectedLayer && currentLayer) { currentLayer.resetStyle(selectedLayer); selectedLayer = null; }
});

// ===== Zeitregler =====
const slider = document.getElementById('time-slider');
slider.max = YEARS.length - 1;
slider.value = YEARS.indexOf(START_YEAR);

slider.addEventListener('input', () => showYear(YEARS[+slider.value]));

function step(delta) {
  const idx = Math.min(YEARS.length - 1, Math.max(0, +slider.value + delta));
  if (idx === +slider.value) return false;
  slider.value = idx;
  showYear(YEARS[idx]);
  return true;
}

document.getElementById('btn-prev').addEventListener('click', () => step(-1));
document.getElementById('btn-next').addEventListener('click', () => step(1));

// Abspielen
let playTimer = null;
const playBtn = document.getElementById('btn-play');
playBtn.addEventListener('click', () => {
  if (playTimer) { stopPlay(); return; }
  playBtn.classList.add('playing');
  playBtn.textContent = '⏸';
  playTimer = setInterval(() => { if (!step(1)) stopPlay(); }, 2200);
});
function stopPlay() {
  clearInterval(playTimer);
  playTimer = null;
  playBtn.classList.remove('playing');
  playBtn.textContent = '▶︎▶︎';
}

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
  if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
});

// Ereignis-Marker ein-/ausblenden
const eventsBtn = document.getElementById('btn-events');
eventsBtn.addEventListener('click', () => {
  eventsVisible = !eventsVisible;
  eventsBtn.classList.toggle('off', !eventsVisible);
  updateEvents(YEARS[+slider.value]);
});

// Tick-Beschriftungen unter dem Regler
const TICKS = [-3000, -1, 500, 1000, 1500, 1715, 1914, 2010];
const ticksEl = document.getElementById('slider-ticks');
TICKS.forEach(y => {
  const idx = YEARS.indexOf(y);
  if (idx < 0) return;
  const el = document.createElement('div');
  el.className = 'tick';
  el.style.left = (idx / (YEARS.length - 1) * 100) + '%';
  el.textContent = y < 0 ? Math.abs(y) + ' v.Chr.' : y;
  ticksEl.appendChild(el);
});

// ===== Start =====
showYear(START_YEAR);
