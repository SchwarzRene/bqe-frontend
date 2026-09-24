import { api } from "../api.js";
import { price } from "../format.js";
import { $, debounce, esc, openFormModal, toast } from "../ui.js";

const ASSET_CLASSES = ["forex", "index", "stock", "crypto", "commodity", "other"];
const DEFAULT_POINT_VALUES = { forex: 100000, index: 1, stock: 1, crypto: 1, commodity: 100, other: 1 };

/** Open the add/edit symbol dialog; typing a name auto-suggests the Yahoo ticker. */
export function openSymbolForm({ symbol = null, onSaved }) {
  const s = symbol || { name: "", ticker: "", asset_class: "forex", point_value: 100000, description: "" };
  openFormModal({
    title: symbol ? `Edit ${symbol.name}` : "Add symbol",
    submitLabel: symbol ? "Save" : "Add symbol",
    body: formBody(s, Boolean(symbol)),
    onReady: (form) => wireForm(form, Boolean(symbol)),
    onSubmit: async (values) => {
      const saved = symbol ? await api.updateSymbol(symbol.id, values) : await api.createSymbol(values);
      toast(symbol ? "Symbol updated" : `${saved.name} added`);
      onSaved?.(saved);
    },
  });
}

function formBody(s, editing) {
  return `
  <div class="form-grid">
    <div class="field">
      <label>Symbol name (as in your broker)</label>
      <input name="name" value="${esc(s.name)}" placeholder="EURUSD, NAS100, XAUUSD, AAPL…" autocomplete="off" required>
    </div>
    <div class="field">
      <label>Market data ticker (Yahoo Finance)</label>
      <div class="input-row"><input name="ticker" value="${esc(s.ticker)}" placeholder="EURUSD=X" autocomplete="off" required><button type="button" class="btn small" data-check>Check</button></div>
    </div>
    <div class="field full preview-box" data-check-result>${editing ? "" : "Type a symbol name — the ticker is suggested automatically. Press <strong>Check</strong> to verify it has live data."}</div>
    <div class="field">
      <label>Asset class</label>
      <select name="asset_class">${ASSET_CLASSES.map((c) => `<option ${c === s.asset_class ? "selected" : ""}>${c}</option>`).join("")}</select>
    </div>
    <div class="field">
      <label>Point value</label>
      <input name="point_value" type="number" step="any" min="0" value="${esc(s.point_value)}" required>
      <div class="hint">Profit per 1.0 price move per 1 lot. EURUSD std lot = 100000, XAUUSD = 100, stocks = 1. Check your MT5 contract size.</div>
    </div>
    <div class="field full"><label>Description</label><input name="description" value="${esc(s.description)}" placeholder="filled in automatically"></div>
  </div>`;
}

function wireForm(form, editing) {
  // Stop auto-filling once the user edits a field by hand.
  const touched = { ticker: editing, asset_class: editing, point_value: editing };
  for (const key of Object.keys(touched)) form[key].addEventListener("input", () => { touched[key] = true; });

  form.name.addEventListener("input", debounce(async () => {
    if (!form.name.value.trim()) return;
    const suggestion = await api.suggestSymbol(form.name.value).catch(() => null);
    if (!suggestion) return;
    if (!touched.ticker) form.ticker.value = suggestion.ticker;
    if (!touched.asset_class) form.asset_class.value = suggestion.asset_class;
    if (!touched.point_value) form.point_value.value = suggestion.point_value;
  }, 250));

  form.asset_class.addEventListener("change", () => {
    if (!touched.point_value) form.point_value.value = DEFAULT_POINT_VALUES[form.asset_class.value];
  });
  $("[data-check]", form).addEventListener("click", () => checkTicker(form));
}

async function checkTicker(form) {
  const box = $("[data-check-result]", form);
  const ticker = form.ticker.value.trim();
  if (!ticker) return;
  box.textContent = "Checking…";
  try {
    const q = await api.quote(ticker);
    box.innerHTML = `<span class="live-dot"></span><strong>${esc(q.name || q.ticker)}</strong> · ${esc(q.exchange)} · <span class="mono">${price(q.price, q.price_hint ?? 2)} ${esc(q.currency)}</span>`;
    if (!form.description.value) form.description.value = q.name;
  } catch (error) {
    box.innerHTML = `<span class="loss">${esc(error.message)}</span> — try the ticker from finance.yahoo.com.`;
  }
}
