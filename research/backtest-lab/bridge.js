// Makes the unmodified web app (app.js, optimizer.js, charts.js) believe it talks to `mt5bt serve`:
// every fetch("/api/...") and the upload XMLHttpRequest are answered by the WebAssembly server in a worker.
// Everything else (static files) still goes to the network. Loaded before the app's own scripts.
(() => {
  const worker = new Worker("/research/backtest-lab/server-worker.js", { type: "module" });
  let seq = 0;
  const pending = new Map();
  let resolveReady, rejectReady;
  const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
  ready.catch(() => {}); // reported below; do not also warn about an unhandled rejection

  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.ready) return resolveReady();
    if (m.fatal) return rejectReady(new Error(m.fatal));
    const done = pending.get(m.id);
    if (done) { pending.delete(m.id); done(m); }
  };
  worker.onerror = (ev) => rejectReady(new Error(ev.message || "the engine worker failed to start"));

  ready.catch((e) => {
    const box = document.createElement("div");
    box.className = "bridge-error";
    box.textContent = "The backtest engine could not start: " + e.message + ". This page needs WebAssembly and module workers (any current browser).";
    const show = () => document.body.prepend(box);
    if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
  });

  const call = (method, url, body) =>
    ready.then(() => new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      worker.postMessage({ id, method, url, body }, body ? [body] : []);
    }));

  async function toBuffer(body) {
    if (body == null) return null;
    if (typeof body === "string") return new TextEncoder().encode(body).buffer;
    if (body instanceof Blob) return body.arrayBuffer();
    if (body instanceof ArrayBuffer) return body;
    if (ArrayBuffer.isView(body)) return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    throw new Error("unsupported request body");
  }
  const isApi = (u) => /^\/api\//.test(u);

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url ? new URL(input.url, location.href).pathname + new URL(input.url, location.href).search : String(input);
    if (!isApi(url)) return realFetch(input, init);
    const r = await call((init.method || "GET").toUpperCase(), url, await toBuffer(init.body));
    return new Response(r.body, { status: r.status, headers: { "Content-Type": r.ctype } });
  };

  // the app uploads tick files with XMLHttpRequest (for the progress bar)
  window.XMLHttpRequest = class {
    constructor() { this.upload = {}; this.status = 0; this.statusText = ""; this.responseText = ""; }
    open(method, url) { this._m = method; this._u = url; }
    send(body) {
      if (!isApi(this._u)) { this.onerror && this.onerror(new Error("only /api/ is available")); return; }
      toBuffer(body).then((buf) => {
        const total = buf ? buf.byteLength : 0;
        return call(this._m.toUpperCase(), this._u, buf).then((r) => {
          this.upload.onprogress && this.upload.onprogress({ loaded: total, total });
          this.status = r.status;
          this.responseText = new TextDecoder().decode(r.body);
          this.onload && this.onload();
        });
      }).catch((e) => this.onerror && this.onerror(e));
    }
  };
})();
