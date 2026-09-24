# Deployment

The site is **one Cloudflare Worker**: it serves the static files, answers
`/api/*`, and runs the scheduled data jobs. Its data lives in a **D1**
database. Push to `main` and it is live, usually inside a minute.

```
push to main ──▶ Cloudflare pulls ──▶ npm ci ──▶ ./build.sh ──▶ wrangler deploy ──▶ D1 migrations ──▶ live
open a PR    ──▶ Cloudflare pulls ──▶ npm ci ──▶ ./build.sh ──▶ preview version URL
```

This replaced `bqe-backend` (a FastAPI container on Azure plus two GitHub
Actions jobs that committed JSON into this repository). There is no server,
no container and no GitHub secret left.

## Cost

Everything fits Cloudflare's free tiers except, possibly, one thing:

| | Free plan | Used here |
|---|---|---|
| Worker requests | 100,000 / day | only `/api/*` and data files count; static files are free |
| D1 storage | 500 MB per database | ~45 MB of prices |
| D1 writes | 100,000 rows / day | ~1,100 on a weekday evening |
| Cron triggers | 5 per account | 3 |
| **CPU per invocation** | **10 ms** | **a Stack batch merges 20 tickers** |

The Stack refresh is incremental: most tickers need only a month of days and
five days of hours from Yahoo, merged onto what D1 holds, and just a few a
night download the whole 10 years (see `research/stack/README.md`). It should
fit the free plan's 10 ms CPU limit most nights. Nights with many full
downloads cost more: the first night of all, and days when many stocks go
ex-dividend at once. If the Worker's logs show Stack runs ending in
`exceededCpu`, lower `STACK_BATCH` in `wrangler.toml`, or move to **Workers
Paid ($5/month)**, which allows 30 s of CPU per invocation (raise
`STACK_BATCH` to 100 there). A run that hits the limit writes nothing and is
retried 20 minutes later. The other jobs wait on the network, which
costs no CPU time, and fit the free plan comfortably.

Gemini's free tier covers Market Tape: 8 grounded requests per run, 2 runs a
day.

## The files that make it work

**`wrangler.toml`** declares the Worker (`main = "worker/index.ts"`), the
static assets (`./_site`), the D1 binding, the cron schedule and the plain
settings. `run_worker_first` sends `/api/*` and the two data folders to the
Worker before the asset store, so D1 wins over a committed data file.

Without `wrangler.toml` wrangler improvises — it treats the *whole repository*
as the assets directory, sweeps in `.git`, and fails on a pack file bigger
than the 25 MiB per-asset limit.

**`build.sh`** produces `_site/`: everything in the repository except the
furniture — `.git`, `.github/`, `docs/`, `README.md`, `wrangler.toml`, the
Worker's source and tooling, and itself. It refuses to publish a tree with no
`index.html`.

**`migrations/`** is the D1 schema. `wrangler d1 migrations apply` records what
it has applied, so the deploy command can run it every time.

## One-time setup

**1. The database.** Either let wrangler create it on the first deploy (leave
`database_id` out of `wrangler.toml`), or create it yourself and pin it:

```bash
npx wrangler login
npx wrangler d1 create bqe          # prints a database_id
# paste it under [[d1_databases]] in wrangler.toml and commit
```

Pinning the id is the more predictable choice: a renamed or recreated Worker
then still finds the same data.

**2. The build.** Dashboard → **Workers & Pages** → your `bqe-frontend`
Worker → **Settings** → **Build**:

| Field | Value |
|---|---|
| Repository | `SchwarzRene/bqe-frontend` |
| Production branch | `main` |
| Build command | `./build.sh` |
| Deploy command | `npx wrangler deploy && npx wrangler d1 migrations apply bqe --remote` |
| Root directory | *(leave empty)* |

Cloudflare installs `package.json`'s dependencies before the build command.
The deploy comes before the migrations so the database exists on the very
first deploy; until the tables exist the Worker serves the committed files.

**3. The secrets.** Stored on the Worker, never in git:

```bash
npx wrangler secret put GEMINI_API_KEY   # free key: https://aistudio.google.com/apikey
npx wrangler secret put ADMIN_TOKEN      # any long random string: openssl rand -hex 32
```

(or Worker → **Settings** → **Variables and Secrets**). `ADMIN_TOKEN` guards
`POST /api/admin/run/{stack,markettape}`, which runs a job on demand.

