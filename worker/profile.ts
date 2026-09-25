// Company fundamentals for Market News's company window, from Yahoo's
// quoteSummary (the numbers behind finance.yahoo.com's statistics, profile
// and analysis tabs). Public, read-only, cached six hours at the edge.
//
//   GET /api/market/profile?ticker=NVDA
//
// quoteSummary wants a session cookie and a crumb; the calendar's Yahoo
// session provides both. Every field is optional: Yahoo leaves out what it
// does not have (no P/E for a loss-maker, no analysts for a small cap), and
// the page shows only what came back.

import { yahooSession } from "./news/calendar";

const MODULES = [
  "price", "summaryDetail", "defaultKeyStatistics", "financialData", "calendarEvents",
  "assetProfile", "recommendationTrend", "earnings",
].join(",");

export class ProfileError extends Error {}

export async function fetchProfile(ticker: string, fetcher: typeof fetch = fetch): Promise<Profile> {
  const { cookie, crumb } = await yahooSession(fetcher)();
  const res = await fetcher(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${MODULES}&crumb=${encodeURIComponent(crumb)}`,
    { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", Cookie: cookie, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
  );
  const body = await res.json<any>().catch(() => null);
  const result = body?.quoteSummary?.result?.[0];
  if (!result) throw new ProfileError(body?.quoteSummary?.error?.description || `No company data for ${ticker} (HTTP ${res.status})`);
  return toProfile(ticker, result);
}

/** A Yahoo number: {raw, fmt} or a plain number. */
const num = (v: any): number | null => {
  const n = typeof v === "object" && v !== null ? v.raw : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const str = (v: any, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const date = (v: any): string | null => {
  const s = num(v);
  return s ? new Date(s * 1000).toISOString().slice(0, 10) : null;
};

export interface Profile {
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  employees: number | null;
  website: string | null;
  summary: string | null;
  stats: Record<string, number | null>;
  analysts: {
    recommendation: string | null;
    count: number | null;
    targetLow: number | null;
    targetMean: number | null;
    targetHigh: number | null;
    trend: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
  };
  earnings: {
    next: string[];
    epsEstimate: number | null;
    revenueEstimate: number | null;
    quarterly: { quarter: string; actual: number | null; estimate: number | null }[];
    yearly: { year: string; revenue: number | null; earnings: number | null }[];
  };
}

export function toProfile(ticker: string, r: any): Profile {
  const price = r.price ?? {}, sd = r.summaryDetail ?? {}, ks = r.defaultKeyStatistics ?? {}, fd = r.financialData ?? {};
  const ap = r.assetProfile ?? {}, ce = r.calendarEvents?.earnings ?? {}, ea = r.earnings ?? {};
  const trend = (r.recommendationTrend?.trend ?? []).find((t: any) => t?.period === "0m") ?? null;
  return {
    ticker,
    name: str(price.longName) ?? str(price.shortName),
    exchange: str(price.exchangeName),
    currency: str(price.currency, 8),
    sector: str(ap.sector),
    industry: str(ap.industry),
    country: str(ap.country),
    employees: num(ap.fullTimeEmployees),
    website: str(ap.website),
    summary: str(ap.longBusinessSummary, 900),
    stats: {
      marketCap: num(price.marketCap) ?? num(sd.marketCap),
      trailingPE: num(sd.trailingPE),
      forwardPE: num(sd.forwardPE) ?? num(ks.forwardPE),
      priceToBook: num(ks.priceToBook),
      pegRatio: num(ks.pegRatio),
      dividendYield: num(sd.dividendYield),
      beta: num(sd.beta) ?? num(ks.beta),
      high52: num(sd.fiftyTwoWeekHigh),
      low52: num(sd.fiftyTwoWeekLow),
      avg50: num(sd.fiftyDayAverage),
      avg200: num(sd.twoHundredDayAverage),
      avgVolume: num(sd.averageVolume),
      sharesOutstanding: num(ks.sharesOutstanding),
      shortPercent: num(ks.shortPercentOfFloat),
      revenue: num(fd.totalRevenue),
      revenueGrowth: num(fd.revenueGrowth),
      earningsGrowth: num(fd.earningsGrowth),
      grossMargin: num(fd.grossMargins),
      operatingMargin: num(fd.operatingMargins),
      profitMargin: num(fd.profitMargins),
      returnOnEquity: num(fd.returnOnEquity),
      debtToEquity: num(fd.debtToEquity),
      currentRatio: num(fd.currentRatio),
      freeCashflow: num(fd.freeCashflow),
      totalCash: num(fd.totalCash),
      totalDebt: num(fd.totalDebt),
    },
    analysts: {
      recommendation: str(fd.recommendationKey, 20),
      count: num(fd.numberOfAnalystOpinions),
      targetLow: num(fd.targetLowPrice),
      targetMean: num(fd.targetMeanPrice),
      targetHigh: num(fd.targetHighPrice),
      trend: trend
        ? { strongBuy: trend.strongBuy ?? 0, buy: trend.buy ?? 0, hold: trend.hold ?? 0, sell: trend.sell ?? 0, strongSell: trend.strongSell ?? 0 }
        : null,
    },
    earnings: {
      next: (ce.earningsDate ?? []).map(date).filter(Boolean).slice(0, 2) as string[],
      epsEstimate: num(ce.earningsAverage),
      revenueEstimate: num(ce.revenueAverage),
      quarterly: (ea.earningsChart?.quarterly ?? []).slice(-8).map((q: any) => ({
        quarter: String(q?.date ?? ""), actual: num(q?.actual), estimate: num(q?.estimate),
      })),
      yearly: (ea.financialsChart?.yearly ?? []).slice(-5).map((y: any) => ({
        year: String(y?.date ?? ""), revenue: num(y?.revenue), earnings: num(y?.earnings),
      })),
    },
  };
}
