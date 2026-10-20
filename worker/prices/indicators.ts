// The technical levels behind GET /api/commodities/prices. Pure functions, no
// I/O. Definitions (the spec's §6):
//
//   bars        completed daily bars, oldest first, [date, open, high, low, close].
//               Today's partial bar is never in here; it is `last`.
//   highN/lowN  max high / min low of the last N bars, the latest completed bar
//               included. null with fewer than N bars.
//   52 weeks    the same over the last 252 bars, or all of them when fewer.
//   sma         mean of the last N closes; null with fewer than N bars.
//   atr20       Wilder: TR = max(h - l, |h - prevClose|, |l - prevClose|); the
//               first 20 TRs (bars 1..20) seed it as a plain mean, then
//               ATR = (ATR_prev * 19 + TR) / 20 over every later bar. Needs 21 bars.
//   change      `last` against the close k bars back: 1 = the latest completed
//               close, 5 = the one four sessions before it, 21 likewise. When
//               `last` is itself the latest completed close (no live price),
//               each count is one more, so d1Pct is not 0 against itself.
//   breakout    "up" when last > highN, "down" when last < lowN, else "none":
//               today's price outside the range of the N completed days.
//   stale       see isStale.
//
// structure (the shape of the market):
//   swings      fractal, k = 3: bar i is a swing high when its high is strictly
//               above the highs of the 3 bars before and the 3 after it (swing
//               low: strictly below the lows). The last 3 bars are never swings.
//   trendState  "up" when the last swing high and low are both above the ones
//               before them, "down" when both are below, else "range"; null
//               without two swing highs and two swing lows.
//   distToSma50InAtr   (last - sma50) / atr20.
//   daysSinceBreakout55  bars after the most recent bar that closed above the
//               high (or below the low) of the 55 bars before it; 0 = the latest
//               completed bar itself. null when none in the stored history.
//   atrPercentile1y    share of the last 252 daily atr20 values that are <= the
//               current one (0-1, the current value counts).
//   volRegime   atr20 against atr20 ten bars ago: > +10% "expanding",
//               < -10% "contracting", else "stable".
//
// A value that cannot be computed is null, never 0 or a guess.

import { addDays } from "../news/time";

export type Bar = [date: string, open: number, high: number, low: number, close: number];

const DATE = 0, HIGH = 2, LOW = 3, CLOSE = 4;

export const WEEK_52 = 252;

/** Max high of the last `n` bars (all of them when fewer); null with none. */
export function highN(bars: Bar[], n: number): number | null {
  const take = bars.slice(-n);
  return take.length ? Math.max(...take.map((b) => b[HIGH])) : null;
}

export function lowN(bars: Bar[], n: number): number | null {
  const take = bars.slice(-n);
  return take.length ? Math.min(...take.map((b) => b[LOW])) : null;
}

/** highN / lowN, but null unless there really are `n` bars. */
function full<T>(bars: Bar[], n: number, f: (b: Bar[], n: number) => T): T | null {
  return bars.length >= n ? f(bars, n) : null;
}

export function sma(bars: Bar[], n: number): number | null {
  if (bars.length < n) return null;
  let sum = 0;
  for (const b of bars.slice(-n)) sum += b[CLOSE];
  return sum / n;
}

/** Wilder ATR at every bar; null before the first has 20 true ranges (bar index n). */
export function atrSeries(bars: Bar[], n = 20): (number | null)[] {
  const out: (number | null)[] = bars.map(() => null);
  if (bars.length < n + 1) return out;
  const tr = (i: number) => {
    const prev = bars[i - 1][CLOSE];
    return Math.max(bars[i][HIGH] - bars[i][LOW], Math.abs(bars[i][HIGH] - prev), Math.abs(bars[i][LOW] - prev));
  };
  let value = 0;
  for (let i = 1; i <= n; i++) value += tr(i);
  value /= n;
  out[n] = value;
  for (let i = n + 1; i < bars.length; i++) out[i] = value = (value * (n - 1) + tr(i)) / n;
  return out;
}

export function atr(bars: Bar[], n = 20): number | null {
  return atrSeries(bars, n).at(-1) ?? null;
}

export const SWING_K = 3;

export interface Swing {
  date: string;
  price: number;
}

/** Confirmed swing highs (or lows), oldest first. */
export function swings(bars: Bar[], kind: "high" | "low", k = SWING_K): Swing[] {
  const col = kind === "high" ? HIGH : LOW;
  const beats = kind === "high" ? (a: number, b: number) => a > b : (a: number, b: number) => a < b;
  const out: Swing[] = [];
  for (let i = k; i < bars.length - k; i++) {
    let ok = true;
    for (let j = 1; j <= k && ok; j++) ok = beats(bars[i][col], bars[i - j][col]) && beats(bars[i][col], bars[i + j][col]);
    if (ok) out.push({ date: bars[i][DATE], price: bars[i][col] });
  }
  return out;
}

