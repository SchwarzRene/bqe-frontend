import { api } from "../api.js";
import { dateTime, todayLocal } from "../format.js";
import { $, $$, esc, openFormModal, toast } from "../ui.js";

const TEMPLATES = {
  "Trade review": `## What was the plan?\n\n## What actually happened?\n\n## What did I do well?\n- \n\n## What would I do differently?\n- \n`,
  "Lesson learned": `## The lesson\n\n## How I learned it\n\n## Rule I'm adding to my playbook\n> \n`,
  "Weekly review": `## Results this week\n\n## Best trade & why\n\n## Worst trade & why\n\n## Patterns I noticed\n- \n\n## Focus for next week\n1. \n`,
  "Pre-market plan": `## Market context\n\n## Levels I'm watching\n- \n\n## Setups I'll take\n- \n\n## What I will NOT do today\n- \n`,
};

/** Open the create/edit journal entry dialog, optionally pre-linked to trades. */
export async function openEntryForm({ entry = null, linkTradeIds = [], defaultTitle = "", onSaved }) {
  const trades = await api.trades();
  const linked = new Set(entry ? entry.trade_ids : linkTradeIds);
  const e = entry || { entry_date: todayLocal(), title: defaultTitle, body: "", tags: [] };

  openFormModal({
    title: entry ? "Edit journal entry" : "New journal entry",
    submitLabel: "Save entry",
    wide: true,
    body: formBody(e, trades, linked),
    onReady: wireTemplates,
    onSubmit: async (values) => {
      const payload = { ...values, trade_ids: (values.trade_ids || []).map(Number) };
      const saved = entry ? await api.updateEntry(entry.id, payload) : await api.createEntry(payload);
      toast(entry ? "Entry updated" : "Entry saved");
      onSaved?.(saved);
    },
  });
}

function formBody(e, trades, linked) {
  const tradeOptions = trades.length
    ? trades.map((t) => `
        <label><input type="checkbox" name="trade_ids" value="${t.id}" ${linked.has(t.id) ? "checked" : ""}>
          <span class="badge ${t.direction}">${t.direction}</span> <strong>${esc(t.symbol_name)}</strong>
          <span class="muted mono">${dateTime(t.entry_time)}</span></label>`).join("")
    : `<div class="muted" style="padding:6px">No trades yet.</div>`;

  return `
  <div class="form-grid">
    <div class="field"><label>Date</label><input type="date" name="entry_date" value="${esc(e.entry_date)}" required></div>
    <div class="field"><label>Tags <span class="muted">(comma separated)</span></label><input name="tags" value="${esc(e.tags.join(", "))}" placeholder="risk, psychology, entries"></div>
    <div class="field full"><label>Title</label><input name="title" value="${esc(e.title)}" placeholder="What's this entry about?" required></div>
    <div class="field full">
      <label>Start from a template</label>
      <div class="template-row">${Object.keys(TEMPLATES).map((name) => `<button type="button" class="btn small" data-template="${esc(name)}">${esc(name)}</button>`).join("")}</div>
    </div>
    <div class="field full">
      <label>Entry</label>
      <textarea name="body" class="tall" placeholder="Write freely. Markdown works: ## headings, - lists, **bold**, > quotes">${esc(e.body)}</textarea>
    </div>
    <div class="field full"><label>Linked trades</label><div class="link-list">${tradeOptions}</div></div>
  </div>`;
}

function wireTemplates(form) {
  const body = $("textarea[name=body]", form);
  $$("[data-template]", form).forEach((btn) =>
    btn.addEventListener("click", () => {
      const template = TEMPLATES[btn.dataset.template];
      // Append rather than replace so a template never wipes what was already written.
      body.value = body.value.trim() ? `${body.value.trimEnd()}\n\n${template}` : template;
      body.focus();
    }),
  );
}
