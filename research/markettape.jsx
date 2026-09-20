import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* ------------------------------------------------------------------ *
 *  MARKET TAPE — a broadcast rundown for Fed events and earnings.
 *  Data is pulled live at runtime via the Claude API + web search.
 * ------------------------------------------------------------------ */

const CSS = `
.tp-root{--ink:#10161f;--panel:#18202b;--panel2:#1e2836;--rule:#2b3644;--text:#dae2ee;
  --dim:#7d8ca2;--faint:#556377;--live:#e5484d;--arm:#e0a422;--beat:#3fb68b;--miss:#e5645d;
  --link:#8fb4e0;
  background:var(--ink);color:var(--text);min-height:100vh;
  font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;}
.tp-mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  font-variant-numeric:tabular-nums;}
.tp-wrap{max-width:1240px;margin:0 auto;padding:0 16px 64px;}

/* header */
.tp-head{position:sticky;top:0;z-index:20;background:rgba(16,22,31,.94);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--rule);margin:0 -16px 20px;padding:14px 16px;}
.tp-headrow{display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap;
  max-width:1240px;margin:0 auto;}
.tp-brand{font-size:19px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;line-height:1;}
.tp-brand span{color:var(--dim);font-weight:400;}
.tp-sub{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin-top:6px;}
.tp-spacer{flex:1 1 40px;}
.tp-clockbox{text-align:right;}
.tp-cue{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);}
.tp-count{font-size:24px;letter-spacing:.04em;line-height:1.1;margin-top:2px;}
.tp-count.tp-hot{color:var(--live);}
.tp-hair{height:2px;background:var(--rule);margin-top:8px;overflow:hidden;}
.tp-hair i{display:block;height:100%;background:var(--arm);transition:width .6s linear;}

/* buttons */
.tp-btn{background:transparent;color:var(--text);border:1px solid var(--rule);
  padding:8px 13px;font-size:11px;letter-spacing:.13em;text-transform:uppercase;cursor:pointer;
  font-family:inherit;border-radius:2px;transition:border-color .15s,color .15s,background .15s;}
.tp-btn:hover:not(:disabled){border-color:var(--arm);color:var(--arm);}
.tp-btn:disabled{opacity:.45;cursor:default;}
.tp-btn:focus-visible,.tp-row:focus-visible,.tp-x:focus-visible,.tp-in:focus-visible{
  outline:2px solid var(--arm);outline-offset:2px;}
.tp-btn-go{border-color:var(--live);color:#fff;background:var(--live);font-weight:600;}
.tp-btn-go:hover:not(:disabled){background:#c93a3f;border-color:#c93a3f;color:#fff;}

/* layout */
.tp-grid{display:grid;grid-template-columns:minmax(0,360px) minmax(0,1fr);gap:22px;align-items:start;}
@media(max-width:920px){.tp-grid{grid-template-columns:1fr;}
  .tp-stage{order:-1;} }

/* section label */
.tp-lab{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--faint);
  display:flex;align-items:center;gap:9px;margin:0 0 9px;}
.tp-lab:after{content:"";flex:1;height:1px;background:var(--rule);}

/* rundown */
.tp-list{border-top:1px solid var(--rule);}
.tp-row{display:grid;grid-template-columns:15px 58px minmax(0,1fr);gap:11px;align-items:start;
  width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--rule);
  padding:11px 6px;cursor:pointer;color:inherit;font-family:inherit;
  border-left:2px solid transparent;transition:background .14s;}
.tp-row:hover{background:var(--panel);}
.tp-row.tp-on{background:var(--panel2);border-left-color:var(--arm);}
.tp-day{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--faint);
  padding:14px 6px 6px;}
.tp-lamp{width:9px;height:9px;border-radius:50%;background:var(--faint);margin-top:5px;flex:none;}
.tp-lamp.l-live{background:var(--live);box-shadow:0 0 0 0 rgba(229,72,77,.7);
  animation:tp-pulse 1.6s infinite;}
.tp-lamp.l-next{background:var(--arm);}
.tp-lamp.l-done{background:transparent;border:1px solid var(--faint);}
@keyframes tp-pulse{70%{box-shadow:0 0 0 7px rgba(229,72,77,0);}100%{box-shadow:0 0 0 0 rgba(229,72,77,0);}}
@media(prefers-reduced-motion:reduce){.tp-lamp.l-live{animation:none;}}
.tp-time{font-size:13px;color:var(--text);line-height:1.35;}
.tp-time em{display:block;font-style:normal;font-size:9.5px;letter-spacing:.14em;color:var(--faint);}
.tp-ttl{font-size:13.5px;line-height:1.4;}
.tp-meta{font-size:11px;color:var(--dim);margin-top:3px;line-height:1.45;}
.tp-tick{font-weight:700;letter-spacing:.06em;}
.tp-tag{font-size:9px;letter-spacing:.16em;text-transform:uppercase;border:1px solid var(--rule);
  padding:1px 5px;color:var(--dim);margin-left:7px;vertical-align:1px;white-space:nowrap;}
.tp-tag.t-live{border-color:var(--live);color:var(--live);}

/* stage */
.tp-stage{min-width:0;}
.tp-panel{background:var(--panel);border:1px solid var(--rule);}
.tp-vid{position:relative;width:100%;aspect-ratio:16/9;background:#0a0e14;
  display:flex;align-items:center;justify-content:center;text-align:center;padding:22px;}
.tp-vid iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}
.tp-vidmsg{max-width:340px;}
.tp-vidmsg p{font-size:12px;color:var(--dim);line-height:1.65;margin:0 0 14px;}
.tp-stagehd{padding:14px 16px;border-bottom:1px solid var(--rule);
  display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
.tp-stagehd h2{margin:0;font-size:16px;font-weight:600;line-height:1.35;}
.tp-body{padding:16px;}

/* readout */
.tp-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));
  gap:1px;background:var(--rule);border:1px solid var(--rule);margin:0 0 14px;}
.tp-m{background:var(--panel);padding:11px 12px;}
.tp-m-lab{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);}
.tp-m-val{font-size:21px;margin-top:5px;letter-spacing:-.01em;}
.tp-m-est{font-size:11px;color:var(--dim);margin-top:3px;}
.v-beat{color:var(--beat);} .v-miss{color:var(--miss);} .v-inline{color:var(--text);}
.tp-hl{font-size:14px;line-height:1.55;margin:0 0 13px;}
.tp-bul{margin:0;padding:0;list-style:none;}
.tp-bul li{font-size:12.5px;line-height:1.6;color:var(--dim);padding-left:15px;position:relative;
  margin-bottom:6px;}
.tp-bul li:before{content:"";position:absolute;left:0;top:8px;width:6px;height:1px;background:var(--faint);}
.tp-react{margin-top:13px;padding-top:12px;border-top:1px solid var(--rule);
  font-size:12.5px;line-height:1.6;color:var(--dim);}
.tp-asof{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-top:14px;}

/* watchlist */
.tp-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
.tp-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--rule);
  padding:4px 6px 4px 9px;font-size:11.5px;letter-spacing:.07em;font-weight:600;}
.tp-x{background:none;border:0;color:var(--faint);cursor:pointer;font-size:14px;line-height:1;
  padding:0 2px;font-family:inherit;}
.tp-x:hover{color:var(--live);}
.tp-in{background:var(--ink);border:1px solid var(--rule);color:var(--text);padding:5px 8px;
  font-size:11.5px;width:88px;font-family:inherit;letter-spacing:.07em;text-transform:uppercase;}
.tp-in::placeholder{color:var(--faint);letter-spacing:.06em;}

/* misc */
.tp-note{font-size:11.5px;line-height:1.6;color:var(--faint);}
.tp-a{color:var(--link);text-decoration:none;border-bottom:1px solid rgba(143,180,224,.35);}
.tp-a:hover{border-bottom-color:var(--link);}
.tp-err{border:1px solid var(--live);background:rgba(229,72,77,.08);padding:11px 13px;
  font-size:12px;line-height:1.6;margin-bottom:14px;}
.tp-empty{padding:34px 20px;text-align:center;color:var(--faint);font-size:12.5px;line-height:1.7;}
.tp-chan{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1px;
  background:var(--rule);border:1px solid var(--rule);}
.tp-chan a{background:var(--panel);padding:12px 13px;text-decoration:none;color:var(--text);
  display:block;transition:background .14s;}
.tp-chan a:hover{background:var(--panel2);}
.tp-chan b{font-size:12.5px;font-weight:600;display:block;}
.tp-chan span{font-size:11px;color:var(--faint);display:block;margin-top:3px;line-height:1.5;}
.tp-tabs{display:flex;gap:0;border:1px solid var(--rule);margin-bottom:12px;}
.tp-tab{flex:1;background:transparent;border:0;border-right:1px solid var(--rule);color:var(--dim);
  padding:7px 4px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;
  font-family:inherit;transition:background .14s,color .14s;}
.tp-tab:last-child{border-right:0;}
.tp-tab:hover{color:var(--text);}
.tp-tab[aria-pressed="true"]{background:var(--panel2);color:var(--arm);}
.tp-tab:focus-visible{outline:2px solid var(--arm);outline-offset:-2px;}
.tp-kind{display:inline-flex;align-items:center;gap:6px;font-size:9.5px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--faint);border:1px solid var(--rule);padding:3px 7px;}
.tp-kind b{color:var(--text);font-weight:600;letter-spacing:.16em;}
.tp-links{display:flex;flex-direction:column;gap:1px;background:var(--rule);
  border:1px solid var(--rule);margin-top:14px;}
.tp-links a{background:var(--panel);padding:9px 12px;text-decoration:none;color:var(--text);
  font-size:12px;display:flex;justify-content:space-between;gap:12px;align-items:baseline;
  transition:background .14s;}
.tp-links a:hover{background:var(--panel2);}
.tp-links a span{color:var(--faint);font-size:10px;letter-spacing:.13em;text-transform:uppercase;
  white-space:nowrap;}
.tp-rel{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--arm);
  display:block;margin-top:3px;}
.tp-toggle{display:inline-flex;align-items:center;gap:7px;font-size:10px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--dim);cursor:pointer;}
.tp-toggle input{accent-color:var(--arm);width:13px;height:13px;}
.tp-load{display:inline-block;width:8px;height:8px;background:var(--arm);margin-right:8px;
  animation:tp-blink 1s steps(2) infinite;vertical-align:0;}
@keyframes tp-blink{50%{opacity:.15;}}
@media(prefers-reduced-motion:reduce){.tp-load{animation:none;}}
`;

