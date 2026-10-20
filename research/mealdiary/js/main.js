import { diary, photoUrl } from "./api.js";
import { shrink } from "./photo.js";

const SLOTS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snack"]];
const SLOT_NAME = Object.fromEntries(SLOTS);
const THEME_KEY = "md-theme";

const $ = (selector, root = document) => root.querySelector(selector);
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

// ── Dates: always the user's own calendar, as the Worker stores them ────────

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const shiftDay = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysFromToday = (s) => Math.round((parseDay(s) - parseDay(today())) / 86_400_000);
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The meal a time of day usually is. */
function slotAt(time) {
  const h = Number(time.slice(0, 2));
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 17) return "snack";
  if (h < 22) return "dinner";
  return "snack";
}

const state = {
  day: today(),
  meals: [],
  suggestion: null,
  notes: "",
  ai: false,
  month: "",
  monthDays: new Map(),
  file: null, // the picture chosen in the add form, already shrunk
  thinking: false,
  ideaError: "",
};
let loadId = 0;

// ── Theme: a display preference, kept in this browser and, signed in, on the account ──

function applyStoredTheme() {
  let theme = null;
  try {
    theme = localStorage.getItem(THEME_KEY);
    if (theme) document.documentElement.dataset.theme = theme;
  } catch { /* storage unavailable — fall back to the OS theme */ }
  window.BQE?.prefs?.sync("mealdiary", theme ? { theme } : {}, (saved) => {
    if (saved.theme !== "dark" && saved.theme !== "light") return;
    try { localStorage.setItem(THEME_KEY, saved.theme); } catch { /* ignore */ }
    document.documentElement.dataset.theme = saved.theme;
  });
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme
    || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  window.BQE?.prefs?.save("mealdiary", { theme: next });
}

function toast(message, kind = "info") {
  const item = document.createElement("div");
  item.className = `toast-item ${kind}`;
  item.textContent = message;
  $("#toast").append(item);
  setTimeout(() => item.remove(), kind === "error" ? 5000 : 2500);
}

/** Run an API call; show its error and return undefined instead of throwing. An ended session reloads the page. */
async function attempt(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error.status === 401) { location.reload(); return undefined; }
    toast(error.message, "error");
    return undefined;
  }
}

// ── The page ────────────────────────────────────────────────────────────────

function renderGuest() {
  $("#view").innerHTML = `
    <section class="card guest">
      <h2>Your meals, day by day</h2>
      <p>Write down what you eat and when, add a photo, and let the AI suggest something different for each day.
         The diary is kept in your account, so you need to sign in — it is the same account as for the other research apps.</p>
      <button class="btn primary" id="sign-in">Sign in or create an account</button>
    </section>`;
  $("#sign-in").addEventListener("click", async () => {
    if (await window.BQE.openLogin({ note: "Your diary is private to your account." })) location.reload();
  });
}

function renderShell() {
  $("#view").innerHTML = `
    <div class="daynav">
      <button class="btn" id="prev" aria-label="Previous day">←</button>
      <input type="date" id="date" aria-label="Day">
      <button class="btn" id="next" aria-label="Next day">→</button>
      <button class="btn" id="to-today">Today</button>
      <h2 id="day-title"></h2>
    </div>
    <div class="layout">
      <div class="col">
        <section class="card" aria-labelledby="add-title">
          <h2 id="add-title">Add what you ate</h2>
          <form id="add" class="form" novalidate>
            <div class="row">
              <div class="field"><label for="add-time">When</label><input type="time" id="add-time" required></div>
              <div class="field"><label for="add-slot">Meal</label>
                <select id="add-slot">${SLOTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>
            </div>
            <div class="field"><label for="add-text">What was it?</label>
              <textarea id="add-text" maxlength="500" rows="3" placeholder="e.g. Lentil soup with bread, an apple" required></textarea></div>
            <div class="field photo-field">
              <label for="add-photo">Photo (optional)</label>
              <input type="file" id="add-photo" accept="image/*">
              <div id="add-preview" class="preview" hidden></div>
              <button type="button" class="btn small" id="add-describe" hidden>Describe the photo with AI</button>
            </div>
            <div class="form-foot"><span class="form-error" id="add-error" role="alert"></span><button class="btn primary" type="submit">Add to diary</button></div>
          </form>
        </section>
        <section class="card" aria-labelledby="meals-title">
          <h2 id="meals-title">Eaten</h2>
          <div id="meals"></div>
        </section>
      </div>
      <div class="col">
        <section class="card" aria-labelledby="ideas-title">
          <div class="card-head"><h2 id="ideas-title">Summary &amp; ideas</h2><button class="btn" id="suggest"></button></div>
          <div id="ideas"></div>
        </section>
        <section class="card" aria-labelledby="cal-title">
          <div class="card-head">
            <h2 id="cal-title">Calendar</h2>
            <span class="cal-nav"><button class="btn small" id="cal-prev" aria-label="Previous month">‹</button><span id="cal-month" class="cal-month"></span><button class="btn small" id="cal-next" aria-label="Next month">›</button></span>
          </div>
          <div id="cal"></div>
        </section>
        <section class="card" aria-labelledby="notes-title">
          <h2 id="notes-title">About you</h2>
          <p class="hint">Diet, allergies, dislikes, goals — the AI keeps to this when it suggests meals.</p>
          <textarea id="notes" maxlength="600" rows="3" placeholder="e.g. vegetarian, no nuts, likes spicy food, cooks for one" aria-label="Notes for the AI"></textarea>
          <div class="form-foot"><span class="hint" id="notes-status" role="status"></span><button class="btn" id="notes-save">Save</button></div>
        </section>
      </div>
    </div>`;
  wire();
}

