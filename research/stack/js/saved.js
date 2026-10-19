// Stack — The marked-charts page, one swipe left of the feed.
// Classic script: shares one global scope with the other files in js/, so the
// load order in index.html matters.
"use strict";

/* ============================================================
   4b. Marked charts — the page one swipe to the left of the feed
   ============================================================ */
const svEl = document.getElementById("saved");
const svList = document.getElementById("svList");
let savedOpen = false;

function sparkline(cv, bars){
  const dpr = Math.min(window.devicePixelRatio||1, 2.5);
  const w = 96, h = 34;
  cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const vis = bars.slice(-60);
  if (vis.length < 2) return;
  let min = Infinity, max = -Infinity;
  for (const b of vis){ if (b.c<min) min=b.c; if (b.c>max) max=b.c; }
  const rng = (max-min) || max*0.02 || 1;
  const up = vis[vis.length-1].c >= vis[0].c;
  ctx.strokeStyle = up ? theme.up : theme.down;
  ctx.lineWidth = 1.5; ctx.lineJoin = "round";
  ctx.beginPath();
  vis.forEach((b,i) => {
    const x = 1 + i/(vis.length-1)*(w-2);
    const y = 2 + (max-b.c)/rng*(h-4);
    i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
  });
  ctx.stroke();
}

function noteOf(sym){ return state.notes[sym] || null; }
function setNote(sym, text){
  const clean = String(text||"").trim().slice(0, 4000);
  if (clean) state.notes[sym] = { text: clean, updated: Date.now() };
  else delete state.notes[sym];
  persist();
}
function whenText(ms){
  if (!ms) return "";
  const d = new Date(ms);
  return isNaN(d) ? "" : "Written " + d.toLocaleDateString(undefined,
    { month:"short", day:"numeric", year:"numeric" });
}
function esc(t){
  return String(t).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}

/* The reason a chart is on this page — why you would buy or sell it. */
let editingNote = null;                       // symbol whose theory is open for editing
function theoryHTML(sym){
  const n = noteOf(sym);
  if (editingNote === sym){
    return `<textarea class="sv-th-in" data-sym="${sym}" rows="4"
              placeholder="Why this one? The setup, the level that invalidates it, what you are waiting for."
              >${n ? esc(n.text) : ""}</textarea>
      <div class="sv-th-row" style="margin-top:6px">
        <button class="sv-th-btn" data-act="save" data-sym="${sym}">Save theory</button>
        <button class="sv-th-btn" data-act="cancel" data-sym="${sym}">Cancel</button>
        <span class="sv-th-when">⌘/Ctrl + Enter saves · Esc cancels</span>
      </div>`;
  }
  if (n){
    return `<p class="sv-th-text">${esc(n.text)}</p>
      <div class="sv-th-row">
        <button class="sv-th-btn" data-act="edit" data-sym="${sym}">Edit theory</button>
        <button class="sv-th-btn danger" data-act="clear" data-sym="${sym}">Remove</button>
        <span class="sv-th-when">${whenText(n.updated)}</span>
      </div>`;
  }
  return `<div class="sv-th-row">
      <button class="sv-th-btn" data-act="add" data-sym="${sym}">+ Add theory</button>
      <span class="sv-th-when">Why you want to buy or sell it</span>
    </div>`;
}

