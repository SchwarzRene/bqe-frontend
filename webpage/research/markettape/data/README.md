Generated folder — do not edit by hand.

`automation/scripts/fetch_market_tape.py` writes two files here:

- `schedule.json` — the rundown: Fed events for the next 10 days and earnings
  for the watchlist tickers over the next 21 days.
- `results.json` — the reported numbers for events that have already started,
  keyed by event id.

Both are produced by the **Market tape** workflow. Until its first run the page
shows an empty rundown and says so; the always-on channels still work.
