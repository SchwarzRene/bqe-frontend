// Market News end to end: calendar sources and ranking (real SQLite, stubbed internet).

import { afterEach, describe, expect, it, vi } from "vitest";
import { CALENDAR, type CalendarConfig, readCalendar, refreshCalendar } from "../../worker/news/calendar";
import { handleNews } from "../../worker/news/index";
import { rankCalendar } from "../../worker/news/rank";
import { cfg, NOW, internet, envWith } from "./flow-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Market News flow: calendar", () => {
  it("reads Yahoo's economic calendar: results as published, meetings' rates, fallbacks off", async () => {
    // CPI at 08:30 New York on the 24th, before release: Yahoo writes 0 for "not yet".
    let econ: unknown[][] = [
      ["CPI MM, SA", "US", "2026-09-24T12:30:00.000Z", "Aug", 0, 0.3, 0.2, 0],
      ["CPI YY, NSA", "US", "2026-09-24T12:30:00.000Z", "Aug", 0, 2.9, 2.7, 0],
      ["Initial Jobless Clm", "US", "2026-09-24T12:30:00.000Z", "", 0, 225, 231, 0],
      ["ECB Refinancing Rate", "EZ", "2026-09-25T12:15:00.000Z", "", 0, 2.15, 2.15, 0],
      ["Tankan Big Mfg Idx", "JP", "2026-10-01T23:50:00.000Z", "Q3", 0, 13, 12, 0],
      ["Fed Waller Speaks", "US", "2026-09-24T15:00:00.000Z", "", 0, 0, 0, 0],
      ["BoE MPC Member Speaks", "GB", "2026-09-24T10:00:00.000Z", "", 0, 0, 0, 0],
      ["Car Registrations", "IT", "2026-09-24T08:00:00.000Z", "", 5, 0, 0, 0],
    ];
    const calls = internet({ econ: () => econ });
    const env = envWith();
    const cal: CalendarConfig = {
      meetings: [{ type: "eu-central-bank", title: "ECB rate decision", date: "2026-09-25", time: "14:15", tz: "Europe/Berlin", minutes: 90, region: "europe", importance: 3, country: "EZ" }],
      weekly: [{ type: "us-data", title: "US weekly jobless claims", weekday: 4, time: "08:30", tz: "America/New_York", region: "us", importance: 2, fallback: true }],
      monthly: [],
      yahooEconomic: CALENDAR.yahooEconomic,
      ics: [{ id: "bls", name: "BLS", url: "https://www.bls.gov/schedule/news_release/bls.ics", type: "us-data", region: "us", fallback: true, include: [{ match: "Consumer Price Index", title: "US CPI", importance: 3 }] }],
    };
    const before = NOW - 60 * 60_000; // 07:05 New York, before the release
    expect(await refreshCalendar(env, before, { cfg, cal })).toBe(
      "meetings: 1, dated: 0, yahoo-economic: 4, rules: 0, fallback-rules: 0, bls: 0, nasdaq: 1, yahoo: 0",
    );
    expect(calls.some((c) => c.url.includes("bls.ics"))).toBe(false);
    const titles = async () => (await readCalendar(env, NOW - 86_400_000, NOW + 8 * 86_400_000)).map((e) => [e.title, e.result]);
    expect(await titles()).toEqual([
      ["NVIDIA results, after the close", "EPS $1.10 vs $1.00 est."],
      ["US inflation (CPI) (Aug)", ""],
      ["US weekly jobless claims", ""],
      ["US: Fed Waller Speaks", ""],
      ["ECB rate decision", ""],
      ["Japan Tankan survey (Q3)", ""],
    ]);

    // Published: the hourly run fills in the figures, and the ECB meeting its rate.
    econ = econ.map((r) => (r[0] === "CPI MM, SA" ? [...r.slice(0, 4), 0.2, ...r.slice(5)] : r[0] === "CPI YY, NSA" ? [...r.slice(0, 4), 3.0, ...r.slice(5)] : r));
    await refreshCalendar(env, NOW, { cfg, cal, back: 1, ahead: 1, only: ["meetings", "yahoo-economic", "nasdaq"] });
    econ = econ.map((r) => (r[0] === "ECB Refinancing Rate" ? [...r.slice(0, 4), 2.15, ...r.slice(5)] : r));
    await refreshCalendar(env, NOW + 86_400_000 + 3_600_000, { cfg, cal, back: 1, ahead: 1, only: ["meetings", "yahoo-economic", "nasdaq"] });
    const after = Object.fromEntries(await titles());
    expect(after["US inflation (CPI) (Aug)"]).toBe("CPI MM, SA 0.2 (exp. 0.3); CPI YY, NSA 3 (exp. 2.9)");
    expect(after["ECB rate decision"]).toBe("2.15 (exp. 2.15)");
    expect(after["Japan Tankan survey (Q3)"]).toBe("");
  });

  it("ranks the events of busy days with one model call and serves the ranking", async () => {
    const env = envWith();
    const insert = (id: string, start: string, importance = 2) =>
      env.DB.raw.prepare(`INSERT INTO news_events (id, type, title, start_at, region, importance, origin, updated)
        VALUES (?, 'us-data', ?, ?, 'us', ?, 'test', '2026-09-24')`).run(id, id, start, importance);
    // Friday: six events (busy). Monday: two (quiet, not asked about).
    for (let i = 0; i < 6; i++) insert(`fri-${i}`, `2026-09-25T1${i}:30:00Z`);
    insert("mon-0", "2026-09-28T12:30:00Z");
    insert("mon-1", "2026-09-28T14:00:00Z");
    let asked = "";
    const calls = internet({
      rank: (prompt) => {
        asked = prompt;
        return {
          days: [
            {
              date: "2026-09-25",
              summary: "PCE inflation is the day's main release.",
              key: ["fri-3", "fri-0", "made-up"],
              events: [{ id: "fri-3", importance: 3 }, { id: "fri-0", importance: 2 }, { id: "fri-1", importance: 1 }, { id: "mon-0", importance: 3 }],
            },
            { date: "2026-09-28", summary: "Not asked", key: ["mon-0"], events: [{ id: "mon-0", importance: 3 }] },
          ],
        };
      },
    });
    expect(await rankCalendar(env, NOW)).toBe("1 busy day ranked");
    expect(calls.filter((c) => c.url.includes("generativelanguage")).length).toBe(1);
    expect(asked).toContain('"date":"2026-09-25"');
    expect(asked).not.toContain("mon-0");

    const res = await handleNews(new Request("https://site/api/news"), env, "");
    const { calendarRanks } = await res.json<any>();
    expect(calendarRanks.days).toEqual({ "2026-09-25": "PCE inflation is the day's main release." });
    // Ids from another day or made up are dropped; key events are flagged.
    expect(calendarRanks.events).toEqual({
      "fri-3": { importance: 3, key: true },
      "fri-0": { importance: 2, key: true },
      "fri-1": { importance: 1, key: false },
    });
  });

  it("skips the model when no day is busy", async () => {
    const calls = internet();
    const env = envWith();
    expect(await rankCalendar(env, NOW)).toBe("no busy days");
    expect(calls.some((c) => c.url.includes("generativelanguage"))).toBe(false);
  });
});
