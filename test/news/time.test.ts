// Market News: schedule slots and time zones.

import { describe, expect, it } from "vitest";
import { briefingSlot, calendarRun, isCalendarRun, isRankRun, isResultsRun, wallClock, zonedToUtc } from "../../worker/news/time";

describe("news time", () => {
  it("converts wall-clock times in any zone, DST included", () => {
    expect(new Date(zonedToUtc("2026-09-24", 11, 0, "Europe/Berlin")).toISOString()).toBe("2026-09-24T09:00:00.000Z");
    expect(new Date(zonedToUtc("2026-01-15", 8, 30, "America/New_York")).toISOString()).toBe("2026-01-15T13:30:00.000Z");
    expect(new Date(zonedToUtc("2026-09-25", 8, 30, "Asia/Tokyo")).toISOString()).toBe("2026-09-24T23:30:00.000Z");
    expect(zonedToUtc("2026-09-24", 8, 0, "Not/AZone")).toBeNaN();
  });

  it("matches the briefing slots in New York time", () => {
    // 2026-09-24 is a Thursday; New York is UTC-4.
    expect(briefingSlot(Date.parse("2026-09-24T12:00:00Z"))).toBe("pre-market");
    expect(briefingSlot(Date.parse("2026-09-24T12:14:00Z"))).toBe("pre-market");
    expect(briefingSlot(Date.parse("2026-09-24T12:15:00Z"))).toBeNull();
    expect(briefingSlot(Date.parse("2026-09-24T06:30:00Z"))).toBe("asia-close");
    expect(briefingSlot(Date.parse("2026-09-26T14:00:00Z"))).toBe("weekend");
    expect(briefingSlot(Date.parse("2026-09-27T14:00:00Z"))).toBeNull();
    // Winter: New York is UTC-5.
    expect(briefingSlot(Date.parse("2026-12-03T21:30:00Z"))).toBe("close");
  });

  it("results at a quarter past on weekdays; the calendar at 05:00", () => {
    expect(isResultsRun(Date.parse("2026-09-24T12:15:00Z"))).toBe(true);
    expect(isResultsRun(Date.parse("2026-09-24T12:30:00Z"))).toBe(false);
    expect(isResultsRun(Date.parse("2026-09-26T12:15:00Z"))).toBe(false);
    expect(isCalendarRun(Date.parse("2026-09-24T09:00:00Z"))).toBe(true);
    expect(isCalendarRun(Date.parse("2026-09-24T09:15:00Z"))).toBe(false);
    expect(calendarRun(Date.parse("2026-09-24T09:00:00Z"))).toBe(1);
    expect(calendarRun(Date.parse("2026-09-24T09:30:00Z"))).toBe(2);
    expect(calendarRun(Date.parse("2026-09-24T09:45:00Z"))).toBeNull();
    // The calendar ranking follows at 05:45 New York.
    expect(isRankRun(Date.parse("2026-09-24T09:45:00Z"))).toBe(true);
    expect(isRankRun(Date.parse("2026-09-24T09:30:00Z"))).toBe(false);
    expect(wallClock(Date.parse("2026-09-24T03:00:00Z"), "America/New_York").date).toBe("2026-09-23");
  });
});
