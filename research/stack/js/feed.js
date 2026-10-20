// Stack — The feed: cards, mounting, gestures.
// Classic script: shares one global scope with the other files in js/, so the
// load order in index.html matters.
"use strict";

/* ============================================================
   5. The feed
   ============================================================ */
const feed = document.getElementById("feed");
const countEl = document.getElementById("count");
let list = UNIVERSE.slice();
let onlySaved = false;
const mounted = new Set();

const io = new IntersectionObserver(entries => {
  for (const e of entries){
    if (e.isIntersecting) mount(e.target); else unmount(e.target);
  }
}, { root: feed, rootMargin: "120% 0px" });

function cardHTML(it){
  const panes = TF.map(t =>
    `<div class="pane" data-tf="${t.id}"><span class="tfl">${t.label}</span><span class="paxis" aria-hidden="true"></span></div>`
  ).join("");
  return `<section class="card" data-sym="${it.sym}">
    <div class="slide">
    <div class="chd">
      <div class="sym">${it.sym}</div>
      <div class="meta"><span class="nm">${it.name}</span><span class="sec">${it.sector}</span></div>
      <div class="quote"><span class="px">—</span><span class="chg">—</span></div>
      <button class="star" data-sym="${it.sym}" aria-pressed="${isSaved(it.sym)}" aria-label="Save ${it.sym}">
        <svg viewBox="0 0 24 24"><path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z"/></svg>
      </button>
    </div>
    <div class="panes">${panes}</div>
    </div>
  </section>`;
}

