import { api } from "../api.js";
import { date, dateTime } from "../format.js";
import { renderMarkdown } from "../markdown.js";
import { $, $$, debounce, esc, toast } from "../ui.js";
import { openEntryForm } from "./journalForm.js";

const state = { q: "", tag: "" };

export async function renderJournal(root, focusId) {
  root.innerHTML = `
    <div class="page-head">
      <h1>Journal</h1>
      <div class="actions"><button class="btn primary" data-new>+ New entry</button></div>
    </div>
    <div class="journal-layout">
      <aside>
        <input type="search" placeholder="Search entries…" data-search value="${esc(state.q)}">
        <h3 style="margin:16px 0 8px">Tags</h3>
        <div data-tags></div>
      </aside>
      <section data-entries><div class="loading">Loading…</div></section>
    </div>`;

  const reload = () => loadEntries(root, focusId);
  $("[data-new]", root).addEventListener("click", () => openEntryForm({ onSaved: reload }));
  $("[data-search]", root).addEventListener("input", debounce((e) => { state.q = e.target.value; reload(); }, 250));
  await reload();
}

async function loadEntries(root, focusId) {
  const [entries, tags] = await Promise.all([api.journal(state), api.journalTags()]);
  renderTags($("[data-tags]", root), tags, () => loadEntries(root));
  const list = $("[data-entries]", root);

  if (!entries.length) {
    list.innerHTML = state.q || state.tag
      ? `<div class="card empty">No entries match.</div>`
      : `<div class="card empty"><h2>Your trading notebook</h2>
           <p>Write down what you learn — mistakes, rules, patterns, weekly reviews.<br>
           Link entries to trades so the lesson sits next to the evidence.</p>
           <button class="btn primary" data-empty-new>+ Write your first entry</button></div>`;
    $("[data-empty-new]", list)?.addEventListener("click", () => openEntryForm({ onSaved: () => loadEntries(root) }));
    return;
  }

  list.innerHTML = entries.map(entryCard).join("");
  wireEntries(list, entries, () => loadEntries(root));
  if (focusId) focusEntry(list, focusId);
}

function renderTags(container, tags, onChange) {
  if (!tags.length) {
    container.innerHTML = `<span class="muted">Tags you add show up here.</span>`;
    return;
  }
  container.innerHTML = tags
    .map((t) => `<span class="tag ${state.tag.toLowerCase() === t.toLowerCase() ? "active" : ""}" data-tag="${esc(t)}">#${esc(t)}</span>`)
    .join("");
  $$("[data-tag]", container).forEach((el) =>
    el.addEventListener("click", () => {
      state.tag = state.tag.toLowerCase() === el.dataset.tag.toLowerCase() ? "" : el.dataset.tag;
      onChange();
    }),
  );
}

function entryCard(e) {
  const trades = e.trades
    .map((t) => `<a class="trade-chip" href="#/trade/${t.id}"><span class="badge ${t.direction}">${t.direction}</span>${esc(t.symbol_name)} <span class="muted">${dateTime(t.entry_time)}</span></a>`)
    .join("");
  const long = e.body.length > 900;
  return `
    <article class="card entry" id="entry-${e.id}">
      <div class="entry-meta">
        <span>${date(e.entry_date)}</span>
        ${e.tags.map((t) => `<span class="tag" data-tag-inline="${esc(t)}">#${esc(t)}</span>`).join("")}
        <span class="entry-actions">
          <button class="btn small ghost" data-edit="${e.id}">Edit</button>
          <button class="btn small ghost danger" data-delete="${e.id}">Delete</button>
        </span>
      </div>
      <h2 class="entry-title">${esc(e.title)}</h2>
      <div class="prose ${long ? "clamped" : ""}" data-body="${e.id}">${renderMarkdown(e.body) || '<span class="muted">No text.</span>'}</div>
      ${long ? `<button class="btn small ghost" data-expand="${e.id}">Show more</button>` : ""}
      ${trades ? `<div style="margin-top:10px">${trades}</div>` : ""}
    </article>`;
}

function wireEntries(list, entries, reload) {
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  $$("[data-edit]", list).forEach((btn) =>
    btn.addEventListener("click", () => openEntryForm({ entry: byId[btn.dataset.edit], onSaved: reload })),
  );
  $$("[data-delete]", list).forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this journal entry? This can't be undone.")) return;
      try {
        await api.deleteEntry(btn.dataset.delete);
        toast("Entry deleted");
        reload();
      } catch (error) {
        toast(error.message, "error");
      }
    }),
  );
  $$("[data-expand]", list).forEach((btn) =>
    btn.addEventListener("click", () => {
      const body = $(`[data-body="${btn.dataset.expand}"]`, list);
      const expanded = body.classList.toggle("clamped") === false;
      btn.textContent = expanded ? "Show less" : "Show more";
    }),
  );
  $$("[data-tag-inline]", list).forEach((el) =>
    el.addEventListener("click", () => { state.tag = el.dataset.tagInline; reload(); }),
  );
}

function focusEntry(list, id) {
  const card = $(`#entry-${id}`, list);
  if (!card) return;
  card.style.outline = "2px solid var(--accent)";
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}
