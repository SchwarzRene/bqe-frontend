# Tests

`npm test` runs everything with vitest; `npm run typecheck` checks these files too.

The folders mirror the code they cover:

| Folder | Covers |
|---|---|
| `account/` | `worker/auth.ts`, `admin.ts`, `contact.ts`: sign-in, the AI-access gate, the admin API, and `security.test.ts` (one block per finding in `docs/SECURITY_AUDIT.md`) |
| `news/` | `worker/news/*`, `worker/screen.ts`: unit tests per module, and `flow-*.test.ts` that run the jobs end to end |
| `prices/` | `worker/prices/*`: indicators, the cron job, the API, Dukascopy, the backfill, source switching |
| `stack/` | `worker/stack.ts`, `worker/yahoo.ts`: the nightly S&P 500 refresh and quote merging |
| `research/` | Browser code under `research/` that is tested as-is (Trading Journal store, the Backtest Lab's WebAssembly server) |
| `helpers/` | `d1.ts` (SQLite behind D1's API, with the repository's migrations applied), `clock.ts`, type shims |

A `fixtures.ts` next to the tests holds stubs and builders that more than one file in that folder needs.

## The clock

`helpers/clock.ts` freezes `Date` before every test (default `2026-10-20T12:00:00Z`; timers keep
running), so a test never depends on the time of day it runs at. Pass your own `now` to the code
under test where you can; where the code reads the clock, use `vi.setSystemTime()`. To try the
suite at another moment:

```bash
TEST_NOW=2026-10-20T23:59:59Z npm test
```
