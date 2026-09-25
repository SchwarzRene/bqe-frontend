// The journal's data and rules, running in the browser. Ported from the
// Python backend (symbols.py, trades.py, pnl.py, stats.py, journal.py,
// drawings.py, validators.py, trade_chart.py) so a guest can use the whole
// app with nothing stored anywhere. For a signed-in user, api.js saves the
// document this module keeps to their account.
//
// Everything here is pure: it takes the document and returns results or
// throws ValidationError / NotFoundError. No network, no storage.

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

export const DEFAULT_POINT_VALUES = { forex: 100000, index: 1, stock: 1, crypto: 1, commodity: 100, other: 1 };
const ASSET_CLASSES = Object.keys(DEFAULT_POINT_VALUES);

/** An empty journal. The whole document is what gets saved. */
export function emptyDb() {
  return { v: 1, next: { symbol: 1, trade: 1, entry: 1 }, symbols: [], trades: [], entries: [], links: [], drawings: {} };
}

/** Accept a saved document, or start empty if it is not one. */
export function loadDb(data) {
  const db = emptyDb();
  if (!data || typeof data !== "object" || data.v !== 1) return db;
  for (const key of ["symbols", "trades", "entries", "links"]) if (Array.isArray(data[key])) db[key] = data[key];
  if (data.drawings && typeof data.drawings === "object") db.drawings = data.drawings;
  if (data.next && typeof data.next === "object") Object.assign(db.next, data.next);
  // Never hand out an id that is already taken, whatever `next` says.
  const max = (rows) => rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
  db.next.symbol = Math.max(db.next.symbol, max(db.symbols) + 1);
  db.next.trade = Math.max(db.next.trade, max(db.trades) + 1);
  db.next.entry = Math.max(db.next.entry, max(db.entries) + 1);
  return db;
}

const nowSql = () => new Date().toISOString().slice(0, 19).replace("T", " "); // like datetime('now')

// ─── validators (validators.py) ─────────────────────────────────────────────

const label = (key) => key.replace(/_/g, " ");

function text(data, key, { required = false, max = 20000 } = {}) {
  let value = data[key];
  if (value == null) value = "";
  if (typeof value !== "string") throw new ValidationError(`${label(key)} must be text`);
  value = value.trim();
  if (required && !value) throw new ValidationError(`${label(key)} is required`);
  if (value.length > max) throw new ValidationError(`${label(key)} is too long (max ${max} characters)`);
  return value;
}

function number(data, key, { required = false, positive = false } = {}) {
  const raw = data[key];
  if (raw == null || raw === "") {
    if (required) throw new ValidationError(`${label(key)} is required`);
    return null;
  }
  const value = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (typeof raw === "boolean" || String(raw).trim() === "" || Number.isNaN(value)) throw new ValidationError(`${label(key)} must be a number`);
  if (!Number.isFinite(value)) throw new ValidationError(`${label(key)} must be a finite number`);
  if (positive && value <= 0) throw new ValidationError(`${label(key)} must be greater than 0`);
  return value;
}

function integerInRange(data, key, low, high) {
  const value = number(data, key);
  if (value == null) return null;
  if (!Number.isInteger(value) || value < low || value > high) {
    throw new ValidationError(`${label(key)} must be a whole number from ${low} to ${high}`);
  }
  return value;
}

function choice(data, key, options, fallback) {
  const value = data[key] || fallback;
  if (!options.includes(value)) throw new ValidationError(`${label(key)} must be one of: ${options.join(", ")}`);
  return value;
}

const pad = (n) => String(n).padStart(2, "0");