/* ---------------------------- time helpers ---------------------------- */

const TZ = "America/New_York";

function tzParts(ts) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  });
  const o = {};
  f.formatToParts(new Date(ts)).forEach((p) => { o[p.type] = p.value; });
  return o;
}
function tzOffsetMin(ts) {
  const p = tzParts(ts);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day,
    p.hour === "24" ? 0 : +p.hour, +p.minute, +p.second);
  return (asUTC - ts) / 60000;
}
/** Turn a New-York wall-clock date+time into a real timestamp. */
function etToTs(dateISO, hhmm) {
  if (!dateISO) return null;
  const [y, m, d] = String(dateISO).split("-").map(Number);
  if (!y || !m || !d) return null;
  const [hh, mi] = String(hhmm || "09:00").split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh || 0, mi || 0);
  let ts = naive - tzOffsetMin(naive) * 60000;
  ts = naive - tzOffsetMin(ts) * 60000;
  return ts;
}
function etToday(now) {
  const p = tzParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}
function etClock(now) {
  const p = tzParts(now);
  return `${p.hour}:${p.minute}:${p.second}`;
}
function dayLabel(dateISO, now) {
  const today = etToday(now);
  if (dateISO === today) return "Today";
  const t = etToTs(dateISO, "12:00");
  if (dateISO === etToday(now + 86400000)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", month: "short", day: "numeric",
  }).format(new Date(t));
}
function countdown(ms) {
  if (ms == null) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return (d > 0 ? `${d}d ` : "") + `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/* ------------------------- json from model text ------------------------- */

function collectText(data) {
  if (!data || !Array.isArray(data.content)) return "";
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
/** Pull the first balanced JSON array/object out of a blob; salvage truncation. */
function extractJSON(raw) {
  if (!raw) return null;
  let s = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = s.search(/[[{]/);
  if (start < 0) return null;
  s = s.slice(start);
  const open = s[0], close = open === "[" ? "]" : "}";
  let depth = 0, inStr = false, esc = false, end = -1, lastItem = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 1 && open === "[") lastItem = i;
      if (depth === 0) { end = i; break; }
    }
  }
  const tryParse = (t) => { try { return JSON.parse(t); } catch { return null; } };
  if (end > 0) return tryParse(s.slice(0, end + 1));
  if (open === "[" && lastItem > 0) return tryParse(s.slice(0, lastItem + 1) + "]");
  return null;
}

async function askClaude(prompt, { search = true } = {}) {
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  };
  if (search) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status}). Try again in a moment.`);
  const data = await res.json();
  const parsed = extractJSON(collectText(data));
  if (!parsed) throw new Error("The response came back unreadable. Refresh to retry.");
  return parsed;
}

