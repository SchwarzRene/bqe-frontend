// Stack — Saved state: bookmarks, drawings and theories.
// Classic script: shares one global scope with the other files in js/, so the
// load order in index.html matters.
"use strict";

/* ============================================================
   3. Saved state: bookmarks + drawings
   ============================================================ */
/* Bookmarks, drawings, theories and the locator setting. For a signed-in
   user they are saved to their account (the Worker's /api/state/stack); a
   guest's live in this tab only and are gone on reload — nothing is stored
   for guests, not even in this browser. */
const LEGACY_KEY = "stack.v1";   // where this page used to keep state, per browser
let state = { saved: [], draw: {}, notes: {}, locator: false };
let downloads = null;
const account = window.BQE ? window.BQE.store("stack") : null;

function applyState(p){
  if (!p || typeof p !== "object") return;
  state.saved = Array.isArray(p.saved) ? p.saved : [];
  state.draw  = (p.draw && typeof p.draw === "object") ? p.draw : {};
  state.notes = (p.notes && typeof p.notes === "object") ? p.notes : {};
  state.locator = !!p.locator;
}
function persist(){
  if (account) account.save({ saved: state.saved, draw: state.draw, notes: state.notes, locator: state.locator });
}
function isSaved(sym){ return state.saved.indexOf(sym) >= 0; }
function toggleSaved(sym){
  const i = state.saved.indexOf(sym);
  if (i >= 0) state.saved.splice(i,1); else state.saved.push(sym);
  persist();
  syncStars(sym);
  if (onlySaved) rebuild();
}
function lines(sym){ return state.draw[sym] || (state.draw[sym] = []); }

(async function(){
  if (window.BQE) window.BQE.mountAccountChip(document.getElementById("account"),
    { note: "Your marked charts, drawings and theories are saved to your account." });
  if (account){
    account.onStatus = (status, detail) => {
      if (status === "conflict") toast("Changed in another tab — reload to keep saving");
      else if (status === "error") toast("Could not save: " + detail);
    };
    try {
      let data = await account.load();
      if (account.signedIn){
        // First sign-in on a browser that kept state the old way: move it
        // into the account, then drop the local copy.
        if (!data){
          try {
            const raw = localStorage.getItem(LEGACY_KEY);
            if (raw){
              data = JSON.parse(raw);
              account.save(data, { now: true });
              localStorage.removeItem(LEGACY_KEY);
            }
          } catch(e){ /* storage blocked or unreadable — start empty */ }
        }
        if (data){
          applyState(data);
          redrawAll();
          document.querySelectorAll(".star").forEach(b => {
            b.setAttribute("aria-pressed", isSaved(b.dataset.sym) ? "true" : "false");
          });
          document.getElementById("locBtn").setAttribute("aria-pressed", state.locator ? "true":"false");
          document.getElementById("fsLoc").setAttribute("aria-pressed", state.locator ? "true":"false");
          if (onlySaved) rebuild();
        }
      }
    } catch(e){ toast("Could not load your saved charts — reload to try again"); }
  }
  if (!window.claude || typeof claude.use !== "function") return;
  try { downloads = await claude.use("downloads"); } catch(e){ downloads = null; }
  if (downloads) document.getElementById("fsPng").hidden = false;
})();
