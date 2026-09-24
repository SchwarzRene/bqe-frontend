# Stack

A scrollable S&P 500 chart feed: four timeframes per stock, lines you draw on
one appear on all of them, and slower charts can mark where the faster ones are
looking. Lives at **/research/stack/**.

## Where the prices come from

The site's Worker keeps them in D1 and refreshes them on weekday evenings
(`worker/stack.ts`): the constituent list from Wikipedia, then daily bars (10
years) and hourly bars (60 days) from Yahoo, 20 tickers per cron run from
22:00 UTC until all ~500 are done.

The refresh is incremental. For a ticker D1 already holds, it asks Yahoo for
only the last month of days and the last 5 days of hours (a few KB), checks
that the overlapping closes still match what is stored, and appends. The
whole 10-year history is downloaded again only when:

- nothing is stored yet;
- the overlap disagrees, because a dividend or split re-adjusted every earlier
  price (prices are adjusted, like yfinance's `auto_adjust=True`);
- there is a gap, because the ticker was skipped for longer than a month;
- it is that ticker's turn for the periodic full check, about once every
  30 days, spread so each evening takes a small share.

That brings a night's download from the full ~46 MB dataset (several times
more as raw Yahoo JSON) to a few MB, and keeps each run's CPU time low. The
cron log line reports `full` alongside `refreshed`. The page reads them at the same paths as
before — `data/index.json` and `data/<TICKER>.json` — and the Worker answers
from D1, falling back to the snapshot committed in `data/` for anything D1
does not hold yet.

On top of that, each card asks `/api/quotes/<TICKER>` for today's bars (Yahoo,
delayed ~15 minutes, cached a minute at the edge) with a 4-second deadline,
and uses the stored bars if that is slow or fails. The page finds the API by
probing `/api/health` on load; a static preview without the Worker skips it.
`live.json` next to the page still overrides the quote URL if you ever need
to.

Until any data exists the page falls back to a built-in simulated series and
the header badge says "Simulated prices". If a ticker's file cannot be read
at all, that card falls back to the simulation so it is never blank.

## Chart gestures

| Gesture | Effect |
| --- | --- |
| Drag left/right on a chart | pan through time |
| Two fingers / ctrl+wheel | zoom the time axis |
| **Drag up/down on the price axis** | **zoom the price range** — down flattens, up stretches |
| **Double-tap the price axis** | back to the fitted range |
| Tap a chart | open it full screen |
| **Swipe right** (off a chart, or from the left edge) | **open the marked-charts page** |
| **Swipe left** on that page | back to the feed |

The bookmark button in the top bar opens the same page, and Escape closes it.
It lists every chart you have marked with the bookmark on its card: last price,
the day's move, a 60-day sparkline and how many lines you have drawn on it.
Tapping a row drops you back on that stock in the feed, lifting any search or
sector filter that would have hidden it. The bookmark in the filter row still
does what it did before — narrow the feed to marked charts.

Each entry also takes a **theory**: tap *+ Add theory* and write why you want to
buy or sell it — the setup, the level that invalidates it, what you are waiting
for. ⌘/Ctrl+Enter saves, Escape cancels, and the text is stored with the
bookmarks and drawings (browser storage on this host, per device, plus the
shared workspace document when one is available). Unmarking a chart keeps its
theory, so re-marking brings it back.

The price axis is the 46-pixel strip on the right of each pane. The newest
candle sits a few slots left of it, so it is never jammed against the axis and
there is room to draw ahead of price.

## Setup

Nothing beyond the Worker's own setup (docs/DEPLOYMENT.md). To fill D1 without
waiting for the evening run, trigger batches by hand:

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<your-site>/api/admin/run/stack
```

Each call refreshes one batch and reports how many tickers remain.

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
sitting at exactly the same height on the monthly. In D1 each ticker is one
row of `series`, holding exactly this document.

## Size

About 90 KB per ticker, so roughly 45 MB in D1 across the full index — well
inside D1's free 500 MB per database — and about 30 KB over the wire per
stock you actually open. To trim it, change `DAILY` / `HOURLY` in
`worker/yahoo.ts`; `STACK_BATCH` in `wrangler.toml` sets tickers per run.

## Running it locally

```bash
npm install
npx wrangler d1 migrations apply bqe --local
npm run dev
curl "localhost:8787/__scheduled?cron=*/3+22-23+*+*+1-5"   # one batch
# open http://localhost:8787/research/stack/
```

## Notes

- Yahoo caps 60-minute history at 730 days; the default 60 days keeps files
  small. Anything longer is fine to request, it just grows the D1 rows.
- Wikipedia is the source for the constituent list. If it's unreachable, or
  its table changes shape, the Worker keeps the list it already has.
- A ticker Yahoo refuses keeps its previous prices and is retried 20 minutes
  later, so throttling never blanks the site.
- Saved charts and drawn lines are kept in the browser's local storage on this
  host, per device.
