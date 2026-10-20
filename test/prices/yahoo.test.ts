// Commodity prices: reading Yahoo's chart answer.

import { describe, expect, it } from "vitest";
import { parseChart } from "../../worker/prices/yahoo";
import { date } from "./fixtures";

describe("parseChart", () => {
  const day = 86_400;
  const t0 = Date.parse("2026-10-14T00:00:00Z") / 1000;
  const chart = (extra: any = {}) => ({
    chart: {
      result: [{
        meta: { gmtoffset: 0, regularMarketPrice: 4211.4, regularMarketTime: t0 + 6 * day + 3600, ...extra },
        timestamp: [t0, t0 + day, t0 + 2 * day, t0 + 3 * day],
        indicators: { quote: [{ open: [1, 2, null, 4], high: [2, 3, 3, 5], low: [0, 1, 1, 3], close: [1.5, 2.5, 2.5, 4.5] }] },
      }],
    },
  });

  it("drops null bars and the exchange's current day", () => {
    // "now" is 2026-10-17 (the fourth bar's day): that bar is still forming.
    const out = parseChart(chart(), Date.parse("2026-10-17T15:00:00Z"));
    expect(out.bars.map((b) => b[0])).toEqual(["2026-10-14", "2026-10-15"]); // the null bar went too
    expect(out.last).toBe(4211.4);
    expect(out.lastAt).toBe("2026-10-20T01:00:00Z");
    // the next day it is complete
    expect(parseChart(chart(), Date.parse("2026-10-18T15:00:00Z")).bars).toHaveLength(3);
  });

  it("uses the exchange's date, and throws on a body without data", () => {
    // GMT-4: 20:00 UTC on the 16th is still the 16th; a bar stamped 00:00 UTC on the 17th is the 16th local.
    const out = parseChart(chart({ gmtoffset: -14_400 }), Date.parse("2026-10-17T12:00:00Z"));
    expect(out.bars[0][0]).toBe("2026-10-13");
    expect(() => parseChart({ chart: { result: null } })).toThrow();
  });
});
