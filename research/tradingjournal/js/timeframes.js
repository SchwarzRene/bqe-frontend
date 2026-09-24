// Mirrors `INTERVAL_SECONDS` in trade_chart.py; order is finest to coarsest.
export const TIMEFRAMES = [
  ["1m", "1m"], ["5m", "5m"], ["15m", "15m"], ["30m", "30m"], ["1h", "1H"], ["1d", "1D"], ["1wk", "1W"],
];

export const INTERVAL_SECONDS = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "1d": 86400, "1wk": 604800,
};

export const isDailyOrAbove = (interval) => INTERVAL_SECONDS[interval] >= 86400;
