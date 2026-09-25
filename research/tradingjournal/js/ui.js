const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * Open the shared <dialog> with a form. `onSubmit(values, form)` may throw; its
 * message is shown inline and the dialog stays open so no input is lost.
 */
export function openFormModal({ title, body, submitLabel = "Save", wide = false, onSubmit, onReady }) {
  const dialog = $("#modal");
  dialog.className = wide ? "wide" : "";
  dialog.innerHTML = `
    <form method="dialog" novalidate>
      <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="btn ghost" data-close>✕</button></div>
      <div class="modal-content">${body}</div>
      <div class="modal-foot">
        <span class="form-error" data-error></span>
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">${esc(submitLabel)}</button>
      </div>
    </form>`;
  const form = $("form", dialog);
  const errorEl = $("[data-error]", dialog);
  $$("[data-close]", dialog).forEach((btn) => btn.addEventListener("click", () => dialog.close()));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = $("button[type=submit]", form);
    submit.disabled = true;
    errorEl.textContent = "";
    try {
      await onSubmit(formValues(form), form);
      dialog.close();
    } catch (error) {
      errorEl.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  dialog.showModal();
  fitSheet();
  // showModal focuses the header's close button; start on the first field instead,
  // except on touch screens, where that would throw the keyboard over the form.
  if (!matchMedia("(pointer: coarse)").matches) {
    $(".modal-content :is(input:not([type=hidden]), select, textarea)", dialog)?.focus();
  }
  onReady?.(form);
  return form;
}

// On a phone the dialog is a full-screen sheet. When the keyboard opens, iOS
// doesn't shrink the layout viewport; it scrolls the visible part of it, so a
// sheet sized to the screen slid up under the header and could be panned
// around. Pinning the sheet to window.visualViewport keeps it exactly on the
// visible area, with only its own content scrolling (as the Market News chat).
const phone = matchMedia("(max-width: 600px)");

function fitSheet() {
  const dialog = $("#modal");
  const vv = window.visualViewport;
  if (!dialog?.open || !vv || !phone.matches) {
    dialog?.style.removeProperty("--sheet-top");
    dialog?.style.removeProperty("--sheet-height");
    return;
  }
  dialog.style.setProperty("--sheet-top", `${vv.offsetTop}px`);
  dialog.style.setProperty("--sheet-height", `${vv.height}px`);
}

if (window.visualViewport) {
  visualViewport.addEventListener("resize", fitSheet);
  visualViewport.addEventListener("scroll", fitSheet);
}
phone.addEventListener("change", fitSheet);
$("#modal")?.addEventListener("close", fitSheet);

export function formValues(form) {
  const values = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === "radio") {
      if (el.checked) values[el.name] = el.value;
    } else if (el.type === "checkbox") {
      (values[el.name] ||= []);
      if (el.checked) values[el.name].push(el.value);
    } else {
      values[el.name] = el.value;
    }
  }
  return values;
}

export function toast(message, kind = "info") {
  const item = document.createElement("div");
  item.className = `toast-item ${kind}`;
  item.textContent = message;
  $("#toast").append(item);
  setTimeout(() => item.remove(), kind === "error" ? 5000 : 2500);
}

export function errorBox(error) {
  return `<div class="error-box">${esc(error.message || error)}</div>`;
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
