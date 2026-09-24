import { describe, expect, it } from "vitest";
import { validateContact } from "../worker/contact";
import { cleanEvent, etDate, etToUtc, extractJson, started } from "../worker/markettape";
import { parseConstituents } from "../worker/stack";
import { isValidSymbol, toColumns, yahooSymbol } from "../worker/yahoo";

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

describe("markettape", () => {
  it("extracts JSON from fenced or chatty model output", () => {
    expect(extractJson('Here you go:\n```json\n[{"a":1},{"b":"]"}]\n```')).toEqual([{ a: 1 }, { b: "]" }]);
    expect(extractJson('{"status":"not_yet"} trailing')).toEqual({ status: "not_yet" });
    expect(extractJson("nothing here")).toBeNull();
  });

  it("salvages a truncated array", () => {
    expect(extractJson('[{"a":1},{"b":2},{"c":')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("cleans events and rejects unusable rows", () => {
    const e = cleanEvent(
      {
        title: "Q3", date: "2026-10-28", ticker: "msft", releaseET: "16:05", streamKind: "tv",
        streamUrl: "javascript:alert(1)", links: [{ url: "https://x.com" }, { url: "ftp://y" }],
      },
      "earnings",
      2,
    )!;
    expect(e.id).toBe("earnings-2");
    expect(e.ticker).toBe("MSFT");
    expect(e.streamKind).toBe("page");
    expect(e.streamUrl).toBe("");
    expect(e.links).toEqual([{ label: "Link", url: "https://x.com" }]);
    expect(cleanEvent({ title: "x", date: "soon" }, "fed", 0)).toBeNull();
  });

  it("converts New York wall time across DST", () => {
    expect(new Date(etToUtc("2026-07-01", 14, 0)).toISOString()).toBe("2026-07-01T18:00:00.000Z");
    expect(new Date(etToUtc("2026-12-01", 14, 0)).toISOString()).toBe("2026-12-01T19:00:00.000Z");
    expect(etDate(new Date("2026-09-25T02:00:00Z"))).toBe("2026-09-24");
  });

  it("knows when an event has started", () => {
    const e = cleanEvent({ title: "FOMC", date: "2026-07-01", timeET: "14:00" }, "fed", 0)!;
    expect(started(e, new Date("2026-07-01T17:59:00Z"))).toBe(false);
    expect(started(e, new Date("2026-07-01T18:30:00Z"))).toBe(true);
    expect(started(e, new Date("2026-07-03T18:30:00Z"))).toBe(false);
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
