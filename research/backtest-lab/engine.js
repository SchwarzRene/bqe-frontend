// Tick-level backtest engine for the Backtest Lab. Runs entirely in the browser.
//
// This is a JavaScript port of the execution rules of the Rust engine in
// SchwarzRene/stock-backtesting-engine (src/engine.rs). Same tick loop, same order of
// operations, same rounding, so a pass gives the same deals as `mt5bt run` on the same
// data and settings (research/backtest-lab/test/engine.test.mjs checks that against
// numbers produced by the Rust binary). Not ported: pending orders, trade sessions,
// partial closes, non-USD conversion.
//
// Prices are integers in points (price x 10^digits). Money is a float rounded to cents
// per deal. Ticks live in typed arrays so a pass allocates almost nothing.

const DAY_MS = 86400000;
const TF_MIN = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440 };
export const TIMEFRAMES = Object.keys(TF_MIN);

export const DEFAULT_CONFIG = {
  digits: 5, contractSize: 100000, volumeMin: 0.01, volumeMax: 100, volumeStep: 0.01,
  stopsLevel: 0, swapLong: -6, swapShort: 2, swapRates: [0, 1, 1, 3, 1, 1, 0], // Sun..Sat
  initialBalance: 10000, leverage: 30, stopOutLevel: 50,
  commissionPerLot: 3.5, slippagePoints: 0, deviationPoints: -1,
  feedMs: 0, openMs: 20, closeMs: 20, jitterMs: 5, seed: 1,
  equitySampleMs: 60000,
};

// Rust's f64::round: half away from zero (Math.round rounds half up).
const roundAway = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));
const round2 = (x) => roundAway(x * 100) / 100;

const MASK = (1n << 64n) - 1n;
/** xorshift64*, identical to util::Rng in the Rust engine. */
class Rng {
  constructor(seed) { this.s = ((BigInt(seed) * 0x9E3779B97F4A7C15n) & MASK) | 1n; }
  nextU64() {
    let x = this.s;
    x ^= x >> 12n; x ^= (x << 25n) & MASK; x ^= x >> 27n;
    this.s = x;
    return (x * 0x2545F4914F6CDD1Dn) & MASK;
  }
}

// ------------------------------------------------------------------ data

/** Parse an MT5 tick export (<DATE>,<TIME>,<BID>,<ASK>,...,<FLAGS>) into typed arrays. */
export function parseTicksCsv(text, digits) {
  const scale = 10 ** digits;
  const lines = text.split(/\r?\n/);
  const n = lines.length;
  const t = new Float64Array(n), bid = new Int32Array(n), ask = new Int32Array(n), flags = new Uint16Array(n);
  let k = 0, bad = 0, backwards = 0;
  for (let i = 0; i < n; i++) {
    const line = lines[i];
    if (!line || line.charCodeAt(0) === 60 /* '<' header */) continue;
    const c = line.split(/[,;\t]/);
    // 2024.01.01 / 00:00:17.610
    const d = c[0].split(/[./-]/), tm = c[1].split(/[:.]/);
    const b = parseFloat(c[2]), a = parseFloat(c[3]);
    if (d.length < 3 || tm.length < 3 || !(b > 0) || !(a > 0)) { bad++; continue; }
    const ms = Date.UTC(+d[0], +d[1] - 1, +d[2], +tm[0], +tm[1], +tm[2], tm[3] ? +tm[3].padEnd(3, "0").slice(0, 3) : 0);
    if (k && ms < t[k - 1]) backwards++;
    t[k] = ms; bid[k] = Math.round(b * scale); ask[k] = Math.round(a * scale);
    flags[k] = c[6] ? +c[6] : 6;
    k++;
  }
  return { t: t.subarray(0, k), bid: bid.subarray(0, k), ask: ask.subarray(0, k), flags: flags.subarray(0, k), digits, count: k, bad, backwards };
}