/* ------------------------------ constants ------------------------------ */

const DEFAULT_WATCHLIST = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL"];

const CHANNELS = [
  { name: "Federal Reserve", url: "https://www.federalreserve.gov/live-broadcast.htm",
    note: "Official feed: FOMC pressers, testimony, board meetings" },
  { name: "Bloomberg Television", url: "https://www.youtube.com/@markets/streams",
    note: "Rolling markets coverage, 24h" },
  { name: "Yahoo Finance", url: "https://www.youtube.com/@YahooFinance/streams",
    note: "Opening bell through the close" },
  { name: "Schwab Network", url: "https://www.youtube.com/@SchwabNetwork/streams",
    note: "Desk commentary during the cash session" },
];

// Used only if the live fetch fails outright.
const SEED = [
  { id: "fomc-sep-2026-decision", kind: "fed", title: "FOMC rate decision",
    org: "Federal Open Market Committee", date: "2026-09-16", timeET: "14:00",
    streamUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendar.htm",
    streamSource: "federalreserve.gov", streamKind: "page",
    note: "Statement plus the quarterly dot plot." },
  { id: "fomc-sep-2026-presser", kind: "fed", title: "Chair press conference",
    org: "Federal Reserve", date: "2026-09-16", timeET: "14:30",
    streamUrl: "https://www.federalreserve.gov/live-broadcast.htm",
    streamSource: "federalreserve.gov", streamKind: "video",
    note: "Q&A usually moves the front end more than the statement." },
];