function rebuild(){
  const q = document.getElementById("q").value.trim().toLowerCase();
  const sec = document.getElementById("sector").value;
  list = UNIVERSE.filter(it =>
    (!sec || it.sector === sec) &&
    (!onlySaved || isSaved(it.sym)) &&
    (!q || it.sym.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
  );
  mounted.forEach(c => io.unobserve(c)); mounted.clear();
  feed.innerHTML = list.length
    ? list.map(cardHTML).join("")
    : `<p class="empty">Nothing here yet.<br>${onlySaved ? "Tap the bookmark on a chart to save it." : "Try a different search or sector."}</p>`;
  feed.querySelectorAll(".card").forEach(c => io.observe(c));
  feed.scrollTop = 0;
  updateCount();
}
function updateCount(){
  const n = list.length;
  const i = n ? Math.round(feed.scrollTop / Math.max(1, feed.clientHeight)) + 1 : 0;
  countEl.textContent = n ? `${Math.min(i,n)} / ${n}` : "";
}

function mount(card){
  if (mounted.has(card)) return;
  mounted.add(card);
  const sym = card.dataset.sym;
  series(sym);
  card.querySelectorAll(".pane").forEach(p => {
    if (!p.querySelector("canvas")){
      const cv = document.createElement("canvas");
      p.appendChild(cv);
    }
  });
  updateQuote(card);
  /* Scrolling mounts a card mid-flick, inside the observer callback. Sizing a
     canvas there reads clientWidth, which forces a synchronous layout of the
     whole feed — ~40ms, a dropped frame, before a single bar is drawn. Paint
     on the following frames instead, daily first because that is where the
     eye lands, then the other three one frame at a time. */
  const order = ["D", ...TF.map(t => t.id).filter(id => id !== "D")];
  const step = () => {
    if (!mounted.has(card)) return;
    const id = order.shift();
    if (!id) return;
    drawPane(card, id);
    if (order.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function updateQuote(card){
  const s = series(card.dataset.sym);
  if (!s){
    card.querySelector(".px").textContent = "—";
    const q = card.querySelector(".chg");
    q.textContent = ""; q.className = "chg";
    return;
  }
  const d = s.D[s.D.length-1], c = chg(s.D);
  card.querySelector(".px").textContent = fmt(d.c);
  const ce = card.querySelector(".chg");
  ce.textContent = (c>=0?"+":"") + c.toFixed(2) + "%";
  ce.className = "chg " + (c>=0?"pos":"neg");
}
function unmount(card){
  if (!mounted.has(card)) return;
  mounted.delete(card);
  card.querySelectorAll("canvas").forEach(c => c.remove());
}
function drawPane(card, tfId){
  const p = card.querySelector('.pane[data-tf="'+tfId+'"]');
  const cv = p && p.querySelector("canvas");
  if (!cv) return;
  const sym = card.dataset.sym;
  const s = series(sym);
  if (!s){ clearPane(cv); return; }                 // bars still loading
  const dl = state.draw[sym] || [];
  if (!card._views) card._views = defaultViews();
  paint(cv, s[tfId], card._views[tfId], dl,
        { tf: tfId, ranges: rangesFor(sym, tfId, card._views) });
  let m = p.querySelector(".marked");
  if (dl.length && !m){
    m = document.createElement("span");
    m.className = "marked";
    m.textContent = dl.length + (dl.length>1 ? " lines" : " line");
    p.appendChild(m);
  } else if (m){
    if (!dl.length) m.remove(); else m.textContent = dl.length + (dl.length>1?" lines":" line");
  }
}
function clearPane(cv){
  if (!sizeCanvas(cv)) return;
  const ctx = cv.getContext("2d");
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,cv.width,cv.height);
}
function drawCard(card){
  if (!card._views) card._views = defaultViews();
  for (const t of TF) drawPane(card, t.id);
}
/* Pointer events outrun the display: a pan can fire several moves per frame,
   and each one used to repaint four canvases. Collapse them into one repaint
   on the next frame instead. */
const drawQueue = new Set();
let drawRaf = 0, fsQueued = false;
function flushDraws(){
  drawRaf = 0;
  const cards = [...drawQueue];
  drawQueue.clear();
  for (const c of cards) drawCard(c);
  if (fsQueued){ fsQueued = false; drawFs(); }
}
function queueDraw(card){
  drawQueue.add(card);
  if (!drawRaf) drawRaf = requestAnimationFrame(flushDraws);
}
function queueFs(){
  fsQueued = true;
  if (!drawRaf) drawRaf = requestAnimationFrame(flushDraws);
}
function redrawAll(){ mounted.forEach(drawCard); if (!fsEl.hidden) drawFs(); }
function syncStars(sym){
  document.querySelectorAll('.star[data-sym="'+CSS.escape(sym)+'"]').forEach(b =>
    b.setAttribute("aria-pressed", isSaved(sym) ? "true" : "false"));
  if (fsSymCur === sym) document.getElementById("fsStar").textContent = isSaved(sym) ? "Saved" : "Save chart";
}

feed.addEventListener("click", e => {
  const star = e.target.closest(".star");
  if (star){ toggleSaved(star.dataset.sym); return; }
  if (Date.now() - gestureEnd < 320) return;        // that tap was a zoom or a pan
  const pane = e.target.closest(".pane");
  if (pane && !e.target.classList.contains("paxis")){
    openFs(pane.closest(".card").dataset.sym, pane.dataset.tf);
  }
});

/* two fingers zoom a pane, one finger sideways pans it */
const fpts = new Map();
let fPinch = null, fPan = null, fAxis = null, gestureEnd = 0;
const clampScale = v => Math.min(PSCALE_MAX, Math.max(PSCALE_MIN, v));
function paneView(pane){
  const card = pane.closest(".card");
  if (!card._views) card._views = defaultViews();
  return { card, view: card._views[pane.dataset.tf] };
}
function setCount(pane, n){
  const { card, view } = paneView(pane);
  const s = series(card.dataset.sym);
  if (!s) return;
  const total = s[pane.dataset.tf].length;
  view.count = Math.max(15, Math.min(total, Math.round(n)));
  view.offset = Math.max(0, Math.min(total - view.count, view.offset));
  queueDraw(card);
}
function fSpread(){
  const v = [...fpts.values()];
  return Math.hypot(v[0].x-v[1].x, v[0].y-v[1].y) || 1;
}
feed.addEventListener("pointerdown", e => {
  const pane = e.target.closest(".pane");
  if (!pane) return;
  if (e.target.classList.contains("paxis")){        // price axis: drag = zoom price
    const { view } = paneView(pane);
    fAxis = { pane, y:e.clientY, pscale: view.pscale || 1, live:false };
    e.target.setPointerCapture(e.pointerId);
    return;
  }
  fpts.set(e.pointerId, { x:e.clientX, y:e.clientY, pane });
  if (fpts.size === 2){
    const v = [...fpts.values()];
    if (v[0].pane === v[1].pane){
      fPinch = { pane: v[0].pane, d: fSpread(), count: paneView(v[0].pane).view.count };
      fPan = null;
    }
  } else if (fpts.size === 1){
    fPan = { pane, x:e.clientX, y:e.clientY, off: paneView(pane).view.offset, live:false };
  }
});
feed.addEventListener("pointermove", e => {
  if (fAxis){
    const dy = e.clientY - fAxis.y;
    if (!fAxis.live){
      if (Math.abs(dy) < 4) return;
      fAxis.live = true;
    }
    // down = more range (candles flatten), up = tighter range
    const { card, view } = paneView(fAxis.pane);
    view.pscale = clampScale(fAxis.pscale * Math.exp(dy/220));
    gestureEnd = Date.now();
    queueDraw(card);
    return;
  }
  if (!fpts.has(e.pointerId)) return;
  const rec = fpts.get(e.pointerId);
  rec.x = e.clientX; rec.y = e.clientY;
  if (fPinch && fpts.size >= 2){
    setCount(fPinch.pane, fPinch.count * fPinch.d / fSpread());
    gestureEnd = Date.now();
    return;
  }
  if (!fPan) return;
  const dx = e.clientX - fPan.x, dy = e.clientY - fPan.y;
  if (!fPan.live){
    if (Math.abs(dy) > Math.abs(dx)) { fPan = null; return; }   // that's a scroll
    if (Math.abs(dx) < 8) return;
    fPan.live = true;
  }
  const cv = fPan.pane.querySelector("canvas");
  const g = cv && cv._geom;
  if (!g) return;
  const { card, view } = paneView(fPan.pane);
  const sr = series(card.dataset.sym);
  if (!sr) return;
  const total = sr[fPan.pane.dataset.tf].length;
  view.offset = Math.max(0, Math.min(total - view.count, fPan.off + Math.round(dx/g.cw)));
  gestureEnd = Date.now();
  queueDraw(card);
});
function feedPointerEnd(e){
  if (fAxis){
    if (fAxis.live) gestureEnd = Date.now();
    fAxis = null;
  }
  fpts.delete(e.pointerId);
  if (fpts.size < 2) fPinch = null;
  if (fPan && fPan.live) gestureEnd = Date.now();
  if (fpts.size === 0) fPan = null;
}
feed.addEventListener("pointerup", feedPointerEnd);
feed.addEventListener("pointercancel", feedPointerEnd);
feed.addEventListener("dblclick", e => {              // axis double-click resets the range
  if (!e.target.classList.contains("paxis")) return;
  const pane = e.target.closest(".pane");
  const { card, view } = paneView(pane);
  view.pscale = 1;
  gestureEnd = Date.now();
  queueDraw(card);
});
feed.addEventListener("wheel", e => {                 // trackpad pinch / ctrl+wheel
  if (!e.ctrlKey) return;
  const pane = e.target.closest(".pane");
  if (!pane) return;
  e.preventDefault();
  setCount(pane, paneView(pane).view.count * (e.deltaY>0 ? 1.12 : 0.89));
  gestureEnd = Date.now();
}, { passive:false });
let scrollTick = 0;
feed.addEventListener("scroll", () => {
  clearTimeout(scrollTick);
  scrollTick = setTimeout(updateCount, 80);
}, { passive:true });
