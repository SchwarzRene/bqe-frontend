// Commodity prices: the indicators against a hand-computed fixture, and the New York wall clock.

import { describe, expect, it } from "vitest";
import { analyse, atr, atrSeries, swings, trendState, type Bar, breakout, highN, isStale, lowN, sma, weekdaysSince, newYorkWall } from "../../worker/prices/indicators";
import { wallClock, ET } from "../../worker/news/time";
import { date } from "./fixtures";

// 30 bars: close = 100 + i, high = close + 2, low = close - 2, open = close.
// Every true range is max(4, 3, 1) = 4, so ATR is exactly 4 whatever the seed.
const line: Bar[] = Array.from({ length: 30 }, (_, i) => [date(i), 100 + i, 102 + i, 98 + i, 100 + i]);

describe("indicators", () => {
  it("highN and lowN cover the last N bars, the latest included", () => {
    expect(highN(line, 10)).toBe(131); // bar 29: 129 + 2
    expect(lowN(line, 10)).toBe(118); // bar 20: 120 - 2 ... 98 + 20
    expect(highN(line, 20)).toBe(131);
    expect(lowN(line, 20)).toBe(108); // bar 10
    expect(lowN(line, 30)).toBe(98);
  });

  it("sma is the mean of the last N closes, null without N bars", () => {
    expect(sma(line, 5)).toBe(127); // 125..129
    expect(sma(line, 30)).toBe(114.5);
    expect(sma(line, 50)).toBeNull();
  });

  it("atr is Wilder's: a mean of the first 20 true ranges, then smoothed", () => {
    expect(atr(line, 20)).toBe(4);
    expect(atr(line.slice(0, 20), 20)).toBeNull(); // 20 bars give 19 true ranges
    expect(atr(line.slice(0, 21), 20)).toBe(4); // 20 true ranges: just the seed
    // A 22nd bar with TR = 24 (h 130, l 106 around prev close 120): (4 * 19 + 24) / 20 = 5
    const wide: Bar[] = [...line.slice(0, 21), [date(21), 121, 130, 106, 121]];
    expect(atr(wide, 20)).toBe(5);
    // and one more calm bar (TR 4) smooths it back: (5 * 19 + 4) / 20 = 4.95
    expect(atr([...wide, [date(22), 121, 123, 119, 121]], 20)).toBeCloseTo(4.95, 10);
  });

  it("breakout compares the live price with the completed range", () => {
    expect(breakout(132, 131, 108)).toBe("up");
    expect(breakout(107, 131, 108)).toBe("down");
    expect(breakout(131, 131, 108)).toBe("none"); // equal is not a breakout
    expect(breakout(null, 131, 108)).toBeNull();
    expect(breakout(120, null, 108)).toBeNull();
  });

  it("analyse puts it together and returns null for what the history cannot support", () => {
    const a = analyse(line, 133);
    expect(a.lastBarDate).toBe(date(29));
    expect(a.levels).toMatchObject({ high10: 131, low10: 118, high20: 131, low20: 108, high52w: 131, low52w: 98 });
    expect(a.levels.high55).toBeNull();
    expect(a.atr20).toBe(4);
    expect(a.sma50).toBeNull();
    expect(a.sma200).toBeNull();
    expect(a.change.d1Pct).toBe(Math.round(((133 - 129) / 129) * 1e4) / 100); // 3.1
    expect(a.change.w1Pct).toBe(Math.round(((133 - 125) / 125) * 1e4) / 100); // 5 bars back = bar 25
    expect(a.change.m1Pct).toBe(Math.round(((133 - 109) / 109) * 1e4) / 100); // 21 bars back = bar 9
    expect(a.signals).toMatchObject({
      aboveSma50: null, aboveSma200: null, sma50AboveSma200: null,
      breakout20: "up", breakout55: null,
      distToHigh20InAtr: 0.5, // (133 - 131) / 4
      distToLow20InAtr: 6.25, // (133 - 108) / 4
    });
    expect(analyse(line, 105).signals.breakout20).toBe("down");
    expect(analyse(line, 120).signals.breakout20).toBe("none");
  });

  it("everything is null without a price or bars", () => {
    const a = analyse(line, null);
    expect(a.change).toEqual({ d1Pct: null, w1Pct: null, m1Pct: null });
    expect(a.signals.breakout20).toBeNull();
    expect(a.signals.distToHigh20InAtr).toBeNull();
    const none = analyse([], 100);
    expect(none.lastBarDate).toBeNull();
    expect(none.levels.high52w).toBeNull();
    expect(none.atr20).toBeNull();
  });

  it("long series: sma200 and the 52-week window", () => {
    const long: Bar[] = Array.from({ length: 300 }, (_, i) => [date(i), 100 + i, 102 + i, 98 + i, 100 + i]);
    const a = analyse(long, 400);
    expect(a.sma50).toBe(374.5); // closes 350..399 (bars 250..299)
    expect(a.sma200).toBe(299.5); // closes 200..399 (bars 100..299)
    expect(a.levels.low52w).toBe(98 + 48); // last 252 bars start at index 48
    expect(a.signals).toMatchObject({ aboveSma50: true, aboveSma200: true, sma50AboveSma200: true });
  });

  // A zigzag through the given [index, close] points, linear in between; high = close + 1, low = close - 1.
  const zigzag = (points: [number, number][]): Bar[] => {
    const out: Bar[] = [];
    for (let i = points[0][0]; i <= points.at(-1)![0]; i++) {
      const k = points.findIndex(([x]) => x >= i);
      const [x1, y1] = points[k], [x0, y0] = k ? points[k - 1] : points[k];
      const c = x1 === x0 ? y1 : y0 + ((y1 - y0) * (i - x0)) / (x1 - x0);
      out.push([date(i), c, c + 1, c - 1, c]);
    }
    return out;
  };

  it("structure: swing points and trendState for an up-trend, a down-trend and a range", () => {
    // peaks at 6 and 18, troughs at 12 and 24; 30 is too close to the end to be a swing
    const up = analyse(zigzag([[0, 100], [6, 110], [12, 104], [18, 114], [24, 107], [30, 118]]), 118).structure;
    expect(up).toMatchObject({
      trendState: "up",
      lastSwingHigh: { date: date(18), price: 115 }, prevSwingHigh: { date: date(6), price: 111 },
      lastSwingLow: { date: date(24), price: 106 }, prevSwingLow: { date: date(12), price: 103 },
    });
    const down = analyse(zigzag([[0, 120], [6, 110], [12, 116], [18, 106], [24, 112], [30, 102]]), 102).structure;
    expect(down.trendState).toBe("down");
    expect(down.lastSwingLow).toEqual({ date: date(18), price: 105 });
    const range = analyse(zigzag([[0, 100], [6, 110], [12, 104], [18, 114], [24, 100], [30, 108]]), 108).structure;
    expect(range.trendState).toBe("range"); // higher high, lower low
    // a plain line has no swings at all
    expect(analyse(line, 130).structure).toMatchObject({ trendState: null, lastSwingHigh: null, prevSwingLow: null });
    // strict: a flat top is no swing
    expect(swings(zigzag([[0, 100], [3, 100], [4, 100], [10, 90]]), "high")).toEqual([]);
    expect(trendState([], [])).toBeNull();
  });

  it("structure: distance to the 50-day average, in ATRs", () => {
    const long: Bar[] = Array.from({ length: 300 }, (_, i) => [date(i), 100 + i, 102 + i, 98 + i, 100 + i]);
    expect(analyse(long, 400).structure.distToSma50InAtr).toBe(6.38); // (400 - 374.5) / 4 = 6.375
    expect(analyse(line, 130).structure.distToSma50InAtr).toBeNull(); // no sma50
  });

  it("structure: days since a 55-bar breakout, and its direction", () => {
    const flat: Bar[] = Array.from({ length: 60 }, (_, i) => [date(i), 100, 101, 99, 100]);
    const up: Bar[] = [...flat, [date(60), 100, 106, 100, 105], ...[61, 62, 63].map((i): Bar => [date(i), 104, 105, 103, 104])];
    expect(analyse(up, 104).structure).toMatchObject({ daysSinceBreakout55: 3, breakout55Dir: "up" });
    const down: Bar[] = [...flat, [date(60), 100, 100, 93, 94]];
    expect(analyse(down, 94).structure).toMatchObject({ daysSinceBreakout55: 0, breakout55Dir: "down" });
    expect(analyse(flat, 100).structure).toMatchObject({ daysSinceBreakout55: null, breakout55Dir: null });
    expect(analyse(line, 130).structure.breakout55Dir).toBeNull(); // 30 bars: no 55-bar prior
  });

  it("structure: ATR percentile and volatility regime", () => {
    expect(atrSeries(line, 20).filter((v) => v !== null)).toHaveLength(10); // idx 20..29
    expect(analyse(line, 130).structure).toMatchObject({ atrPercentile1y: 1, volRegime: null }); // ten bars ago has no ATR yet
    const longer: Bar[] = Array.from({ length: 40 }, (_, i) => [date(i), 100 + i, 102 + i, 98 + i, 100 + i]);
    expect(analyse(longer, 140).structure).toMatchObject({ atrPercentile1y: 1, volRegime: "stable" }); // 4 vs 4
    const wide: Bar[] = [...line, [date(30), 130, 142, 118, 130]]; // TR 24 -> ATR 5, ten bars ago 4
    expect(analyse(wide, 130).structure).toMatchObject({ volRegime: "expanding", atrPercentile1y: 1 });
    const calm: Bar[] = [...wide, [date(31), 130, 132, 128, 130]]; // ATR (5 * 19 + 4) / 20 = 4.95
    // 11 of the 12 values (ten 4s, the 5, itself) are <= 4.95; ten bars ago it was 4: +23.75%
    expect(analyse(calm, 130).structure).toMatchObject({ volRegime: "expanding", atrPercentile1y: 0.92 });
    // a short history cannot say
    expect(analyse(line.slice(0, 15), 110).structure).toMatchObject({ atrPercentile1y: null, volRegime: null });
  });

  it("stale: an old bar, or an old fetch on a weekday", () => {
    const wed = Date.parse("2026-10-21T14:00:00Z");
    expect(weekdaysSince("2026-10-16", "2026-10-19")).toBe(1); // Fri -> Mon
    expect(weekdaysSince("2026-10-19", "2026-10-19")).toBe(0);
    expect(weekdaysSince("2026-10-21", "2026-10-19")).toBe(0);
    // the same as counting the days one by one, for every start and length over a few weeks
    for (let a = 0; a < 21; a++) for (let b = 0; b < 40; b++) {
      const from = new Date(Date.UTC(2026, 0, 1 + a)).toISOString().slice(0, 10), to = new Date(Date.UTC(2026, 0, 1 + a + b)).toISOString().slice(0, 10);
      let n = 0;
      for (let k = 1; k <= b; k++) { const dow = new Date(Date.UTC(2026, 0, 1 + a + k)).getUTCDay(); if (dow >= 1 && dow <= 5) n++; }
      expect(weekdaysSince(from, to)).toBe(n);
    }
    expect(isStale("2026-10-20", "2026-10-21T12:00:00Z", wed)).toBe(false);
    expect(isStale("2026-10-20", "2026-10-21T07:00:00Z", wed)).toBe(true); // 7 h old on a weekday
    expect(isStale("2026-10-15", "2026-10-21T13:00:00Z", wed)).toBe(true); // Thu bar: Fri Mon Tue Wed = 4
    expect(isStale("2026-10-16", "2026-10-21T13:00:00Z", wed)).toBe(false); // Mon Tue Wed = 3
    const sun = Date.parse("2026-10-25T14:00:00Z");
    expect(isStale("2026-10-23", "2026-10-24T11:00:00Z", sun)).toBe(false); // old fetch is fine at the weekend
    expect(isStale(null, null, wed)).toBe(true);
  });
});

describe("newYorkWall", () => {
  it("agrees with Intl across two years, DST changes included", () => {
    let checked = 0;
    for (let ms = Date.parse("2025-01-01T00:00:00Z"); ms < Date.parse("2027-01-01T00:00:00Z"); ms += 37 * 60_000) {
      const a = newYorkWall(ms), b = wallClock(ms, ET);
      if (a.date !== b.date || a.weekday !== b.weekday || a.hour !== b.hour) throw new Error(`mismatch at ${new Date(ms).toISOString()}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      checked++;
    }
    expect(checked).toBeGreaterThan(28_000);
  });
});
