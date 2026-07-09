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

// Marker-Größe an Zoomstufe koppeln: weit herausgezoomt = kleine Marker
function updateMarkerScale() {
  const z = map.getZoom();
  const scale = z <= 2 ? 0.5 : z === 3 ? 0.65 : z === 4 ? 0.8 : z === 5 ? 1 : 1.1;
  document.documentElement.style.setProperty('--marker-scale', scale);
}
map.on('zoomend', updateMarkerScale);
updateMarkerScale();

// ===== Hilfsfunktionen =====
function fileForYear(y) {
  return 'data/world_' + (y < 0 ? 'bc' + Math.abs(y) : y) + '.geojson';
}

function formatYear(y) {
  if (LANG === 'en') return y < 0 ? Math.abs(y).toLocaleString('en-US') + ' BC' : 'AD ' + y;
  return y < 0 ? Math.abs(y).toLocaleString('de-DE') + ' v. Chr.' : y + ' n. Chr.';
}

// Anzeigename einer Region: Deutsch übersetzt, Englisch = Originalname der Kartendaten
function displayName(name) {
  return LANG === 'en' ? name : (NAME_DE[name] || name);
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
      `<a href="https://de.wikipedia.org/wiki/${encodeURIComponent(ev.wiki.replace(/ /g, '_'))}" target="_blank" rel="noopener">${T().wikiMore}</a></div>`,
      { maxWidth: 320 }
    );
    eventLayer.addLayer(marker);
  });
}

// ===== Hauptstädte =====
const capitalLayer = L.layerGroup().addTo(map);
let capitalsVisible = true;

function updateCapitals(year) {
  capitalLayer.clearLayers();
  if (!capitalsVisible) return;
  CAPITALS.filter(c => year >= c.show[0] && year <= c.show[1]).forEach(c => {
    const marker = L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div class="capital-marker" title="${escapeHtml(c.name)}">★</div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      })
    });
    const st = stateName(c.state);
    const wikiHref = LANG === 'en'
      ? 'https://en.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(c.name)
      : 'https://de.wikipedia.org/wiki/' + encodeURIComponent(c.wiki.replace(/ /g, '_'));
    marker.bindTooltip(
      `<b>${escapeHtml(c.name)}</b><br><small>${T().capitalTip}: ${escapeHtml(st)}</small>`,
      { className: 'region-tip' }
    );
    marker.bindPopup(
      `<div class="event-popup"><h4>🏛️ ${escapeHtml(c.name)}</h4><p>${T().capitalOf} <b>${escapeHtml(st)}</b></p>` +
      `<a href="${wikiHref}" target="_blank" rel="noopener">${T().wikiMore}</a></div>`,
      { maxWidth: 280 }
    );
    capitalLayer.addLayer(marker);
  });
}

