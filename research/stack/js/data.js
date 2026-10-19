// Stack — Real bars: loading the snapshot and live quotes, and choosing the source.
// Classic script: shares one global scope with the other files in js/, so the
// load order in index.html matters.
"use strict";

/* ------------------------------------------------------------
   Real bars, when this page is hosted next to a data/ folder
   (built by automation/scripts/fetch_market_data.py via yfinance).
   Missing or unreachable -> the simulated series above is used.
   ------------------------------------------------------------ */
const DATA_BASE = "data/";
let dataset = null;                                  // {updated, files}
/* Live source. The site's own Worker answers /api/quotes/SYMBOL with
   fresh bars (worker/index.ts); every card asks it first and falls back to
   the stored snapshot when it is missing, slow or rate-limited. A live.json
   next to this page holding {"proxy":"https://..."} points it elsewhere. */
let live = null;                                     // {proxy}
let liveSeen = false;                                // has the proxy answered?
const realCache = new Map();
const pendingLoad = new Set();

function fromColumns(col){
  const tu = col.tu || 86400000, n = col.t.length, out = new Array(n);
  for (let i=0;i<n;i++) out[i] = { t: col.t[i]*tu, o: col.o[i], h: col.h[i], l: col.l[i], c: col.c[i] };
  return out;
}
/* Bars for a symbol, or null while the real ones are still in flight.
   Building the simulated fallback costs tens of milliseconds per symbol —
   paid on mount, mid-scroll, for bars that are replaced a moment later and
   that show a made-up price in the meantime. With a dataset present the
   card waits instead; loadReal falls back to the simulation if the fetch
   comes back empty. */
function series(sym){
  const r = realCache.get(sym);
  if (r) return r;
  if (dataset){ loadReal(sym); return null; }
  return simSeries(sym);
}
async function loadReal(sym){
  if (!dataset || realCache.has(sym) || pendingLoad.has(sym)) return;
  const file = dataset.files.get(sym);
  if (!file) return;
  pendingLoad.add(sym);
  try {
    const j = (live && live.proxy ? await fetchLive(file) : null)
           || await fetchSnapshot(file);
    {
      const D = j && j.d ? fromColumns(j.d) : [];
      if (D.length > 40){
        const s = {
          D,
          W: groupBy(D, weekKey),
          M: groupBy(D, monthKey),
          H1: (j.h1 && j.h1.t && j.h1.t.length > 20) ? fromColumns(j.h1) : D.slice(-120)
        };
        if (realCache.size > 80) realCache.delete(realCache.keys().next().value);
        realCache.set(sym, s);
        refreshSymbol(sym);
      }
    }
  } catch(e){ /* handled below */ }
  finally { pendingLoad.delete(sym); }
  if (!realCache.has(sym)){            // nothing usable came back — simulate it
    realCache.set(sym, simSeries(sym));
    refreshSymbol(sym);
  }
}
async function fetchSnapshot(file){
  const res = await fetch(DATA_BASE + encodeURIComponent(file) + ".json");
  return res.ok ? res.json() : null;
}
/* One request to the proxy, with a short deadline: a slow or unreachable
   worker must never hold a card hostage — the snapshot is right there. */
async function fetchLive(file){
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 4000);
  try {
    const res = await fetch(live.proxy.replace(/\/$/, "") + "/" + encodeURIComponent(file),
                            { signal: stop.signal });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || !j.d || !Array.isArray(j.d.t) || j.d.t.length < 40) return null;
    if (!liveSeen){ liveSeen = true; markSource(); }
    return j;
  } catch(e){ return null; }
  finally { clearTimeout(timer); }
}
async function initData(){
  let j;
  try {
    const res = await fetch("live.json", { cache:"no-cache" });
    if (res.ok){
      const cfg = await res.json();
      if (cfg && typeof cfg.proxy === "string" && /^https?:\/\//.test(cfg.proxy)) live = cfg;
    }
  } catch(e){ /* no live.json — try the site's own API below */ }
  if (!live){
    /* Same-origin API, when this page is served by the Worker. A static
       preview (python -m http.server) has none and answers 404 at once. */
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 1500);
    try {
      const res = await fetch("/api/health", { cache:"no-store", signal: stop.signal });
      if (res.ok) live = { proxy: location.origin + "/api/quotes" };
    } catch(e){ /* no API — the snapshot is the source */ }
    finally { clearTimeout(timer); }
  }
  try {
    const res = await fetch(DATA_BASE + "index.json", { cache:"no-cache" });
    if (!res.ok) return;
    j = await res.json();
  } catch(e){ return; }
  if (!j || !Array.isArray(j.tickers) || !j.tickers.length) return;
  UNIVERSE = j.tickers.map(t => ({
    sym: t.s,
    name: t.n || t.s,
    sector: t.sec || "Unlisted",
    file: t.f || t.s.replace(/\./g, "-")
  }));
  dataset = { updated: j.updated || "", files: new Map(UNIVERSE.map(u => [u.sym, u.file])) };
  fillSectors();
  markSource();
  rebuild();
}
function markSource(){
  const el = document.getElementById("src");
  if (!dataset){ el.textContent = "Simulated prices"; el.title = "No data/ folder found next to this page"; return; }
  const d = dataset.updated ? new Date(dataset.updated) : null;
  if (liveSeen){
    el.textContent = "Live · Yahoo";
    el.title = "Fetched from the live proxy on load (Yahoo quotes are delayed ~15 min)";
    el.classList.add("live");
    return;
  }
  el.textContent = d && !isNaN(d)
    ? "Yahoo data · " + d.toLocaleDateString(undefined,{month:"short",day:"numeric"})
    : "Yahoo data";
  el.title = dataset.updated ? "Last refreshed " + dataset.updated : "";
  el.classList.add("live");
}
function refreshSymbol(sym){
  // never re-render under a half-typed theory
  if (savedOpen && !editingNote && isSaved(sym)) renderSaved();
  const card = feed.querySelector('.card[data-sym="'+CSS.escape(sym)+'"]');
  if (card && mounted.has(card)){
    card._views = defaultViews();
    updateQuote(card);
    drawCard(card);
  }
  if (!fsEl.hidden && fsSymCur === sym){
    TF.forEach(t => { views[t.id] = { count: t.bars, offset: 0 }; });
    drawFs();
  }
}
