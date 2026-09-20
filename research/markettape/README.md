# Market Tape

A broadcast-style rundown of Federal Reserve events and earnings calls, live at
**/research/markettape/**. The write-up is at `research/markettape.html`; the
original single-file React component is `research/markettape.jsx`.

## How the data gets here

The page is static, so the searches run ahead of time:

```
.github/workflows/market-tape.yml   weekdays 12:10 + 22:10 UTC, or manual
scripts/fetch_market_tape.py        Messages API + web search -> JSON
research/markettape/data/           generated: schedule.json, results.json
research/markettape/app.js          the page (bundled React, no CDN)
```

`schedule.json` holds the rundown (Fed events 10 days out, earnings 21 days for
the watchlist). `results.json` holds the reported numbers for events that have
already started, keyed by event id. Everything time-based — the on-air windows,
the countdown, the Today/Tomorrow grouping — is computed in the browser against
the viewer's own clock, because a committed file cannot know what is on air now.

## Setup

1. Add a repository secret `ANTHROPIC_API_KEY` (Settings → Secrets and
   variables → Actions).
2. Settings → Actions → General → Workflow permissions → *Read and write*, so
   the job can commit what it fetched.
3. Actions → **Market tape** → Run workflow, once, by hand.

Until that first run the board renders empty and says so; the always-on channel
links still work. A run is two schedule queries plus at most six result queries.

## Changing the watchlist

The `tickers` input on a manual run overrides it for that run. To change the
default, edit the `--tickers` list in the workflow's *Build the rundown* step.

## Rebuilding the page

`app.js` is bundled from the React source with esbuild:

```bash
esbuild app.jsx --bundle --minify --format=iife --target=es2019 \
  --jsx=automatic --define:process.env.NODE_ENV='"production"' --outfile=app.js
```

React is bundled in, so the page loads no third-party scripts at runtime.

## Running it locally

```bash
python scripts/fetch_market_tape.py --out research/markettape/data
python -m http.server 8000
# open http://localhost:8000/research/markettape/
```

`fetch` needs `http://`, so opening `index.html` off the filesystem won't load
the data.