function wire() {
  $("#prev").addEventListener("click", () => setDay(shiftDay(state.day, -1)));
  $("#next").addEventListener("click", () => setDay(shiftDay(state.day, 1)));
  $("#to-today").addEventListener("click", () => setDay(today()));
  $("#date").addEventListener("change", (e) => DAY_RE.test(e.target.value) && setDay(e.target.value));
  $("#add").addEventListener("submit", addMeal);
  $("#add-time").addEventListener("change", (e) => { if (!$("#add-text").value) $("#add-slot").value = slotAt(e.target.value || "12:00"); });
  $("#add-photo").addEventListener("change", chooseFile);
  $("#add-describe").addEventListener("click", describeNew);
  $("#suggest").addEventListener("click", suggest);
  $("#meals").addEventListener("click", onMealClick);
  $("#ideas").addEventListener("click", onIdeaClick);
  $("#cal").addEventListener("click", (e) => { const b = e.target.closest("[data-day]"); if (b) setDay(b.dataset.day); });
  $("#cal-prev").addEventListener("click", () => setMonth(-1));
  $("#cal-next").addEventListener("click", () => setMonth(1));
  $("#notes-save").addEventListener("click", saveNotes);
  resetForm();
}

function resetForm() {
  $("#add-time").value = state.day === today() ? nowTime() : ($("#add-time").value || "12:00");
  $("#add-slot").value = slotAt($("#add-time").value);
  $("#add-text").value = "";
  $("#add-error").textContent = "";
  clearFile();
}

function clearFile() {
  state.file = null;
  $("#add-photo").value = "";
  const box = $("#add-preview");
  const img = $("img", box);
  if (img) URL.revokeObjectURL(img.src);
  box.hidden = true;
  box.textContent = "";
  $("#add-describe").hidden = true;
}

async function chooseFile(e) {
  const file = e.target.files[0];
  if (!file) return clearFile();
  const error = $("#add-error");
  error.textContent = "";
  try {
    state.file = await shrink(file);
  } catch (err) {
    clearFile();
    error.textContent = err.message;
    return;
  }
  const box = $("#add-preview");
  box.textContent = "";
  const img = Object.assign(document.createElement("img"), { src: URL.createObjectURL(state.file), alt: "The photo you chose" });
  const remove = Object.assign(document.createElement("button"), { type: "button", className: "btn small", textContent: "Remove" });
  remove.addEventListener("click", clearFile);
  box.append(img, remove);
  box.hidden = false;
  $("#add-describe").hidden = false;
  setAiButton($("#add-describe"));
}

/** An AI button is for accounts with AI access; the others see why it is off. */
function setAiButton(button) {
  button.disabled = !state.ai;
  button.title = state.ai ? "" : "AI access is switched on by an administrator, per account.";
}

/**
 * Ask the AI what is in a picture and put the sentence in `field` for the user to
 * correct and save. Runs only on this click, and never replaces text without asking.
 */
