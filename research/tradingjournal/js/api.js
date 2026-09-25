// The views' data API — the same calls the Python backend answered, now
// served in the browser by store.js, with market data from the site's
// Worker (/api/market/*).
//
// A guest's journal lives in this tab only. A signed-in user's journal is
// loaded from, and saved to, their account after every change.

import * as S from "./store.js";

let db = S.emptyDb();
let account = null; // BQE.store("journal") when signed in

/** Load the signed-in user's journal. Call once before the first render. */
export async function initData(onStatus) {
  const BQE = window.BQE;
  if (!BQE) return { signedIn: false };
  account = BQE.store("journal");
  account.onStatus = onStatus;
  try {
    db = S.loadDb(await account.load());
  } catch (error) {
    // Signed in, but the load failed: do not start empty and then save that
    // over the real journal.
    account = null;
    throw new Error(`Could not load your journal (${error.message}). Reload to try again.`);
  }
  return { signedIn: account.signedIn };
}

function changed() {
  if (account && account.signedIn) account.save(db);
}

/** Run a mutation, then save. Errors from the store reach the view as-is. */
async function mutate(fn) {
  const result = fn();
  changed();
  return result;
}

// ─── market data ────────────────────────────────────────────────────────────

const cache = new Map();

async function market(path, params, ttlMs) {
  const url = `/api/market/${path}?${new URLSearchParams(params)}`;
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Can't reach the market data service — check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 && !data.error) throw new Error("Market data needs the site's Worker — it is not available in a static preview.");
  if (!res.ok) throw new Error(data.error || `Market data request failed (${res.status})`);
  cache.set(url, { value: data, expires: Date.now() + ttlMs });
  return data;
}

const quote = (ticker) => market("quote", { ticker: String(ticker).trim().toUpperCase() }, 30_000);

/** Quotes for several tickers; a failed one maps to null instead of failing the list. */
async function quotes(tickers) {
  const list = [...new Set(tickers)].sort();
  const values = await Promise.all(list.map((t) => quote(t).catch(() => null)));
  return Object.fromEntries(list.map((t, i) => [t, values[i]]));
}

/** P&L fields, pricing open trades with live quotes (one fetch per ticker). */
async function withMetrics(rows) {
  const live = await quotes(rows.filter((r) => r.exit_price == null).map((r) => r.ticker));
  return rows.map((r) => S.addMetrics(r, live[r.ticker]?.price ?? null));
}

// ─── the API the views call ─────────────────────────────────────────────────

export const api = {
  symbols: async () => S.listSymbols(db),
  suggestSymbol: async (name) => S.suggest(name),
  symbolQuotes: async () => quotes(db.symbols.map((s) => s.ticker)),

  createSymbol: async (data) => {
    const fields = S.validateSymbol(data);
    let q;
    try {
      q = await quote(fields.ticker);
    } catch (error) {
      throw new S.ValidationError(`Could not verify ticker: ${error.message}`);
    }
    return mutate(() => S.insertSymbol(db, S.enrichFromQuote(fields, data, q)));
  },

  updateSymbol: async (id, data) => {
    const current = S.getSymbol(db, id);
    const fields = S.validateSymbol(data);
    if (fields.ticker !== current.ticker) {
      let q;
      try {
        q = await quote(fields.ticker);
      } catch (error) {
        throw new S.ValidationError(`Could not verify ticker: ${error.message}`);
      }
      S.enrichFromQuote(fields, data, q);
    } else {
      S.keepMarketFields(current, fields, data);
    }
    return mutate(() => S.replaceSymbol(db, id, fields));
  },

  deleteSymbol: (id) => mutate(() => { S.deleteSymbol(db, id); return { ok: true }; }),

  symbolCandles: async (id, interval) => {
    const symbol = S.getSymbol(db, id);
    return market("candles", { ticker: symbol.ticker, interval: interval || "1h" }, 300_000);
  },

  drawings: async (scope) => S.getDrawings(db, scope),
  saveDrawings: (scope, drawings) => mutate(() => S.saveDrawings(db, scope, drawings)),
  quote: async (ticker) => quote(ticker),

  trades: async (filters) => withMetrics(S.listTrades(db, filters || {})),
  trade: async (id) => {
    const [trade] = await withMetrics([S.getTrade(db, id)]);
    trade.journal_entries = S.entriesForTrade(db, id);
    return trade;
  },
  createTrade: async (data) => (await withMetrics([await mutate(() => S.createTrade(db, data))]))[0],
  updateTrade: async (id, data) => (await withMetrics([await mutate(() => S.updateTrade(db, id, data))]))[0],
  deleteTrade: (id) => mutate(() => { S.deleteTrade(db, id); return { ok: true }; }),
  setups: async () => S.listSetups(db),

  tradeChart: async (id, interval) => {
    const trade = S.getTrade(db, id);
    const plan = S.planTradeChart(trade, interval || null);
    const fetchWindow = ([start, end]) =>
      market("candles", { ticker: trade.ticker, interval: plan.interval, period1: Math.floor(start), period2: Math.ceil(end) }, 300_000);
    let { candles } = await fetchWindow(plan.window);
    if (!candles.length && plan.fallback) ({ candles } = await fetchWindow(plan.fallback));
    return { interval: plan.interval, available_intervals: plan.available, candles };
  },

  /** The symbol's price at a local wall-clock time ("2024-05-01T14:32"), from its candles. */
  priceAt: async (symbolId, localTime) => {
    const symbol = S.getSymbol(db, symbolId);
    const ts = S.localEpoch(localTime);
    let lastError = null;
    for (const plan of S.planPriceAt(ts)) {
      const fetchWindow = ([start, end]) =>
        market("candles", { ticker: symbol.ticker, interval: plan.interval, period1: Math.floor(start), period2: Math.ceil(end) }, 300_000);
      try {
        const hit = S.priceAt((await fetchWindow(plan.window)).candles, ts, plan.interval)
          || S.priceAt((await fetchWindow(plan.fallback)).candles, ts, plan.interval);
        if (hit) return { ...hit, interval: plan.interval };
      } catch (error) {
        lastError = error;
      }
    }
    const why = lastError ? ` (${lastError.message})` : "";
    throw new Error(`No ${symbol.name} price found for ${localTime.replace("T", " ")}${why} — enter it by hand.`);
  },

  stats: async (filters) => {
    const f = filters || {};
    return S.computeStats(await withMetrics(S.listTrades(db, { date_from: f.date_from, date_to: f.date_to })));
  },

  journal: async (filters) => S.listEntries(db, filters || {}),
  journalTags: async () => S.listTags(db),
  createEntry: (data) => mutate(() => S.createEntry(db, data)),
  updateEntry: (id, data) => mutate(() => S.updateEntry(db, id, data)),
  deleteEntry: (id) => mutate(() => { S.deleteEntry(db, id); return { ok: true }; }),
};
