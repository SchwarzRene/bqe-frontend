// Market Tape: the Federal Reserve calendar and earnings dates, found with
// Google's Gemini API and Google Search grounding, stored in D1 and served
// at the paths the page already reads. Ported from bqe-backend's
// fetch_market_tape.py, which used Claude on GitHub Actions.
//
// The page makes no model calls — it renders these two documents and works
// out the on-air windows and countdowns in the browser:
//
//   /research/markettape/data/schedule.json  {updated, watchlist, events:[...]}
//   /research/markettape/data/results.json   {updated, results:{event_id: {...}}}

import type { Env } from "./env";
import { isoNow, jsonText, mapLimit } from "./http";
import { putDocument } from "./stack";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.7-flash";
const DEFAULT_WATCHLIST = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL"];
const MAX_RESULTS = 6;
// A first rundown built on demand (see serveTapeFile) is tried at most this
// often, so visitors cannot run up the Gemini quota while it keeps failing.
const BOOTSTRAP_EVERY_MS = 30 * 60_000;

// How long after its start an event still counts as "on air", per kind.
// Mirrors LIVE_WINDOW_MIN in the page.
const LIVE_WINDOW_MIN: Record<string, number> = { fed: 95, earnings: 80 };

const FILES: Record<string, string> = {
  "schedule.json": "markettape:schedule",
  "results.json": "markettape:results",
};

export interface TapeEvent {
  id: string;
  kind: "fed" | "earnings";
  title: string;
  org: string;
  date: string;
  timeET: string;
  releaseET?: string;
  ticker?: string;
  note: string;
  streamUrl: string;
  streamSource: string;
  streamKind: "video" | "audio" | "page";
  links: { label: string; url: string }[];
}

// --------------------------------------------------------------------------
// serving
// --------------------------------------------------------------------------

export async function serveTapeFile(request: Request, env: Env, ctx: ExecutionContext, file: string): Promise<Response> {
  const key = FILES[file];
  if (key) {
    try {
      const row = await readDoc(env, key);
      if (row) return jsonText(row, 200, { "Cache-Control": "public, max-age=300" });

      // No rundown yet — a fresh deploy, before the first scheduled run.
      // Build it now, while this visitor waits (about a minute), instead of
      // showing an empty board until 12:10 or 22:10 UTC.
      if (file === "schedule.json" && (await claimBootstrap(env, env.GEMINI_MODEL || DEFAULT_MODEL))) {
        const run = refreshTape(env, new Date(), { results: false });
        ctx.waitUntil(run); // finish even if the visitor leaves
        console.log("markettape: first rundown on demand:", await run);
        const fresh = await readDoc(env, key);
        if (fresh) return jsonText(fresh, 200, { "Cache-Control": "public, max-age=300" });
      }
    } catch (err) {
      console.warn("markettape: D1 read failed, serving the committed file", err);
    }
  }
  return env.ASSETS.fetch(request);
}

async function readDoc(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT body FROM documents WHERE key = ?").bind(key).first<{ body: string }>();
  return row?.body ?? null;
}

/**
 * Take the on-demand slot, unless a run with the same model started within
 * BOOTSTRAP_EVERY_MS. Atomic. A different model — the usual fix after a
 * failure — is tried straight away rather than after the pause.
 */
