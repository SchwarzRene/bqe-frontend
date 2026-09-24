Normally empty — the Worker serves these paths from D1 (`worker/markettape.ts`).

The page reads two files from here:

- `schedule.json` — the rundown: Fed events for the next 10 days and earnings
  for the watchlist tickers over the next 21 days.
- `results.json` — the reported numbers for events that have already started,
  keyed by event id.

A file committed here is only used while D1 has no copy of its own.
