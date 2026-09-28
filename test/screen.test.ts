import { describe, expect, it } from "vitest";
import { screenStocks } from "../worker/news/chat";
import {
  backfillScreen, currentRows, findRow, mergeScreen, readScreen, rsi, type ScreenRow, screenRow, screenSummary, shortName,
} from "../worker/screen";
import type { Columns } from "../worker/yahoo";
import { d1 } from "./d1";

const DAY = 86_400_000;

/** Daily bars ending on `end` (epoch day), close = price(i). */
function daily(n: number, price: (i: number) => number, end = Math.floor(Date.UTC(2026, 8, 25) / DAY)): Columns {
  const t = Array.from({ length: n }, (_, i) => end - (n - 1 - i));
  const c = t.map((_, i) => price(i));
  return { tu: DAY, t, o: c, h: c.map((x) => x * 1.01), l: c.map((x) => x * 0.99), c };
}

const meta = { s: "TEST", n: "Test Corp.", sec: "Energy" };

describe("screen figures", () => {
  it("computes returns, averages and the 52-week range from daily closes", () => {
    // 300 bars rising by 1 a day from 100: last close 399.
    const row = screenRow(meta, daily(300, (i) => 100 + i))!;
    expect(row.px).toBe(399);
    expect(row.date).toBe("2026-09-25");
    expect(row.r1d).toBeCloseTo((399 / 398 - 1) * 100, 2);
    expect(row.r1m).toBeCloseTo((399 / 378 - 1) * 100, 2);
    expect(row.r1y).toBeCloseTo((399 / 147 - 1) * 100, 2);
    // The high is 1% above the last close, the low 1% below the close 251 bars back.
    expect(row.hi52).toBeCloseTo((1 / 1.01 - 1) * 100, 2);
    expect(row.lo52).toBeCloseTo((399 / (148 * 0.99) - 1) * 100, 1);
    expect(row.sma50).toBeGreaterThan(0);
    expect(row.sma200).toBeGreaterThan(row.sma50!);
    expect(row.rsi).toBe(100);
    expect(row.streak).toBe(299);
    expect(row.vol).toBeGreaterThan(0);
  });

  it("measures year to date from the last close of the previous year", () => {
    const end = Math.floor(Date.UTC(2026, 0, 5) / DAY); // 5 January
    // Closes: …, 31 Dec = 100 (index n-6), then 1-5 Jan at 110.
    const row = screenRow(meta, daily(30, (i) => (i < 25 ? 100 : 110), end))!;
    expect(row.ytd).toBeCloseTo(10, 5);
  });

  it("counts a falling streak and leaves missing horizons empty", () => {
    const row = screenRow(meta, daily(30, (i) => 200 - i))!;
    expect(row.streak).toBe(-29);
    expect(row.r3m).toBeNull();
    expect(row.sma200).toBeNull();
    expect(screenRow(meta, daily(1, () => 5))).toBeNull();
  });

  it("gives RSI 50 on a flat series and a middling value on a zigzag", () => {
    expect(rsi(Array(40).fill(10), 14)).toBe(50);
    const zig = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 2 : 0));
    expect(rsi(zig, 14)).toBeGreaterThan(40);
    expect(rsi(zig, 14)).toBeLessThan(60);
  });

  it("finds companies by symbol or name, and shortens names for headline search", () => {
    const rows = [
      { ...screenRow(meta, daily(30, (i) => 100 + i))!, s: "BRK.B", n: "Berkshire Hathaway" },
      { ...screenRow(meta, daily(30, (i) => 100 + i))!, s: "AAPL", n: "Apple Inc." },
    ];
    expect(findRow(rows, "brk-b")?.s).toBe("BRK.B");
    expect(findRow(rows, "apple")?.s).toBe("AAPL");
    expect(findRow(rows, "nothing")).toBeNull();
    expect(shortName("Apple Inc.")).toBe("Apple");
    expect(shortName("Alphabet Inc. (Class A)")).toBe("Alphabet");
    expect(shortName("Exxon Mobil Corporation")).toBe("Exxon Mobil");
  });
});

function sample(): ScreenRow[] {
  const mk = (s: string, sec: string, drift: number) => screenRow({ s, n: `${s} Inc.`, sec }, daily(260, (i) => 100 * (1 + drift) ** i))!;
  return [mk("UP", "Energy", 0.004), mk("FLAT", "Energy", 0), mk("DOWN", "Health Care", -0.003), mk("TECH", "Information Technology", 0.002)];
}

describe("screen in the chat", () => {
  it("ranks the index by a figure, within a sector if asked", () => {
    const rows = sample();
    const all: any = screenStocks(rows, { sort_by: "r1m", order: "desc", limit: 2 });
    expect(all.of).toBe(4);
    expect(all.rows.map((r: string) => r.split(" ")[0])).toEqual(["UP", "TECH"]);
    const energy: any = screenStocks(rows, { sort_by: "r1m", order: "asc", sector: "energy" });
    expect(energy.rows.map((r: string) => r.split(" ")[0])).toEqual(["FLAT", "UP"]);
    expect((screenStocks(rows, { sort_by: "r1m", sector: "Mining" }) as any).error).toMatch(/no sector/);
    expect((screenStocks([], { sort_by: "r1d" }) as any).error).toMatch(/not built/);
  });

  it("summarises breadth, sectors and the extremes for the prompt", () => {
    const text = screenSummary(sample());
    expect(text).toContain("As of the close on 2026-09-25; 4 constituents");
    expect(text).toContain("- Energy | 2 |");
    expect(text).toMatch(/Top 10 on the day:\nUP UP Inc\. \(Energy\)/);
    expect(text).toMatch(/Bottom 10 over 1 month:\nDOWN /);
    expect(screenSummary([])).toMatch(/No S&P 500 screen yet/);
  });

  it("leaves out rows the refresh has not reached for days", () => {
    const rows = sample();
    const stale = { ...rows[0], s: "OLD", date: "2026-09-10" };
    expect(currentRows([...rows, stale]).map((r) => r.s)).not.toContain("OLD");
  });
});

describe("screen storage", () => {
  it("merges rows, backfills from stored prices and drops companies that left", async () => {
    const db = d1();
    const env: any = { DB: db };
    const body = (s: string) => JSON.stringify({ s, n: `${s} Inc.`, sec: "Energy", updated: "2026-09-26T00:10:00Z", d: daily(260, (i) => 50 + i) });
    for (const s of ["AAA", "BBB", "CCC"]) {
      db.raw.prepare("INSERT INTO tickers (symbol, file, name, sector, active) VALUES (?, ?, ?, 'Energy', 1)").run(s, s, `${s} Inc.`);
      db.raw.prepare("INSERT INTO series (file, body, updated) VALUES (?, ?, '2026-09-26T00:10:00Z')").run(s, body(s));
    }

    // A company that has since left the index is in the stored screen.
    await mergeScreen(env, [{ ...screenRow({ s: "GONE", n: "Gone", sec: "Energy" }, daily(30, () => 1))! }]);
    expect((await readScreen(env)).map((r) => r.s)).toEqual(["GONE"]);

    expect(await backfillScreen(env, 2)).toEqual({ filled: 2, behind: 1 });
    expect(await backfillScreen(env, 2)).toEqual({ filled: 1, behind: 0 });
    const rows = await readScreen(env);
    expect(rows.map((r) => r.s)).toEqual(["AAA", "BBB", "CCC"]);
    expect(rows[0].px).toBe(309);
    // Nothing behind: nothing read, nothing written.
    expect(await backfillScreen(env)).toEqual({ filled: 0, behind: 0 });
  });
});