async function claimBootstrap(env: Env, model: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - BOOTSTRAP_EVERY_MS).toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO documents (key, body, updated) VALUES ('markettape:bootstrap', ?1, ?2)
     ON CONFLICT (key) DO UPDATE SET body = excluded.body, updated = excluded.updated
     WHERE documents.updated < ?3 OR documents.body <> excluded.body`,
  )
    .bind(model, isoNow(), cutoff)
    .run();
  return result.meta.changes > 0;
}

// --------------------------------------------------------------------------
// refresh (cron)
// --------------------------------------------------------------------------

export async function refreshTape(env: Env, now = new Date(), { results: withResults = true } = {}): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    return "GEMINI_API_KEY is not set — `npx wrangler secret put GEMINI_API_KEY`";
  }
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const ask = (prompt: string) => askGemini(env.GEMINI_API_KEY!, model, prompt);
  const watchlist = (env.MARKETTAPE_TICKERS || "").split(/\s+/).filter(Boolean);
  const tickers = watchlist.length ? watchlist : DEFAULT_WATCHLIST;
  const today = etDate(now);

  const [fed, earnings] = await Promise.all([ask(fedPrompt(today)), ask(earningsPrompt(today, tickers))]);
  const events: TapeEvent[] = [];
  for (const [kind, rows] of [["fed", fed], ["earnings", earnings]] as const) {
    if (!Array.isArray(rows)) {
      console.warn(`markettape: ${kind} lookup came back unusable`);
      continue;
    }
    rows.forEach((row, i) => {
      const event = cleanEvent(row, kind, i);
      if (event) events.push(event);
    });
  }
  if (!events.length) return "nothing usable came back — kept the existing schedule";

  events.sort((a, b) =>
    (a.date + (a.releaseET || a.timeET)).localeCompare(b.date + (b.releaseET || b.timeET)),
  );
  const stamp = isoNow();
  await putDocument(env, FILES["schedule.json"], JSON.stringify({ updated: stamp, watchlist: tickers, events }));
  // The on-demand first run skips the numbers, to answer sooner; the next
  // scheduled run fills them in.
  if (!withResults) return `${events.length} events (results on the next scheduled run)`;

  // Only events that have already started can have numbers attached.
  const due = events.filter((e) => started(e, now)).slice(0, MAX_RESULTS);
  let results: Record<string, unknown> = {};
  const previous = await env.DB.prepare("SELECT body FROM documents WHERE key = ?")
    .bind(FILES["results.json"])
    .first<{ body: string }>();
  if (previous) {
    try {
      results = JSON.parse(previous.body).results ?? {};
    } catch {
      results = {};
    }
  }

  const found = await mapLimit(due, 3, async (e) => [e.id, await ask(resultPrompt(e, today))] as const);
  for (const [id, data] of found) {
    if (data && typeof data === "object" && ["reported", "not_yet"].includes((data as any).status)) {
      results[id] = data;
    }
  }
  const live = new Set(events.map((e) => e.id));
  results = Object.fromEntries(Object.entries(results).filter(([id]) => live.has(id)));
  await putDocument(env, FILES["results.json"], JSON.stringify({ updated: stamp, results }));

  return `${events.length} events, ${Object.keys(results).length} results`;
}

/**
 * One search-grounded call that must come back as JSON. Google Search
 * grounding cannot be combined with a JSON response schema, so the prompt
 * asks for JSON and extractJson digs it out of the text.
 */
async function askGemini(key: string, model: string, prompt: string, retried = false): Promise<unknown> {
  const res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const problem = describeGeminiError(res.status, await res.text());
    console.warn(`markettape: gemini ${res.status} (${model}): ${problem.summary}`);
    // A short per-minute limit clears by itself: wait as long as Google
    // asks and try once more. A limit of 0 or a daily one will not.
    if (problem.retryAfterMs != null && !retried) {
      await new Promise((resolve) => setTimeout(resolve, problem.retryAfterMs!));
      return askGemini(key, model, prompt, true);
    }
    return null;
  }
  const body = await res.json<any>();
  const candidate = body?.candidates?.[0];
  if (!candidate?.content?.parts) {
    console.warn("markettape: no candidate", body?.promptFeedback?.blockReason ?? candidate?.finishReason);
    return null;
  }
  const text = candidate.content.parts.map((p: { text?: string }) => p.text ?? "").join("\n");
  return extractJson(text);
}

/**
 * The part of a Gemini error that says what to do about it. A 429 names the
 * exact quota that was hit and its size; "limit 0" means this model has no
 * free-tier allowance on this key at all, which no amount of waiting fixes.
 * Exported for tests.
 */
export function describeGeminiError(status: number, text: string): { summary: string; retryAfterMs: number | null } {
  let error: any;
  try {
    error = JSON.parse(text)?.error;
  } catch {
    return { summary: text.slice(0, 500), retryAfterMs: null };
  }
  const details: any[] = Array.isArray(error?.details) ? error.details : [];
  const violations: any[] = details.flatMap((d) => (Array.isArray(d?.violations) ? d.violations : []));
  const quotas = violations
    .filter((v) => v?.quotaId || v?.quotaMetric)
    .map((v) => `${v.quotaId || v.quotaMetric} limit ${v.quotaValue ?? "?"}`);
  const delay = details.find((d) => typeof d?.retryDelay === "string")?.retryDelay as string | undefined;
  const delayMs = delay && /^\d+(\.\d+)?s$/.test(delay) ? Math.ceil(parseFloat(delay) * 1000) : null;

  const noFreeTier = violations.some((v) => String(v?.quotaValue) === "0");
  const daily = violations.some((v) => /PerDay/i.test(String(v?.quotaId)));
  const parts = [error?.status || `HTTP ${status}`];
  if (quotas.length) parts.push(quotas.join("; "));
  if (noFreeTier) parts.push("this model has no free-tier quota on this key: pick another model or enable billing");
  else if (daily) parts.push("the daily quota is used up: it resets at midnight Pacific time");
  if (delay) parts.push(`retry after ${delay}`);
  if (!quotas.length && error?.message) parts.push(String(error.message).slice(0, 300));

  const retryable = status === 429 && !noFreeTier && !daily && delayMs != null && delayMs <= 60_000;
  return { summary: parts.join(" — "), retryAfterMs: retryable ? delayMs : null };
}

// --------------------------------------------------------------------------
// prompts — unchanged from the Python job apart from the search wording
// --------------------------------------------------------------------------

function fedPrompt(today: string): string {
  return `Today is ${today} (New York time). Search the web for scheduled Federal Reserve public events from ${today} through the next 10 days: FOMC decisions, the Chair's press conferences, congressional testimony, and speeches by the Chair, governors, or regional Fed presidents.

