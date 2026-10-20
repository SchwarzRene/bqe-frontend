// Market News: the economic calendar.

import { describe, expect, it } from "vitest";
import { type CalendarConfig, fixedEvents, mergeMeetingResults, nasdaqEvent, parseEconomic, parseIcs, pickNasdaq } from "../../worker/news/calendar";
import { withHeadlines } from "../../worker/news/index";

describe("news calendar", () => {
  const cal: CalendarConfig = {
    meetings: [{ type: "fed", title: "FOMC rate decision", date: "2026-10-28", time: "14:00", tz: "America/New_York", minutes: 90, region: "us", importance: 3 }],
    weekly: [
      { type: "commodities", title: "EIA natural gas storage", weekday: 4, time: "10:30", tz: "America/New_York", region: "us", importance: 2 },
      { type: "commodities", title: "USDA crop progress", weekday: 1, time: "16:00", tz: "America/New_York", region: "us", importance: 1, months: [4, 5, 6, 7, 8, 9, 10, 11] },
    ],
    monthly: [
      { type: "asia-central-bank", title: "PBoC loan prime rate", day: 20, weekend: "next-business-day", time: "09:00", tz: "Asia/Shanghai", region: "asia", importance: 2 },
      { type: "asia-data", title: "China official PMIs", day: "last", weekend: "same-day", time: "09:30", tz: "Asia/Shanghai", region: "asia", importance: 2 },
    ],
    ics: [],
  };

  it("places meetings and weekly and monthly releases on the UTC clock", () => {
    const { meetings, rules } = fixedEvents("2026-09-14", "2026-10-31", cal);
    expect(meetings).toEqual([expect.objectContaining({
      id: "fed-2026-10-28-fomc-rate-decision", start: "2026-10-28T18:00:00Z", end: "2026-10-28T19:30:00Z", importance: 3,
    })]);
    const at = (title: string) => rules.filter((r) => r.title === title).map((r) => r.start);
    expect(at("EIA natural gas storage").slice(0, 2)).toEqual(["2026-09-17T14:30:00Z", "2026-09-24T14:30:00Z"]);
    // 20 September 2026 is a Sunday: the next business day.
    expect(at("PBoC loan prime rate")).toEqual(["2026-09-21T01:00:00Z", "2026-10-20T01:00:00Z"]);
    expect(at("China official PMIs")).toEqual(["2026-09-30T01:30:00Z", "2026-10-31T01:30:00Z"]);
    // Crop progress only runs April to November.
    expect(fixedEvents("2026-12-01", "2026-12-31", cal).rules.some((r) => r.title === "USDA crop progress")).toBe(false);
  });

  it("reads Yahoo's economic calendar by column label, with epoch times", () => {
    const body = { finance: { result: [{ documents: [{
      columns: [{ label: "Event" }, { label: "Country Code" }, { label: "Event Time" }, { label: "For" }, { label: "Actual" }, { label: "Market Expectation" }, { label: "Prior to This" }, { label: "Revised from" }],
      rows: [["GDP Final", "us", 1790253000, "Q2", 3.8, 3.3, 3.3, null], ["", "US", 1790253000, "", null, null, null, null], ["X", "US", "not a date", "", 1, 1, 1, 1]],
    }] }] } };
    expect(parseEconomic(body)).toEqual([
      { name: "GDP Final", country: "US", start: 1790253000000, period: "Q2", actual: 3.8, consensus: 3.3, prior: 3.3 },
    ]);
    expect(parseEconomic({})).toEqual([]);
  });

  it("gives a meeting the rate decision Yahoo lists for its country and time", () => {
    const meeting = { id: "m", type: "fed" as const, title: "FOMC rate decision", start: "2026-10-28T18:00:00Z", end: "", region: "us" as const, importance: 3, streamUrl: "", result: "", tickers: [], country: "US" };
    const rate = (country: string, start: string) => ({ ...meeting, id: `y-${country}`, title: "rate", start, result: "4 (exp. 4)", country, kind: "rate" as const });
    const out = mergeMeetingResults([meeting], [rate("GB", "2026-10-28T18:00:00Z"), rate("US", "2026-10-28T18:00:00Z"), rate("US", "2026-10-30T18:00:00Z")]);
    expect(out.meetings).toEqual([expect.objectContaining({ id: "m", result: "4 (exp. 4)" })]);
    expect(out.meetings[0]).not.toHaveProperty("country");
    expect(out.economic.map((e) => e.id)).toEqual(["y-GB", "y-US"]);
  });

  it("parses a published iCalendar schedule", () => {
    const ics = [
      "BEGIN:VCALENDAR", "BEGIN:VEVENT", "DTSTART;TZID=America/New_York:20261014T083000",
      "SUMMARY:Consumer Price Index for Septem", " ber 2026", "END:VEVENT",
      "BEGIN:VEVENT", "DTSTART:20261106T133000Z", "SUMMARY:Employment Situation\\, October", "END:VEVENT",
      "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261201", "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    expect(parseIcs(ics)).toEqual([
      { summary: "Consumer Price Index for September 2026", start: Date.parse("2026-10-14T12:30:00Z") },
      { summary: "Employment Situation, October", start: Date.parse("2026-11-06T13:30:00Z") },
    ]);
    // Only the days asked for are converted.
    expect(parseIcs(ics, "America/New_York", "2026-11-01", "2026-11-10").map((e) => e.summary)).toEqual(["Employment Situation, October"]);
  });

  it("reads Nasdaq earnings rows: watchlist plus the largest, reported EPS as the result", () => {
    const rows = [
      { symbol: "TINY", marketCap: "$1,000", time: "time-pre-market" },
      { symbol: "NVDA", name: "NVIDIA Corporation", marketCap: "$4,000,000,000,000", time: "time-after-hours", fiscalQuarterEnding: "Oct/2026", epsForecast: "$1.25", eps: "$1.30" },
      ...Array.from({ length: 6 }, (_, i) => ({ symbol: `BIG${"ABCDEF"[i]}`, marketCap: `$${(i + 1) * 1000},000,000` })),
    ];
    expect(pickNasdaq(rows, new Set(["NVDA"])).map((r) => r.symbol)).toEqual(["NVDA", "BIGF", "BIGE", "BIGD", "BIGC", "BIGB"]);
    expect(nasdaqEvent(rows[1], "2026-11-18")).toMatchObject({
      id: "earnings-2026-11-18-nvda", title: "NVIDIA results (quarter to Oct/2026), after the close",
      start: "2026-11-18T21:05:00Z", result: "EPS $1.30 vs $1.25 est.", tickers: ["NVDA"],
    });
    expect(nasdaqEvent({ symbol: "AAPL", epsForecast: "$1.00", eps: "N/A" }, "2026-10-29")!.result).toBe("");
    expect(nasdaqEvent({ symbol: "<script>" }, "2026-10-29")).toBeNull();
  });

  it("groups headlines under the event they mention", () => {
    const ev = [{ id: "e", type: "us-data" as const, title: "US CPI, August", start: "2026-09-24T12:30:00Z", end: "", region: "us" as const, importance: 3, streamUrl: "", result: "", tickers: [] }];
    const item = (id: string, title: string, at: string) => ({ id, title, url: "", source: "", alsoIn: [], category: "markets", region: "us", tickers: [], publishedAt: at, score: 0, importance: null, tone: null });
    const out = withHeadlines(ev, [item("a", "CPI rises more than expected", "2026-09-24T12:40:00Z"), item("b", "CPI outlook", "2026-09-20T12:40:00Z"), item("c", "Stocks rise", "2026-09-24T13:00:00Z")]);
    expect(out[0].itemIds).toEqual(["a"]);
  });
});
