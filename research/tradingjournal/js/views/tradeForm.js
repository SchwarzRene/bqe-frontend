import { api } from "../api.js";
import { money, nowLocalInput } from "../format.js";
import { $, $$, esc, openFormModal, toast } from "../ui.js";

/**
 * Open the create/edit trade dialog. With `closing: true` the exit fields are
 * pre-filled with the live price and current time, for one-click closing.
 */
export async function openTradeForm({ trade = null, closing = false, onSaved }) {
  const [symbols, setups] = await Promise.all([api.symbols(), api.setups()]);
  if (!symbols.length) {
    toast("Add a symbol first (Symbols tab)", "error");
    location.hash = "#/symbols";
    return;
  }
  const t = trade || { direction: "long", entry_time: nowLocalInput(), fees: 0, symbol_id: symbols[0].id };

  openFormModal({
    title: trade ? (closing ? `Close ${trade.symbol_name} trade` : "Edit trade") : "New trade",
    submitLabel: closing ? "Close trade" : "Save trade",
    wide: true,
    body: formBody(t, symbols, setups),
    onReady: (form) => wireForm(form, symbols, closing),
    onSubmit: async (values) => {
      const saved = trade ? await api.updateTrade(trade.id, values) : await api.createTrade(values);
      toast(trade ? "Trade updated" : "Trade added");
      onSaved?.(saved);
    },
  });
}

function formBody(t, symbols, setups) {
  const val = (v) => esc(v ?? "");
  const symbolOptions = symbols
    .map((s) => `<option value="${s.id}" ${s.id === t.symbol_id ? "selected" : ""}>${esc(s.name)}</option>`)
    .join("");
  const stars = [1, 2, 3, 4, 5]
    .map((n) => `<button type="button" data-star="${n}" class="${t.rating >= n ? "on" : ""}">★</button>`)
    .join("");

  return `
  <div class="form-grid">
    <div class="field">
      <label>Symbol</label>
      <select name="symbol_id">${symbolOptions}</select>
    </div>
    <div class="field">
      <label>Direction</label>
      <div class="segmented">
        <input type="radio" id="dir-long" name="direction" value="long" ${t.direction === "long" ? "checked" : ""}><label for="dir-long">▲ Long</label>
        <input type="radio" id="dir-short" name="direction" value="short" ${t.direction === "short" ? "checked" : ""}><label for="dir-short">▼ Short</label>
      </div>
    </div>
    <div class="field"><label>Volume (lots / units)</label><input name="volume" type="number" step="any" min="0" value="${val(t.volume)}" placeholder="0.10" required></div>
    <div class="field"><label>Setup / strategy</label><input name="setup" list="setup-list" value="${val(t.setup)}" placeholder="e.g. London breakout"><datalist id="setup-list">${setups.map((s) => `<option value="${esc(s)}">`).join("")}</datalist></div>

    <div class="form-section-title">Entry</div>
    <div class="field"><label>Entry price</label><div class="input-row"><input name="entry_price" type="number" step="any" value="${val(t.entry_price)}" required><button type="button" class="btn small" data-live="entry">Live</button></div></div>
    <div class="field"><label>Entry time</label><input name="entry_time" type="datetime-local" value="${val(t.entry_time)}" required></div>
    <div class="field"><label>Stop loss</label><input name="stop_loss" type="number" step="any" value="${val(t.stop_loss)}" placeholder="optional — enables R-multiple"></div>
    <div class="field"><label>Take profit</label><input name="take_profit" type="number" step="any" value="${val(t.take_profit)}" placeholder="optional"></div>

    <div class="form-section-title">Exit <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">— leave empty while the trade is open</span></div>
    <div class="field"><label>Exit price</label><div class="input-row"><input name="exit_price" type="number" step="any" value="${val(t.exit_price)}"><button type="button" class="btn small" data-live="exit">Live</button></div></div>
    <div class="field"><label>Exit time</label><input name="exit_time" type="datetime-local" value="${val(t.exit_time)}"></div>
    <div class="field"><label>Fees (commission + swap)</label><input name="fees" type="number" step="any" value="${val(t.fees)}"><div class="hint">Cost is positive; a swap credit is negative.</div></div>
    <div class="field"><label>Actual P&amp;L from broker</label><input name="pnl_override" type="number" step="any" value="${val(t.pnl_override)}" placeholder="optional override"><div class="hint">Use this if the calculated P&amp;L doesn't match MT5.</div></div>
    <div class="full preview-box" data-preview></div>

    <div class="form-section-title">Review</div>
    <div class="field full">
      <label>Execution rating</label>
      <input type="hidden" name="rating" value="${val(t.rating)}">
      <div class="stars">${stars}</div>
    </div>
    <div class="field full"><label>Notes</label><textarea name="notes" placeholder="Why did you take it? How did you manage it?">${esc(t.notes || "")}</textarea></div>
  </div>`;
}

function wireForm(form, symbols, closing) {
  const symbolFor = () => symbols.find((s) => String(s.id) === form.symbol_id.value);
  const preview = $("[data-preview]", form);
  const updatePreview = () => { preview.innerHTML = previewText(form, symbolFor()); };

  form.addEventListener("input", updatePreview);
  form.addEventListener("change", updatePreview);
  $$("[data-live]", form).forEach((btn) =>
    btn.addEventListener("click", () => fillLivePrice(form, symbolFor(), btn.dataset.live).then(updatePreview)),
  );
  wireStars(form);
  updatePreview();

  if (closing) {
    form.exit_time.value = nowLocalInput();
    fillLivePrice(form, symbolFor(), "exit").then(updatePreview);
  }
}

async function fillLivePrice(form, symbol, which) {
  if (!symbol) return;
  try {
    const quote = await api.quote(symbol.ticker);
    form[`${which}_price`].value = quote.price;
    if (!form[`${which}_time`].value || which === "exit") form[`${which}_time`].value = nowLocalInput();
  } catch (error) {
    toast(error.message, "error");
  }
}

function wireStars(form) {
  const buttons = $$("[data-star]", form);
  buttons.forEach((btn) =>
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.star);
      // Clicking the current rating again clears it.
      const next = Number(form.rating.value) === n ? "" : String(n);
      form.rating.value = next;
      buttons.forEach((b) => b.classList.toggle("on", next && Number(b.dataset.star) <= n));
    }),
  );
}

function previewText(form, symbol) {
  if (!symbol) return "";
  const num = (name) => (form[name].value === "" ? null : Number(form[name].value));
  const sign = form.direction.value === "short" ? -1 : 1;
  const [entry, exit, volume, sl, fees] = ["entry_price", "exit_price", "volume", "stop_loss", "fees"].map(num);
  const parts = [`Point value <span class="mono">${symbol.point_value}</span> per 1.0 move per lot`];
  if (entry && volume && sl) {
    parts.push(`Risk <span class="mono loss">${money(-Math.abs(entry - sl) * volume * symbol.point_value)}</span>`);
  }
  if (entry && volume && exit) {
    const pnl = sign * (exit - entry) * volume * symbol.point_value - (fees || 0);
    parts.push(`Calculated P&amp;L <span class="mono ${pnl >= 0 ? "profit" : "loss"}">${money(pnl)}</span>`);
  }
  return parts.join(" &nbsp;·&nbsp; ");
}
