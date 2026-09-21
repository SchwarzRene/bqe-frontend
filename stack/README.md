# Stack on schwarzrene.github.io

A scrollable S&P 500 chart feed: four timeframes per stock, lines you draw on
one appear on all of them, and slower charts can mark where the faster ones are
looking. Lives at **https://schwarzrene.github.io/stack/** once these files are
in the repo.

## Why yfinance can't run in the page

GitHub Pages serves static files — there is no Python process to call. Yahoo's
own endpoints don't allow direct browser calls from another domain either. So
yfinance runs *ahead of time*, in GitHub Actions, and commits the result as
plain JSON that the page fetches. The chart you see is real Yahoo data; it's
just fetched on a schedule rather than per request.

Until the first fetch runs, the page falls back to its built-in simulated
series and the header badge says "Simulated prices". After the first run the
badge turns green and shows the refresh date.

## Files

```
stack/index.html                      the page
stack/data/                           generated — one JSON per ticker + index.json
stack/live.example.json               template for the optional live proxy
scripts/fetch_market_data.py          yfinance -> JSON
requirements.txt                      yfinance, pandas, lxml
.github/workflows/market-data.yml     weekdays 22:20 UTC + manual run
worker/                               optional Cloudflare Worker for live bars
```

## Optional: live bars on page load

The snapshot above is refreshed once a weekday evening, so the page always
opens on the previous close. To fetch current bars as you scroll instead,
deploy the Worker in `worker/` and point `stack/live.json` at it — see
`worker/README.md`. It exists because Yahoo sends no CORS headers, so the
browser needs something that will answer it; the Worker relays the same JSON
shape with the header attached.

With `stack/live.json` present each card asks the Worker first and falls back
to the committed snapshot whenever it is missing, slow (4-second deadline) or
rate-limited. Without that file nothing changes. Yahoo quotes are delayed about
15 minutes, so this is today's bars, not a tick feed.

Everything is additive — no existing file of yours is touched. If your site is
Jekyll, `stack/` is copied through untouched.

## Chart gestures

| Gesture | Effect |
| --- | --- |
| Drag left/right on a chart | pan through time |
| Two fingers / ctrl+wheel | zoom the time axis |
| **Drag up/down on the price axis** | **zoom the price range** — down flattens, up stretches |
| **Double-tap the price axis** | back to the fitted range |
| Tap a chart | open it full screen |

The price axis is the 46-pixel strip on the right of each pane. The newest
candle sits a few slots left of it, so it is never jammed against the axis and
there is room to draw ahead of price.

## Setup

1. The four paths above are already in the repository (these setup notes live
   at `stack/README.md`; they shipped as `STACK-SETUP.md`).
2. In **Settings → Actions → General → Workflow permissions**, make sure
   *Read and write permissions* is selected. The workflow needs it to commit
   the data.
3. Go to **Actions → Market data → Run workflow** and start it by hand once.
   Use the `limit` input (say `25`) for a quick first test; leave it at `0` for
   the full index.
4. Give Pages a minute to rebuild, then open `/stack/`.

After that it runs itself on weekday evenings. A commit made by the workflow
does not retrigger workflows, so there is no loop.

## Data format

One file per ticker, columns rather than rows to keep it small:

```json
{"s":"AAPL","n":"Apple Inc.","sec":"Information Technology","updated":"…",
 "d" :{"tu":86400000,"t":[20345,…],"o":[…],"h":[…],"l":[…],"c":[…]},
 "h1":{"tu":60000,   "t":[29297130,…],"o":[…],"h":[…],"l":[…],"c":[…]}}
```

`t × tu` is the bar's open time in epoch milliseconds — days for the daily
series, minutes for the hourly one. Prices are split-and-dividend adjusted
(`auto_adjust=True`). The page derives the weekly and monthly bars from the
daily series in the browser, which is what keeps a level drawn on the 1H chart
sitting at exactly the same height on the monthly.

## Size

About 90 KB per ticker with the defaults (10 years of daily bars, 60 days of
hourly), so roughly 45 MB across the full index, and about 30 KB over the wire
per stock you actually open. Git stores each day's update as a delta, so
growth after the first commit is small.

To trim it, edit the workflow's fetch step:

```
--daily-period 5y      halves the daily history
--hourly-period 30d    shorter intraday window
--no-hourly            drop intraday entirely (the 1H pane then shows daily bars)
--limit 100            only the first 100 constituents
```

## Running it locally

```bash
pip install -r requirements.txt
python scripts/fetch_market_data.py --out stack/data --tickers AAPL MSFT NVDA
python -m http.server 8000
# open http://localhost:8000/stack/
```

Opening `stack/index.html` straight off the filesystem won't load the data —
`fetch` needs `http://`. The page still works there, simulated.

## Notes

- Yahoo caps 60-minute history at 730 days; the default 60 days keeps files
  small. Anything longer is fine to request, it just grows the repo.
- Wikipedia is the source for the constituent list. If it's unreachable the
  script reuses the previous `index.json` rather than writing a broken one.
- If a whole run comes back empty (Yahoo throttling), the script exits without
  touching the existing files, so the site never goes blank.
- Saved charts and drawn lines are kept in the browser's local storage on this
  host, per device.
