// Stack — Fullscreen chart and drawing tools.
// Classic script: shares one global scope with the other files in js/, so the
// load order in index.html matters.
"use strict";

/* ============================================================
   6. Fullscreen chart + drawing
   ============================================================ */
const fsEl    = document.getElementById("fs");
const fsCv    = document.getElementById("fsCanvas");
const fsTabs  = document.getElementById("fsTabs");
const fsHint  = document.getElementById("fsHint");
let fsSymCur = null, fsTf = "D", tool = null, pending = null, preview = null;
const views = {};                                   // per timeframe zoom/pan

fsTabs.innerHTML = TF.map(t =>
  `<button data-tf="${t.id}" aria-pressed="false">${t.id === "H1" ? "1H" : t.id}</button>`).join("");

function openFs(sym, tf){
  fsSymCur = sym; fsTf = tf;
  const it = UNIVERSE.find(u => u.sym === sym);
  document.getElementById("fsSym").textContent = sym;
  document.getElementById("fsNm").textContent = it ? it.name : "";
  document.getElementById("fsStar").textContent = isSaved(sym) ? "Saved" : "Save chart";
  const card = feed.querySelector('.card[data-sym="'+CSS.escape(sym)+'"]');
  const src = (card && card._views) || defaultViews();
  TF.forEach(t => { views[t.id] = { count: src[t.id].count, offset: src[t.id].offset,
                                    pscale: src[t.id].pscale || 1 }; });
  setTool(null);
  fsEl.hidden = false;
  requestAnimationFrame(drawFs);
}
function closeFs(){
  fsEl.hidden = true;
  pending = null; preview = null;
  if (fsSymCur){
    const card = feed.querySelector('.card[data-sym="'+CSS.escape(fsSymCur)+'"]');
    if (card){
      card._views = {};
      TF.forEach(t => { card._views[t.id] = { count: views[t.id].count, offset: views[t.id].offset,
                                              pscale: views[t.id].pscale || 1 }; });
      if (mounted.has(card)) drawCard(card);
    }
  }
}
function drawFs(){
  if (!fsSymCur) return;
  const s = series(fsSymCur);
  fsTabs.querySelectorAll("button").forEach(b =>
    b.setAttribute("aria-pressed", b.dataset.tf === fsTf ? "true" : "false"));
  if (!s){ clearPane(fsCv); return; }               // bars still loading
  paint(fsCv, s[fsTf], views[fsTf], state.draw[fsSymCur] || [],
        { big:true, tf:fsTf, preview, ranges: rangesFor(fsSymCur, fsTf, views) });
  document.getElementById("fsLoc").setAttribute("aria-pressed", state.locator ? "true" : "false");
}
function setTool(t){
  tool = t; pending = null; preview = null;
  document.querySelectorAll(".tool[data-tool]").forEach(b =>
    b.setAttribute("aria-pressed", b.dataset.tool === t ? "true" : "false"));
  fsHint.textContent =
    t === "level" ? "Drag anywhere to place a price line. It shows on all four timeframes." :
    t === "trend" ? "Tap the first point, then the second." :
    t === "erase" ? "Tap a line to remove it." :
    "Drag to pan, pinch or scroll to zoom. Simulated data.";
  drawFs();
}
fsTabs.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  fsTf = b.dataset.tf; pending = null; preview = null; drawFs();
});
document.getElementById("fsBack").addEventListener("click", closeFs);
document.querySelectorAll(".tool[data-tool]").forEach(b =>
  b.addEventListener("click", () => setTool(tool === b.dataset.tool ? null : b.dataset.tool)));
document.getElementById("fsFit").addEventListener("click", () => {
  const t = TF.find(x => x.id === fsTf);
  views[fsTf] = { count: Math.round(t.bars*0.85), offset: 0 };
  drawFs();
});
document.getElementById("fsStar").addEventListener("click", () => toggleSaved(fsSymCur));
document.getElementById("fsClear").addEventListener("click", () => {
  const cur = state.draw[fsSymCur] || [];
  if (!cur.length) { toast("No lines on " + fsSymCur); return; }
  const backup = cur.slice();
  state.draw[fsSymCur] = [];
  persist(); drawFs();
  toast(backup.length + (backup.length>1?" lines removed":" line removed"), "Undo", () => {
    state.draw[fsSymCur] = backup; persist(); drawFs();
  });
});