**4. Fill the data.** Either wait for the evening, or run it now:

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<site>/api/admin/run/markettape
# repeat until "remaining" reaches 0:
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<site>/api/admin/run/stack
```

**5. Retire `bqe-backend`.** Once the site serves from D1:

- disable its `market-data` and `market-tape` workflows (Actions → workflow →
  ⋯ → Disable), or they keep committing 46 MB of JSON here every weekday;
- delete the Azure resource group (`az group delete --name bqe-rg`) so nothing
  is billed;
- delete the `FRONTEND_REPO_TOKEN` PAT on GitHub and the Azure OIDC app;
- archive the repository.

## Contact form messages

Submissions land in the `contact_messages` table. Read the open ones:

```bash
npx wrangler d1 execute bqe --remote --command \
  "SELECT id, created_at, name, email, subject, message FROM contact_messages WHERE answered_at IS NULL"
```

Mark one answered once you have replied — that starts the 30-day deletion the
privacy policy promises (section 7.1):

```bash
npx wrangler d1 execute bqe --remote --command \
  "UPDATE contact_messages SET answered_at = datetime('now') WHERE id = 42"
```

The D1 console in the dashboard runs the same SQL. No IP address is stored,
only a salted hash that changes daily, used for the rate limit (5 messages per
hour) and cleared after a day.

## Pull request previews

Cloudflare builds non-production branches and pull requests to preview
versions, each with its own URL, and reports them on the pull request.
Preview versions do not touch the production URL.

## What CI does, and what it does not

`.github/workflows/ci.yml` runs on every push and pull request. It checks that
every internal link and asset reference resolves and that nothing resembling a
credential is committed, and it typechecks, unit-tests and bundles the Worker
(`wrangler deploy --dry-run`).

**It does not gate the deploy.** Cloudflare pulls from GitHub independently, so
a red CI run will not stop a deploy. The check still runs and its result is
visible on the commit.

## Custom domain

Your Worker → **Settings** → **Domains & Routes** → **Add** → **Custom
domain**.

If the domain's DNS is already on Cloudflare this is two clicks and the
certificate is issued automatically.

After the domain is live, update the `Live:` line in `README.md`. Nothing
else needs to know the domain: the page and its API share an origin.

## Limits

Workers static assets allows **20,000 files** and **25 MiB per file**.

Currently published: **660 files**, largest **3.8 MiB**
(`research/historymap/data/world_1492.geojson`). Plenty of headroom — but the
stack data is 500 of those files, so keep the file count in mind if you add
another per-ticker dataset.

Check before pushing something large:

```bash
./build.sh
find _site -type f | wc -l                    # must stay under 20000
find _site -type f -size +25M                 # must print nothing
```

## Rolling back

Your Worker → **Deployments** → find the last good version → **Rollback**.
Immediate, and no git operation needed.

Then fix the problem properly on `main`, because the next push deploys again.

## Troubleshooting

**`Asset too large` naming a `.git` pack file.** The build published the
repository root instead of `_site`. Either the build command is not set to
`./build.sh`, or `wrangler.toml` is not at the repository root.

**`Proceed with setup?` in the build log.** wrangler found no configuration and
is improvising. Same cause as above: `wrangler.toml` is missing or not where
wrangler is looking.

**A push did not deploy at all.** Check the Worker's **Builds** tab first — if
no build was queued, the GitHub App has lost access. Re-authorise it under
GitHub → Settings → Applications.

**The build fails with `build.sh: not found` or a permission error.** The
executable bit did not survive. `git update-index --chmod=+x build.sh` and
push.

**The site deploys but pages are unstyled.** Something broke the absolute
paths. Every page references `/assets/...` from the site root; run
`./build.sh` locally and check the file is really at that path inside `_site/`.

**Live quotes stopped working.** `curl https://<site>/api/health`, then
`curl https://<site>/api/quotes/AAPL`. A 502 naming `yahoo 429` or `403` is
Yahoo throttling Cloudflare's addresses; the page silently uses the stored
bars, which is the designed behaviour.

**The data is not updating.** Worker → **Logs** (observability is on) and look
at the cron runs: `stack refresh {...}` reports what each batch did, and
`markettape refresh:` says why it skipped (usually a missing
`GEMINI_API_KEY`). `SELECT symbol, last_error FROM tickers WHERE last_error
IS NOT NULL` shows which tickers keep failing.
