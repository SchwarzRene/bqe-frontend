// The site's Worker. Static files are served straight from the CDN and never
// reach this code; only the paths in wrangler.toml's run_worker_first do,
// plus the cron triggers.

import { handleAuth, pruneAuth } from "./auth";
import { handleContact, pruneContact } from "./contact";
import type { Env } from "./env";
import { json } from "./http";
import { handleMarket } from "./market";
import { refreshTape, serveTapeFile } from "./markettape";
import { refreshStack, serveStackFile } from "./stack";
import { handleState } from "./state";
import { fetchQuote, isValidSymbol, UpstreamError } from "./yahoo";

const QUOTE_TTL = 60; // seconds a live quote is reused at the edge

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === "/api/health") return json({ status: "ok" });

      let m = path.match(/^\/api\/quotes\/([^/]+)$/);
      if (m && method === "GET") return quote(decodeURIComponent(m[1]).toUpperCase(), request, ctx);

      if (path === "/api/contact") {
        if (method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
        return handleContact(request, env);
      }

      m = path.match(/^\/api\/auth\/([a-z]+)$/);
      if (m) return handleAuth(request, env, m[1]);

      m = path.match(/^\/api\/state\/([a-z]+)$/);
      if (m) return handleState(request, env, m[1]);

      m = path.match(/^\/api\/market\/([a-z]+)$/);
      if (m) return handleMarket(request, ctx, m[1]);

      m = path.match(/^\/api\/admin\/run\/(stack|markettape)$/);
      if (m) {
        if (method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
        if (!authorised(request, env)) return json({ error: "unauthorised" }, 401);
        return json(m[1] === "stack" ? await refreshStack(env) : { result: await refreshTape(env) });
      }

      m = path.match(/^\/research\/stack\/data\/([A-Za-z0-9.\-]+)\.json$/);
      if (m && method === "GET") return serveStackFile(request, env, m[1]);

      m = path.match(/^\/research\/markettape\/data\/([a-z]+\.json)$/);
      if (m && method === "GET") return serveTapeFile(request, env, ctx, m[1]);

      if (path.startsWith("/api/")) return json({ error: "not found" }, 404);
    } catch (err) {
      console.error(`${method} ${path} failed`, err);
      return json({ error: "internal error" }, 500);
    }
    // Anything else routed here (e.g. README.md under a data folder) is a file.
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx): Promise<void> {
    switch (controller.cron) {
      case "*/3 22-23 * * 1-5": {
        const report = await refreshStack(env, new Date(controller.scheduledTime));
        console.log("stack refresh", JSON.stringify(report));
        break;
      }
      case "10 12 * * 1-5":
      case "10 22 * * 1-5": {
        console.log("markettape refresh:", await refreshTape(env, new Date(controller.scheduledTime)));
        ctx.waitUntil(pruneContact(env));
        ctx.waitUntil(pruneAuth(env));
        break;
      }
      default:
        console.warn("unknown cron", controller.cron);
    }
  },
} satisfies ExportedHandler<Env>;

/** GET /api/quotes/:symbol — fresh bars for one ticker, cached a minute at the edge. */
async function quote(symbol: string, request: Request, ctx: ExecutionContext): Promise<Response> {
  if (!isValidSymbol(symbol)) return json({ error: "bad symbol" }, 400);

  const cache = caches.default;
  const key = new Request(new URL(`/api/quotes/${symbol}`, request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  try {
    const q = await fetchQuote(symbol);
    const updated = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const res = json({ s: symbol, updated, live: true, ...q }, 200, {
      "Cache-Control": `public, max-age=${QUOTE_TTL}`,
    });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (err) {
    // 502 is what the page reads as "use the stored bars for this ticker".
    const message = err instanceof UpstreamError ? err.message : "upstream unavailable";
    console.warn(`quote ${symbol}: ${err}`);
    return json({ error: message }, 502);
  }
}

function authorised(request: Request, env: Env): boolean {
  const token = env.ADMIN_TOKEN;
  const given = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || given.length !== token.length) return false;
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
