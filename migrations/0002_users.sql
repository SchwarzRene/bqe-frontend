-- Sign-in and per-user storage.
--
-- Only signed-in users have anything stored: a guest can use every app, but
-- what they do lives in their browser tab and is gone on reload.

CREATE TABLE users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- PBKDF2-SHA256. Iterations are per user so they can be raised later
  -- (the Workers free plan's 10 ms CPU limit is why they are not higher).
  password_hash        TEXT NOT NULL,
  password_salt        TEXT NOT NULL,
  password_iterations  INTEGER NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A session is a random token in an HttpOnly cookie; only its SHA-256 is
-- stored, so a copy of this table cannot be used to sign in.
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_by_user ON sessions (user_id);

-- Failed sign-ins, for the lockout. Same daily-rotating IP hash as the
-- contact form; pruned after a day.
CREATE TABLE login_attempts (
  ip_hash       TEXT NOT NULL,
  attempted_at  TEXT NOT NULL
);
CREATE INDEX login_attempts_by_ip ON login_attempts (ip_hash, attempted_at);

-- One JSON document per user per app (Stack drawings and bookmarks, the
-- Trading Journal). `version` makes a save from a stale tab fail instead of
-- silently overwriting a newer one.
CREATE TABLE user_state (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app         TEXT NOT NULL,
  body        TEXT NOT NULL,
  version     INTEGER NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, app)
);

-- The one account. Its starting password is weak and this hash is public:
-- change it after the first sign-in (Login → Change password).
INSERT INTO users (username, password_hash, password_salt, password_iterations)
VALUES ('ceo', '7141152e31485090ee3318ec735fe7028327f295d038a5c0cc07bfcc43e39ab7', 'b43f98b7cb1a044ad932977257e2d677', 50000);