function renderSaved(){
  const syms = state.saved.slice();
  document.getElementById("svN").textContent =
    syms.length ? syms.length + (syms.length>1 ? " charts" : " chart") : "";
  if (!syms.length){
    svList.innerHTML = `<p class="sv-empty">No charts marked yet.<br>` +
      `Tap the bookmark on a chart to keep it here.</p>`;
    return;
  }
  svList.innerHTML = "";
  for (const sym of syms){
    const it = UNIVERSE.find(u => u.sym === sym) || { sym, name:"", sector:"" };
    const bars = (series(sym) || {}).D || null;
    const last = bars ? bars[bars.length-1] : null;
    const pct = bars ? chg(bars) : 0;
    const lines = (state.draw[sym] || []).length;
    const row = document.createElement("button");
    row.className = "sv-row";
    row.dataset.sym = sym;
    row.innerHTML = `
      <span class="sv-id">
        <span class="sv-sym">${sym}</span>
        <span class="sv-nm">${it.name || ""}${it.sector ? " · " + it.sector : ""}</span>
        ${lines ? `<span class="sv-lines">${lines} drawn ${lines>1?"lines":"line"}</span>` : ""}
      </span>
      <canvas class="sv-spark" aria-hidden="true"></canvas>
      <span class="sv-q">
        <span class="sv-px">${last ? fmt(last.c) : "—"}</span><br>
        <span class="sv-chg" style="color:var(${pct>=0?"--up":"--down"})">
          ${bars ? (pct>=0?"+":"") + pct.toFixed(2) + "%" : ""}
        </span>
      </span>
      <span class="sv-drop" role="button" tabindex="0" aria-label="Unmark ${sym}">×</span>`;
    const item = document.createElement("div");
    item.className = "sv-item";
    item.appendChild(row);
    const th = document.createElement("div");
    th.className = "sv-th";
    th.innerHTML = theoryHTML(sym);
    item.appendChild(th);
    svList.appendChild(item);
    if (bars) sparkline(row.querySelector("canvas"), bars);
    if (editingNote === sym){
      const ta = th.querySelector("textarea");
      if (ta){ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
  }
  const hint = document.createElement("p");
  hint.className = "sv-hint";
  hint.textContent = "Swipe left, or press Escape, to go back to the feed.";
  svList.appendChild(hint);
}

function openSaved(){
  if (savedOpen) return;
  savedOpen = true;
  renderSaved();
  svEl.classList.add("open");
  svEl.setAttribute("aria-hidden", "false");
}
function closeSaved(){
  if (!savedOpen) return;
  savedOpen = false;
  editingNote = null;
  svEl.classList.remove("open");
  svEl.setAttribute("aria-hidden", "true");
}

/** Show a symbol in the feed, lifting any filter that would hide it. */
function jumpTo(sym){
  closeSaved();
  let card = feed.querySelector('.card[data-sym="'+CSS.escape(sym)+'"]');
  if (!card){
    onlySaved = false;
    document.getElementById("savedBtn").setAttribute("aria-pressed","false");
    document.getElementById("q").value = "";
    secSel.value = "";
    rebuild();
    card = feed.querySelector('.card[data-sym="'+CSS.escape(sym)+'"]');
  }
  if (card) card.scrollIntoView({ block:"start", behavior:"auto" });
}

svList.addEventListener("keydown", e => {
  const ta = e.target.closest(".sv-th-in");
  if (!ta) return;
  if (e.key === "Escape"){
    e.stopPropagation(); editingNote = null; renderSaved();
  } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)){
    e.preventDefault(); setNote(ta.dataset.sym, ta.value); editingNote = null; renderSaved();
  }
});
svList.addEventListener("click", e => {
  const th = e.target.closest("[data-act]");
  if (th){
    const sym = th.dataset.sym;
    if (th.dataset.act === "add" || th.dataset.act === "edit") editingNote = sym;
    else if (th.dataset.act === "cancel") editingNote = null;
    else if (th.dataset.act === "save"){
      const ta = svList.querySelector('.sv-th-in[data-sym="'+CSS.escape(sym)+'"]');
      setNote(sym, ta ? ta.value : "");
      editingNote = null;
    } else if (th.dataset.act === "clear"){
      setNote(sym, "");
      editingNote = null;
    }
    renderSaved();
    return;
  }
  const drop = e.target.closest(".sv-drop");
  if (drop){
    e.stopPropagation();
    toggleSaved(drop.closest(".sv-row").dataset.sym);
    renderSaved();
    return;
  }
  const row = e.target.closest(".sv-row");
  if (row) jumpTo(row.dataset.sym);
});
document.getElementById("svBack").addEventListener("click", closeSaved);

/* swipe right anywhere off a chart (or from the left edge, even over one)
   opens the marked charts; swipe left there goes back. */
let swipe = null;
const SWIPE_MIN = 60;
document.addEventListener("pointerdown", e => {
  swipe = null;
  if (!fsEl.hidden) return;                       // the full-screen chart owns its gestures
  if (savedOpen){
    if (e.target.closest(".sv-th")) return;      // typing or selecting, not swiping
    swipe = { x:e.clientX, y:e.clientY, mode:"close" };
    return;
  }
  const onChart = !!e.target.closest(".pane");
  if (onChart && e.clientX > 28) return;           // that drag pans the chart
  swipe = { x:e.clientX, y:e.clientY, mode:"open" };
}, { passive:true });
document.addEventListener("pointerup", e => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  const swiped = Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)*1.6;
  if (swiped && swipe.mode === "open" && dx > 0) openSaved();
  else if (swiped && swipe.mode === "close" && dx < 0) closeSaved();
  swipe = null;
}, { passive:true });
document.addEventListener("pointercancel", () => { swipe = null; }, { passive:true });
