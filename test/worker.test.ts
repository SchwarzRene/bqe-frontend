import { describe, expect, it } from "vitest";
import { validateContact } from "../worker/contact";
import { parseConstituents } from "../worker/stack";
import {
  type Columns, isValidSymbol, mergeDaily, mergeHourly, refreshQuote, toColumns, yahooSymbol,
} from "../worker/yahoo";

/** Bars at t = from, from+step, … with close = price(t). */
function bars(from: number, n: number, price: (t: number) => number, tu = 86_400_000, step = 1): Columns {
  const t = Array.from({ length: n }, (_, i) => from + i * step);
  const c = t.map(price);
  return { tu, t, o: c, h: c, l: c, c };
}

/** A Yahoo chart response for the same bars, as fetch() would return it. */
function yahooBody(cols: Columns) {
  const step = cols.tu / 1000;
  return {
    chart: {
      result: [{
        timestamp: cols.t.map((t) => t * step),
        indicators: { quote: [{ open: cols.o, high: cols.h, low: cols.l, close: cols.c }] },
      }],
    },
  };
}

describe("yahoo", () => {
  it("scales OHLC by adjclose and drops unusable bars", () => {
    const body = {
      chart: {
        result: [
          {
            timestamp: [86_400 * 20000 + 48_600, 86_400 * 20001 + 48_600, 86_400 * 20002 + 48_600],
            indicators: {
              quote: [{ open: [100, null, 50], high: [110, 1, 55], low: [90, 1, 45], close: [100, 1, 5] }],
              adjclose: [{ adjclose: [50, 1, 5] }],
            },
          },
        ],
      },
    };
    const cols = toColumns(body, 86_400_000)!;
    expect(cols.t).toEqual([20000, 20002]); // snapped to the day, null bar gone
    expect(cols.c).toEqual([50, 5]);
    expect(cols.o[0]).toBe(50); // 100 * 50/100
    expect(cols.h[1]).toBe(55); // close under 10 -> 4 digits, k = 1
  });

  it("returns null for an empty result", () => {
    expect(toColumns({ chart: { result: null } }, 60_000)).toBeNull();
  });

  it("validates and respells symbols", () => {
    expect(isValidSymbol("BRK-B")).toBe(true);
    expect(isValidSymbol("../etc")).toBe(false);
    expect(yahooSymbol(" brk.b ")).toBe("BRK-B");
  });
});

describe("parseConstituents", () => {
  const html = `<p>x</p>
<table class="wikitable sortable" id="constituents"><tbody>
<tr><th>Symbol</th><th>Security</th><th>GICS Sector</th><th>GICS Sub-Industry</th></tr>
<tr><td><a rel="nofollow" class="external text" href="https://www.nyse.com/quote/XNYS:MMM">MMM</a></td>
<td><a href="/wiki/3M" title="3M">3M</a></td><td>Industrials</td><td>Industrial Conglomerates</td></tr>
<tr><td><a href="#">BRK.B</a></td><td><a href="/wiki/B">Berkshire Hathaway</a></td><td>Financials</td><td>x</td></tr>
<tr><td>AT&amp;T? no</td><td>bad</td><td>bad</td></tr>
</tbody></table><table id="changes"><tr><td>ZZZ</td></tr></table>`;

  it("reads the constituents table by its headers", () => {
    expect(parseConstituents(html)).toEqual([
      { s: "BRK.B", f: "BRK-B", n: "Berkshire Hathaway", sec: "Financials" },
      { s: "MMM", f: "MMM", n: "3M", sec: "Industrials" },
    ]);
  });

  it("gives up on a table whose headers changed", () => {
    expect(parseConstituents(html.replace("GICS Sector", "Sector"))).toEqual([]);
    expect(parseConstituents("<table id='other'></table>")).toEqual([]);
  });
});

describe("validateContact", () => {
  const good = { name: "Ada", email: "ada@example.com", subject: "general", message: "Hello there, a question." };

  it("accepts a valid submission", () => {
    expect(validateContact(good)).toEqual({ ok: true, value: { ...good, phone: "" } });
  });

  it("rejects bad fields", () => {
    const r = validateContact({ ...good, email: "nope", subject: "spam", message: "short" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "message", "subject"]);
  });
});