const LIVE_WINDOW_MIN = { fed: 95, earnings: 80 };

/* ------------------------------ prompts ------------------------------ */

function fedPrompt(today) {
  return `Today is ${today} (New York time). Search the web for scheduled Federal Reserve public events from ${today} through the next 10 days: FOMC decisions, the Chair's press conferences, congressional testimony, and speeches by the Chair, governors, or regional Fed presidents.

Return ONLY a compact JSON array, no prose, no markdown fences. Up to 6 items, sorted earliest first:
[{"id":"short-slug","kind":"fed","title":"FOMC rate decision","org":"Federal Reserve","date":"YYYY-MM-DD","timeET":"14:00","streamUrl":"https://...","streamSource":"federalreserve.gov","streamKind":"video","note":"under 10 words: what to watch"}]

Rules: timeET is 24-hour New York time. streamKind is "video" if it is a watchable broadcast, "audio" if listen-only, "page" if the link is just a calendar or document page. streamUrl must be a real URL you saw in the search results (prefer federalreserve.gov live pages or an official YouTube live URL). Never invent a URL.`;
}

function earningsPrompt(today, tickers) {
  return `Today is ${today} (New York time). Search the web for confirmed earnings dates for these tickers in the next 21 days: ${tickers.join(", ")}.

Return ONLY a compact JSON array, no prose, no markdown fences. Up to 6 items, sorted earliest first, skip any ticker with no scheduled date:
[{"id":"short-slug","kind":"earnings","title":"Q3 FY26 results","org":"Company name","ticker":"XXXX","date":"YYYY-MM-DD","releaseET":"16:30","timeET":"17:00","streamUrl":"https://...","streamSource":"apple.com/investor","streamKind":"audio","note":"under 10 words: the number that matters"}]

Rules: releaseET is when the numbers hit the wire, timeET is when the call starts, both 24-hour New York time. streamKind is "video" only if there is a real video broadcast, "audio" for a listen-only webcast (most earnings calls), "page" if you only found an IR landing page. streamUrl must be the company's own webcast page from the search results, not a third-party site. Never invent a URL. If the date is estimated rather than confirmed, start the note with "Est:".`;
}

function streamPrompt(ev) {
  const who = ev.kind === "earnings"
    ? `${ev.org || ev.ticker} (${ev.ticker}) earnings on ${ev.date}`
    : `the Federal Reserve event "${ev.title}" on ${ev.date}`;
  return `Search the web for how to follow ${who} live.

Return ONLY compact JSON, no prose, no markdown fences:
{"streamUrl":"https://...","streamSource":"host domain","streamKind":"video","links":[{"label":"Live webcast","url":"https://..."},{"label":"Press release","url":"https://..."}]}

Include up to 4 links: the official live webcast, the press-release or newsroom page, the investor-relations or Fed calendar page, and a live blog or broadcast covering it. Every URL must be one you saw in the search results — never construct or guess one. streamKind is "video", "audio" or "page" for the main streamUrl.`;
}

