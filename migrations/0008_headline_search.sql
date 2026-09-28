-- Market News: a full-text index over headline titles, for the chat's
-- search_headlines now that headlines are kept 180 days. A LIKE scan would
-- read every stored headline in the date range on each search; the index
-- reads only the matches. Kept in step by worker/news/store.ts (ingest adds
-- new headlines, pruneNews removes old ones), not by triggers.
CREATE VIRTUAL TABLE news_fts USING fts5(
  title,
  id UNINDEXED,
  published_at UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
INSERT INTO news_fts (title, id, published_at) SELECT title, id, published_at FROM news_items;
