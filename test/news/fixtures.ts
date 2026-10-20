// Config shared by the Market News unit tests.

import { type Config } from "../../worker/news/feeds";

export const cfg: Config = {
  feeds: [{ id: "bbc", name: "BBC", type: "rss", url: "https://feeds.example/world.xml", category: "world", region: "global", weight: 18 }],
  yahooWeight: 16,
  watchlist: [
    { symbol: "NVDA", name: "Nvidia", region: "us" },
    { symbol: "EBS.VI", name: "Erste Group", region: "europe" },
  ],
  commodities: [
    { symbol: "CL=F", name: "Crude oil", group: "Energy" },
    { symbol: "GC=F", name: "Gold", group: "Metals" },
    { symbol: "ZS=F", name: "Soybeans", group: "Agriculture" },
  ],
  blockedPublishers: ["Motley Fool", "RT"],
  promoPatterns: ["stocks? to buy", "could make you rich"],
};
