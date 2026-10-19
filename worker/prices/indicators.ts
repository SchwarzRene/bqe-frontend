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
//               close, 5 = the one four sessions before it, 21 likewise.
//   breakout    "up" when last > highN, "down" when last < lowN, else "none":
//               today's price outside the range of the N completed days.
//   stale       see isStale.
//
// A value that cannot be computed is null, never 0 or a guess.

import { addDays, ET, wallClock } from "../news/time";

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

export function atr(bars: Bar[], n = 20): number | null {
  if (bars.length < n + 1) return null;
  const tr = (i: number) => {
    const prev = bars[i - 1][CLOSE];
    return Math.max(bars[i][HIGH] - bars[i][LOW], Math.abs(bars[i][HIGH] - prev), Math.abs(bars[i][LOW] - prev));
  };
  let value = 0;
  for (let i = 1; i <= n; i++) value += tr(i);
  value /= n;
  for (let i = n + 1; i < bars.length; i++) value = (value * (n - 1) + tr(i)) / n;
  return value;
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
}

/** Everything the endpoint reports for one instrument, from its completed bars and the live price. */
export function analyse(bars: Bar[], last: number | null, decimals = 2): Analysis {
  const p = (v: number | null) => round(v, decimals);
  const h20 = full(bars, 20, highN), l20 = full(bars, 20, lowN);
  const h55 = full(bars, 55, highN), l55 = full(bars, 55, lowN);
  const a = atr(bars, 20);
  const s50 = sma(bars, 50), s200 = sma(bars, 200);
  const above = (x: number | null, y: number | null) => (x == null || y == null ? null : x > y);

  return {
    lastBarDate: bars.length ? bars[bars.length - 1][DATE] : null,
    change: {
      d1Pct: round(pct(last, closeBack(bars, 1))),
      w1Pct: round(pct(last, closeBack(bars, 5))),
      m1Pct: round(pct(last, closeBack(bars, 21))),
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
  };
}

/** Mon-Fri days after `date` up to and including `today` (both YYYY-MM-DD). */
export function weekdaysSince(date: string, today: string): number {
  let n = 0;
  for (let d = addDays(date, 1); d <= today; d = addDays(d, 1)) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
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
  const wall = wallClock(now, ET);
  if (weekdaysSince(lastBarDate, wall.date) > STALE_BAR_WEEKDAYS) return true;
  const fetched = Date.parse(fetchedAt);
  const weekday = wall.weekday >= 1 && wall.weekday <= 5;
  return Number.isNaN(fetched) || (weekday && now - fetched > STALE_FETCH_MS);
}
