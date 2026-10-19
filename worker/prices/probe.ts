// A one-off diagnostic: what does Dukascopy answer the Worker?
//
// In a browser https://jetta.dukascopy.com/v1/candles/day/XAU-USD/BID/2025 returns the year's candles
// as JSON; from the Worker it returned 200, text/html, 0 bytes. This tries a few variants of the
// request from the Worker's network and stores what came back in prices:probe (status, content type,
// size, the start of the body, a few response headers), so the cause can be read from D1.
//
// It runs once, on the first backfill slot after a deploy with PRICES_PROBE = "on" and no stored
// result, or on demand with POST /api/admin/run/prices?mode=probe. Remove the setting to retire it.

import type { Env } from "../env";
import { isoNow } from "../http";

const BASE = "https://jetta.dukascopy.com/v1/candles/day";
import { BROWSER_HEADERS } from "./dukascopy";

const SITE = "https://www.dukascopy.com";
export const PROBE_KEY = "prices:probe";

interface Variant {
  name: string;
  url: string;
  headers?: Record<string, string>;
}

export const VARIANTS: Variant[] = [
  { name: "plain", url: `${BASE}/XAU-USD/BID/2025` },
  { name: "plain, current-year form", url: `${BASE}/XAU-USD/BID?from=${Date.UTC(2025, 0, 1)}` },
  { name: "browser headers", url: `${BASE}/XAU-USD/BID/2025`, headers: BROWSER_HEADERS },
  { name: "origin and referer only", url: `${BASE}/XAU-USD/BID/2025`, headers: { Referer: `${SITE}/`, Origin: SITE } },
  { name: "node user agent", url: `${BASE}/XAU-USD/BID/2025`, headers: { "User-Agent": "node", Accept: "*/*" } },
  { name: "another instrument", url: `${BASE}/EUR-USD/BID/2025` },
  { name: "old datafeed (binary)", url: "https://datafeed.dukascopy.com/datafeed/XAUUSD/2025/BID_candles_day_1.bi5" },
];

const KEEP_HEADERS = ["server", "via", "cf-ray", "cf-cache-status", "content-length", "content-encoding", "cache-control", "x-powered-by", "location", "www-authenticate", "access-control-allow-origin", "x-cache", "x-amz-cf-id", "x-served-by"];

export interface ProbeResult {
  name: string;
  url: string;
  ms: number;
  status?: number;
  type?: string | null;
  bytes?: number;
  head?: string;
  headers?: Record<string, string>;
  error?: string;
}

export async function probeOne(v: Variant, fetcher: typeof fetch = fetch): Promise<ProbeResult> {
  const started = Date.now();
  const out: ProbeResult = { name: v.name, url: v.url, ms: 0 };
  try {
    const res = await fetcher(v.url, { headers: v.headers, signal: AbortSignal.timeout(8000), redirect: "manual" });
    const body = new Uint8Array(await res.arrayBuffer());
    out.status = res.status;
    out.type = res.headers.get("content-type");
    out.bytes = body.length;
    const sample = body.slice(0, 120);
    const text = new TextDecoder().decode(sample).replace(/\s+/g, " ");
    // Printable text as it is; anything else (the old feed is compressed binary) as hex.
    out.head = /^[\x20-\x7e]*$/.test(text) ? text : Array.from(sample.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join(" ");
    out.headers = Object.fromEntries(KEEP_HEADERS.flatMap((h) => (res.headers.get(h) ? [[h, res.headers.get(h)!.slice(0, 120)]] : [])));
    if (res.headers.get("set-cookie")) out.headers["set-cookie"] = "(present)";
  } catch (err) {
    out.error = String(err).slice(0, 160);
  }
  out.ms = Date.now() - started;
  return out;
}

export async function hasProbe(env: Env): Promise<boolean> {
  return !!(await env.DB.prepare("SELECT 1 AS x FROM documents WHERE key = ?").bind(PROBE_KEY).first());
}

/** Run every variant (one after the other) and store the answers. Returns a one-line summary. */
export async function runProbe(env: Env, fetcher: typeof fetch = fetch): Promise<string> {
  const results: ProbeResult[] = [];
  for (const v of VARIANTS) results.push(await probeOne(v, fetcher));
  await env.DB.prepare(
    `INSERT INTO documents (key, body, updated) VALUES (?1, ?2, ?3)
     ON CONFLICT (key) DO UPDATE SET body = excluded.body, updated = excluded.updated`,
  )
    .bind(PROBE_KEY, JSON.stringify({ at: isoNow(), results }), isoNow())
    .run();
  return `probe: ${results.map((r) => `${r.name} -> ${r.error ? "error" : `${r.status} ${r.bytes}B`}`).join("; ")}`;
}