async function describeInto(button, field, error, ask) {
  if (field.value.trim() && !confirm("Replace what you wrote with the AI's description?")) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Looking at the photo…";
  error.textContent = "";
  try {
    field.value = (await ask()).description;
    field.focus();
  } catch (err) {
    if (err.status === 401) return location.reload();
    error.textContent = err.message;
  } finally {
    button.textContent = label;
    setAiButton(button);
  }
}

const describeNew = (e) => describeInto(e.currentTarget, $("#add-text"), $("#add-error"), () => diary.describeFile(state.file));

// ── Loading and showing a day ───────────────────────────────────────────────

function setDay(day) {
  if (!DAY_RE.test(day)) return;
  if (location.hash === `#${day}`) { state.day = day; load(); } else location.hash = day; // hashchange loads
}

async function load() {
  const id = ++loadId;
  const day = state.day;
  const monthKey = day.slice(0, 7);
  const [data, month] = await Promise.all([
    attempt(() => diary.day(day)),
    state.month === monthKey && state.monthDays.size ? Promise.resolve(null) : attempt(() => diary.month(monthKey)),
  ]);
  if (id !== loadId) return; // another day was asked for meanwhile
  if (!data) return;
  Object.assign(state, { meals: data.meals, suggestion: data.suggestion, notes: data.notes, ai: data.ai, ideaError: "" });
  if (month) { state.month = monthKey; state.monthDays = new Map(month.days.map((d) => [d.day, d.meals])); }
  else if (state.month !== monthKey) { state.month = monthKey; state.monthDays = new Map(); }
  renderDay();
}

function renderDay() {
  const date = parseDay(state.day);
  $("#date").value = state.day;
  $("#day-title").textContent = date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    + (state.day === today() ? " · today" : "");
  $("#notes").value = state.notes;
  renderMeals();
  renderIdeas();
  renderCalendar();
}

function mealHtml(m) {
  return `
    <article class="meal" data-id="${m.id}">
      <div class="meal-time num">${esc(m.time)}</div>
      <div class="meal-main">
        <span class="badge slot-${esc(m.slot)}">${esc(SLOT_NAME[m.slot])}</span>
        <p class="meal-text">${esc(m.description)}</p>
        <div class="meal-actions">
          <button class="btn small ghost" data-action="edit">Edit</button>
          <button class="btn small ghost danger" data-action="delete">Delete</button>
        </div>
      </div>
      ${m.photo ? `<button class="photo-btn" data-action="view" aria-label="Show the photo larger"><img src="${esc(photoUrl(m.id, m.photo))}" alt="Photo: ${esc(m.description)}" loading="lazy" decoding="async"></button>` : ""}
    </article>`;
}

function renderMeals() {
  $("#meals").innerHTML = state.meals.length
    ? state.meals.map(mealHtml).join("")
    : `<p class="empty">Nothing written down for this day yet.</p>`;
}

const mealById = (el) => state.meals.find((m) => m.id === Number(el.closest(".meal")?.dataset.id));

async function onMealClick(e) {
  const button = e.target.closest("[data-action]");
  const meal = button && mealById(button);
  if (!meal) return;
  if (button.dataset.action === "view") return viewPhoto(meal);
  if (button.dataset.action === "edit") return editMeal(meal);
  if (button.dataset.action === "delete") {
    if (!confirm(`Delete "${meal.description.slice(0, 60)}" from the diary?`)) return;
    if (await attempt(() => diary.deleteMeal(meal.id))) { toast("Deleted"); refresh(); }
  }
}

/** Reload the day and the month's dots without losing what is typed in the add form. */
async function refresh() {
  state.monthDays = new Map();
  await load();
}

async function addMeal(e) {
  e.preventDefault();
  const error = $("#add-error");
  const description = $("#add-text").value.trim();
  if (!description) { error.textContent = "Say what you ate."; return; }
  const submit = $("button[type=submit]", e.target);
  submit.disabled = true;
  error.textContent = "";
  try {
    const { meal } = await diary.addMeal({ day: state.day, time: $("#add-time").value, slot: $("#add-slot").value, description });
    if (state.file) {
      try { await diary.putPhoto(meal.id, state.file); } catch (err) { toast(`Saved, but the photo did not upload: ${err.message}`, "error"); }
    }
    resetForm();
    toast("Added");
    await refresh();
  } catch (err) {
    if (err.status === 401) return location.reload();
    error.textContent = err.message;
  } finally {
    submit.disabled = false;
  }
}

// ── Dialogs: edit a meal, look at a photo ───────────────────────────────────

