// Market News: reading and classifying feeds.

import { afterEach, describe, expect, it, vi } from "vitest";
import { classify, cleanText, fetchAll, normalizeUrl, parseFeed, tickersFor } from "../../worker/news/feeds";
import { cfg } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("news feeds", () => {
  it("parses RSS items with CDATA and entities, and Atom entries", () => {
    const rss = `<rss><channel><title>Feed</title>
      <item><title><![CDATA[Oil &amp; gas <b>jump</b>]]></title><link>https://ex.com/a?utm_source=x&amp;id=2</link><pubDate>Thu, 24 Sep 2026 13:05:00 GMT</pubDate></item>
      <item><title>No link</title></item>
    </channel></rss>`;
    expect(parseFeed(rss)).toEqual([{ title: "Oil & gas jump", link: "https://ex.com/a?utm_source=x&id=2", date: "Thu, 24 Sep 2026 13:05:00 GMT" }]);

    const atom = `<feed><entry><title type="html">Kremlin &lt;i&gt;says&lt;/i&gt;</title>
      <link rel="enclosure" href="https://ex.com/img.jpg"/><link rel="alternate" href="https://ex.com/story"/>
      <published>2026-09-24T10:00:00Z</published></entry></feed>`;
    expect(parseFeed(atom)).toEqual([{ title: "Kremlin says", link: "https://ex.com/story", date: "2026-09-24T10:00:00Z" }]);
  });

  it("cleans text", () => {
    expect(cleanText("  A&#x2019;s   <em>deal</em> &#8212; done ")).toBe("A’s deal — done");
  });

  it("normalizes URLs: tracking parameters, fragment, trailing slash, host case", () => {
    expect(normalizeUrl("https://WWW.Ex.com/path/?utm_medium=a&b=2&fbclid=z#top")).toBe("https://www.ex.com/path?b=2");
    expect(normalizeUrl("https://ex.com/")).toBe("https://ex.com/");
    expect(normalizeUrl("javascript:alert(1)")).toBe("");
  });

  it("classifies broad sources by the words in the headline", () => {
    expect(classify("Oil slips as OPEC+ supply talk returns", "markets", "us")).toEqual({ category: "commodities", region: "us" });
    expect(classify("Kremlin rejects new sanctions", "world", "global")).toEqual({ category: "world", region: "russia" });
    expect(classify("Leaders tell us they will meet", "world", "global").region).toBe("global");
    expect(classify("ECB officials split on October", "world", "global").region).toBe("europe");
  });

  it("finds watchlist tickers by name, symbol or Yahoo's list", () => {
    expect(tickersFor("Nvidia shares recover", [], cfg.watchlist)).toEqual(["NVDA"]);
    expect(tickersFor("Banks rally in Vienna", ["EBS.VI"], cfg.watchlist)).toEqual(["EBS.VI"]);
    expect(tickersFor("Erste Group among top gainers", [], cfg.watchlist)).toEqual(["EBS.VI"]);
  });

  it("fetches every source, and a failing one is only recorded", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("feeds.example")) {
        return new Response(`<rss><item><title>Nvidia soars on results</title><link>https://ex.com/n1</link><pubDate>${new Date().toUTCString()}</pubDate></item></rss>`);
      }
      if (url.includes("q=NVDA")) {
        return new Response(JSON.stringify({ news: [{ title: "Nvidia deal", publisher: "Reuters", link: "https://ex.com/n2", providerPublishTime: Math.floor(Date.now() / 1000), relatedTickers: ["NVDA"] }] }));
      }
      return new Response("nope", { status: 500 });
    });
    const { items, health } = await fetchAll(cfg);
    expect(items.map((i) => i.title).sort()).toEqual(["Nvidia deal", "Nvidia soars on results"]);
    const deal = items.find((i) => i.title === "Nvidia deal")!;
    expect(deal.source).toBe("Reuters");
    expect(deal.category).toBe("company");
    expect(deal.tickers).toEqual(["NVDA"]);
    expect(health.bbc.ok).toBe(true);
    expect(health["yahoo:GC=F"]).toMatchObject({ ok: false, error: "HTTP 500" });
    const oil = items.find((i) => i.sourceId === "yahoo:CL=F");
    expect(oil).toBeUndefined();
  });
});