Return ONLY a compact JSON array, no prose, no markdown fences. Up to 6 items, sorted earliest first:
[{"id":"short-slug","kind":"fed","title":"FOMC rate decision","org":"Federal Reserve","date":"YYYY-MM-DD","timeET":"14:00","streamUrl":"https://...","streamSource":"federalreserve.gov","streamKind":"video","note":"under 10 words: what to watch","links":[{"label":"Calendar","url":"https://..."}]}]

Rules: timeET is 24-hour New York time. streamKind is "video" if it is a watchable broadcast, "audio" if listen-only, "page" if the link is just a calendar or document page. streamUrl and every link URL must be a real URL from the search results (prefer federalreserve.gov live pages or an official YouTube live URL). Never invent a URL. Up to 3 links per event.`;
}

function earningsPrompt(today: string, tickers: string[]): string {
  return `Today is ${today} (New York time). Search the web for confirmed earnings dates for these tickers in the next 21 days: ${tickers.join(", ")}.

Return ONLY a compact JSON array, no prose, no markdown fences. Up to 8 items, sorted earliest first, skip any ticker with no scheduled date:
[{"id":"short-slug","kind":"earnings","title":"Q3 FY26 results","org":"Company name","ticker":"XXXX","date":"YYYY-MM-DD","releaseET":"16:30","timeET":"17:00","streamUrl":"https://...","streamSource":"apple.com/investor","streamKind":"audio","note":"under 10 words: the number that matters","links":[{"label":"Webcast","url":"https://..."}]}]

Rules: releaseET is when the numbers hit the wire, timeET is when the call starts, both 24-hour New York time. streamKind is "video" only if there is a real video broadcast, "audio" for a listen-only webcast (most earnings calls), "page" if you only found an IR landing page. streamUrl and every link URL must be the company's own pages from the search results, not a third-party site. Never invent a URL. If the date is estimated rather than confirmed, start the note with "Est:".`;
}