/**
 * From the last two swing highs and lows. A swing is confirmed only SWING_K bars late, so `last` can
 * already have taken the structure back: a down-trend whose last swing high is exceeded (or an
 * up-trend whose last swing low is lost) is a "range" until the next swings confirm.
 */
export function trendState(highs: Swing[], lows: Swing[], last: number | null = null): "up" | "down" | "range" | null {
  if (highs.length < 2 || lows.length < 2) return null;
  const [ph, lh] = highs.slice(-2), [pl, ll] = lows.slice(-2);
  if (lh.price > ph.price && ll.price > pl.price) return last != null && last < ll.price ? "range" : "up";
  if (lh.price < ph.price && ll.price < pl.price) return last != null && last > lh.price ? "range" : "down";
  return "range";
}

/** The most recent bar to close beyond the 55 bars before it: bars since, and which way. */
export function lastBreakout55(bars: Bar[]): { daysSince: number; dir: "up" | "down" } | null {
  for (let j = bars.length - 1; j >= 55; j--) {
    let hi = -Infinity, lo = Infinity;
    for (let i = j - 55; i < j; i++) {
      if (bars[i][HIGH] > hi) hi = bars[i][HIGH];
      if (bars[i][LOW] < lo) lo = bars[i][LOW];
    }
    const close = bars[j][CLOSE];
    if (close > hi) return { daysSince: bars.length - 1 - j, dir: "up" };
    if (close < lo) return { daysSince: bars.length - 1 - j, dir: "down" };
  }
  return null;
}

/** Percent move from `from` to `to`; null when either is missing or `from` is 0. */
export function pct(to: number | null, from: number | null | undefined): number | null {
  if (to == null || from == null || from === 0) return null;
  return ((to - from) / from) * 100;
}

/** The close `k` bars back, 1 = the latest completed close. */
export function closeBack(bars: Bar[], k: number): number | null {
  return bars.length >= k ? bars[bars.length - k][CLOSE] : null;
}

export function breakout(last: number | null, high: number | null, low: number | null): "up" | "down" | "none" | null {
  if (last == null || high == null || low == null) return null;
  return last > high ? "up" : last < low ? "down" : "none";
}

export function round(v: number | null, decimals = 2): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export interface Analysis {
  lastBarDate: string | null;
  change: { d1Pct: number | null; w1Pct: number | null; m1Pct: number | null };
  levels: {
    high10: number | null; low10: number | null;
    high20: number | null; low20: number | null;
    high55: number | null; low55: number | null;
    high52w: number | null; low52w: number | null;
  };
  atr20: number | null;
  sma50: number | null;
  sma200: number | null;
  signals: {
    aboveSma50: boolean | null;
    aboveSma200: boolean | null;
    sma50AboveSma200: boolean | null;
    breakout20: "up" | "down" | "none" | null;
    breakout55: "up" | "down" | "none" | null;
    distToHigh20InAtr: number | null;
    distToLow20InAtr: number | null;
  };
  structure: {
    trendState: "up" | "down" | "range" | null;
    lastSwingHigh: Swing | null;
    lastSwingLow: Swing | null;
    prevSwingHigh: Swing | null;
    prevSwingLow: Swing | null;
    distToSma50InAtr: number | null;
    daysSinceBreakout55: number | null;
    breakout55Dir: "up" | "down" | null;
    atrPercentile1y: number | null;
    volRegime: "expanding" | "contracting" | "stable" | null;
  };
}