let loadToken = 0;
async function showYear(year) {
  const token = ++loadToken;
  document.getElementById('year-label').textContent = formatYear(year);
  updateEraPanel(year);
  updateEvents(year);
  updateCapitals(year);

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
      let tip = '<b>' + escapeHtml(displayName(name)) + '</b>';
      if (ent !== name) tip += '<br><small>' + T().partOf + ': ' + escapeHtml(displayName(ent)) + '</small>';
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

  // Englische Fassung (falls vorhanden) über die parallele ERAS_EN-Liste
  const idx = ERAS.indexOf(era);
  const c = (LANG === 'en' && typeof ERAS_EN !== 'undefined' && ERAS_EN[idx]) ? ERAS_EN[idx] : era;

  document.getElementById('era-range').textContent =
    formatYear(era.from) + ' – ' + formatYear(Math.min(era.to, 2025));
  document.getElementById('era-title').textContent = c.title;
  document.getElementById('era-hegemon').innerHTML = '🏆 <b>' + T().hegemonLabel + ':</b> ' + linkify(c.hegemon, LANG);
  document.getElementById('era-text').innerHTML = linkify(c.text, LANG);
  document.getElementById('era-denken').innerHTML = linkify(c.denken, LANG);

  document.getElementById('era-kunst').innerHTML = linkify(c.kunst || '', LANG);
  const koepfe = document.getElementById('era-koepfe');
  koepfe.innerHTML = (c.koepfe || []).map(k => '<li>' + linkify(k, LANG) + '</li>').join('');

  const kon = document.getElementById('era-konflikte');
  kon.innerHTML = c.konflikte.map(k => '<li>' + linkify(k, LANG) + '</li>').join('');
  const schlag = document.getElementById('era-schlaglichter');
  schlag.innerHTML = c.schlaglichter.map(s => '<li>' + linkify(s, LANG) + '</li>').join('');

  // Chronik: datierte Ereignisse dieser Epoche (Texte derzeit deutsch)
  const entries = CHRONICLE
    .filter(e => e.y >= era.from && e.y < era.to)
    .sort((a, b) => a.y - b.y);
  const bc = LANG === 'en' ? ' BC' : ' v. Chr.';
  document.getElementById('era-chronik').innerHTML = entries.map(e => {
    const yr = e.y < 0 ? Math.abs(e.y) + bc : e.y;
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

  document.getElementById('sb-title').textContent = displayName(name);
  let sub = formatYear(year);
  if (ent !== name) sub += ' · ' + T().partOf + ': ' + displayName(ent);
  if (props.PARTOF && props.PARTOF !== name && props.PARTOF !== ent)
    sub += ' · ' + T().belongsTo + ': ' + displayName(props.PARTOF);
  document.getElementById('sb-subtitle').textContent = sub;

  // Kuratierter Bericht (Texte derzeit deutsch – im EN-Modus mit Hinweis)
  const report = findReport(name, ent, year);
  const repEl = document.getElementById('sb-report');
  if (report) {
    repEl.innerHTML = T().langNote
      + '<h3 style="margin-top:0">📜 ' + escapeHtml(report.title) + '</h3>'
      + linkify(report.html, 'de')
      + '<div class="wiki-links"><b style="font-size:.8rem;color:var(--text-dim)">' + T().deepen + '</b><br>' + wikiChips(report.wiki) + '</div>';
  } else {
    repEl.innerHTML = '<p style="color:var(--text-dim);font-size:.9rem">' + T().noReport(formatYear(year)) + '</p>';
  }

  // Wikipedia-Zusammenfassung: bevorzugte Sprache zuerst
  const loading = document.getElementById('sb-wiki-loading');
  loading.textContent = T().loading;
  const content = document.getElementById('sb-wiki-content');
  loading.classList.remove('hidden');
  content.innerHTML = '';

  let summary;
  if (LANG === 'en') {
    // Kartennamen sind nativ englisch – direkt auf en.wikipedia nachschlagen
    summary = await fetchWiki(name, 'en') || (ent !== name && await fetchWiki(ent, 'en')) ||
      await fetchWiki(WIKI_DE[name] || NAME_DE[name] || name, 'de');
  } else {
    const wikiTitle = WIKI_DE[name] || NAME_DE[name] || WIKI_DE[ent] || NAME_DE[ent] || name;
    summary = await fetchWiki(wikiTitle) || await fetchWiki(name) || await fetchWiki(name, 'en');
  }
  loading.classList.add('hidden');

  if (summary) {
    const img = summary.thumbnail ? `<img src="${summary.thumbnail.source}" alt="">` : '';
    const url = summary.content_urls.desktop.page;
    content.innerHTML = img + '<p>' + escapeHtml(summary.extract) + '</p>' +
      `<a href="${url}" target="_blank" rel="noopener">${T().readFull}</a>` +
      '<p class="wiki-src" style="clear:both">' + T().source + ': Wikipedia (' + (summary.lang || 'de') + ')</p>';
  } else {
    content.innerHTML = '<p class="wiki-src">' + T().noWiki + '</p>';
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

// Hauptstädte ein-/ausblenden
const capitalsBtn = document.getElementById('btn-capitals');
capitalsBtn.addEventListener('click', () => {
  capitalsVisible = !capitalsVisible;
  capitalsBtn.classList.toggle('off', !capitalsVisible);
  updateCapitals(YEARS[+slider.value]);
});

// ===== Sprache =====
function applyUILang() {
  const t = T();
  document.documentElement.lang = LANG;
  document.getElementById('h-denken').textContent = t.hDenken;
  document.getElementById('h-kunst').textContent = t.hKunst;
  document.getElementById('h-konflikte').textContent = t.hKonflikte;
  document.getElementById('h-chronik').textContent = t.hChronik;
  document.getElementById('h-schlag').textContent = t.hSchlag;
  document.getElementById('btn-prev').title = t.tPrev;
  document.getElementById('btn-next').title = t.tNext;
  document.getElementById('btn-events').title = t.tEvents;
  document.getElementById('btn-capitals').title = t.tCapitals;
  document.getElementById('btn-lang').title = t.tLang;
  document.getElementById('btn-lang').textContent = LANG.toUpperCase();
  document.getElementById('era-toggle').title = t.tCollapse;
  document.getElementById('attribution').innerHTML = t.attribution;
  buildTicks();
}

document.getElementById('btn-lang').addEventListener('click', () => {
  LANG = LANG === 'de' ? 'en' : 'de';
  localStorage.setItem('hm-lang', LANG);
  applyUILang();
  lastEra = null;                       // Epochen-Panel neu rendern erzwingen
  document.getElementById('sidebar-close').click(); // Sidebar schließen (Inhalt wäre gemischt)
  showYear(YEARS[+slider.value]);
});

// Tick-Beschriftungen unter dem Regler
const TICKS = [-3000, -1, 500, 1000, 1500, 1715, 1914, 2010];
function buildTicks() {
  const ticksEl = document.getElementById('slider-ticks');
  ticksEl.innerHTML = '';
  TICKS.forEach(y => {
    const idx = YEARS.indexOf(y);
    if (idx < 0) return;
    const el = document.createElement('div');
    el.className = 'tick';
    el.style.left = (idx / (YEARS.length - 1) * 100) + '%';
    el.textContent = y < 0 ? Math.abs(y) + ' ' + T().bc : y;
    ticksEl.appendChild(el);
  });
}

// Auf schmalen Bildschirmen startet das Epochen-Panel eingeklappt, damit die Karte sichtbar bleibt
if (window.innerWidth <= 800) {
  document.getElementById('era-panel').classList.add('collapsed');
}

// ===== Start =====
applyUILang();
showYear(START_YEAR);
