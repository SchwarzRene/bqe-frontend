// Market News end to end: fetching, ingesting and pruning headlines (real SQLite, stubbed internet).

import { afterEach, describe, expect, it, vi } from "vitest";
import { ingest as ingestPart, pruneNews } from "../../worker/news/store";
import { ingest, cfg, NOW, internet, envWith } from "./flow-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Market News flow: ingest", () => {
  it("ingests: filters, dedupes across sources, scores and records health", async () => {
    internet();
    const env = envWith();
    const report = await ingest(env, NOW, cfg);
    expect(report).toMatchObject({ added: 5, failed: [] });
    const rows = env.DB.raw.prepare("SELECT title, source, also_in, category, region, tickers FROM news_items ORDER BY title").all();
    expect(rows.map((r: any) => r.title)).toEqual([
      "ECB officials split on October cut",
      "Kremlin rejects new EU sanctions package",
      "Nvidia shares recover part of this week's losses",
      "Oil slips as OPEC+ supply talk returns",
      "US GDP growth revised up in third estimate",
    ]);
    const gdp: any = rows.find((r: any) => r.title.startsWith("US GDP"));
    expect(JSON.parse(gdp.also_in)).toEqual([{ source: "Other", url: "https://other.example/gdp" }]);
    const byTitle = (t: string): any => rows.find((r: any) => r.title.startsWith(t));
    expect(byTitle("Kremlin")).toMatchObject({ region: "russia", category: "world" });
    expect(byTitle("Oil")).toMatchObject({ category: "commodities" });
    expect(byTitle("Nvidia")).toMatchObject({ category: "company", tickers: '["NVDA"]' });
    expect(env.DB.raw.prepare("SELECT ticker FROM news_item_tickers").all()).toEqual([{ ticker: "NVDA" }]);

    // A second run adds nothing.
    expect(await ingest(env, NOW + 60_000, cfg)).toMatchObject({ added: 0, merged: 0 });
  });

  it("fetches a third of the sources per run, and a budget of new headlines", async () => {
    internet();
    const env = envWith();
    const five = { ...cfg, feeds: [...cfg.feeds, ...cfg.feeds.map((f) => ({ ...f, id: f.id + "2" }))] };
    const report = await ingestPart(env, NOW, five, fetch, { part: 1, of: 3, budget: 2 });
    // Sources 1 and 4 of wire, other, wire2, other2, yahoo NVDA, yahoo CL=F.
    expect(Object.keys(JSON.parse((env.DB.raw.prepare("SELECT body FROM documents WHERE key = 'news:health'").get() as any).body).sources).sort()).toEqual(["other", "yahoo:NVDA"]);
    expect(report.added).toBe(2);
  });

  it("prunes what is older than 7 days", async () => {
    internet();
    const env = envWith();
    await ingest(env, NOW, cfg);
    await pruneNews(env, NOW + 8 * 86_400_000);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM news_items").get()).toEqual({ n: 0 });
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM news_item_tickers").get()).toEqual({ n: 0 });
  });
});