function resultPrompt(ev, today) {
  const who = ev.kind === "earnings"
    ? `${ev.org || ev.ticker} (${ev.ticker}) earnings scheduled ${ev.date}`
    : `the Federal Reserve event "${ev.title}" scheduled ${ev.date}`;
  const shape = ev.kind === "earnings"
    ? `"metrics":[{"label":"Adj. EPS","actual":"$1.42","estimate":"$1.28","verdict":"beat"}]  (up to 4: EPS, revenue, a segment or margin, guidance)`
    : `"metrics":[{"label":"Target range","actual":"3.50-3.75%","estimate":"unchanged","verdict":"inline"}]  (up to 4: rate, vote split, dot-plot median, balance sheet)`;
  return `Today is ${today} (New York time). Search the web for the outcome of ${who}.

Return ONLY compact JSON, no prose, no markdown fences:
{"status":"reported","headline":"one sentence, under 20 words","metrics":[...],"bullets":["under 15 words each, max 3"],"reaction":"price reaction in one short sentence, or empty string","asOf":"YYYY-MM-DD HH:MM ET"}

Where ${shape}
verdict is "beat", "miss", or "inline". Use "not_yet" for status if it has not happened or nothing has been published, and leave metrics empty. Write every field in your own words — do not quote source text.`;
}

/* ------------------------------ component ------------------------------ */