/** Everything the endpoint reports for one instrument, from its completed bars and the live price. */
export function analyse(bars: Bar[], last: number | null, decimals = 2, lastIsBar = false): Analysis {
  // `last` is the latest completed bar's close (see Chart.live): the changes compare it with the bars before that.
  const skip = lastIsBar ? 1 : 0;
  const p = (v: number | null) => round(v, decimals);
  const h20 = full(bars, 20, highN), l20 = full(bars, 20, lowN);
  const h55 = full(bars, 55, highN), l55 = full(bars, 55, lowN);
  const series = atrSeries(bars, 20);
  const a = series.at(-1) ?? null;
  const s50 = sma(bars, 50), s200 = sma(bars, 200);
  const sh = swings(bars, "high"), sl = swings(bars, "low");
  const sw = (v: Swing | undefined): Swing | null => (v ? { date: v.date, price: p(v.price)! } : null);
  const brk = lastBreakout55(bars);
  const window = series.slice(-WEEK_52).filter((v): v is number => v != null);
  const before = series.length > 10 ? series[series.length - 11] : null;
  const above = (x: number | null, y: number | null) => (x == null || y == null ? null : x > y);

  return {
    lastBarDate: bars.length ? bars[bars.length - 1][DATE] : null,
    change: {
      d1Pct: round(pct(last, closeBack(bars, 1 + skip))),
      w1Pct: round(pct(last, closeBack(bars, 5 + skip))),
      m1Pct: round(pct(last, closeBack(bars, 21 + skip))),
    },
    levels: {
      high10: p(full(bars, 10, highN)), low10: p(full(bars, 10, lowN)),
      high20: p(h20), low20: p(l20),
      high55: p(h55), low55: p(l55),
      high52w: p(highN(bars, WEEK_52)), low52w: p(lowN(bars, WEEK_52)),
    },
    atr20: p(a),
    sma50: p(s50),
    sma200: p(s200),
    signals: {
      aboveSma50: above(last, s50),
      aboveSma200: above(last, s200),
      sma50AboveSma200: above(s50, s200),
      breakout20: breakout(last, h20, l20),
      breakout55: breakout(last, h55, l55),
      distToHigh20InAtr: last == null || h20 == null || !a ? null : round((last - h20) / a),
      distToLow20InAtr: last == null || l20 == null || !a ? null : round((last - l20) / a),
    },
    structure: {
      trendState: trendState(sh, sl, last),
      lastSwingHigh: sw(sh.at(-1)),
      lastSwingLow: sw(sl.at(-1)),
      prevSwingHigh: sw(sh.at(-2)),
      prevSwingLow: sw(sl.at(-2)),
      distToSma50InAtr: last == null || s50 == null || !a ? null : round((last - s50) / a),
      daysSinceBreakout55: brk?.daysSince ?? null,
      breakout55Dir: brk?.dir ?? null,
      atrPercentile1y: a == null ? null : round(window.filter((v) => v <= a).length / window.length),
      volRegime: a == null || !before ? null : a > before * 1.1 ? "expanding" : a < before * 0.9 ? "contracting" : "stable",
    },
  };
}

/**
 * New York's calendar date and weekday (0 = Sunday) at `ms`, by the US DST rule
 * (second Sunday of March to first Sunday of November, 02:00 local). Done by
 * hand: this runs on every request, and building an Intl.DateTimeFormat in a
 * fresh isolate costs milliseconds of the free plan's 10 ms.
 */
export function newYorkWall(ms: number): { date: string; weekday: number; hour: number } {
  const year = new Date(ms).getUTCFullYear();
  const sundayOnOrAfter = (month: number, day: number) => day + ((7 - new Date(Date.UTC(year, month, day)).getUTCDay()) % 7);
  const dstStart = Date.UTC(year, 2, sundayOnOrAfter(2, 8), 7); // 02:00 EST
  const dstEnd = Date.UTC(year, 10, sundayOnOrAfter(10, 1), 6); // 02:00 EDT
  const local = new Date(ms + (ms >= dstStart && ms < dstEnd ? -4 : -5) * 3_600_000);
  return { date: local.toISOString().slice(0, 10), weekday: local.getUTCDay(), hour: local.getUTCHours() };
}

/** Mon-Fri days after `date` up to and including `today` (both YYYY-MM-DD), by arithmetic: a long-dead instrument must not cost a loop. */
export function weekdaysSince(date: string, today: string): number {
  const from = Date.parse(`${date}T00:00:00Z`) / 86_400_000;
  const total = Date.parse(`${today}T00:00:00Z`) / 86_400_000 - from;
  if (!(total > 0)) return 0;
  let n = Math.floor(total / 7) * 5;
  for (let k = 1; k <= total % 7; k++) {
    const dow = (from + k + 4) % 7; // 1970-01-01 was a Thursday
    if (dow >= 1 && dow <= 5) n++;
  }
  return n;
}

export const STALE_FETCH_MS = 6 * 3_600_000;
export const STALE_BAR_WEEKDAYS = 3;

/**
 * Stale when the newest completed bar is more than 3 weekdays old, or — on a
 * weekday (New York) — the last successful fetch is more than 6 hours old.
 * Without a bar or a fetch time there is nothing to trust: stale.
 */
export function isStale(lastBarDate: string | null, fetchedAt: string | null, now: number): boolean {
  if (!lastBarDate || !fetchedAt) return true;
  const wall = newYorkWall(now);
  if (weekdaysSince(lastBarDate, wall.date) > STALE_BAR_WEEKDAYS) return true;
  const fetched = Date.parse(fetchedAt);
  const weekday = wall.weekday >= 1 && wall.weekday <= 5;
  return Number.isNaN(fetched) || (weekday && now - fetched > STALE_FETCH_MS);
}
