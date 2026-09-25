// Wall-clock helpers. The jobs are scheduled in New York time (the spec's
// schedule), events are announced in their own local time, and everything is
// stored in UTC.

export const ET = "America/New_York";

/**
 * ISO time in UTC to the second, "2026-09-24T12:30:00Z". Every stored time
 * and every bound compared against one uses this: mixing it with
 * toISOString()'s ".000Z" breaks text comparison at the boundary.
 */
export function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
  date: string; // YYYY-MM-DD
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The wall clock in `tz` at `ms`. */
export function wallClock(ms: number, tz: string): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = Number(get("year")), month = Number(get("month")), day = Number(get("day"));
  return {
    year, month, day,
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** Epoch ms of a wall-clock time in `tz`, DST included. NaN for a bad date or zone. */
export function zonedToUtc(date: string, hour: number, minute: number, tz: string): number {
  const guess = Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  if (Number.isNaN(guess)) return NaN;
  try {
    // Twice: the first pass can land on the wrong side of a DST change.
    let ms = guess;
    for (let i = 0; i < 2; i++) {
      const w = wallClock(ms, tz);
      const asIfUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
      ms = guess - (asIfUtc - ms);
    }
    return ms;
  } catch {
    return NaN; // unknown time zone
  }
}

/** YYYY-MM-DD plus `days`, calendar arithmetic only. */
export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T12:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export type Slot = "asia-close" | "pre-market" | "midday" | "close" | "weekend";

// The spec's briefing times, New York time. The cron fires every 15 minutes,
// so a slot matches the one run that falls in [time, time + 15 min).
const SLOTS: { slot: Slot; hour: number; minute: number; days: number[] }[] = [
  { slot: "asia-close", hour: 2, minute: 30, days: [1, 2, 3, 4, 5] },
  { slot: "pre-market", hour: 8, minute: 0, days: [1, 2, 3, 4, 5] },
  { slot: "midday", hour: 12, minute: 30, days: [1, 2, 3, 4, 5] },
  { slot: "close", hour: 16, minute: 30, days: [1, 2, 3, 4, 5] },
  { slot: "weekend", hour: 10, minute: 0, days: [6] },
];

export const SLOT_LABEL: Record<Slot | "manual" | "first", string> = {
  "asia-close": "Asia close and European open briefing",
  "pre-market": "Pre-market briefing",
  midday: "Midday briefing",
  close: "Close briefing",
  weekend: "Weekend briefing",
  manual: "Updated briefing",
  first: "Briefing",
};

/** The briefing slot a cron run at `ms` belongs to, if any. */
export function briefingSlot(ms: number): Slot | null {
  const w = wallClock(ms, ET);
  const minutes = w.hour * 60 + w.minute;
  for (const s of SLOTS) {
    const at = s.hour * 60 + s.minute;
    if (s.days.includes(w.weekday) && minutes >= at && minutes < at + 15) return s.slot;
  }
  return null;
}

/** Whether a cron run at `ms` should fetch: every run on weekdays, hourly at weekends. */
export function shouldFetch(ms: number): boolean {
  const w = wallClock(ms, ET);
  const weekend = w.weekday === 0 || w.weekday === 6;
  return !weekend || w.minute < 15;
}

/** The daily calendar run: 05:00 New York time. */
export function isCalendarRun(ms: number): boolean {
  const w = wallClock(ms, ET);
  return w.hour === 5 && w.minute < 15;
}
