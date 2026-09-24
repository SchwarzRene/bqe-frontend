# Trading Journal

Track trades, mark up charts and keep a journal of what you learn. Lives at
**/research/tradingjournal/**. Prices come from Yahoo Finance through the
site's Worker (`/api/market/quote`, `/api/market/candles`), cached at the edge.

It started as a local Python app (SQLite plus a small HTTP server). Here it
runs in the browser: the rules that lived in the Python modules — P&L, risk
and R-multiple, stats, validation, journal links, drawings, which timeframes
a trade can still be charted on — are ported one-to-one into `js/store.js`.
The views are unchanged.

## Who gets what stored

| | Where the journal lives | After a reload |
|---|---|---|
| **Guest** | this tab's memory only | gone — nothing is stored anywhere |
| **Signed in** | the account, in D1 (`user_state`, app `journal`) | back, on any device |

A signed-in journal is one JSON document, saved automatically after every
change ("Saving… / Saved" in the top bar). If the same journal is open in two
tabs and both change it, the second save is refused rather than overwriting
the first; the page says so and asks for a reload. A document is limited to
1.8 MB, which is roughly 5,000 trades with notes.

## Files

```
index.html          the app shell (loads /assets/js/session.js for sign-in)
css/style.css       the app's own styles
js/store.js         data and rules — ported from the Python backend, pure, unit-tested
js/api.js           the calls the views make: store.js + market data + saving
js/main.js          router, theme, account chip, save status
js/charts.js        candle charts (lightweight-charts v4 from jsDelivr)
js/drawing.js       chart drawing tools
js/views/*.js       dashboard, trades, trade detail, journal, symbols
```

Tests for `js/store.js` are in `test/journal.test.ts` at the repository root
(`npm test`).

## Using it

1. **Symbols** → add the symbols you trade, by their MT5 name (`EURUSD`,
   `NAS100`, `XAUUSD`, `BTCUSD`, `AAPL`…). The Yahoo ticker is suggested;
   **Check** confirms it has live data.
2. **Trades** → **+ New trade**. Leave the exit fields empty while a trade is
   open; its P&L then follows the live price.
3. **Trade page** → switch timeframes and draw on the chart.
4. **Journal** → write what you learned and link the trades it is about.

P&L is `(exit − entry) × volume × point value × (+1 long / −1 short) − fees`.
If it does not match your broker, enter the real figure in **Actual P&L from
broker**. Yahoo keeps 1-minute bars for about 7 days, 5–30-minute bars for
about 60 days and hourly bars for about 2 years; the trade page only offers
the timeframes that still exist for that trade.
