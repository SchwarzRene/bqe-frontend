-- Meal Diary (research/mealdiary/, worker/diary/): what a signed-in user ate,
-- when, with an optional photo, and the AI's meal ideas for each day.
--
-- Everything is per user and per day. `day` is the user's own calendar date
-- (YYYY-MM-DD, as their browser saw it) and `time` their local clock (HH:MM),
-- so a dinner at 23:30 stays on the day it was eaten whatever the server's
-- zone is. Kept until the user deletes it, or the account is deleted
-- (deleteUserStatements in worker/auth.ts spells the cascade out).

CREATE TABLE diary_meals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          TEXT NOT NULL,                 -- YYYY-MM-DD
  time         TEXT NOT NULL,                 -- HH:MM
  slot         TEXT NOT NULL,                 -- breakfast | lunch | dinner | snack
  description  TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX diary_meals_by_day ON diary_meals (user_id, day, time);

-- At most one photo per meal. The browser shrinks it to a JPEG before it is
-- sent; it is stored as base64 text (a D1 row tops out at 2 MB, and a TEXT
-- column behaves the same in every environment a BLOB does not). A separate
-- table, so listing a day never reads the pictures.
CREATE TABLE diary_photos (
  meal_id  INTEGER PRIMARY KEY REFERENCES diary_meals(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime     TEXT NOT NULL,                     -- image/jpeg | image/png | image/webp
  bytes    INTEGER NOT NULL,                  -- size of the picture itself
  updated_at TEXT NOT NULL,                   -- when it was uploaded; goes into the picture's URL so a replaced one is not served from cache
  data     TEXT NOT NULL                      -- base64
);
CREATE INDEX diary_photos_by_user ON diary_photos (user_id);

-- The AI's ideas for one day, as the model returned them (JSON). Generated
-- once, shown again on every visit; "New ideas" replaces it. Pruned after 60 days.
CREATE TABLE diary_suggestions (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day           TEXT NOT NULL,
  body          TEXT NOT NULL,
  generated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- What the user wants the AI to know: diet, allergies, dislikes, goals.
CREATE TABLE diary_settings (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notes       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Model calls per user per day, for the daily limit (like news_chat_usage).
CREATE TABLE diary_ai_usage (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  count    INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
