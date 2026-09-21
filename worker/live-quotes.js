/**
 * Stack live quotes — a Cloudflare Worker that lets the browser reach Yahoo.
 *
 * Yahoo's chart endpoint sends no CORS headers, so a page on
 * schwarzrene.github.io cannot call it directly. This Worker calls it
 * server-side and hands back the same column-wise shape the committed
 * snapshot uses, with the one header the browser needs.
 *
 *     GET /AAPL        -> {"s":"AAPL","d":{tu,t,o,h,l,c},"h1":{...},"live":true}
 *
 * Prices are adjusted with the adjclose ratio so they line up with the
 * snapshot written by scripts/fetch_market_data.py (auto_adjust=True) —
 * a level drawn on one must sit at the same height on the other.
 *
 * Deploy: see worker/README.md.
 */

const ALLOWED_ORIGINS = [
  "https://schwarzrene.github.io",
  "http://localhost:8000",
];

const UPSTREAM = "https://query1.finance.yahoo.com";   // override with a YAHOO_BASE var when testing
const DAILY = { range: "10y", interval: "1d", unit: 86400000 };
const HOURLY = { range: "60d", interval: "60m", unit: 60000 };
const EDGE_TTL = 60;          // seconds a response is reused for everyone
const BROWSER_TTL = 45;       // seconds the browser may reuse its own copy

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405, cors);

    const symbol = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, "")).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9.\-]{0,9}$/.test(symbol)) {
      return json({ error: "bad symbol" }, 400, cors);
    }

    // One cached copy per symbol, shared by every visitor.
    const cache = caches.default;
    const key = new Request(new URL("/" + symbol, request.url).toString(), { method: "GET" });
    const hit = await cache.match(key);
    if (hit) return withCors(hit, cors);

    let payload;
    try {
      const upstream = (env && env.YAHOO_BASE) || UPSTREAM;
      const [daily, hourly] = await Promise.all([
        chart(symbol, DAILY, upstream),
        chart(symbol, HOURLY, upstream).catch(() => null),  // intraday is a bonus, not a requirement
      ]);
      if (!daily || daily.t.length < 40) return json({ error: "no data" }, 502, cors);
      payload = { s: symbol, updated: new Date().toISOString(), live: true, d: daily };
      if (hourly && hourly.t.length > 20) payload.h1 = hourly;
    } catch (err) {
      return json({ error: String(err).slice(0, 200) }, 502, cors);
    }

    const response = json(payload, 200, {
      ...cors,
      "Cache-Control": `public, max-age=${BROWSER_TTL}, s-maxage=${EDGE_TTL}`,
    });
    ctx.waitUntil(cache.put(key, response.clone()));
    return response;
  },
};

/** One Yahoo range, returned in the page's column format. */
async function chart(symbol, spec, upstream) {
  const url = `${upstream}/v8/finance/chart/${encodeURIComponent(symbol)}`
            + `?range=${spec.range}&interval=${spec.interval}&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; stack-live-quotes/1.0)" },
    cf: { cacheTtl: EDGE_TTL, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);

  const body = await res.json();
  const result = body && body.chart && body.chart.result && body.chart.result[0];
  if (!result || !Array.isArray(result.timestamp)) return null;

  const quote = (result.indicators.quote || [])[0] || {};
  const adj = ((result.indicators.adjclose || [])[0] || {}).adjclose || [];
  const step = spec.unit / 1000;
  const out = { tu: spec.unit, t: [], o: [], h: [], l: [], c: [] };

  for (let i = 0; i < result.timestamp.length; i++) {
    const o = quote.open?.[i], h = quote.high?.[i], l = quote.low?.[i], c = quote.close?.[i];
    if ([o, h, l, c].some((v) => v == null || !(v > 0))) continue;
    // Match the snapshot's auto_adjust=True: scale OHLC by adjclose/close.
    const k = adj[i] != null && c > 0 ? adj[i] / c : 1;
    const digits = c * k < 10 ? 4 : 2;
    out.t.push(Math.floor(result.timestamp[i] / step));
    out.o.push(round(o * k, digits));
    out.h.push(round(h * k, digits));
    out.l.push(round(l * k, digits));
    out.c.push(round(c * k, digits));
  }
  return out;
}

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function withCors(response, cors) {
  const copy = new Response(response.body, response);
  for (const [k, v] of Object.entries(cors)) copy.headers.set(k, v);
  return copy;
}
