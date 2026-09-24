-- The database behind the site's Worker. Applied with
--   npx wrangler d1 migrations apply bqe --remote
-- and never edited after it has shipped: a change is a new numbered file.

-- S&P 500 constituents, refreshed from Wikipedia once per trading day.
-- `file` is Yahoo's spelling (BRK-B), which is also the URL the page asks for.
CREATE TABLE tickers (
  symbol        TEXT PRIMARY KEY,
  file          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  sector        TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  refreshed_at  TEXT,           -- last successful price refresh (ISO, UTC)
  attempted_at  TEXT,           -- last attempt, successful or not
  last_error    TEXT
);

-- One price document per ticker, in exactly the shape the Stack page reads
-- from /research/stack/data/<file>.json. Stored whole rather than as rows of
-- bars: the page always wants the whole thing, and a whole-document rewrite
-- is what keeps the split/dividend adjustment consistent across history.
CREATE TABLE series (
  file     TEXT PRIMARY KEY,
  body     TEXT NOT NULL,
  updated  TEXT NOT NULL
);

-- Small named JSON documents: the Market Tape schedule and results, and the
-- bookkeeping the scheduled jobs keep between runs.
CREATE TABLE documents (
  key      TEXT PRIMARY KEY,
  body     TEXT NOT NULL,
  updated  TEXT NOT NULL
);

-- Contact form submissions. Deleted 30 days after being answered, as the
-- privacy policy says (section 7.1). The IP is never stored: `ip_hash` is a
-- salted hash that rotates daily, kept only for the rate limit and cleared
-- after a day.
CREATE TABLE contact_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  subject      TEXT NOT NULL,
  message      TEXT NOT NULL,
  ip_hash      TEXT,
  answered_at  TEXT
);

CREATE INDEX contact_by_ip ON contact_messages (ip_hash, created_at);
CREATE INDEX tickers_due   ON tickers (active, refreshed_at);
