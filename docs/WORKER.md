# The Worker

All server-side code is in `worker/`; its data lives in a Cloudflare D1 database called `bqe`.

## API

| Path | Source | What it does |
|---|---|---|
| `GET /api/health` | `worker/index.ts` | Liveness; the Stack page probes it to find the API. |
| `GET /api/quotes/:symbol` | `worker/yahoo.ts` | Daily + hourly bars from Yahoo, cached 60 s at the edge. |
| `POST /api/contact` | `worker/contact.ts` | Stores a contact form submission in D1 (validated, rate-limited, honeypot). |
| `GET /research/stack/data/*.json` | `worker/stack.ts` | Prices from D1; the committed file until D1 has them. |
| `GET /api/commodities/prices` | `worker/prices/index.ts` | Snapshot of the 15 commodity instruments (one D1 read, no upstream fetch); `?symbol=`, `?history=1` and a `from`/`to`/`days`/`years` range add daily closes from the archive. |
| `GET /api/news` | `worker/news/index.ts` | Market News: the latest briefing, 24 h of headlines, this week's calendar. |
| `POST /api/news/refresh` | `worker/news/index.ts` | Fetch now and write a fresh briefing. AI access; one per 15 min. |
| `POST /api/chat` | `worker/news/chat.ts` | Market News chat (Gemini). AI access; daily limit per user. |
| `GET/POST /api/company/analysis` | `worker/news/analyst.ts` | Market News AI analyst note. AI access; same daily limit. |
| `POST /api/admin/run/{stack,screen,news,calendar,briefing,prices}` | `worker/index.ts` | Runs a job now. Needs `Authorization: Bearer $ADMIN_TOKEN`. |
| `POST /api/auth/{signup,login,logout,password}`, `GET /api/auth/{me,config}` | `worker/auth.ts` | Sign-up and sign-in with an HttpOnly session cookie. |
| `GET /api/auth/export`, `POST /api/auth/delete` | `worker/auth.ts` | A user downloads everything stored for their account, or deletes it. |
| `GET /api/admin/users`, `PATCH/DELETE /api/admin/users/:id`, `POST /api/admin/users/:id/password` | `worker/admin.ts` | The admin terminal: list accounts, grant/revoke AI access, suspend, change role, reset a password, delete. Signed-in admins only. |
| `GET /api/admin/messages`, `POST /api/admin/messages/:id/answered`, `GET /api/admin/audit` | `worker/admin.ts` | The admin terminal: contact-form inbox and the log of admin actions. |
| `GET/DELETE /api/chats[/:id]` | `worker/news/conversations.ts` | A signed-in user's saved Market News chats. |
| `GET /api/diary/day/:day`, `GET /api/diary/days?month=` or `?from=&to=`, `GET /api/diary/history?before=` | `worker/diary/index.ts` | Meal Diary: a day's meals, saved ideas and notes; meals per day of a month or range (calendar, date strip); a page of past days with their meals, newest first (the feed). Signed in. |
| `POST/PATCH/DELETE /api/diary/meals[/:id]`, `GET/PUT/DELETE /api/diary/meals/:id/photo`, `GET/PUT /api/diary/settings` | `worker/diary/index.ts`, `photos.ts` | Meal Diary: add, change and delete an entry, its photo (JPEG/PNG/WebP, ≤ 700 kB, 25 MB per account), and the notes the AI keeps to. |
| `POST /api/diary/describe`, `POST /api/diary/meals/:id/describe` | `worker/diary/describe.ts` | Meal Diary: Gemini describes a meal photo in one sentence (image sent inline). Only on request; AI access. |
| `POST /api/diary/suggest` | `worker/diary/suggest.ts` | Meal Diary: Gemini summarises a day and suggests a breakfast, lunch, dinner and snack to cook next, from the last two weeks of the diary. Only on request; AI access; `DIARY_AI_DAILY_LIMIT` requests a day per user, shared with the descriptions. |
| `GET/PUT /api/state/{stack,journal,news}` | `worker/state.ts` | A signed-in user's saved work, one JSON document per app. |
| `GET /api/market/{quote,candles}` | `worker/market.ts` | Yahoo quotes and candles for the Trading Journal, cached at the edge. |

### Accounts and saved work

