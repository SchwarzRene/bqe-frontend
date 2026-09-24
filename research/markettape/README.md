# Market Tape

A broadcast-style rundown of Federal Reserve events and earnings calls, live at
**/research/markettape/**. The write-up is at
`research/markettape.html`.

## How the data gets here

The page is static, so the searches run ahead of time, on the site's Worker:

```
wrangler.toml [triggers]           weekdays 12:10 + 22:10 UTC
worker/markettape.ts               Gemini API + Google Search grounding -> D1
/research/markettape/data/*.json   served by the Worker from D1
research/markettape/app.js         the page (bundled React, no CDN)
```

`schedule.json` holds the rundown (Fed events 10 days out, earnings 21 days for
the watchlist). `results.json` holds the reported numbers for events that have
already started, keyed by event id. Everything time-based — the on-air windows,
the countdown, the Today/Tomorrow grouping — is computed in the browser against
the viewer's own clock.

The page still reads `data/schedule.json` and `data/results.json`; the Worker
answers those paths from D1, and falls back to a committed file if there is one.

## Setup

1. Get a free Gemini API key at <https://aistudio.google.com/apikey>.
2. Store it on the Worker: `npx wrangler secret put GEMINI_API_KEY`
   (or Worker → Settings → Variables and Secrets in the dashboard).
3. Open the page. When there is no rundown yet — a fresh deploy, before
   the first scheduled run — the Worker builds one while that first visitor
   waits (about a minute; the page says so). That on-demand build is tried
   at most once every 30 minutes, so a failing key or model name cannot run
   up the quota. It skips the reported numbers; the next scheduled run adds
   them.

   To force a full run at any time instead:

   ```bash
   curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://<your-site>/api/admin/run/markettape
   ```

If a build fails the board says so, and the always-on channel links still
work; the Worker's logs show why (`markettape: gemini 404` is a wrong model
name, `429` the free tier's rate limit). A run is two schedule queries plus at most six result
queries, well inside the free tier's daily limit. On the free tier Google may
use prompts to improve its products — nothing private goes into these ones.

## Changing the watchlist or the model

`MARKETTAPE_TICKERS` and `GEMINI_MODEL` under `[vars]` in `wrangler.toml`.
The model must support Google Search grounding.

## Rebuilding the page

`app.js` is bundled from the React source with esbuild:

```bash
esbuild app.jsx --bundle --minify --format=iife --target=es2019 \
  --jsx=automatic --define:process.env.NODE_ENV='"production"' --outfile=app.js
```

React is bundled in, so the page loads no third-party scripts at runtime.

## Running it locally

```bash
echo "GEMINI_API_KEY=..." > .dev.vars      # git-ignored
npx wrangler d1 migrations apply bqe --local
npm run dev
curl "localhost:8787/__scheduled?cron=10+12+*+*+1-5"
# open http://localhost:8787/research/markettape/
```

`fetch` needs `http://`, so opening `index.html` off the filesystem won't load
the data.