function resultPrompt(event: TapeEvent, today: string): string {
  let who: string, shape: string;
  if (event.kind === "earnings") {
    who = `${event.org || event.ticker} (${event.ticker}) earnings scheduled ${event.date}`;
    shape = `"metrics":[{"label":"Adj. EPS","actual":"$1.42","estimate":"$1.28","verdict":"beat"}]  (up to 4: EPS, revenue, a segment or margin, guidance)`;
  } else {
    who = `the Federal Reserve event "${event.title}" scheduled ${event.date}`;
    shape = `"metrics":[{"label":"Target range","actual":"3.50-3.75%","estimate":"unchanged","verdict":"inline"}]  (up to 4: rate, vote split, dot-plot median, balance sheet)`;
  }
  return `Today is ${today} (New York time). Search the web for the outcome of ${who}.

Return ONLY compact JSON, no prose, no markdown fences:
{"status":"reported","headline":"one sentence, under 20 words","metrics":[...],"bullets":["under 15 words each, max 3"],"reaction":"price reaction in one short sentence, or empty string","asOf":"YYYY-MM-DD HH:MM ET"}

Where ${shape}
verdict is "beat", "miss", or "inline". Use "not_yet" for status if it has not happened or nothing has been published, and leave metrics empty. Write every field in your own words — do not quote source text.`;
}

// --------------------------------------------------------------------------
// shaping
// --------------------------------------------------------------------------

/** First balanced JSON array/object in a blob; salvages a truncated array. */
export function extractJson(raw: string): unknown {
  if (!raw) return null;
  let text = raw.replace(/```json/g, "").replace(/```/g, "").trim();
  const starts = [text.indexOf("["), text.indexOf("{")].filter((i) => i >= 0);
  if (!starts.length) return null;
  text = text.slice(Math.min(...starts));

  const opener = text[0];
  let depth = 0, inStr = false, esc = false, end = -1, lastItem = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 1 && opener === "[") lastItem = i;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const candidates = [];
  if (end > 0) candidates.push(text.slice(0, end + 1));
  if (opener === "[" && lastItem > 0) candidates.push(text.slice(0, lastItem + 1) + "]");
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try the next */
    }
  }
  return null;
}

const isHttp = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//.test(v);
const str = (v: unknown, max: number, fallback = "") => (v == null || v === "" ? fallback : String(v)).slice(0, max);

/** Keep only rows the page can actually place on a clock. */
export function cleanEvent(raw: any, kind: "fed" | "earnings", index: number): TapeEvent | null {
  if (!raw || typeof raw !== "object" || !raw.date || !raw.title) return null;
  const date = String(raw.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return null;

  const links = (Array.isArray(raw.links) ? raw.links : [])
    .filter((l: any) => l && isHttp(l.url))
    .map((l: any) => ({ label: str(l.label, 60, "Link"), url: l.url }))
    .slice(0, 4);

  const event: TapeEvent = {
    id: str(raw.id, 80, `${kind}-${index}`),
    kind,
    title: str(raw.title, 120),
    org: str(raw.org, 120),
    date,
    timeET: str(raw.timeET, 5, "09:00"),
    note: str(raw.note, 120),
    streamUrl: isHttp(raw.streamUrl) ? raw.streamUrl : "",
    streamSource: str(raw.streamSource, 80),
    streamKind: ["video", "audio", "page"].includes(raw.streamKind) ? raw.streamKind : "page",
    links,
  };
  if (kind === "earnings") {
    event.ticker = str(raw.ticker, 8).toUpperCase();
    if (raw.releaseET) event.releaseET = str(raw.releaseET, 5);
  }
  return event;
}

/** True once the wire time (or the call, if that is all we have) has passed. */
export function started(event: TapeEvent, now: Date): boolean {
  const clock = event.releaseET || event.timeET || "09:00";
  const [h, m] = clock.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  const start = etToUtc(event.date, h, m);
  if (Number.isNaN(start)) return false;
  const windowMs = (LIVE_WINDOW_MIN[event.kind] ?? 90) * 60_000 + 86_400_000;
  return start <= now.getTime() && now.getTime() <= start + windowMs;
}

/** Today's date in New York. */
export function etDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

/** Epoch ms of a New York wall-clock time, DST included. */
export function etToUtc(date: string, hour: number, minute: number): number {
  const guess = Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  if (Number.isNaN(guess)) return NaN;
  // Offset of New York from UTC at that instant, e.g. -240 minutes in summer.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return guess - (asIfUtc - guess);
}