/* pointer interaction on the fullscreen canvas */
let drag = null, pinch = null;
const pts = new Map();
const spread = () => {
  const v = [...pts.values()];
  return Math.hypot(v[0].x-v[1].x, v[0].y-v[1].y) || 1;
};
function zoomTo(n){
  const g = fsCv._geom, v = views[fsTf];
  v.count = Math.max(20, Math.min(g.total, Math.round(n)));
  v.offset = Math.max(0, Math.min(g.total - v.count, v.offset));
  queueFs();
}
fsCv.addEventListener("pointerdown", e => {
  const g = fsCv._geom; if (!g) return;
  fsCv.setPointerCapture(e.pointerId);
  const r = fsCv.getBoundingClientRect();
  const x = e.clientX-r.left, y = e.clientY-r.top;
  pts.set(e.pointerId, {x,y});
  if (pts.size === 2){
    pinch = { d: spread(), count: views[fsTf].count };
    drag = null;
    return;
  }

  if (tool === "level"){
    const d = { id: uid(), kind:"level", price: g.pOf(y) };
    lines(fsSymCur).push(d);
    drag = { mode:"level", d };
    drawFs();
  } else if (tool === "trend"){
    const pt = { t: g.timeOfX(x), p: g.pOf(y) };
    if (!pending){
      pending = pt;
      preview = { t1:pt.t, p1:pt.p, t2:pt.t, p2:pt.p };
      drag = { mode:"trend" };
    } else {
      lines(fsSymCur).push({ id:uid(), kind:"trend", t1:pending.t, p1:pending.p, t2:pt.t, p2:pt.p });
      pending = null; preview = null; persist();
    }
    drawFs();
  } else if (tool === "erase"){
    eraseAt(x,y);
  } else if (x > g.x1){                              // price axis: drag = zoom price
    drag = { mode:"pscale", y, pscale: views[fsTf].pscale || 1 };
  } else {
    drag = { mode:"pan", x, startOff: views[fsTf].offset };
  }
});
fsCv.addEventListener("pointermove", e => {
  const g = fsCv._geom; if (!g) return;
  const r = fsCv.getBoundingClientRect();
  const x = e.clientX-r.left, y = e.clientY-r.top;
  if (pts.has(e.pointerId)) pts.set(e.pointerId, {x,y});
  if (pinch && pts.size >= 2){ zoomTo(pinch.count * pinch.d / spread()); return; }
  if (drag && drag.mode === "level"){
    drag.d.price = g.pOf(y); queueFs();
  } else if (pending){
    preview = { t1:pending.t, p1:pending.p, t2:g.timeOfX(x), p2:g.pOf(y) };
    queueFs();
  } else if (drag && drag.mode === "pscale"){
    views[fsTf].pscale = Math.min(PSCALE_MAX, Math.max(PSCALE_MIN,
      drag.pscale * Math.exp((y-drag.y)/220)));
    queueFs();
  } else if (drag && drag.mode === "pan"){
    const shift = Math.round((x-drag.x)/g.cw);
    const max = g.total - views[fsTf].count;
    views[fsTf].offset = Math.max(0, Math.min(max, drag.startOff + shift));
    queueFs();
  }
});
function endDrag(e){
  if (e) pts.delete(e.pointerId);
  if (pts.size < 2) pinch = null;
  if (drag && drag.mode === "level") persist();
  drag = null;
}
fsCv.addEventListener("pointerup", endDrag);
fsCv.addEventListener("pointercancel", endDrag);
fsCv.addEventListener("dblclick", e => {             // axis double-click resets the range
  const g = fsCv._geom; if (!g) return;
  const r = fsCv.getBoundingClientRect();
  if (e.clientX - r.left <= g.x1) return;
  views[fsTf].pscale = 1;
  drawFs();
});
fsCv.addEventListener("wheel", e => {
  e.preventDefault();
  if (!fsCv._geom) return;
  zoomTo(views[fsTf].count * (e.deltaY>0 ? 1.15 : 0.87));
}, { passive:false });

function uid(){ return Math.random().toString(36).slice(2,9); }
function eraseAt(x,y){
  const g = fsCv._geom, arr = state.draw[fsSymCur] || [];
  let best = -1, bestD = 14;
  arr.forEach((d,i) => {
    let dist;
    if (d.kind === "level"){
      dist = Math.abs(y - g.yOf(d.price));
    } else {
      const ax = g.xOfTime(d.t1), ay = g.yOf(d.p1);
      const bx = g.xOfTime(d.t2), by = g.yOf(d.p2);
      if (Math.abs(bx-ax) < 0.01) return;
      const m = (by-ay)/(bx-ax);
      const ly = ay + m*(x-ax);
      dist = Math.abs(y-ly) / Math.sqrt(1+m*m);
    }
    if (dist < bestD){ bestD = dist; best = i; }
  });
  if (best < 0){ toast("No line there"); return; }
  const removed = arr.splice(best,1)[0];
  persist(); drawFs();
  toast("Line removed", "Undo", () => { arr.splice(best,0,removed); persist(); drawFs(); });
}

/* PNG export */
document.getElementById("fsPng").addEventListener("click", async () => {
  if (!downloads) return;
  const out = document.createElement("canvas");
  const dpr = 2, w = 900, h = 520;
  out.width = w*dpr; out.height = h*dpr;
  out._dpr = dpr; out._fixed = true;
  const tfLabel = (TF.find(t => t.id === fsTf) || {}).label || fsTf;
  const sFs = series(fsSymCur);
  if (!sFs) return;
  paint(out, sFs[fsTf], views[fsTf], state.draw[fsSymCur] || [],
        { big:true, tf:fsTf, bg:theme.pane, title:`${fsSymCur} · ${tfLabel}` });
  out.toBlob(async b => {
    try {
      await downloads.save({ filename: `${fsSymCur}_${fsTf}.png`, data: b });
      toast("Chart saved");
    } catch(err){
      if (err && err.code === "declined") return;
      toast("Couldn't save the file");
    }
  }, "image/png");
});
