// Stack — Chrome wiring and startup.
// Classic script: shares one global scope with the other files in js/, so the
// load order in index.html matters.
"use strict";

/* ============================================================
   7. Chrome wiring
   ============================================================ */
const secSel = document.getElementById("sector");
function fillSectors(){
  const keep = secSel.value;
  secSel.length = 1;
  [...new Set(UNIVERSE.map(u => u.sector))].sort().forEach(s => {
    const o = document.createElement("option"); o.value = s; o.textContent = s;
    secSel.appendChild(o);
  });
  secSel.value = [...secSel.options].some(o => o.value === keep) ? keep : "";
}
fillSectors();
function setLocator(on){
  state.locator = on;
  persist();
  document.getElementById("locBtn").setAttribute("aria-pressed", on ? "true":"false");
  document.getElementById("fsLoc").setAttribute("aria-pressed", on ? "true":"false");
  redrawAll();
}
document.getElementById("locBtn").addEventListener("click", () => {
  setLocator(!state.locator);
  toast(state.locator
    ? "Slower charts now show where the faster ones are looking"
    : "Range markers off");
});
document.getElementById("fsLoc").addEventListener("click", () => setLocator(!state.locator));
document.getElementById("filterBtn").addEventListener("click", e => {
  const box = document.getElementById("filters");
  const open = box.classList.toggle("open");
  e.currentTarget.setAttribute("aria-pressed", open ? "true":"false");
  if (open) document.getElementById("q").focus();
});
document.getElementById("savedBtn").addEventListener("click", e => {
  onlySaved = !onlySaved;
  e.currentTarget.setAttribute("aria-pressed", onlySaved ? "true":"false");
  rebuild();
});
document.getElementById("markedBtn").addEventListener("click", () => openSaved());
let qTick = 0;
document.getElementById("q").addEventListener("input", () => {
  clearTimeout(qTick); qTick = setTimeout(rebuild, 160);
});
secSel.addEventListener("change", rebuild);
document.getElementById("themeBtn").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const dark = cur ? cur === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", dark ? "light" : "dark");
  theme = readTheme();
  redrawAll();
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  theme = readTheme(); redrawAll();
});

let rTick = 0;
window.addEventListener("resize", () => {
  clearTimeout(rTick);
  rTick = setTimeout(() => { redrawAll(); updateCount(); }, 140);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !fsEl.hidden){ closeFs(); return; }
  if (e.key === "Escape" && savedOpen){ closeSaved(); return; }
  if (!fsEl.hidden || savedOpen) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp"){
    e.preventDefault();
    feed.scrollBy({ top: (e.key==="ArrowDown"?1:-1)*feed.clientHeight, behavior:"smooth" });
  }
});

/* toast */
let toastTick = 0;
function toast(msg, actionLabel, fn){
  const box = document.getElementById("toast");
  const act = document.getElementById("toastAct");
  document.getElementById("toastMsg").textContent = msg;
  act.hidden = !actionLabel;
  if (actionLabel){
    act.textContent = actionLabel;
    act.onclick = () => { box.hidden = true; fn && fn(); };
  }
  box.hidden = false;
  clearTimeout(toastTick);
  toastTick = setTimeout(() => { box.hidden = true; }, actionLabel ? 5200 : 2000);
}

setLocator(state.locator);
markSource();
rebuild();
initData();