function closeDialog() { const d = $("#modal"); if (d.open) d.close(); }

function viewPhoto(meal) {
  const dialog = $("#modal");
  dialog.className = "photo-dialog";
  dialog.innerHTML = `<form method="dialog"><img src="${esc(photoUrl(meal.id, meal.photo))}" alt="Photo: ${esc(meal.description)}"><p class="caption">${esc(meal.time)} · ${esc(SLOT_NAME[meal.slot])} · ${esc(meal.description)}</p><button class="btn" value="close">Close</button></form>`;
  dialog.showModal();
}

function editMeal(meal) {
  const dialog = $("#modal");
  dialog.className = "";
  dialog.innerHTML = `
    <form method="dialog" class="form" novalidate>
      <h2>Edit entry</h2>
      <div class="row">
        <div class="field"><label for="ed-time">When</label><input type="time" id="ed-time" value="${esc(meal.time)}" required></div>
        <div class="field"><label for="ed-slot">Meal</label>
          <select id="ed-slot">${SLOTS.map(([v, l]) => `<option value="${v}"${v === meal.slot ? " selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label for="ed-text">What was it?</label><textarea id="ed-text" maxlength="500" rows="3" required></textarea></div>
      <div class="field">
        <label for="ed-photo">${meal.photo ? "Replace the photo" : "Add a photo"}</label>
        <input type="file" id="ed-photo" accept="image/*">
        ${meal.photo ? `<label class="check"><input type="checkbox" id="ed-remove"> Remove the current photo</label>` : ""}
        <button type="button" class="btn small" id="ed-describe"${meal.photo ? "" : " hidden"}>Describe the photo with AI</button>
      </div>
      <div class="form-foot"><span class="form-error" id="ed-error" role="alert"></span>
        <button type="button" class="btn" id="ed-cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>
    </form>`;
  $("#ed-text").value = meal.description;
  $("#ed-cancel").addEventListener("click", closeDialog);
  const describe = $("#ed-describe");
  setAiButton(describe);
  $("#ed-photo").addEventListener("change", (e) => { describe.hidden = !meal.photo && !e.target.files[0]; });
  describe.addEventListener("click", () => describeInto(describe, $("#ed-text"), $("#ed-error"), async () => {
    const file = $("#ed-photo").files[0];
    return file ? diary.describeFile(await shrink(file)) : diary.describeMeal(meal.id);
  }));
  $("form", dialog).addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = $("#ed-error");
    const submit = $("button[type=submit]", dialog);
    submit.disabled = true;
    error.textContent = "";
    try {
      await diary.updateMeal(meal.id, { time: $("#ed-time").value, slot: $("#ed-slot").value, description: $("#ed-text").value });
      const file = $("#ed-photo").files[0];
      if (file) await diary.putPhoto(meal.id, await shrink(file));
      else if ($("#ed-remove")?.checked) await diary.deletePhoto(meal.id);
      closeDialog();
      toast("Saved");
      await refresh();
    } catch (err) {
      if (err.status === 401) return location.reload();
      error.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });
  dialog.showModal();
}

// ── Meal ideas ──────────────────────────────────────────────────────────────

function renderIdeas() {
  const button = $("#suggest");
  const near = Math.abs(daysFromToday(state.day)) <= 1;
  const s = state.suggestion;
  button.textContent = state.thinking ? "Thinking…" : s ? "Update" : "Summarise & suggest";
  button.disabled = state.thinking || !state.ai || !near;
  button.classList.toggle("primary", !s && state.ai && near);

  let html = "";
  if (!state.ai) {
    html += `<p class="hint">The AI features (photo descriptions, summary, ideas) need AI access, which an administrator switches on for each account. The diary itself works without it.</p>`;
  } else if (!near) {
    html += `<p class="hint">Ideas are made for today and the days next to it.</p>`;
  }
  if (state.ideaError) html += `<p class="form-error" role="alert">${esc(state.ideaError)}</p>`;
  if (s) {
    if (s.summary) html += `<p class="summary">${esc(s.summary)}</p><h3 class="next">What to cook next</h3>`;
    html += s.meals.map((m, i) => `
      <article class="idea">
        <div class="idea-head"><span class="badge slot-${esc(m.slot)}">${esc(SLOT_NAME[m.slot])}</span>
          ${m.minutes ? `<span class="muted">${esc(m.minutes)} min</span>` : ""}</div>
        <h3>${esc(m.name)}</h3>
        ${m.why ? `<p>${esc(m.why)}</p>` : ""}
        ${m.ingredients.length ? `<p class="ingredients">${m.ingredients.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</p>` : ""}
        <button class="btn small" data-idea="${i}">I ate this</button>
      </article>`).join("");
    if (s.tip) html += `<p class="tip">${esc(s.tip)}</p>`;
    if (s.generatedAt) html += `<p class="hint">Made ${esc(new Date(s.generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }))}.</p>`;
  } else if (state.ai && near && !state.thinking && !state.ideaError) {
    html += `<p class="empty">Nothing here runs by itself. Press the button for a short summary of what you ate today and four ideas, different from the last two weeks, for what to cook next.</p>`;
  }
  $("#ideas").innerHTML = html;
}

async function suggest() {
  const day = state.day;
  state.thinking = true;
  state.ideaError = "";
  renderIdeas();
  try {
    const res = await diary.suggest(day);
    if (state.day === day) state.suggestion = res.suggestion;
  } catch (err) {
    if (err.status === 401) return location.reload();
    state.ideaError = err.message;
  } finally {
    state.thinking = false;
    if (state.day === day) renderIdeas();
  }
}

/** "I ate this": the idea fills the add form, so the diary gets the entry with one more tap. */
function onIdeaClick(e) {
  const button = e.target.closest("[data-idea]");
  const idea = button && state.suggestion?.meals[Number(button.dataset.idea)];
  if (!idea) return;
  $("#add-text").value = idea.name;
  $("#add-slot").value = idea.slot;
  $("#add-text").focus();
  $("#add").scrollIntoView({ behavior: "smooth", block: "center" });
}

// ── Calendar and notes ──────────────────────────────────────────────────────

function setMonth(delta) {
  const [y, m] = state.month.split("-").map(Number);
  const first = new Date(y, m - 1 + delta, 1);
  // Land on the same day in the new month (or its last), so the day and the calendar stay together.
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  setDay(ymd(new Date(first.getFullYear(), first.getMonth(), Math.min(parseDay(state.day).getDate(), last))));
}

function renderCalendar() {
  const [y, m] = state.month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  $("#cal-month").textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const lead = (first.getDay() + 6) % 7; // Monday first
  const length = new Date(y, m, 0).getDate();
  const names = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" }));
  const cells = [...Array(lead).fill(`<span></span>`)];
  for (let d = 1; d <= length; d++) {
    const day = `${state.month}-${pad(d)}`;
    const n = state.monthDays.get(day) || 0;
    cells.push(`<button class="cal-day${day === state.day ? " selected" : ""}${day === today() ? " today" : ""}${n ? " has" : ""}" data-day="${day}" aria-label="${esc(day)}${n ? `, ${n} ${n === 1 ? "entry" : "entries"}` : ""}"${day === state.day ? ' aria-current="date"' : ""}>${d}${n ? `<i aria-hidden="true">${n}</i>` : ""}</button>`);
  }
  $("#cal").innerHTML = `<div class="cal-grid">${names.map((n) => `<span class="cal-head">${esc(n)}</span>`).join("")}${cells.join("")}</div>`;
}

async function saveNotes() {
  const status = $("#notes-status");
  const res = await attempt(() => diary.saveNotes($("#notes").value));
  if (res) { state.notes = res.notes; $("#notes").value = res.notes; status.textContent = "Saved"; setTimeout(() => { status.textContent = ""; }, 2000); }
}

// ── Start ───────────────────────────────────────────────────────────────────

async function start() {
  applyStoredTheme();
  $("#theme-toggle").addEventListener("click", toggleTheme);
  window.BQE?.mountAccountChip($("#account"), { note: "Your diary is saved to your account." });
  const user = await window.BQE?.user;
  if (!user) return renderGuest();
  const fromHash = location.hash.slice(1);
  if (DAY_RE.test(fromHash)) state.day = fromHash;
  state.month = state.day.slice(0, 7);
  renderShell();
  window.addEventListener("hashchange", () => {
    const day = location.hash.slice(1);
    if (DAY_RE.test(day) && day !== state.day) { state.day = day; clearFileForNewDay(); load(); }
  });
  load();
}

/** A different day keeps what is typed, but the time of day default follows the day. */
function clearFileForNewDay() {
  if (!$("#add-text").value) resetForm();
}

start();
