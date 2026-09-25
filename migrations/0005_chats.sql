-- Market News chat conversations, saved per user so they follow the account
-- to any device. The server appends each question and its answer after the
-- model has replied (worker/news/conversations.ts); the user can reopen or
-- delete them from the chat's history. Kept until deleted, or until the
-- account is: at most 50 per user, oldest dropped first.

CREATE TABLE chat_conversations (
  id          TEXT PRIMARY KEY,                -- random, 32 hex characters
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,                   -- the first question, shortened
  messages    TEXT NOT NULL,                   -- JSON [{role, text, sources?, at}]
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX chat_conversations_by_user ON chat_conversations (user_id, updated_at);