/** A local date-time at minute precision, `YYYY-MM-DDTHH:MM`, as a datetime-local input sends. */
function timestamp(data, key, { required = false } = {}) {
  const raw = text(data, key, { required });
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/);
  if (!m || !validDate(+m[1], +m[2], +m[3]) || +(m[4] ?? 0) > 23 || +(m[5] ?? 0) > 59) {
    throw new ValidationError(`${label(key)} must be a date and time`);
  }
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}`;
}

function date(data, key, { required = false } = {}) {
  const raw = text(data, key, { required });
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || !validDate(+m[1], +m[2], +m[3])) throw new ValidationError(`${label(key)} must be a date`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function validDate(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function idList(data, key) {
  const values = data[key] || [];
  if (!Array.isArray(values)) throw new ValidationError(`${label(key)} must be a list`);
  const ids = values.map((v) => Number(v));
  if (ids.some((v) => !Number.isInteger(v))) throw new ValidationError(`${label(key)} must contain ids`);
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** Minutes since the epoch of a naive `YYYY-MM-DDTHH:MM`, ignoring time zones (like Python's naive datetimes). */
function naiveMinutes(iso) {
  const [d, t = "00:00"] = iso.split("T");
  const [y, mo, day] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  return Date.UTC(y, mo - 1, day, h, mi) / 60000;
}

// ─── symbols (symbols.py) ───────────────────────────────────────────────────

// Common MT5/CFD symbol names -> [Yahoo ticker, asset class].
const TICKER_PRESETS = {
  NAS100: ["^NDX", "index"], US100: ["^NDX", "index"], USTEC: ["^NDX", "index"],
  US30: ["^DJI", "index"], DJ30: ["^DJI", "index"],
  SPX500: ["^GSPC", "index"], US500: ["^GSPC", "index"],
  GER40: ["^GDAXI", "index"], DE40: ["^GDAXI", "index"], GER30: ["^GDAXI", "index"],
  UK100: ["^FTSE", "index"], JP225: ["^N225", "index"], FRA40: ["^FCHI", "index"],
  EU50: ["^STOXX50E", "index"], HK50: ["^HSI", "index"], AUS200: ["^AXJO", "index"],
  XAUUSD: ["GC=F", "commodity"], GOLD: ["GC=F", "commodity"],
  XAGUSD: ["SI=F", "commodity"], SILVER: ["SI=F", "commodity"],
  USOIL: ["CL=F", "commodity"], WTI: ["CL=F", "commodity"],
  UKOIL: ["BZ=F", "commodity"], BRENT: ["BZ=F", "commodity"],
  NATGAS: ["NG=F", "commodity"],
};
const CRYPTO_BASES = new Set(["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "LTC", "BNB", "DOT", "AVAX", "LINK", "TRX"]);

/** Guess the Yahoo ticker, asset class and point value for a broker symbol name. */
export function suggest(name) {
  const [ticker, assetClass] = guessTicker(String(name || "").trim().toUpperCase());
  return { ticker, asset_class: assetClass, point_value: DEFAULT_POINT_VALUES[assetClass] };
}

function guessTicker(name) {
  if (TICKER_PRESETS[name]) return TICKER_PRESETS[name];
  for (const quote of ["USDT", "USD"]) {
    const base = name.slice(0, -quote.length);
    if (name.endsWith(quote) && CRYPTO_BASES.has(base)) return [`${base}-USD`, "crypto"];
  }
  if (/^[A-Z]{6}$/.test(name)) return [`${name}=X`, "forex"];
  return [name, "stock"];
}

export function listSymbols(db) {
  return db.symbols
    .map((s) => ({ ...s, trade_count: db.trades.filter((t) => t.symbol_id === s.id).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSymbol(db, id) {
  const symbol = db.symbols.find((s) => s.id === Number(id));
  if (!symbol) throw new NotFoundError("Symbol not found");
  return symbol;
}

export function validateSymbol(data) {
  const name = text(data, "name", { required: true, max: 32 }).toUpperCase();
  if (!/^[A-Z0-9._\-^=!#]+$/.test(name)) throw new ValidationError("name may only contain letters, digits and . _ - ^ = ! #");
  return {
    name,
    ticker: text(data, "ticker", { required: true, max: 32 }).toUpperCase(),
    asset_class: choice(data, "asset_class", ASSET_CLASSES, "other"),
    point_value: number(data, "point_value", { required: true, positive: true }),
    description: text(data, "description", { max: 200 }),
  };
}

/** digits/description from a verified quote, as _enrich_from_market did. */
export function enrichFromQuote(fields, data, quote) {
  const explicit = integerInRange(data, "digits", 0, 8);
  const hint = quote.price_hint;
  fields.digits = explicit != null ? explicit : Number.isInteger(hint) && hint >= 0 && hint <= 8 ? hint : 2;
  fields.description = fields.description || quote.name || "";
  return fields;
}

function assertUniqueName(db, name, exceptId) {
  if (db.symbols.some((s) => s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase())) {
    throw new ValidationError(`A symbol named ${name} already exists`);
  }
}

export function insertSymbol(db, fields) {
  assertUniqueName(db, fields.name);
  const symbol = { id: db.next.symbol++, ...fields, created_at: nowSql() };
  db.symbols.push(symbol);
  return symbol;
}

/** Fields for an update whose ticker did not change (no market check needed). */
export function keepMarketFields(current, fields, data) {
  const explicit = integerInRange(data, "digits", 0, 8);
  fields.digits = explicit == null ? current.digits : explicit;
  fields.description = fields.description || current.description;
  return fields;
}

export function replaceSymbol(db, id, fields) {
  const symbol = getSymbol(db, id);
  assertUniqueName(db, fields.name, symbol.id);
  Object.assign(symbol, fields);
  return symbol;
}

export function deleteSymbol(db, id) {
  const symbol = getSymbol(db, id);
  // Never silently erase trade history.
  if (db.trades.some((t) => t.symbol_id === symbol.id)) throw new ValidationError("This symbol still has trades — delete those first");
  db.symbols = db.symbols.filter((s) => s !== symbol);
  delete db.drawings[`symbol:${symbol.id}`];
}

// ─── trades (trades.py) ─────────────────────────────────────────────────────

const TRADE_COLUMNS = ["symbol_id", "direction", "volume", "entry_price", "entry_time", "exit_price", "exit_time",
  "stop_loss", "take_profit", "fees", "pnl_override", "setup", "rating", "notes"];

/** A trade joined with its symbol, the row shape the views read. */
function joined(db, trade) {
  const s = getSymbol(db, trade.symbol_id);
  return { ...trade, symbol_name: s.name, ticker: s.ticker, point_value: s.point_value, digits: s.digits, asset_class: s.asset_class };
}

/** Newest first. Filters: status, symbol_id, setup, date_from, date_to. */
export function listTrades(db, filters = {}) {
  let rows = db.trades;
  if (filters.status === "open") rows = rows.filter((t) => t.exit_price == null);
  else if (filters.status === "closed") rows = rows.filter((t) => t.exit_price != null);
  if (/^\d+$/.test(String(filters.symbol_id ?? ""))) rows = rows.filter((t) => t.symbol_id === Number(filters.symbol_id));
  if (filters.setup) rows = rows.filter((t) => t.setup === filters.setup);
  // Compare on the date prefix so a bare YYYY-MM-DD bound includes that whole day.
  if (filters.date_from) rows = rows.filter((t) => t.entry_time.slice(0, 10) >= String(filters.date_from).slice(0, 10));
  if (filters.date_to) rows = rows.filter((t) => t.entry_time.slice(0, 10) <= String(filters.date_to).slice(0, 10));
  return rows
    .map((t) => joined(db, t))
    .sort((a, b) => (a.entry_time < b.entry_time ? 1 : a.entry_time > b.entry_time ? -1 : b.id - a.id));
}

export function getTrade(db, id) {
  const trade = db.trades.find((t) => t.id === Number(id));
  if (!trade) throw new NotFoundError("Trade not found");
  return joined(db, trade);
}

export function validateTrade(db, data) {
  const symbolId = integerInRange(data, "symbol_id", 1, 2 ** 31);
  if (symbolId == null) throw new ValidationError("symbol is required");
  getSymbol(db, symbolId);
  const fields = {
    symbol_id: symbolId,
    direction: choice(data, "direction", ["long", "short"]),
    volume: number(data, "volume", { required: true, positive: true }),
    entry_price: number(data, "entry_price", { required: true, positive: true }),
    entry_time: timestamp(data, "entry_time", { required: true }),
    exit_price: number(data, "exit_price", { positive: true }),
    exit_time: timestamp(data, "exit_time"),
    stop_loss: number(data, "stop_loss", { positive: true }),
    take_profit: number(data, "take_profit", { positive: true }),
    fees: number(data, "fees") || 0,
    pnl_override: number(data, "pnl_override"),
    setup: text(data, "setup", { max: 60 }),
    rating: integerInRange(data, "rating", 1, 5),
    notes: text(data, "notes"),
  };
  const hasPrice = fields.exit_price != null, hasTime = fields.exit_time != null;
  if (hasPrice !== hasTime) throw new ValidationError("exit price and exit time must be given together");
  if (hasTime && fields.exit_time < fields.entry_time) throw new ValidationError("exit time cannot be before entry time");
  if (fields.pnl_override != null && !hasPrice) throw new ValidationError("actual P&L can only be set on a closed trade");
  return fields;
}

export function createTrade(db, data) {
  const fields = validateTrade(db, data);
  const trade = { id: db.next.trade++, ...fields, created_at: nowSql() };
  db.trades.push(trade);
  return getTrade(db, trade.id);
}

export function updateTrade(db, id, data) {
  getTrade(db, id);
  const fields = validateTrade(db, data);
  const trade = db.trades.find((t) => t.id === Number(id));
  for (const c of TRADE_COLUMNS) trade[c] = fields[c];
  return getTrade(db, id);
}

export function deleteTrade(db, id) {
  const trade = getTrade(db, id);
  db.trades = db.trades.filter((t) => t.id !== trade.id);
  db.links = db.links.filter(([, tradeId]) => tradeId !== trade.id);
  delete db.drawings[`trade:${trade.id}`];
}

export function listSetups(db) {
  const setups = [...new Set(db.trades.map((t) => t.setup).filter(Boolean))];
  return setups.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

// ─── P&L (pnl.py) ───────────────────────────────────────────────────────────

export function addMetrics(trade, livePrice = null) {
  const result = { ...trade };
  const closed = trade.exit_price != null;
  result.status = closed ? "closed" : "open";
  result.current_price = closed ? null : livePrice;
  result.pnl = closed ? closedPnl(trade) : null;
  result.unrealized_pnl = closed || livePrice == null ? null : priceMovePnl(trade, livePrice) - trade.fees;
  const realizedOrLive = closed ? result.pnl : result.unrealized_pnl;
  const risk = riskAmount(trade);
  result.risk = risk;
  result.r_multiple = risk && realizedOrLive != null ? realizedOrLive / risk : null;
  result.duration_minutes = trade.exit_time ? Math.floor(naiveMinutes(trade.exit_time) - naiveMinutes(trade.entry_time)) : null;
  return result;
}

function closedPnl(t) {
  return t.pnl_override != null ? t.pnl_override : priceMovePnl(t, t.exit_price) - t.fees;
}

function priceMovePnl(t, price) {
  return (t.direction === "long" ? 1 : -1) * (price - t.entry_price) * t.volume * t.point_value;
}

function riskAmount(t) {
  if (t.stop_loss == null) return null;
  return Math.abs(t.entry_price - t.stop_loss) * t.volume * t.point_value || null;
}

// ─── stats (stats.py) ───────────────────────────────────────────────────────

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const sum = (v) => v.reduce((a, b) => a + b, 0);

/** Aggregate stats from trades that already carry addMetrics fields. */
export function computeStats(trades) {
  const closed = trades.filter((t) => t.status === "closed")
    .sort((a, b) => (a.exit_time < b.exit_time ? -1 : a.exit_time > b.exit_time ? 1 : a.id - b.id));
  const open = trades.filter((t) => t.status === "open");
  const equity = [];
  let total = 0;
  for (const t of closed) {
    total += t.pnl;
    equity.push({ time: t.exit_time, equity: total, trade_id: t.id });
  }
  return {
    summary: summary(closed, open, equity),
    equity_curve: equity,
    by_symbol: group(closed, (t) => t.symbol_name),
    by_setup: group(closed, (t) => t.setup || "(no setup)"),
    by_direction: group(closed, (t) => t.direction),
    by_weekday: WEEKDAYS.map((day) => {
      const p = closed.filter((t) => WEEKDAYS[(new Date(naiveMinutes(t.entry_time) * 60000).getUTCDay() + 6) % 7] === day).map((t) => t.pnl);
      return { key: day, trades: p.length, net_pnl: sum(p) };
    }),
  };
}

function summary(closed, open, equity) {
  const pnls = closed.map((t) => t.pnl);
  const wins = pnls.filter((p) => p > 0), losses = pnls.filter((p) => p < 0);
  const grossProfit = sum(wins), grossLoss = -sum(losses);
  const r = closed.map((t) => t.r_multiple).filter((v) => v != null);
  const unrealized = open.map((t) => t.unrealized_pnl).filter((v) => v != null);
  // Peak starts at 0 so a losing first trade counts as drawdown from the starting balance.
  let peak = 0, worst = 0;
  for (const p of equity) { peak = Math.max(peak, p.equity); worst = Math.max(worst, peak - p.equity); }
  // Signed length of the latest run: +3 is three wins in a row, -2 two losses.
  let streak = 0;
  for (let i = pnls.length - 1; i >= 0; i--) {
    const p = pnls[i];
    if (p === 0 || (streak > 0 && p < 0) || (streak < 0 && p > 0)) break;
    streak += p > 0 ? 1 : -1;
  }
  return {
    trade_count: closed.length,
    win_count: wins.length,
    loss_count: losses.length,
    breakeven_count: pnls.length - wins.length - losses.length,
    win_rate: pnls.length ? wins.length / pnls.length : null,
    net_pnl: sum(pnls),
    gross_profit: grossProfit,
    gross_loss: grossLoss,
    profit_factor: grossLoss ? grossProfit / grossLoss : null,
    avg_win: mean(wins),
    avg_loss: mean(losses),
    expectancy: mean(pnls),
    largest_win: wins.length ? Math.max(...wins) : null,
    largest_loss: losses.length ? Math.min(...losses) : null,
    avg_r: mean(r),
    max_drawdown: worst,
    streak,
    open_count: open.length,
    unrealized_pnl: unrealized.length ? sum(unrealized) : null,
  };
}

function group(closed, keyFn) {
  const groups = new Map();
  for (const t of closed) {
    const k = keyFn(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t.pnl);
  }
  return [...groups].map(([key, p]) => ({ key, trades: p.length, net_pnl: sum(p), win_rate: p.filter((x) => x > 0).length / p.length }))
    .sort((a, b) => b.net_pnl - a.net_pnl);
}

// ─── journal (journal.py) ───────────────────────────────────────────────────

export function splitTags(raw) {
  const seen = new Set(), tags = [];
  for (let tag of String(raw || "").split(",")) {
    tag = tag.trim().replace(/^#+/, "");
    if (tag && !seen.has(tag.toLowerCase())) { seen.add(tag.toLowerCase()); tags.push(tag); }
  }
  return tags;
}

const hydrate = (e) => ({ ...e, tags: splitTags(e.tags) });

function attachTrades(db, entry) {
  const trades = db.links.filter(([entryId]) => entryId === entry.id)
    .map(([, tradeId]) => db.trades.find((t) => t.id === tradeId))
    .filter(Boolean)
    .map((t) => ({ id: t.id, direction: t.direction, entry_time: t.entry_time, symbol_name: getSymbol(db, t.symbol_id).name }))
    .sort((a, b) => (a.entry_time < b.entry_time ? -1 : a.entry_time > b.entry_time ? 1 : 0));
  return { ...entry, trades, trade_ids: trades.map((t) => t.id) };
}

/** Newest first, filtered by free-text search and a single tag. */
export function listEntries(db, { q = "", tag = "" } = {}) {
  const query = String(q).trim().toLowerCase();
  const wanted = String(tag).trim().toLowerCase();
  return db.entries
    .filter((e) => !query || [e.title, e.body, e.tags].some((f) => String(f).toLowerCase().includes(query)))
    .sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : b.id - a.id))
    .map((e) => attachTrades(db, hydrate(e)))
    .filter((e) => !wanted || e.tags.some((t) => t.toLowerCase() === wanted));
}

export function getEntry(db, id) {
  const entry = db.entries.find((e) => e.id === Number(id));
  if (!entry) throw new NotFoundError("Journal entry not found");
  return attachTrades(db, hydrate(entry));
}

export function entriesForTrade(db, tradeId) {
  const ids = new Set(db.links.filter(([, t]) => t === Number(tradeId)).map(([e]) => e));
  return db.entries.filter((e) => ids.has(e.id))
    .sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : 0))
    .map(hydrate);
}

function validateEntry(data) {
  let rawTags = data.tags || "";
  if (Array.isArray(rawTags)) rawTags = rawTags.map(String).join(",");
  const fields = {
    entry_date: date(data, "entry_date", { required: true }),
    title: text(data, "title", { required: true, max: 200 }),
    body: text(data, "body", { max: 100000 }),
    tags: splitTags(text({ tags: rawTags }, "tags", { max: 500 })).join(", "),
  };
  return [fields, idList(data, "trade_ids")];
}

function replaceLinks(db, entryId, tradeIds) {
  if (tradeIds.some((id) => !db.trades.some((t) => t.id === id))) throw new ValidationError("one or more linked trades no longer exist");
  db.links = db.links.filter(([e]) => e !== entryId).concat(tradeIds.map((t) => [entryId, t]));
}

export function createEntry(db, data) {
  const [fields, tradeIds] = validateEntry(data);
  const id = db.next.entry;
  replaceLinks(db, id, tradeIds);
  db.next.entry++;
  db.entries.push({ id, ...fields, created_at: nowSql(), updated_at: nowSql() });
  return getEntry(db, id);
}

export function updateEntry(db, id, data) {
  const entry = db.entries.find((e) => e.id === Number(id));
  if (!entry) throw new NotFoundError("Journal entry not found");
  const [fields, tradeIds] = validateEntry(data);
  replaceLinks(db, entry.id, tradeIds);
  Object.assign(entry, fields, { updated_at: nowSql() });
  return getEntry(db, entry.id);
}

export function deleteEntry(db, id) {
  getEntry(db, id);
  db.entries = db.entries.filter((e) => e.id !== Number(id));
  db.links = db.links.filter(([e]) => e !== Number(id));
}

export function listTags(db) {
  const tags = new Map();
  for (const e of db.entries) for (const t of splitTags(e.tags)) if (!tags.has(t)) tags.set(t, t);
  return [...tags.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

// ─── drawings (drawings.py) ─────────────────────────────────────────────────

const SCOPE_RE = /^(?:trade|symbol):\d+$/;
const MAX_DRAWINGS = 300;
const POINT_KEYS = { trend: ["a", "b"], rect: ["a", "b"], text: ["a"], hline: [] };

export function getDrawings(db, scope) {
  if (!SCOPE_RE.test(scope)) throw new NotFoundError("Not found");
  return db.drawings[scope] || [];
}

export function saveDrawings(db, scope, drawings) {
  if (!SCOPE_RE.test(scope)) throw new NotFoundError("Not found");
  if (!Array.isArray(drawings)) throw new ValidationError("drawings must be a list");
  if (drawings.length > MAX_DRAWINGS) throw new ValidationError(`at most ${MAX_DRAWINGS} drawings per chart`);
  const cleaned = drawings.map(cleanDrawing);
  db.drawings[scope] = cleaned;
  return cleaned;
}

/** Keep only known fields, so the stored document cannot grow arbitrary payloads. */
function cleanDrawing(d) {
  if (!d || typeof d !== "object" || !(d.type in POINT_KEYS)) throw new ValidationError("unknown drawing type");
  const out = { type: d.type, color: typeof d.color === "string" && /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : "#f59e0b" };
  for (const key of POINT_KEYS[d.type]) {
    if (!d[key] || typeof d[key] !== "object") throw new ValidationError("drawing point is missing");
    out[key] = { t: finite(d[key].t), p: finite(d[key].p) };
  }
  if (d.type === "hline") out.p = finite(d.p);
  if (d.type === "text") {
    if (typeof d.text !== "string" || !d.text.trim()) throw new ValidationError("text note is empty");
    out.text = d.text.trim().slice(0, 300);
  }
  return out;
}

function finite(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ValidationError("drawing coordinates must be numbers");
  return v;
}

// ─── trade chart windows (trade_chart.py) ───────────────────────────────────

const HOUR = 3600, DAY = 24 * HOUR;
export const INTERVAL_SECONDS = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": HOUR, "1d": DAY, "1wk": 7 * DAY };
// How far back Yahoo serves each interval, minus a safety margin. null = unlimited.
const HISTORY_LIMIT = { "1m": 6.5 * DAY, "5m": 58 * DAY, "15m": 58 * DAY, "30m": 58 * DAY, "1h": 720 * DAY, "1d": null, "1wk": null };
const CONTEXT_BARS = 80;
const MAX_TRADE_BARS = 6000;

/** Trade times are the trader's wall clock; the browser is in that zone. */
export function localEpoch(iso) {
  const [d, t = "00:00"] = iso.split("T");
  const [y, mo, day] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  return new Date(y, mo - 1, day, h, mi).getTime() / 1000;
}

export function availableIntervals(entryTs, exitTs, now) {
  return Object.keys(INTERVAL_SECONDS).filter((i) => {
    const limit = HISTORY_LIMIT[i];
    if (limit != null && now - entryTs > limit) return false;
    return (exitTs - entryTs) / INTERVAL_SECONDS[i] <= MAX_TRADE_BARS;
  });
}

/** Pick the finest timeframe that fits the whole trade in at most ~120 bars. */
export function autoInterval(entryTs, exitTs, available) {
  const span = Math.max(exitTs - entryTs, 0);
  return available.find((i) => span / INTERVAL_SECONDS[i] <= 120) || available[available.length - 1];
}

export function chartWindow(entryTs, exitTs, now, interval, minPadding) {
  const padding = Math.max((exitTs - entryTs) * 0.5, minPadding);
  let start = entryTs - padding;
  const limit = HISTORY_LIMIT[interval];
  if (limit != null) start = Math.max(start, now - limit);
  return [start, Math.min(exitTs + padding, now)];
}

/** Which interval and window to load for a trade. The caller fetches the candles. */
export function planTradeChart(trade, interval, now = Date.now() / 1000) {
  const entryTs = localEpoch(trade.entry_time);
  const exitTs = trade.exit_time ? localEpoch(trade.exit_time) : now;
  const available = availableIntervals(entryTs, exitTs, now);
  if (!interval) interval = autoInterval(entryTs, exitTs, available);
  else if (!available.includes(interval)) throw new ValidationError(`${interval} candles are no longer available for a trade this old`);
  const pad = CONTEXT_BARS * INTERVAL_SECONDS[interval];
  return {
    interval,
    available,
    window: chartWindow(entryTs, exitTs, now, interval, pad),
    // Window fell on a weekend or outside session hours: widen it.
    fallback: INTERVAL_SECONDS[interval] < DAY ? chartWindow(entryTs, exitTs, now, interval, 5 * DAY) : null,
  };
}

// ─── price at a moment (for trades entered by time only) ────────────────────

/**
 * Where to look for the price at `ts`, best first: each interval Yahoo still
 * serves for that age, finest first. A symbol without fine bars (or a Yahoo
 * error on one) falls through to the next.
 */
export function planPriceAt(ts, now = Date.now() / 1000) {
  if (ts > now + 60) throw new ValidationError("that time is in the future");
  return ["1m", "5m", "1h", "1d"]
    .filter((i) => HISTORY_LIMIT[i] == null || now - ts <= HISTORY_LIMIT[i])
    .map((interval) => {
      const step = INTERVAL_SECONDS[interval];
      const end = Math.min(ts + step, now);
      return {
        interval,
        window: [ts - 10 * step, end],
        // Market shut at that time: reach back to the last session before a weekend or holiday.
        fallback: [ts - Math.max(5 * DAY, 10 * step), end],
      };
    });
}

/**
 * The price at `ts` from candles of `interval`: the open of the candle that
 * holds it, or the close of the last candle before it when the market was
 * shut then. Null if no candle starts at or before `ts`.
 */
export function priceAt(candles, ts, interval) {
  const step = INTERVAL_SECONDS[interval];
  let last = null;
  for (const c of candles) {
    if (c.time > ts) break;
    last = c;
  }
  if (!last) return null;
  return ts < last.time + step ? { price: last.open, time: last.time } : { price: last.close, time: last.time + step };
}