export function parseDate(s) {
  const m = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/.exec(String(s).trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
}

// ------------------------------------------------------------------ bars

class BarSeries {
  constructor(tf, cap) { this.tf = tf; this.ms = TF_MIN[tf] * 60000; this.cap = cap; this.bars = []; }
  update(timeMs, price) {
    const open = timeMs - (((timeMs % this.ms) + this.ms) % this.ms);
    const b = this.bars[this.bars.length - 1];
    if (b && b.time === open) {
      if (price > b.high) b.high = price;
      if (price < b.low) b.low = price;
      b.close = price;
      return false;
    }
    this.bars.push({ time: open, open: price, high: price, low: price, close: price });
    if (this.bars.length > this.cap * 2) this.bars.splice(0, this.bars.length - this.cap);
    return true;
  }
  /** shift 0 = forming bar, 1 = last closed bar */
  get(shift) { return this.bars[this.bars.length - 1 - shift]; }
}

// ------------------------------------------------------------------ engine

class Engine {
  constructor(cfg, tf, barCap) {
    this.cfg = cfg;
    this.scale = 10 ** cfg.digits;
    this.inv = 1 / this.scale;
    this.point = this.inv;
    this.time = 0; this.bidP = 0; this.askP = 0; this.started = false;
    this.balance = cfg.initialBalance; this.equity = cfg.initialBalance;
    this.marginUsed = 0; this.peak = cfg.initialBalance;
    this.positions = []; this.requests = [];
    this.nextTicket = 1; this.nextDeal = 1;
    this.nextRollover = 0; this.nextSample = 0;
    this.rng = new Rng(cfg.seed);
    this.series = new BarSeries(tf, barCap);
    this.isNewBar = false;
    this.deals = []; this.curve = [];
    this.maxDdAbs = 0; this.maxDdRel = 0; this.minEquity = cfg.initialBalance;
    this.rejects = {};
  }

  // ---- strategy-facing API (mirrors Engine in Rust)
  get bid() { return this.bidP * this.inv; }
  get ask() { return this.askP * this.inv; }
  bar(shift) { return this.series.get(shift); }
  newBar() { return this.isNewBar; }
  hasOpenRequest(magic, side) { return this.requests.some((r) => r.kind === "open" && r.magic === magic && r.side === side); }
  buy(lots, sl, tp, magic) { this.open(1, lots, sl, tp, magic); }
  sell(lots, sl, tp, magic) { this.open(-1, lots, sl, tp, magic); }
  close(ticket) { this.submit({ kind: "close", ticket }, this.cfg.closeMs); }

  toPts(price) { return price <= 0 ? 0 : Math.round(price * this.scale); }
  open(side, lots, sl, tp, magic) {
    this.submit({ kind: "open", side, lots, sl: this.toPts(sl), tp: this.toPts(tp), magic, seen: side > 0 ? this.askP : this.bidP }, this.cfg.openMs);
  }
  submit(req, lat) {
    const j = this.cfg.jitterMs > 0 ? Number(this.rng.nextU64() % BigInt(this.cfg.jitterMs + 1)) : 0;
    req.at = this.time + this.cfg.feedMs + lat + j;
    // sorted by activation time, FIFO among equals
    let i = this.requests.length;
    while (i > 0 && this.requests[i - 1].at > req.at) i--;
    this.requests.splice(i, 0, req);
  }

  // ---- helpers
  profitFor(side, lots, open, close) {
    return (side > 0 ? close - open : open - close) * this.inv * this.cfg.contractSize * lots;
  }
  closePx(side) { return side > 0 ? this.bidP : this.askP; }
  reject(why) { this.rejects[why] = (this.rejects[why] || 0) + 1; }
  validVolume(l) {
    const c = this.cfg;
    if (l < c.volumeMin - 1e-9 || l > c.volumeMax + 1e-9) return false;
    const s = l / c.volumeStep;
    return Math.abs(s - Math.round(s)) < 1e-6;
  }
  stopsOk(side, sl, tp) {
    const lvl = Math.max(this.cfg.stopsLevel, 1);
    return side > 0
      ? (sl === 0 || this.bidP - sl >= lvl) && (tp === 0 || tp - this.bidP >= lvl)
      : (sl === 0 || sl - this.askP >= lvl) && (tp === 0 || this.askP - tp >= lvl);
  }

  execute(r) {
    if (r.kind === "open") {
      if (!this.validVolume(r.lots)) return this.reject("volume");
      if (!this.stopsOk(r.side, r.sl, r.tp)) return this.reject("stops level");
      const slip = this.cfg.slippagePoints;
      const px = r.side > 0 ? this.askP + slip : this.bidP - slip;
      if (this.cfg.deviationPoints >= 0) {
        const adverse = r.side > 0 ? px - r.seen : r.seen - px;
        if (adverse > this.cfg.deviationPoints) return this.reject("requote");
      }
      this.openPosition(r.side, r.lots, px, r.sl, r.tp, r.magic);
    } else if (r.kind === "close") {
      const i = this.positions.findIndex((p) => p.ticket === r.ticket);
      if (i < 0) return this.reject("no position");
      const p = this.positions[i];
      this.closeAt(i, this.closePx(p.side) - this.cfg.slippagePoints * p.side, "out");
    }
  }

  openPosition(side, lots, px, sl, tp, magic) {
    const c = this.cfg;
    const margin = (lots * c.contractSize * px * this.inv) / c.leverage;
    if (margin > this.equity - this.marginUsed + 1e-9) return this.reject("no money");
    const comm = -round2(lots * c.commissionPerLot);
    this.balance += comm;
    this.marginUsed += margin;
    const ticket = this.nextTicket++;
    this.positions.push({ ticket, side, lots, open: px, openTime: this.time, sl, tp, magic, swap: 0, entryComm: comm, margin });
    this.deals.push({ id: this.nextDeal++, time: this.time, position: ticket, side, kind: "in", lots, price: px, commission: comm, swap: 0, profit: 0, net: 0, balance: this.balance });
  }

  closeAt(i, px, kind) {
    const p = this.positions[i];
    const profit = round2(this.profitFor(p.side, p.lots, p.open, px));
    const swap = round2(p.swap);
    const commOut = -round2(p.lots * this.cfg.commissionPerLot);
    this.balance += profit + swap + commOut;
    const net = profit + swap + commOut + p.entryComm;
    this.marginUsed -= p.margin;
    this.positions.splice(i, 1);
    if (!this.positions.length) this.marginUsed = 0;
    this.deals.push({ id: this.nextDeal++, time: this.time, position: p.ticket, side: p.side, kind, lots: p.lots, price: px, commission: commOut, swap, profit, net, balance: this.balance, openTime: p.openTime, openPrice: p.open });
  }

  processRequests() {
    while (this.requests.length && this.requests[0].at <= this.time) this.execute(this.requests.shift());
  }

  rollovers() {
    if (!this.positions.length) { this.nextRollover = Math.floor(this.time / DAY_MS) * DAY_MS + DAY_MS; return; }
    const c = this.cfg;
    while (this.time >= this.nextRollover) {
      const day = Math.floor(this.nextRollover / DAY_MS);
      const wd = (((day - 1 + 4) % 7) + 7) % 7; // weekday of the day that just ended, 0 = Sunday
      const f = c.swapRates[wd];
      if (f > 0) {
        for (const p of this.positions) {
          const rate = p.side > 0 ? c.swapLong : c.swapShort;
          p.swap += rate * this.inv * c.contractSize * p.lots * f;
        }
      }
      this.nextRollover += DAY_MS;
    }
  }

  checkSlTp() {
    for (let i = 0; i < this.positions.length; ) {
      const p = this.positions[i];
      let hit = null;
      if (p.side > 0) {
        if (p.sl && this.bidP <= p.sl) hit = [this.bidP, "sl"];
        else if (p.tp && this.bidP >= p.tp) hit = [p.tp, "tp"];
      } else {
        if (p.sl && this.askP >= p.sl) hit = [this.askP, "sl"];
        else if (p.tp && this.askP <= p.tp) hit = [p.tp, "tp"];
      }
      if (hit) this.closeAt(i, hit[0], hit[1]); else i++;
    }
  }

  floating() {
    let f = 0;
    for (const p of this.positions) f += this.profitFor(p.side, p.lots, p.open, this.closePx(p.side)) + p.swap;
    return f;
  }

  updateAccount() {
    this.equity = this.positions.length ? this.balance + this.floating() : this.balance;
    while (this.marginUsed > 0 && (this.equity / this.marginUsed) * 100 <= this.cfg.stopOutLevel && this.positions.length) {
      let worst = 0, worstPl = Infinity;
      this.positions.forEach((p, i) => {
        const pl = this.profitFor(p.side, p.lots, p.open, this.closePx(p.side)) + p.swap;
        if (pl < worstPl) { worstPl = pl; worst = i; }
      });
      this.closeAt(worst, this.closePx(this.positions[worst].side), "stopout");
      this.equity = this.positions.length ? this.balance + this.floating() : this.balance;
    }
    if (this.equity > this.peak) this.peak = this.equity;
    const dd = this.peak - this.equity;
    if (dd > this.maxDdAbs) this.maxDdAbs = dd;
    if (this.peak > 0 && (dd / this.peak) * 100 > this.maxDdRel) this.maxDdRel = (dd / this.peak) * 100;
    if (this.equity < this.minEquity) this.minEquity = this.equity;
  }

  /** One tick. Returns false for warm-up ticks (bars only, no trading). */
  step(t, bid, ask, flags, warmupUntil) {
    // A request that falls due BETWEEN two ticks executes at the quote valid at its due time,
    // i.e. the previous tick (validated against MT5 in the Rust engine).
    if (this.requests.length && this.started) {
      while (this.requests.length && this.requests[0].at < t) {
        const r = this.requests.shift();
        this.time = Math.max(r.at, this.time);
        this.execute(r);
      }
    }
    this.time = t; this.bidP = bid; this.askP = ask;
    const bidTick = flags === 0 || (flags & 2) !== 0; // bars are BID bars
    if (t < warmupUntil) {
      if (bidTick) this.isNewBar = this.series.update(t, bid * this.inv);
      return false;
    }
    if (!this.started) {
      this.started = true;
      this.nextSample = t;
      this.nextRollover = Math.floor(t / DAY_MS) * DAY_MS + DAY_MS;
    }
    if (t >= this.nextRollover) this.rollovers();
    if (this.requests.length) this.processRequests();
    if (this.positions.length) this.checkSlTp();
    this.updateAccount();
    this.isNewBar = bidTick ? this.series.update(t, bid * this.inv) : false;
    return true;
  }

  afterStrategy() {
    if (this.requests.length) {
      const np = this.positions.length, nd = this.deals.length;
      this.processRequests();
      if (this.positions.length !== np || this.deals.length !== nd) this.updateAccount();
    }
    if (this.time >= this.nextSample && this.cfg.equitySampleMs > 0) {
      this.curve.push([this.time, this.balance, this.equity]);
      this.nextSample = this.time + this.cfg.equitySampleMs;
    }
  }

  finish() {
    while (this.positions.length) this.closeAt(0, this.closePx(this.positions[0].side), "end");
    this.updateAccount();
    this.curve.push([this.time, this.balance, this.equity]);
    let grossProfit = 0, grossLoss = 0, wins = 0, losses = 0, trades = 0, commission = 0, swap = 0, stopOuts = 0;
    for (const d of this.deals) {
      commission += d.commission; swap += d.swap;
      if (d.kind === "in") continue;
      trades++;
      if (d.net > 0) { wins++; grossProfit += d.net; } else if (d.net < 0) { losses++; grossLoss += d.net; }
      if (d.kind === "stopout") stopOuts++;
    }
    return {
      initialBalance: this.cfg.initialBalance, finalBalance: this.balance,
      netProfit: this.balance - this.cfg.initialBalance,
      grossProfit, grossLoss, commission, swap, trades, wins, losses, stopOuts,
      profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : Infinity,
      winRate: trades ? (wins / trades) * 100 : 0,
      avgWin: wins ? grossProfit / wins : 0, avgLoss: losses ? grossLoss / losses : 0,
      expectedPayoff: trades ? (grossProfit + grossLoss) / trades : 0,
      maxDdAbs: this.maxDdAbs, maxDdRel: this.maxDdRel, minEquity: this.minEquity,
      rejects: this.rejects, deals: this.deals, curve: this.curve,
    };
  }
}

// ------------------------------------------------------------------ strategies

/** Close the opposite side, then open `side` unless already there (same helper as the Rust examples). */
function go(e, p, side) {
  for (const pos of e.positions.filter((x) => x.magic === p.magic && x.side === -side)) e.close(pos.ticket);
  if (e.positions.some((x) => x.magic === p.magic && x.side === side) || e.hasOpenRequest(p.magic, side)) return;
  const px = side > 0 ? e.ask : e.bid;
  const sl = p.stopLossPoints > 0 ? px - side * p.stopLossPoints * e.point : 0;
  const tp = p.takeProfitPoints > 0 ? px + side * p.takeProfitPoints * e.point : 0;
  (side > 0 ? e.buy : e.sell).call(e, p.lots, sl, tp, p.magic);
}

class Sma {
  constructor(n) { this.n = n; this.buf = new Float64Array(n); this.pos = 0; this.sum = 0; this.filled = 0; }
  update(x) {
    this.sum += x - this.buf[this.pos]; this.buf[this.pos] = x;
    this.pos = (this.pos + 1) % this.n;
    if (this.filled < this.n) this.filled++;
    if (this.pos === 0) { let s = 0; for (const v of this.buf) s += v; this.sum = s; } // exact re-sum, as in Rust
    return this.filled === this.n ? this.sum / this.n : null;
  }
}

class Rsi {
  constructor(n) { this.n = n; this.prev = null; this.g = 0; this.l = 0; this.seen = 0; }
  update(c) {
    const prev = this.prev; this.prev = c;
    if (prev === null) return null;
    const g = Math.max(c - prev, 0), l = Math.max(prev - c, 0), n = this.n;
    if (this.seen < n) {
      this.g += g / n; this.l += l / n; this.seen++;
      if (this.seen < n) return null;
    } else {
      this.g = (this.g * (n - 1) + g) / n; this.l = (this.l * (n - 1) + l) / n;
    }
    return this.l === 0 ? 100 : 100 - 100 / (1 + this.g / this.l);
  }
}

const COMMON = [
  { key: "timeframe", label: "Timeframe", type: "select", options: TIMEFRAMES },
  { key: "lots", label: "Lots", step: 0.01, min: 0.01, def: 0.1 },
  { key: "stopLossPoints", label: "Stop loss (points)", step: 10, min: 0, def: 300 },
  { key: "takeProfitPoints", label: "Take profit (points)", step: 10, min: 0, def: 600 },
];

/** name -> { label, description, params, create(p) -> { tf, onTick(e) } }. Parameters mirror the .set names of the Rust strategies. */
export const STRATEGIES = {
  sma_crossover: {
    label: "SMA crossover",
    description: "Fast SMA crosses slow SMA on closed bars: buy on the up-cross, sell on the down-cross, always in the market.",
    params: [
      { key: "fastPeriod", label: "Fast period", step: 1, min: 1, def: 10, opt: [5, 30, 5] },
      { key: "slowPeriod", label: "Slow period", step: 1, min: 2, def: 40, opt: [40, 90, 10] },
      ...COMMON,
    ],
    defaults: { timeframe: "M15", magic: 1 },
    create(p) {
      if (!(p.fastPeriod >= 1 && p.slowPeriod > p.fastPeriod)) throw new Error("need 1 <= fast < slow");
      const fast = new Sma(p.fastPeriod), slow = new Sma(p.slowPeriod);
      let prev = null;
      return {
        tf: p.timeframe,
        onTick(e) {
          if (!e.newBar()) return;
          const b = e.bar(1); if (!b) return;
          const f = fast.update(b.close), s = slow.update(b.close);
          if (f === null || s === null) return;
          const diff = f - s, was = prev; prev = diff;
          if (was === null) return;
          if (was <= 0 && diff > 0) go(e, p, 1); else if (was >= 0 && diff < 0) go(e, p, -1);
        },
      };
    },
  },
  rsi_reversion: {
    label: "RSI mean reversion",
    description: "Wilder RSI on closed bars: buy when it falls below the oversold level, sell when it rises above the overbought level.",
    params: [
      { key: "rsiPeriod", label: "RSI period", step: 1, min: 2, def: 14, opt: [7, 21, 7] },
      { key: "oversold", label: "Oversold", step: 1, min: 1, def: 30, opt: [20, 35, 5] },
      { key: "overbought", label: "Overbought", step: 1, min: 1, def: 70, opt: [65, 80, 5] },
      ...COMMON,
    ],
    defaults: { timeframe: "M15", magic: 2, takeProfitPoints: 300 },
    create(p) {
      if (!(p.rsiPeriod >= 2 && p.oversold > 0 && p.oversold < p.overbought && p.overbought < 100)) throw new Error("need 0 < oversold < overbought < 100");
      const rsi = new Rsi(p.rsiPeriod);
      return {
        tf: p.timeframe,
        onTick(e) {
          if (!e.newBar()) return;
          const b = e.bar(1); if (!b) return;
          const r = rsi.update(b.close); if (r === null) return;
          if (r < p.oversold) go(e, p, 1); else if (r > p.overbought) go(e, p, -1);
        },
      };
    },
  },
  donchian_breakout: {
    label: "Donchian breakout",
    description: "Buy a close above the highest high of the previous N bars, sell a close below the lowest low.",
    params: [{ key: "lookback", label: "Lookback (bars)", step: 1, min: 2, def: 20, opt: [10, 60, 10] }, ...COMMON],
    defaults: { timeframe: "H1", magic: 3, stopLossPoints: 400, takeProfitPoints: 800 },
    create(p) {
      if (!(p.lookback >= 2)) throw new Error("need lookback >= 2");
      return {
        tf: p.timeframe,
        onTick(e) {
          if (!e.newBar()) return;
          const last = e.bar(1); if (!last) return;
          let hi = -Infinity, lo = Infinity;
          for (let s = 2; s < 2 + p.lookback; s++) {
            const b = e.bar(s); if (!b) return;
            if (b.high > hi) hi = b.high;
            if (b.low < lo) lo = b.low;
          }
          if (last.close > hi) go(e, p, 1); else if (last.close < lo) go(e, p, -1);
        },
      };
    },
  },
};

export function defaultParams(name) {
  const s = STRATEGIES[name];
  const p = { magic: 1, ...s.defaults };
  for (const d of s.params) if (d.def !== undefined && p[d.key] === undefined) p[d.key] = d.def;
  for (const d of s.params) if (d.def !== undefined && s.defaults[d.key] !== undefined) p[d.key] = s.defaults[d.key];
  return p;
}

// ------------------------------------------------------------------ one pass

/**
 * Run one pass over data (from parseTicksCsv). `fromMs`/`toMs` bound the traded window; earlier
 * ticks only feed the bars (warm-up), exactly like `--from` in the Rust CLI.
 */
export function runBacktest(data, cfgIn, strategyName, params, fromMs = -Infinity, toMs = Infinity, { barCap = 1024 } = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...cfgIn, digits: data.digits };
  const strat = STRATEGIES[strategyName].create(params);
  const e = new Engine(cfg, strat.tf, barCap);
  const { t, bid, ask, flags, count } = data;
  for (let i = 0; i < count; i++) {
    if (t[i] >= toMs) break;
    if (e.step(t[i], bid[i], ask[i], flags[i], fromMs)) { strat.onTick(e); e.afterStrategy(); }
  }
  return e.finish();
}
