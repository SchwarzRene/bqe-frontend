import { describe, expect, it } from "vitest";
// Plain browser JS, tested as-is; typed loosely here.
import * as Store from "../research/tradingjournal/js/store.js";

const S: any = Store;

function seeded() {
  const db = S.emptyDb();
  const fields = S.enrichFromQuote(
    S.validateSymbol({ name: "xauusd", ticker: "gc=f", asset_class: "commodity", point_value: "100" }),
    {},
    { name: "Gold", price_hint: 2 },
  );
  const gold = S.insertSymbol(db, fields);
  return { db, gold };
}

describe("trading journal store", () => {
  it("suggests tickers like the Python app", () => {
    expect(S.suggest("nas100")).toEqual({ ticker: "^NDX", asset_class: "index", point_value: 1 });
    expect(S.suggest("BTCUSDT")).toEqual({ ticker: "BTC-USD", asset_class: "crypto", point_value: 1 });
    expect(S.suggest("EURUSD")).toEqual({ ticker: "EURUSD=X", asset_class: "forex", point_value: 100000 });
    expect(S.suggest("AAPL").asset_class).toBe("stock");
  });

  it("validates symbols and refuses duplicates", () => {
    const { db, gold } = seeded();
    expect(gold).toMatchObject({ id: 1, name: "XAUUSD", ticker: "GC=F", digits: 2, description: "Gold", point_value: 100 });
    expect(() => S.insertSymbol(db, { ...gold, id: undefined })).toThrow(/already exists/);
    expect(() => S.validateSymbol({ name: "bad name", ticker: "X", point_value: 1 })).toThrow(/may only contain/);
  });

  it("computes P&L, risk and R like pnl.py", () => {
    const { db, gold } = seeded();
    const t = S.createTrade(db, {
      symbol_id: String(gold.id), direction: "short", volume: "0.5", entry_price: "2000",
      entry_time: "2026-09-21T09:30", exit_price: "1990", exit_time: "2026-09-21T11:00",
      stop_loss: "2004", fees: "3", setup: "London", rating: "4",
    });
    const m = S.addMetrics(t);
    expect(m.status).toBe("closed");
    expect(m.pnl).toBeCloseTo(497); // 10 × 0.5 × 100 − 3
    expect(m.risk).toBeCloseTo(200);
    expect(m.r_multiple).toBeCloseTo(2.485);
    expect(m.duration_minutes).toBe(90);

    const open = S.createTrade(db, { symbol_id: gold.id, direction: "long", volume: 1, entry_price: 2000, entry_time: "2026-09-22T10:00" });
    expect(S.addMetrics(open, 2010).unrealized_pnl).toBeCloseTo(1000);
    expect(S.addMetrics(open).unrealized_pnl).toBeNull();
  });

  it("enforces the trade rules", () => {
    const { db, gold } = seeded();
    const base = { symbol_id: gold.id, direction: "long", volume: 1, entry_price: 10, entry_time: "2026-09-22T10:00" };
    expect(() => S.createTrade(db, { ...base, exit_price: 11 })).toThrow(/together/);
    expect(() => S.createTrade(db, { ...base, exit_price: 11, exit_time: "2026-09-22T09:00" })).toThrow(/before entry/);
    expect(() => S.createTrade(db, { ...base, pnl_override: 5 })).toThrow(/closed trade/);
    expect(() => S.createTrade(db, { ...base, entry_time: "2026-02-30T10:00" })).toThrow(/date and time/);
    expect(() => S.createTrade(db, { ...base, volume: "abc" })).toThrow(/must be a number/);
    expect(() => S.deleteSymbol(db, gold.id)).not.toThrow();
  });

  it("keeps a symbol that still has trades", () => {
    const { db, gold } = seeded();
    S.createTrade(db, { symbol_id: gold.id, direction: "long", volume: 1, entry_price: 10, entry_time: "2026-09-22" });
    expect(() => S.deleteSymbol(db, gold.id)).toThrow(/still has trades/);
  });

  it("filters, sorts and aggregates stats", () => {
    const { db, gold } = seeded();
    const mk = (day: string, exit: number) =>
      S.createTrade(db, { symbol_id: gold.id, direction: "long", volume: 1, entry_price: 100, entry_time: `2026-09-${day}T10:00`, exit_price: exit, exit_time: `2026-09-${day}T12:00` });
    mk("21", 101); mk("22", 99); mk("23", 102); // Mon +100, Tue −100, Wed +200 (point value 100)
    const rows = S.listTrades(db, { date_from: "2026-09-22" });
    expect(rows.map((r: any) => r.entry_time.slice(8, 10))).toEqual(["23", "22"]);

    const stats = S.computeStats(S.listTrades(db).map((t: any) => S.addMetrics(t)));
    expect(stats.summary.net_pnl).toBeCloseTo(200);
    expect(stats.summary.win_rate).toBeCloseTo(2 / 3);
    expect(stats.summary.max_drawdown).toBeCloseTo(100);
    expect(stats.summary.streak).toBe(1);
    expect(stats.by_weekday.slice(0, 3).map((d: any) => d.trades)).toEqual([1, 1, 1]);
  });

  it("links journal entries to trades and cleans up on delete", () => {
    const { db, gold } = seeded();
    const t = S.createTrade(db, { symbol_id: gold.id, direction: "long", volume: 1, entry_price: 10, entry_time: "2026-09-22T10:00" });
    const e = S.createEntry(db, { entry_date: "2026-09-22", title: "Patience", body: "Waited for the retest", tags: "#discipline, Gold, gold", trade_ids: [String(t.id)] });
    expect(e.tags).toEqual(["discipline", "Gold"]);
    expect(e.trade_ids).toEqual([t.id]);
    expect(S.listEntries(db, { q: "RETEST" })).toHaveLength(1);
    expect(S.listEntries(db, { tag: "gold" })).toHaveLength(1);
    expect(S.entriesForTrade(db, t.id)).toHaveLength(1);
    expect(() => S.createEntry(db, { entry_date: "2026-09-22", title: "x", trade_ids: [99] })).toThrow(/no longer exist/);

    S.saveDrawings(db, `trade:${t.id}`, [{ type: "hline", p: 12, color: "red" }]);
    expect(S.getDrawings(db, `trade:${t.id}`)[0].color).toBe("#f59e0b");
    S.deleteTrade(db, t.id);
    expect(db.links).toEqual([]);
    expect(S.getDrawings(db, `trade:${t.id}`)).toEqual([]);
    S.deleteEntry(db, String(e.id));
    expect(db.entries).toEqual([]);
  });

  it("rejects bad drawings and scopes", () => {
    const { db } = seeded();
    expect(() => S.saveDrawings(db, "trade:1", [{ type: "circle" }])).toThrow(/unknown drawing/);
    expect(() => S.saveDrawings(db, "trade:1", [{ type: "trend", a: { t: 1, p: 2 } }])).toThrow(/point is missing/);
    expect(() => S.getDrawings(db, "../x")).toThrow();
  });

  it("never reuses ids from a saved document", () => {
    const db = S.loadDb({ v: 1, next: { symbol: 1, trade: 1, entry: 1 }, symbols: [{ id: 7 }], trades: [{ id: 3 }], entries: [], links: [], drawings: {} });
    expect(db.next).toEqual({ symbol: 8, trade: 4, entry: 1 });
    expect(S.loadDb({ junk: true }).symbols).toEqual([]);
  });

  it("plans the chart window for a trade", () => {
    const now = S.localEpoch("2026-09-24T12:00");
    const plan = S.planTradeChart({ entry_time: "2026-09-24T10:00", exit_time: "2026-09-24T11:00" }, null, now);
    expect(plan.interval).toBe("1m");
    expect(plan.available).toContain("1wk");
    // Yahoo keeps hourly bars ~2 years: a 20-month-old trade still has them, a 3-year-old one not.
    const old = S.planTradeChart({ entry_time: "2025-01-06T10:00", exit_time: "2025-01-06T11:00" }, null, now);
    expect(old.available).toEqual(["1h", "1d", "1wk"]);
    const older = S.planTradeChart({ entry_time: "2023-09-04T10:00", exit_time: "2023-09-04T11:00" }, null, now);
    expect(older.available).toEqual(["1d", "1wk"]);
    expect(() => S.planTradeChart({ entry_time: "2025-01-06T10:00", exit_time: null }, "1m", now)).toThrow(/no longer available/);
  });

  it("looks up the price at a moment from candles", () => {
    const now = S.localEpoch("2026-09-24T12:00");
    const recent = S.planPriceAt(S.localEpoch("2026-09-24T10:30"), now);
    expect(recent.interval).toBe("1m");
    expect(S.planPriceAt(S.localEpoch("2025-01-06T10:00"), now).interval).toBe("1h");
    expect(S.planPriceAt(S.localEpoch("2023-09-04T10:00"), now).interval).toBe("1d");
    expect(() => S.planPriceAt(now + 3600, now)).toThrow(/future/);

    const candles = [
      { time: 1000, open: 10, close: 11 },
      { time: 1060, open: 11, close: 12 },
      { time: 5000, open: 20, close: 21 },
    ];
    expect(S.priceAt(candles, 1070, "1m")).toEqual({ price: 11, time: 1060 }); // inside a candle: its open
    expect(S.priceAt(candles, 3000, "1m")).toEqual({ price: 12, time: 1120 }); // market shut: last close
    expect(S.priceAt(candles, 500, "1m")).toBeNull();
  });
});
