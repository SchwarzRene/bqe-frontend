-- Market News: the model's reading of every headline (worker/news/headlines.ts).
-- `importance` is 1-5 on the same scale as the briefing's headline ranks,
-- `tone` is + / - / 0 for the markets or the companies named, and
-- `ranked_at` is set once a batch holding the headline has been answered,
-- even if the model skipped it, so none is sent twice. The companies the
-- model names go into `tickers` and news_item_tickers like any other.
ALTER TABLE news_items ADD COLUMN importance INTEGER;
ALTER TABLE news_items ADD COLUMN tone TEXT;
ALTER TABLE news_items ADD COLUMN ranked_at TEXT;