describe("incremental refresh", () => {
  const stored = bars(1000, 2500, (t) => 100 + (t % 7));

  it("appends recent days that agree with the stored history", () => {
    const recent = bars(3480, 25, (t) => 100 + (t % 7)); // 20 overlap, 5 new
    const merged = mergeDaily(stored, recent)!;
    expect(merged.t.length).toBe(2505);
    expect(merged.t.at(-1)).toBe(3504);
    expect(merged.t[0]).toBe(1000);
  });

  it("replaces the stored last bar rather than trusting it", () => {
    const edited = { ...stored, c: [...stored.c.slice(0, -1), 1] };
    expect(mergeDaily(edited, bars(3480, 25, (t) => 100 + (t % 7)))).not.toBeNull();
  });

  it("asks for a full download after a dividend re-adjusts history", () => {
    const adjusted = bars(3480, 25, (t) => (100 + (t % 7)) * 0.995);
    expect(mergeDaily(stored, adjusted)).toBeNull();
  });

  it("tolerates rounding but not a real move", () => {
    expect(mergeDaily(stored, bars(3480, 25, (t) => 100 + (t % 7) + 0.01))).not.toBeNull();
    expect(mergeDaily(stored, bars(3480, 25, (t) => 100 + (t % 7) + 0.02))).toBeNull();
  });

  it("asks for a full download when there is a gap", () => {
    expect(mergeDaily(stored, bars(3600, 25, () => 100))).toBeNull();
  });

  it("keeps a 60-day hourly window", () => {
    // Hourly `t` is in minutes (tu = 60 000), one bar every 60.
    const nowMin = 30_000_000;
    const hourly = (from: number, n: number, price: number) => bars(from, n, () => price, 60_000, 60);
    const stored = hourly(nowMin - 70 * 1440, 70 * 24, 5); // 70 days of hours
    const recent = hourly(nowMin - 5 * 1440, 5 * 24, 6); // the last 5 days
    const merged = mergeHourly(stored, recent, nowMin * 60_000)!;
    expect(merged.t[0]).toBeGreaterThanOrEqual(nowMin - 60 * 1440);
    expect(merged.t[0]).toBeLessThan(nowMin - 60 * 1440 + 60);
    expect(merged.t.at(-1)).toBe(recent.t.at(-1));
    expect(merged.c.at(-1)).toBe(6);
    expect(mergeHourly(stored, hourly(nowMin + 1440, 5, 6), nowMin * 60_000)).toBeNull(); // gap
  });

  it("downloads only the recent ranges when the history still matches", async () => {
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      const range = new URL(url).searchParams.get("range")!;
      asked.push(range);
      const cols = range === "1mo" ? bars(3480, 25, (t) => 100 + (t % 7)) : bars(30_000_000, 30, () => 5, 60_000, 60);
      return new Response(JSON.stringify(yahooBody(cols)));
    }) as typeof fetch;
    const hourly = bars(30_000_000 - 600, 25, () => 5, 60_000, 60);
    const { quote, full } = await refreshQuote("TEST", { d: stored, h1: hourly }, false, 30_002_000 * 60_000, fetcher);
    expect(full).toBe(false);
    expect(asked.sort()).toEqual(["1mo", "5d"]);
    expect(quote.d.t.length).toBe(2505);
    expect(quote.h1!.t.at(-1)).toBe(30_000_000 + 29 * 60);
  });

  it("downloads the whole history when forced or when nothing is stored", async () => {
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(new URL(url).searchParams.get("range")!);
      return new Response(JSON.stringify(yahooBody(bars(1000, 2500, () => 100))));
    }) as typeof fetch;
    expect((await refreshQuote("TEST", null, false, Date.now(), fetcher)).full).toBe(true);
    expect((await refreshQuote("TEST", { d: stored }, true, Date.now(), fetcher)).full).toBe(true);
    expect(asked.sort()).toEqual(["10y", "10y", "60d", "60d"]);
  });
});
