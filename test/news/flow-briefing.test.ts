// Market News end to end: briefings and the one-job-per-tick schedule (real SQLite, stubbed internet).

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBriefing, latestBriefing } from "../../worker/news/briefing";
import { type CalendarConfig, readCalendar, refreshCalendar } from "../../worker/news/calendar";
import { handleNews, newsTick } from "../../worker/news/index";
import { rankHeadlines } from "../../worker/news/headlines";
import { ALL, ingest, cfg, NOW, gemini, internet, envWith, briefingFrom } from "./flow-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Market News flow: briefing", () => {
  it("builds the calendar without AI, a briefing, and serves it all", async () => {
    const calls = internet({ briefing: briefingFrom });
    const env = envWith();
    await ingest(env, NOW, cfg);

    const cal: CalendarConfig = {
      meetings: [{ type: "eu-central-bank", title: "ECB rate decision", date: "2026-09-25", time: "14:15", tz: "Europe/Berlin", minutes: 90, region: "europe", importance: 3 }],
      weekly: [{ type: "commodities", title: "EIA natural gas storage", weekday: 4, time: "10:30", tz: "America/New_York", region: "us", importance: 2 }],
      monthly: [],
      ics: [{ id: "bls", name: "BLS", url: "https://www.bls.gov/schedule/news_release/bls.ics", type: "us-data", region: "us", include: [
        { match: "Consumer Price Index", title: "US CPI", importance: 3 },
        { match: "Employment Situation", title: "US jobs report", importance: 3 },
      ] }],
    };
    // The calendar makes no model calls.
    expect(await refreshCalendar(env, NOW, { cfg, cal })).toBe("meetings: 1, dated: 0, rules: 3, fallback-rules: 0, bls: 2, nasdaq: 1, yahoo: 0");
    expect(calls.some((c) => c.url.includes("generativelanguage"))).toBe(false);
    const events = await readCalendar(env, NOW - 86_400_000, NOW + 3 * 86_400_000);
    expect(events.map((e) => [e.title, e.start, e.result])).toEqual([
      ["NVIDIA results, after the close", "2026-09-23T20:05:00Z", "EPS $1.10 vs $1.00 est."],
      ["US CPI", "2026-09-24T12:30:00Z", ""],
      ["EIA natural gas storage", "2026-09-24T14:30:00Z", ""],
      ["ECB rate decision", "2026-09-25T12:15:00Z", ""],
    ]);
    // Rebuilt the next day, nothing is duplicated and the reported EPS stays.
    await refreshCalendar(env, NOW + 86_400_000, { cfg, cal });
    const again = await readCalendar(env, NOW - 86_400_000, NOW + 3 * 86_400_000);
    expect(again.map((e) => e.title)).toEqual(events.map((e) => e.title));
    expect(again[0].result).toBe("EPS $1.10 vs $1.00 est.");

    expect(await buildBriefing(env, "pre-market", { now: NOW, cfg })).toBe("briefing written from 5 headlines");
    const b = (await latestBriefing(env))!;
    expect(b.label).toBe("Pre-market briefing");
    expect(b.pages.general.topStories[0].summary).toBe("US growth revised higher");
    expect(b.companies).toEqual([{ ticker: "NVDA", name: "Nvidia", line: "Recovering after two down days", ids: [expect.any(String)] }]);
    // Nothing new since: the next slot skips the model call.
    const geminiCalls = calls.filter((c) => c.url.includes("generativelanguage")).length;
    expect(await buildBriefing(env, "midday", { now: NOW + 3_600_000, cfg })).toMatch(/skipped/);
    expect(calls.filter((c) => c.url.includes("generativelanguage")).length).toBe(geminiCalls);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW + 90 * 60_000);
    const res = await handleNews(new Request("https://site/api/news"), env, "");
    const body: any = await res.json();
    expect(body.briefing.generatedAt).toBe(b.generatedAt);
    expect(body.items.length).toBeGreaterThanOrEqual(5);
    expect(body.events.length).toBeGreaterThanOrEqual(1);
    expect(body.yahooOk).toBe(true);
  });

  it("keeps the previous briefing when the model's answer is unusable twice", async () => {
    const calls = internet({ briefing: () => ({ general: { topStories: [] } }) });
    const env = envWith();
    await ingest(env, NOW, cfg);
    expect(await buildBriefing(env, "first", { force: true, now: NOW, cfg })).toBe("no valid briefing — kept the previous one");
    expect(calls.filter((c) => c.body?.generationConfig?.responseMimeType).length).toBe(2);
    expect(await latestBriefing(env)).toBeNull();
  });

  it("runs one job per tick: calendar, then headlines, then the first briefing, after a deploy", async () => {
    const calls = internet({ briefing: briefingFrom });
    const env = envWith();
    const tick = (utc: string) => newsTick(env, Date.parse(utc), cfg, ALL);
    // 10:00 New York on a Thursday: nothing exists yet. First the calendar, with no fetch.
    let report = await tick("2026-09-24T14:00:00Z");
    // Yahoo unreachable in this test: the fallbacks (BLS, the jobless-claims rule …) take over.
    expect(report).toMatch(/^calendar \(first\): .*yahoo-economic failed: no Yahoo crumb.*fallback-rules: [1-9]\d*, bls: [1-9]/);
    expect(report).not.toMatch(/fetch/);
    // The calendar's other half: earnings, dated events, rules.
    report = await tick("2026-09-24T14:30:00Z");
    expect(report).toMatch(/^calendar \(first, part 2\): dated: 0, rules: \d+, nasdaq: 1, yahoo: 0$/);
    // No headlines yet, so no briefing: this run fetches, and the model
    // ranks what came in, in the same run and with one call.
    report = await tick("2026-09-24T14:45:00Z");
    expect(report).toMatch(/^fetch: \{"fetched":9,"added":5.* · rank: 5 of 5 ranked by gemini-3.5-flash-lite, 1 tied to companies$/);
    const modelCalls = calls.filter((c) => c.url.includes("generativelanguage"));
    expect(modelCalls.map((c) => c.url.includes("gemini-3.5-flash-lite") && c.body.systemInstruction.parts[0].text.startsWith("You rank news headlines"))).toEqual([true]);
    const ranked = env.DB.raw.prepare("SELECT title, importance, tone, tickers FROM news_items WHERE title LIKE '%Nvidia%' OR title LIKE 'US GDP%' ORDER BY title").all();
    expect(ranked).toEqual([
      { title: "Nvidia shares recover part of this week's losses", importance: 2, tone: "+", tickers: '["NVDA"]' },
      { title: "US GDP growth revised up in third estimate", importance: 5, tone: "0", tickers: "[]" },
    ]);
    // Nothing left to rank: the next fetch run makes no model call for it.
    expect(await rankHeadlines(env, Date.parse("2026-09-24T14:50:00Z"), cfg)).toBe("nothing to rank");
    // Now the first briefing, in a run of its own.
    report = await tick("2026-09-24T15:00:00Z");
    expect(report).toBe("briefing (first): briefing written from 5 headlines");
    // Results at :15, then the first calendar ranking, then fetch otherwise.
    expect(await tick("2026-09-24T15:15:00Z")).toMatch(/^calendar results: /);
    expect(await tick("2026-09-24T15:30:00Z")).toMatch(/^calendar ranks \(first\): /);
    expect(await tick("2026-09-24T15:45:00Z")).toMatch(/^fetch: /);
    // The daily ranking at 05:45 New York.
    expect(await tick("2026-09-25T09:45:00Z")).toMatch(/^calendar ranks: /);
  });
});
