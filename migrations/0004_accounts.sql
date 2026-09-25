-- Open sign-up, roles and AI access.
--
-- Anyone can now create an account (POST /api/auth/signup). A new account
-- can save its work in the research apps but cannot use the AI features —
-- the Market News chat, the AI analyst and a fresh briefing — until an admin
-- grants it in the admin terminal (/pages/admin.html). Admins always have AI
-- access.

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';        -- 'user' | 'admin'
ALTER TABLE users ADD COLUMN ai_access INTEGER NOT NULL DEFAULT 0;    -- 0 = restricted, the default
ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;     -- 1 = cannot sign in
ALTER TABLE users ADD COLUMN last_login_at TEXT;

-- Optional, but at most one account per address.
CREATE UNIQUE INDEX users_email ON users (email COLLATE NOCASE) WHERE email IS NOT NULL;

-- The account that existed before sign-up opened is the site owner's.
UPDATE users SET role = 'admin', ai_access = 1 WHERE username = 'ceo';

-- Accounts created, per visitor per day, for the sign-up rate limit. Same
-- daily-rotating IP hash as the contact form; pruned after a day.
CREATE TABLE signup_attempts (
  ip_hash       TEXT NOT NULL,
  attempted_at  TEXT NOT NULL
);
CREATE INDEX signup_attempts_by_ip ON signup_attempts (ip_hash, attempted_at);
