# Live quotes proxy

The Stack page reads committed JSON by default — a snapshot the **Market data**
workflow refreshes on weekday evenings. That is accurate to the previous close
but never intraday, because a browser on `schwarzrene.github.io` cannot call
Yahoo directly: Yahoo's chart endpoint sends no CORS headers, so the request is
refused before it starts.

This Worker is the missing half. It calls Yahoo server-side and returns the
same column-wise JSON with `Access-Control-Allow-Origin` set, so the page can
fetch fresh bars for each card as it scrolls into view.

```
browser ──▶ your-worker.workers.dev/AAPL ──▶ query1.finance.yahoo.com
        ◀── {s,d:{tu,t,o,h,l,c},h1:{…},live:true}
```

Yahoo quotes are delayed roughly 15 minutes on US equities. This gives you
today's bars, not a tick feed.

## Deploy

1. Make a free Cloudflare account (the Workers free tier is 100,000 requests
   per day, which is far more than this page will use).
2. From this folder:

   ```bash
   npx wrangler deploy
   ```

   Wrangler prints the deployed URL, e.g. `https://stack-live-quotes.<you>.workers.dev`.
3. Test it in a browser or with curl:

   ```bash
   curl https://stack-live-quotes.<you>.workers.dev/AAPL | head -c 200
   ```
4. Turn it on for the page: copy `stack/live.example.json` to `stack/live.json`,
   put your Worker URL in it, and commit.

   ```json
   { "proxy": "https://stack-live-quotes.<you>.workers.dev" }
   ```

The badge in the header turns to **Live · Yahoo** once the Worker answers.

## Turning it off

Delete `stack/live.json`. The page goes back to the committed snapshot with no
other change — and it does that by itself anyway whenever the Worker is slow,
unreachable or rate-limited, since every live request has a 4-second deadline
and falls through to the snapshot.

## Editing the allowlist

`ALLOWED_ORIGINS` at the top of `live-quotes.js` decides who may call the
Worker. It ships with the site's origin and `http://localhost:8000` for local
testing; add any other origin you serve the page from.

## Cost and limits

Each card view is one request, cached for 60 seconds at the edge and 45 in the
browser, so scrolling the full index once is a few hundred requests. Yahoo does
rate-limit; when it answers with an error the Worker returns 502 and the page
quietly uses the snapshot for that ticker.
