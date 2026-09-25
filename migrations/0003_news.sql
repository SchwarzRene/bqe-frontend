-- Market News: headlines, briefings, the event calendar and chat usage.
-- See research/markettape/README.md for what each job writes.

-- One row per story. `id` is a hash of the normalized URL; a near-identical
-- title from another source is folded into the first one's `also_in`
-- instead of getting a row of its own. Kept 7 days.
CREATE TABLE news_items (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  source        TEXT NOT NULL,
  also_in       TEXT NOT NULL DEFAULT '[]',   -- JSON [{source, url}]
  category      TEXT NOT NULL,                -- world | markets | company | policy | commodities
  region        TEXT NOT NULL,                -- us | europe | asia | russia | global
  tickers       TEXT NOT NULL DEFAULT '[]',   -- JSON ["NVDA"]
  published_at  TEXT NOT NULL,                -- ISO, UTC
  score         INTEGER NOT NULL DEFAULT 0,   -- 0-100, at the time it was stored
  fetched_at    TEXT NOT NULL
);
CREATE INDEX news_items_time     ON news_items (published_at);
CREATE INDEX news_items_category ON news_items (category, published_at);
CREATE INDEX news_items_region   ON news_items (region, published_at);
CREATE INDEX news_items_fetched  ON news_items (fetched_at);

-- The same tickers as news_items.tickers, one row each, so "news on NVDA"
-- is an index lookup rather than a scan.
CREATE TABLE news_item_tickers (
  item_id  TEXT NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  ticker   TEXT NOT NULL,
  PRIMARY KEY (ticker, item_id)
);

-- Every briefing the model wrote, for the "new vs. continuing" comparison.
-- The latest one is also kept whole in documents ('news:briefing'), so the
-- page loads it with one read. Kept 7 days.
CREATE TABLE news_briefings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at  TEXT NOT NULL,
  body          TEXT NOT NULL
);
CREATE INDEX news_briefings_time ON news_briefings (generated_at);

-- Scheduled events found by the daily calendar job (central banks, data,
-- non-US earnings, commodity reports). Fed events and US watchlist earnings
-- come from the Market Tape documents and are merged in when read.
CREATE TABLE news_events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  start_at    TEXT NOT NULL,                  -- ISO, UTC
  end_at      TEXT,                           -- ISO, UTC; null = a default length per type
  region      TEXT NOT NULL,
  importance  INTEGER NOT NULL DEFAULT 2,     -- 1-3
  stream_url  TEXT,
  result      TEXT,                           -- one line, once it has happened
  tickers     TEXT NOT NULL DEFAULT '[]',
  origin      TEXT NOT NULL,                  -- the search group that wrote it (us, europe, …)
  updated     TEXT NOT NULL
);
CREATE INDEX news_events_start ON news_events (start_at);

-- Questions asked in the chat, per user per day (UTC), for the daily limit.
CREATE TABLE news_chat_usage (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  count    INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
