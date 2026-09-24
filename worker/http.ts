// Responses built by the Worker. _headers only applies to static assets, so
// anything the Worker answers itself carries the same security headers here.
const SECURITY_HEADERS: Record<string, string> = {
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
 * The visitor's IP as a salted hash that changes every day, so it can rate
 * limit within a day but cannot follow anyone across days. The IP itself is
 * never stored.
 */
export async function hashIp(ip: string, day = utcDay()): Promise<string> {
  const data = new TextEncoder().encode(`${day}|bqe|${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return hex(digest).slice(0, 32);
}

export function hex(buffer: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A request from a page on another site: refuse anything that changes state. */
export function crossSite(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !!origin && origin !== new URL(request.url).origin;
}

/** Read a JSON object body, or null when it is missing, too large or malformed. */
export async function readJson(request: Request, maxBytes: number): Promise<any | null> {
  const text = await request.text();
  if (!text || text.length > maxBytes) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
