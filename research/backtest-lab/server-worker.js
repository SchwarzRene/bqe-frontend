// Web worker hosting the WebAssembly server (see server-core.js). The page's bridge.js sends it every
// /api/* request; running here keeps long backtests and optimisations off the page's main thread.
import { openServer, seedExample } from "./server-core.js";

const BASE = new URL(".", import.meta.url).href;
const load = async (path) => {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
};

let server = null;
const ready = (async () => {
  server = await openServer(await load("mt5bt.wasm"), (line) => console.log("[mt5bt]", line));
  await seedExample(server, load);
})();
ready.then(() => postMessage({ ready: true }), (e) => postMessage({ fatal: String((e && e.message) || e) }));

onmessage = async (ev) => {
  const { id, method, url, body } = ev.data;
  try {
    await ready;
    const r = server.request(method, url, body ? new Uint8Array(body) : null);
    const buf = r.body.buffer.slice(r.body.byteOffset, r.body.byteOffset + r.body.byteLength);
    postMessage({ id, status: r.status, ctype: r.ctype, body: buf }, [buf]);
  } catch (e) {
    postMessage({ id, status: 500, ctype: "application/json", body: new TextEncoder().encode(JSON.stringify({ error: String((e && e.message) || e) })).buffer });
  }
};
