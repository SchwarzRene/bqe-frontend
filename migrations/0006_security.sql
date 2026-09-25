-- Security hardening (see SECURITY_AUDIT.md).

-- SEC-01: the owner account was seeded in 0002 with a hash that is public in
-- this repository. If it was never changed, it can no longer be used to sign
-- in: '!' is not a hex digest, so no password matches it. Set a new one with
--   node scripts/set-password.mjs ceo
-- which prints the wrangler command to run. A password that was already
-- changed is left alone.
UPDATE users SET password_hash = '!'
 WHERE username = 'ceo'
   AND password_hash = '7141152e31485090ee3318ec735fe7028327f295d038a5c0cc07bfcc43e39ab7';

-- SEC-02: failed sign-ins are counted per account as well as per visitor, so
-- a lockout follows the account being guessed, whichever address it comes
-- from. `account` is the lowercased username that was tried.
ALTER TABLE login_attempts ADD COLUMN account TEXT;
CREATE INDEX login_attempts_by_account ON login_attempts (account, attempted_at);

-- SCL-01: the site-wide sign-up limit counts every sign-up in the last hour.
CREATE INDEX signup_attempts_time ON signup_attempts (attempted_at);

-- REL-02: what admins did, for the admin terminal's `audit` command. Kept a
-- year. `admin` is the username at the time, so a deleted admin's entries
-- still read.
CREATE TABLE admin_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  admin       TEXT NOT NULL,
  action      TEXT NOT NULL,       -- update | password | delete | message
  target      TEXT NOT NULL,       -- username, or contact message id
  detail      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX admin_audit_time ON admin_audit (at);