Visitors can use every research app without an account, but **nothing a
guest does is stored** — not on the server and not in their browser. It
lives in the open tab and is gone on reload. A signed-in user's work in
Stack (marked charts, drawings, theories) and in the Trading Journal is
saved to their account and follows them to any device. So do their
display settings — Market News's regions, time zone, headline sort and
calendar filters, the Trading Journal's light/dark theme and the History
Map's language, the Meal Diary's theme: one `prefs` document per user with a section per app
(`PATCH /api/state/prefs`, merged rather than versioned, via
`BQE.prefs.sync/save` in `session.js`). Each app also keeps them in
`localStorage`, so guests keep theirs in the browser. Market News's Ask
AI conversations are saved to the account too (`GET/DELETE /api/chats`),
with a history to reopen or delete them.

Anyone can create an account (Login → *Create one*): a username (3–32
letters, digits, `. _ -`), a password of at least 12 characters that is not
known from a data breach and, optionally, an email address. Sign-ups are
limited to 5 per visitor per day and 30 an hour site-wide, and Cloudflare
Turnstile is asked when it is configured. Sign-in allows 10 failures per
visitor per 15 minutes and 10 per account per hour. An account keeps up
to 4 MB of saved work across the apps. Signed-in users can download their
data or delete their account from the account panel.

**AI access is off by default.** A new account can save its work, but the
AI features — Market News's Ask AI chat, the AI analyst note, a fresh
briefing on Refresh and the Meal Diary's meal ideas — answer `403` until an admin grants access. Admins
always have it. The check is on the Worker (`aiDenied` in
`worker/auth.ts`), before any model call.

**The admin terminal** is `/pages/admin.html`, linked from the account
panel for admins. It lists every account (email, role, AI access, status,
created, last sign-in, open sessions, AI requests today) and has a switch
per user for AI access, plus suspend (which also signs them out), make
admin / demote, reset password (shows a temporary one to pass on) and
delete. The same actions work as commands at its prompt — `grant alice
bob`, `revoke alice`, `grant-all`, `suspend`, `promote`, `reset`, `list
noai`, `whois` — as do the contact-form inbox (`messages`, `read 12`,
`answered 12`) and the log of admin actions (`audit`); `help` lists them.
Every admin change is recorded in `admin_audit` (kept a year). An admin
cannot suspend, demote or delete their own account.

The first admin is `ceo`, created by `migrations/0002_users.sql` and made
admin by `migrations/0004_accounts.sql`. Its seeded hash is public, so
`migrations/0006_security.sql` disables it unless it was already changed; set
the password with `node scripts/set-password.mjs ceo` (see
docs/DEPLOYMENT.md). To make another account admin from the command line:
`npx wrangler d1 execute bqe --remote --command "UPDATE users SET role = 'admin' WHERE username = 'NAME'"`.

An app opts in with `/assets/js/session.js`: `BQE.store("<app>")` loads and
saves its document (a no-op for guests), and `BQE.mountAccountChip(el)`
shows who is signed in. A new app also needs its name added to `APPS` in
`worker/state.ts`.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how requests reach these routes.

## Data and automation

| Cron (UTC) | Job | Writes to D1 |
|---|---|---|
| every minute 22:00–23:59 UTC Mon–Fri, every 2 min 00:00–05:59 Tue–Sat | Stack prices: the first run of the day takes the constituents from Wikipedia, the others bars from Yahoo, `STACK_BATCH` (20) tickers a run, each two Yahoo requests | `tickers`, `series` |
| every 15 min | Market News (`worker/news/`), one job per run: headlines (a third of the sources per run); Gemini briefings at 02:30, 08:00, 12:30, 16:30 New York time on weekdays and Sat 10:00; calendar results at :15 on weekdays; the calendar (no model calls) at 05:00 and 05:30 New York time, with the daily clean-up | `news_*`, `documents` |
| `5,20,35,50 * * * *` | Commodity prices (`worker/prices/`), one small job per run: :05 and :35 refresh the next few instruments, :20 and :50 backfill the year archive. Source is `PRICES_SOURCE` in `wrangler.toml` | `documents` |
| with the 05:00 run | Deletes contact messages 30 days after they were answered, expired sessions, Meal Diary ideas older than 60 days | `contact_messages`, `sessions`, `diary_suggestions` |

The Stack job is batched because a Worker invocation has limited CPU time and outbound requests (set by `STACK_BATCH` in `wrangler.toml`): each run takes the next tickers not yet
refreshed today, and a failed ticker is retried 20 minutes later. It is also
incremental: a ticker already in D1 fetches only its last month of days and
five days of hours and appends them. The full 10-year download happens only
when the stored history no longer matches (a dividend or split), when there
is a gap, or on that ticker's roughly monthly full check.

Nothing is committed back to git any more. The data files still in
`research/stack/data/` are the last snapshot and only matter until D1 has
filled in — the index switches to D1 once it holds prices for 90% of the list.
