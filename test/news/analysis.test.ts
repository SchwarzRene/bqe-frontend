// Market News: the company analysis note.

import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAnalysis, priceStats } from "../../worker/news/analyst";
import { toProfile } from "../../worker/profile";
import { gemini, envWith, sha256 } from "./flow-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("company analysis", () => {
  const DAY = 86400;
  // A year of daily bars rising 0.1% a day, with one dip.
  const bars = Array.from({ length: 250 }, (_, i) => ({ time: 1_760_000_000 + i * DAY, close: 100 * 1.001 ** i * (i === 200 ? 0.9 : 1), volume: i >= 245 ? 2000 : 1000 }));

  it("works a price history into returns, volatility, drawdown and averages", () => {
    const s = priceStats(bars)!;
    expect(s.last).toBeCloseTo(100 * 1.001 ** 249, 6);
    expect(s.returns["1W"]).toBeCloseTo(1.001 ** 7 - 1, 4);
    expect(s.maxDrawdown).toBeCloseTo(-0.1, 2);
    expect(s.fromHigh).toBeCloseTo(0, 6);
    expect(s.vsMa50).toBeGreaterThan(0);
    expect(s.volumeVsAvg).toBeCloseTo(2000 / 1020 - 1, 2);
    expect(s.volatility).toBeGreaterThan(0);
    expect(priceStats(bars.slice(0, 1))).toBeNull();
  });

  it("reads Yahoo's quoteSummary into a profile, keeping only what is there", () => {
    const p = toProfile("NVDA", {
      price: { longName: "NVIDIA Corporation", currency: "USD", marketCap: { raw: 4e12, fmt: "4T" } },
      summaryDetail: { trailingPE: { raw: 55.2 }, fiftyTwoWeekHigh: { raw: 200 }, dividendYield: {} },
      financialData: { recommendationKey: "buy", targetMeanPrice: { raw: 210 }, numberOfAnalystOpinions: { raw: 60 } },
      recommendationTrend: { trend: [{ period: "0m", strongBuy: 20, buy: 30, hold: 8, sell: 1, strongSell: 1 }] },
      calendarEvents: { earnings: { earningsDate: [{ raw: 1_795_000_000 }], earningsAverage: { raw: 1.1 } } },
      earnings: { earningsChart: { quarterly: [{ date: "2Q2026", actual: { raw: 1 }, estimate: { raw: 0.9 } }] } },
    });
    expect(p).toMatchObject({ name: "NVIDIA Corporation", currency: "USD", sector: null });
    expect(p.stats).toMatchObject({ marketCap: 4e12, trailingPE: 55.2, high52: 200, dividendYield: null });
    expect(p.analysts).toMatchObject({ recommendation: "buy", targetMean: 210, count: 60, trend: { strongBuy: 20, hold: 8 } });
    expect(p.earnings.next).toEqual(["2026-11-18"]);
    expect(p.earnings.quarterly).toEqual([{ quarter: "2Q2026", actual: 1, estimate: 0.9 }]);
  });

  it("writes an analysis for signed-in users only, from the data, and reuses it for six hours", async () => {
    const calls: string[] = [];
    let prompt = "";
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.includes("finance/chart")) {
        return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: "NVDA" }, timestamp: bars.map((b) => b.time), indicators: { quote: [{ open: bars.map((b) => b.close), high: bars.map((b) => b.close), low: bars.map((b) => b.close), close: bars.map((b) => b.close), volume: bars.map((b) => b.volume) }] } }] } }));
      }
      if (url.includes("fc.yahoo.com")) return new Response("", { status: 404, headers: { "Set-Cookie": "A3=x; Domain=.yahoo.com" } });
      if (url.includes("getcrumb")) return new Response("crumb1");
      if (url.includes("quoteSummary")) return new Response(JSON.stringify({ quoteSummary: { result: [{ price: { longName: "NVIDIA Corporation" }, financialData: { recommendationKey: "buy" } }] } }));
      if (url.includes("generativelanguage")) {
        const body = JSON.parse(String(init!.body));
        prompt = body.contents[0].parts[0].text;
        const id = prompt.match(/"id":"([0-9a-f]+)"/)![1];
        return gemini(JSON.stringify({
          summary: "Nvidia trades at its high after a steady year.", tone: "positive",
          expect: ["Earnings next month set the tone."], catalysts: ["Data-center demand."], risks: ["Valuation.", ""],
          watch: ["The 50-day average."], sources: [id, "made-up"],
        }));
      }
      return new Response("not found", { status: 404 });
    });
    const env = envWith();
    env.DB.raw.exec(`INSERT INTO news_items (id, title, url, source, category, region, tickers, published_at, score, fetched_at)
      VALUES ('aa11', 'Nvidia wins a data-center deal', 'https://wire.example/n', 'Wire', 'company', 'us', '["NVDA"]', '${new Date(Date.now() - 3600e3).toISOString()}', 60, '2026-01-01')`);
    const req = (method: string, cookie = true) => new Request("https://site/api/company/analysis" + (method === "GET" ? "?ticker=NVDA" : ""), {
      method,
      headers: { ...(cookie ? { Cookie: "bqe_session=tok" } : {}), Origin: "https://site" },
      body: method === "POST" ? JSON.stringify({ ticker: "nvda", name: "Nvidia" }) : undefined,
    });

    expect((await handleAnalysis(req("POST", false), env)).status).toBe(401);
    expect(calls).toEqual([]);

    env.DB.raw.exec("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('" + (await sha256("tok")) + "', 1, '2026-01-01', '2999-01-01')");
    // Nothing stored yet: GET says so without a model call.
    expect(await (await handleAnalysis(req("GET"), env)).json()).toEqual({ analysis: null, cached: false });

    const res = await handleAnalysis(req("POST"), env);
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.analysis).toMatchObject({ tone: "positive", risks: ["Valuation."], sources: [{ id: "aa11", label: "Wire", url: "https://wire.example/n" }] });
    expect(body.cached).toBe(false);
    expect(prompt).toContain("Nvidia wins a data-center deal");
    expect(prompt).toContain('"recommendation":"buy"');
    expect(prompt).toMatch(/max drawdown over the year -9\.9%/);
    expect(env.DB.raw.prepare("SELECT count FROM news_chat_usage").get()).toEqual({ count: 1 });

    // Asked again: the stored one, no model call, not counted.
    const n = calls.filter((u) => u.includes("generativelanguage")).length;
    const again: any = await (await handleAnalysis(req("POST"), env)).json();
    expect(again).toMatchObject({ cached: true, analysis: { tone: "positive" } });
    expect(calls.filter((u) => u.includes("generativelanguage")).length).toBe(n);
    expect(env.DB.raw.prepare("SELECT count FROM news_chat_usage").get()).toEqual({ count: 1 });
  });
});