export default function MarketTape() {
  const [now, setNow] = useState(() => Date.now());
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [draft, setDraft] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [warn, setWarn] = useState("");
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState({});
  const [embed, setEmbed] = useState(false);
  const [filter, setFilter] = useState("all");
  const [auto, setAuto] = useState(true);
  const [finding, setFinding] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* restore watchlist */
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("tape:watchlist");
        const v = r && JSON.parse(r.value);
        if (Array.isArray(v) && v.length) setWatchlist(v);
      } catch { /* first run, keep defaults */ }
    })();
  }, []);

  const saveWatchlist = useCallback((list) => {
    setWatchlist(list);
    window.storage.set("tape:watchlist", JSON.stringify(list)).catch(() => {});
  }, []);

  /* ------------------------- load the rundown ------------------------- */
  const load = useCallback(async (tickers) => {
    setLoading(true);
    setWarn("");
    const today = etToday(Date.now());
    const [fed, earn] = await Promise.allSettled([
      askClaude(fedPrompt(today)),
      tickers.length ? askClaude(earningsPrompt(today, tickers)) : Promise.resolve([]),
    ]);
    const out = [];
    const misses = [];
    for (const [res, label] of [[fed, "Fed events"], [earn, "earnings dates"]]) {
      if (res.status === "fulfilled" && Array.isArray(res.value)) out.push(...res.value);
      else misses.push(label);
    }
    const clean = out
      .filter((e) => e && e.date && e.title)
      .map((e, i) => normalize(e, i))
      .filter((e) => e.ts)
      .sort((a, b) => a.ts - b.ts);

    if (!clean.length) {
      setEvents(SEED.map(normalize));
      setWarn("Live lookup came back empty. Showing the scheduled FOMC dates only — hit Refresh to try again.");
    } else {
      setEvents(clean);
      if (misses.length) setWarn(`Couldn't load ${misses.join(" or ")}. The rest of the rundown is current.`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    load(DEFAULT_WATCHLIST);
  }, [load]);

  /* --------------------------- derived state --------------------------- */
  const statusOf = useCallback((ev) => {
    const start = Math.min(ev.ts, ev.releaseTs || ev.ts);
    const end = ev.ts + (LIVE_WINDOW_MIN[ev.kind] || 90) * 60000;
    if (now >= start && now < end) return "live";
    if (now >= end) return "done";
    return "scheduled";
  }, [now]);

  const shown = useMemo(() => events.filter((e) =>
    filter === "all" ? true
      : filter === "live" ? statusOf(e) !== "scheduled"
        : e.kind === filter), [events, filter, statusOf]);

  const liveCount = useMemo(
    () => events.filter((e) => statusOf(e) === "live").length, [events, statusOf]);

  const next = useMemo(() => {
    const live = events.find((e) => statusOf(e) === "live");
    if (live) return { ev: live, live: true, at: live.ts };
    const up = events.find((e) => Math.min(e.ts, e.releaseTs || e.ts) > now);
    return up ? { ev: up, live: false, at: Math.min(up.ts, up.releaseTs || up.ts) } : null;
  }, [events, now, statusOf]);

  const hairPct = useMemo(() => {
    if (!next || next.live) return 100;
    const span = 3 * 3600000;
    const left = next.at - now;
    return left > span ? 4 : Math.max(4, 100 - (left / span) * 100);
  }, [next, now]);

  const sel = useMemo(
    () => events.find((e) => e.id === selected) || null, [events, selected]);

  useEffect(() => { setEmbed(false); }, [selected]);

  /* ---------------------------- fetch result ---------------------------- */
  const fetchResult = useCallback(async (ev) => {
    setResults((r) => ({ ...r, [ev.id]: { loading: true } }));
    try {
      const data = await askClaude(resultPrompt(ev, etToday(Date.now())));
      setResults((r) => ({ ...r, [ev.id]: { loading: false, data } }));
    } catch (err) {
      setResults((r) => ({ ...r, [ev.id]: { loading: false, error: err.message } }));
    }
  }, []);

  /* ------------------- find a better stream for one row ------------------- */
  const findStream = useCallback(async (ev) => {
    setFinding(true);
    try {
      const d = await askClaude(streamPrompt(ev));
      setEvents((list) => list.map((e) => e.id !== ev.id ? e : normalize({
        ...e,
        streamUrl: d.streamUrl || e.streamUrl,
        streamSource: d.streamSource || e.streamSource,
        streamKind: d.streamKind || e.streamKind,
        links: Array.isArray(d.links) ? d.links : e.links,
      }, 0)));
    } catch {
      setWarn("Couldn't find extra links for that event. The original link still works.");
    }
    setFinding(false);
  }, []);

  /* ------------- auto-refresh the readout while an event is on ------------- */
  const selLive = sel ? statusOf(sel) !== "scheduled" : false;
  useEffect(() => {
    if (!auto || !sel || !selLive) return;
    fetchResult(sel);
    const t = setInterval(() => fetchResult(sel), 90000);
    return () => clearInterval(t);
  }, [auto, sel && sel.id, selLive, fetchResult]); // eslint-disable-line

  const addTicker = () => {
    const t = draft.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    if (!t || watchlist.includes(t) || watchlist.length >= 12) { setDraft(""); return; }
    const list = [...watchlist, t];
    setDraft("");
    saveWatchlist(list);
    load(list);
  };
  const dropTicker = (t) => {
    const list = watchlist.filter((x) => x !== t);
    saveWatchlist(list);
    load(list);
  };

  /* ------------------------------ render ------------------------------ */
  const rows = [];
  let lastDay = null;
  shown.forEach((ev) => {
    if (ev.date !== lastDay) {
      lastDay = ev.date;
      rows.push(<div className="tp-day tp-mono" key={`d-${ev.date}`}>{dayLabel(ev.date, now)}</div>);
    }
    const st = statusOf(ev);
    const isNext = next && !next.live && next.ev.id === ev.id;
    rows.push(
      <button key={ev.id} className={`tp-row${selected === ev.id ? " tp-on" : ""}`}
        onClick={() => setSelected(ev.id)} aria-pressed={selected === ev.id}>
        <span className={`tp-lamp ${st === "live" ? "l-live" : st === "done" ? "l-done" : isNext ? "l-next" : ""}`} />
        <span className="tp-time tp-mono">
          {ev.releaseET || ev.timeET || "--:--"}<em>ET</em>
        </span>
        <span>
          <span className="tp-ttl">
            {ev.ticker && <span className="tp-tick tp-mono">{ev.ticker} </span>}
            {ev.title}
            {st === "live" && <span className="tp-tag t-live">On air</span>}
            {st === "done" && <span className="tp-tag">Done</span>}
          </span>
          <span className="tp-meta">{ev.org}{ev.note ? ` · ${ev.note}` : ""}</span>
          {ev.releaseET && ev.timeET && ev.releaseET !== ev.timeET && (
            <span className="tp-rel tp-mono">
              Numbers {ev.releaseET} · call {ev.timeET}
            </span>
          )}
        </span>
      </button>
    );
  });

  const vid = sel ? youtubeId(sel.streamUrl) : null;
  const r = sel ? results[sel.id] : null;

  return (
    <div className="tp-root">
      <style>{CSS}</style>

      <header className="tp-head">
        <div className="tp-headrow">
          <div>
            <div className="tp-brand">Market <span>Tape</span></div>
            <div className="tp-sub tp-mono">
              {etClock(now)} ET · {liveCount ? `${liveCount} on air` : "nothing on air"} · {events.length} scheduled
            </div>
          </div>
          <div className="tp-spacer" />
          <div className="tp-clockbox">
            <div className="tp-cue">{next ? (next.live ? "On air now" : "Next up") : "Standing by"}</div>
            <div className={`tp-count tp-mono${next && next.live ? " tp-hot" : ""}`}>
              {next ? (next.live ? "LIVE" : `T− ${countdown(next.at - now)}`) : "—"}
            </div>
            <div className="tp-cue" style={{ marginTop: 4 }}>
              {next ? `${next.ev.ticker ? next.ev.ticker + " · " : ""}${next.ev.title}` : "No events loaded"}
            </div>
          </div>
          <button className="tp-btn" onClick={() => load(watchlist)} disabled={loading}>
            {loading ? "Loading" : "Refresh"}
          </button>
        </div>
        <div className="tp-hair"><i style={{ width: `${hairPct}%` }} /></div>
      </header>

      <div className="tp-wrap">
        {warn && <div className="tp-err">{warn}</div>}

        <div className="tp-grid">
          {/* ----------------------- rundown ----------------------- */}
          <section>
            <h2 className="tp-lab">Rundown</h2>
            <div className="tp-tabs">
              {[["all", "All"], ["live", "On air"], ["fed", "Fed"], ["earnings", "Earnings"]]
                .map(([k, label]) => (
                  <button key={k} className="tp-tab" aria-pressed={filter === k}
                    onClick={() => setFilter(k)}>{label}</button>
                ))}
            </div>
            <div className="tp-list">
              {loading && !events.length
                ? <div className="tp-empty"><span className="tp-load" />Searching for scheduled events…</div>
                : rows.length ? rows
                : <div className="tp-empty">
                    {filter === "all"
                      ? "Nothing scheduled in the window. Add a ticker or refresh."
                      : "Nothing here right now. Switch back to All to see the full rundown."}
                  </div>}
            </div>

            <h2 className="tp-lab" style={{ marginTop: 26 }}>Watchlist</h2>
            <div className="tp-chips">
              {watchlist.map((t) => (
                <span className="tp-chip tp-mono" key={t}>
                  {t}
                  <button className="tp-x" onClick={() => dropTicker(t)} aria-label={`Remove ${t}`}>×</button>
                </span>
              ))}
              <input className="tp-in tp-mono" value={draft} placeholder="Ticker"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTicker(); }} />
              <button className="tp-btn" onClick={addTicker} disabled={!draft.trim()}>Add</button>
            </div>
            <p className="tp-note" style={{ marginTop: 10 }}>
              Adding or removing a ticker reloads the rundown. Saved between sessions.
            </p>
          </section>

          {/* ------------------------ stage ------------------------ */}
          <section className="tp-stage">
            <h2 className="tp-lab">Stage</h2>
            {!sel ? (
              <div className="tp-panel tp-empty">
                Pick a row from the rundown to open its stream and results.
              </div>
            ) : (
              <div className="tp-panel">
                <div className="tp-stagehd">
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <h2>{sel.ticker ? `${sel.ticker} — ` : ""}{sel.title}</h2>
                    <div className="tp-meta tp-mono" style={{ marginTop: 5 }}>
                      {dayLabel(sel.date, now)} · {sel.releaseET
                        ? `numbers ${sel.releaseET} ET, call ${sel.timeET} ET`
                        : `${sel.timeET} ET`} · {sel.org}
                      {statusOf(sel) === "live" ? " · ON AIR" : ""}
                    </div>
                    <div style={{ marginTop: 9 }}>
                      <span className="tp-kind">Feed <b>{KINDS[sel.streamKind]}</b></span>
                    </div>
                  </div>
                  {sel.streamUrl && (
                    <a className="tp-btn tp-btn-go" href={sel.streamUrl}
                      target="_blank" rel="noopener noreferrer"
                      style={{ textDecoration: "none", display: "inline-block" }}>
                      Open live stream ↗
                    </a>
                  )}
                </div>

                <div className="tp-vid">
                  {embed && vid ? (
                    <iframe src={`https://www.youtube.com/embed/${vid}`} title="Live stream"
                      allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
                  ) : (
                    <div className="tp-vidmsg">
                      <p>
                        {vid
                          ? "Video feed — it can play right here."
                          : sel.streamKind === "audio"
                            ? `Listen-only webcast on ${sel.streamSource || "the company site"}. Audio calls can't play inside this app, so the button above opens the real feed.`
                            : sel.streamUrl
                              ? `Hosted on ${sel.streamSource || "the source site"}, which only plays in its own tab.`
                              : "No feed found yet for this event."}
                      </p>
                      {vid && <button className="tp-btn" onClick={() => setEmbed(true)}>Play here</button>}
                      {!vid && (
                        <button className="tp-btn" onClick={() => findStream(sel)} disabled={finding}>
                          {finding ? "Searching" : "Find stream & links"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!!sel.links.length && (
                  <div className="tp-links">
                    {sel.links.map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                        {l.label || "Link"}
                        <span>{hostOf(l.url)} ↗</span>
                      </a>
                    ))}
                  </div>
                )}

                <div className="tp-body">
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <h3 className="tp-lab" style={{ margin: 0, flex: 1 }}>Result</h3>
                    <label className="tp-toggle">
                      <input type="checkbox" checked={auto}
                        onChange={(e) => setAuto(e.target.checked)} />
                      Auto
                    </label>
                  </div>
                  {!r && (
                    <>
                      <p className="tp-note" style={{ marginBottom: 12 }}>
                        {statusOf(sel) === "scheduled"
                          ? "Not out yet. Check back once the release lands — the numbers appear here."
                          : "Pull the reported numbers and the market reaction."}
                      </p>
                      <button className="tp-btn" onClick={() => fetchResult(sel)}>Get result</button>
                    </>
                  )}
                  {r?.loading && <div className="tp-note"><span className="tp-load" />Searching for the numbers…</div>}
                  {r?.error && (
                    <div className="tp-err">
                      {r.error}{" "}
                      <button className="tp-btn" style={{ marginTop: 9 }}
                        onClick={() => fetchResult(sel)}>Try again</button>
                    </div>
                  )}
                  {r?.data && <Readout d={r.data} onRetry={() => fetchResult(sel)} />}
                </div>
              </div>
            )}

            <h2 className="tp-lab" style={{ marginTop: 26 }}>Always-on channels</h2>
            <div className="tp-chan">
              {CHANNELS.map((c) => (
                <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer">
                  <b>{c.name}</b><span>{c.note}</span>
                </a>
              ))}
            </div>
            <p className="tp-note" style={{ marginTop: 12 }}>
              Schedules, links and figures are pulled from live web search and can be wrong or stale.
              Confirm anything you trade on against the primary source.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ subviews ------------------------------ */

function Readout({ d, onRetry }) {
  if (d.status === "not_yet") {
    return (
      <>
        <p className="tp-note" style={{ marginBottom: 12 }}>
          Nothing published yet. {d.headline || ""}
        </p>
        <button className="tp-btn" onClick={onRetry}>Check again</button>
      </>
    );
  }
  const metrics = Array.isArray(d.metrics) ? d.metrics.slice(0, 4) : [];
  const bullets = Array.isArray(d.bullets) ? d.bullets.slice(0, 4) : [];
  return (
    <>
      {d.headline && <p className="tp-hl">{d.headline}</p>}
      {!!metrics.length && (
        <div className="tp-metrics">
          {metrics.map((m, i) => (
            <div className="tp-m" key={i}>
              <div className="tp-m-lab">{m.label}</div>
              <div className={`tp-m-val tp-mono v-${["beat", "miss"].includes(m.verdict) ? m.verdict : "inline"}`}>
                {m.actual || "—"}
              </div>
              {m.estimate && <div className="tp-m-est tp-mono">est. {m.estimate}</div>}
            </div>
          ))}
        </div>
      )}
      {!!bullets.length && (
        <ul className="tp-bul">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
      )}
      {d.reaction && <div className="tp-react">{d.reaction}</div>}
      <div className="tp-asof tp-mono">
        {d.asOf ? `As of ${d.asOf}` : "Timestamp unavailable"}
        {" · "}
        <button className="tp-x" style={{ color: "var(--link)", fontSize: 10, letterSpacing: ".14em" }}
          onClick={onRetry}>REFRESH</button>
      </div>
    </>
  );
}

const KINDS = { video: "Video", audio: "Audio only", page: "No live feed" };

function normalize(e, i) {
  const kind = e.kind === "earnings" ? "earnings" : "fed";
  const links = (Array.isArray(e.links) ? e.links : [])
    .filter((l) => l && l.url && /^https?:\/\//.test(l.url))
    .slice(0, 4);
  const streamKind = KINDS[e.streamKind] ? e.streamKind : (e.streamUrl ? "page" : "page");
  return {
    ...e,
    id: e.id || `${kind}-${i}`,
    kind,
    links,
    streamKind,
    ts: etToTs(e.date, e.timeET),
    releaseTs: e.releaseET ? etToTs(e.date, e.releaseET) : null,
  };
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "link"; }
}

function youtubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
