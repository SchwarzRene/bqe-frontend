// Responses built by the Worker. _headers only applies to static assets, so
// anything the Worker answers itself carries the same security headers here.
const SECURITY_HEADERS: Record<string, string> = {
  // JSON is never a document: nothing in it may load or run.
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return jsonText(JSON.stringify(body), status, headers);
}

/** A body that is already serialised — the stored documents are. */
export function jsonText(text: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(text, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** UTC calendar date, YYYY-MM-DD. */
export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * The visitor's IP as a keyed hash that changes every day, so it can rate
 * limit within a day but cannot follow anyone across days. The IP itself is
 * never stored, and without IP_HASH_SECRET (a Worker secret, not in D1) a
 * copy of the database cannot be turned back into addresses by trying them
 * all. IPv6 visitors are counted per /64, the block one connection gets.
 */
export async function hashIp(ip: string, secret?: string, day = utcDay()): Promise<string> {
  const data = new TextEncoder().encode(`${day}|bqe|${ipBlock(ip)}`);
  if (!secret) {
    warnOnce("IP_HASH_SECRET is not set: visitor hashes are unkeyed");
    return hex(await crypto.subtle.digest("SHA-256", data)).slice(0, 32);
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, data)).slice(0, 32);
}

/** The visitor's hash for this request (see hashIp). */
export function visitor(request: Request, env: { IP_HASH_SECRET?: string }): Promise<string> {
  return hashIp(request.headers.get("CF-Connecting-IP") || "unknown", env.IP_HASH_SECRET);
}

/** An IPv4 address as it is; an IPv6 address as its /64 prefix. */
export function ipBlock(ip: string): string {
  if (!ip.includes(":")) return ip;
  // An IPv4 address in IPv6 notation (::ffff:1.2.3.4) is that IPv4 address.
  if (ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1);
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") && tail ? tail.split(":") : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

const warned = new Set<string>();
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

export function hex(buffer: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A request from a page on another site: refuse anything that changes state. */
export function crossSite(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !!origin && origin !== new URL(request.url).origin;
}

/**
 * The request body as text, or null when it is larger than `maxBytes`. A
 * declared Content-Length over the limit is refused before anything is read,
 * and the stream is cut off at the limit, so a huge body is never buffered.
 */
export async function readText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Read a JSON object body, or null when it is missing, too large or malformed. */
export async function readJson(request: Request, maxBytes: number): Promise<any | null> {
  const text = await readText(request, maxBytes);
  if (!text) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

/** A rate-limit binding's verdict; true (allowed) when the binding is not configured. */
export async function allowed(limiter: { limit(o: { key: string }): Promise<{ success: boolean }> } | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key })).success;
  } catch {
    return true; // the limiter failing must not take the site down with it
  }
}
