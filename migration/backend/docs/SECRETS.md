# Secrets and API keys

The rule, and the only one that really matters:

> **A secret is never committed.** Not in code, not in a config file, not in a
> workflow file, not in a comment, not "temporarily". Git remembers forever,
> and both of these repositories are public.

Everything below is how that rule is kept while still letting the code reach
the services it needs.

## Where each secret actually lives

A secret lives in the secret store of whatever runs the code. There are three
places code runs, so there are three stores.

| Runs where | Store | What goes in it |
|---|---|---|
| GitHub Actions (the scheduled market-data jobs, the deploy) | Repo → Settings → Secrets and variables → Actions → **Secrets** | `ANTHROPIC_API_KEY`, `FRONTEND_REPO_TOKEN`, `AZURE_*` |
| Azure (the running API container) | Container App → **Secrets**, surfaced as env vars | anything the API itself needs at runtime |
| Your laptop | a `.env` file that is git-ignored | your own copies, for local work |

The code never knows which of the three it is in. It reads `os.getenv(...)`
and the platform supplies the value. That is the whole trick: `app/config.py`
has no secret defaults, so a missing value fails loudly instead of silently
falling back to something committed.

## The secrets this project uses

### `ANTHROPIC_API_KEY` — GitHub Actions secret, `bqe-backend`

Used by `automation/scripts/fetch_market_tape.py` to write the earnings
rundown. Set it at **bqe-backend → Settings → Secrets and variables →
Actions → New repository secret**.

`market-tape.yml` passes it to the script as an environment variable and
nothing else:

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

GitHub masks it in logs. Note that masking is a safety net, not a guarantee —
never `echo` a secret, and never write one to a file the job later commits.

### `FRONTEND_REPO_TOKEN` — GitHub Actions secret, `bqe-backend`

The automation lives in `bqe-backend`, but the JSON it produces belongs to
the site, so it is committed into `bqe-frontend`. The automatic
`GITHUB_TOKEN` is scoped to the repository it runs in, so it cannot push to
the other one — hence a token of its own.

Create it as a **fine-grained** personal access token:

1. GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → **Generate new token**
2. Repository access: **Only select repositories** → `bqe-frontend`
3. Permissions → Repository permissions → **Contents: Read and write**
4. Expiration: 90 days, and put a reminder in your calendar to roll it

Nothing else. Not "all repositories", not `repo` on a classic token — that
grants write access to every repository you own, which is far more than a
data job needs.

### `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` — GitHub Actions secrets, `bqe-backend`

These are **not passwords**. There is deliberately no Azure password in this
setup at all.

`infra/github-oidc.sh` sets up workload identity federation: on each run
GitHub mints a short-lived OIDC token, Azure checks that it really came from
`SchwarzRene/bqe-backend` on `main`, and issues an access token that expires
in minutes. Nothing long-lived is stored, so there is nothing to rotate and
nothing worth stealing.

They are still kept as secrets rather than variables, because there is no
reason to publish your subscription layout.

### `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — GitHub Actions secrets, `bqe-frontend`

See `bqe-frontend/docs/DEPLOYMENT.md`. Same idea: a token scoped to
"Cloudflare Pages: Edit" on one account, and nothing more.

## Runtime configuration vs secrets

Not everything that varies by environment is a secret. `ALLOWED_ORIGINS`,
`QUOTE_CACHE_TTL` and the resource-group name are configuration: they are
not sensitive, and treating them as secrets only makes them harder to read
and change.

- **Secret** → GitHub *Secrets*, or Azure Container App *secrets*
- **Config** → GitHub *Variables*, or Azure Container App *env vars*

The deploy workflow uses `vars.AZURE_RESOURCE_GROUP` and
`vars.AZURE_CONTAINER_APP` for exactly this reason.

## Adding a secret the API needs at runtime

Today the API container needs no secret — it only relays a public endpoint.
When that changes (a database, a mail provider), the value goes into the
Container App, not into the image:

```bash
# Store it
az containerapp secret set \
  --name bqe-backend --resource-group bqe-rg \
  --secrets "db-password=<the value>"

# Surface it to the process as an env var that references the secret
az containerapp update \
  --name bqe-backend --resource-group bqe-rg \
  --set-env-vars "DB_PASSWORD=secretref:db-password"
```

Then read it in `app/config.py` with `os.getenv("DB_PASSWORD")`. The image
stays free of secrets, which is what makes it safe to push to a public
registry.

## Working locally

```bash
cp .env.example .env     # .env is git-ignored
# fill in what you need; most of the app runs with none of it
```

`.env.example` is committed and holds **names and harmless defaults only**.
It is documentation of what exists, never of what the values are.

## If a key is ever committed

Assume it is compromised the moment it is pushed — public repositories are
scraped continuously, often within seconds.

1. **Revoke the key at the provider first.** Rewriting git history does not
   un-publish anything; forks, clones and caches keep the old objects.
2. Issue a replacement and put it in the right secret store.
3. Only then worry about scrubbing history
   (`git filter-repo`, or GitHub Support for cached views).

Step 1 is the one that matters. Steps 2 and 3 are cleanup.

## Worth turning on

In both repositories, **Settings → Code security**:

- **Secret scanning** — GitHub greps pushes for known key formats and alerts
  you. Free on public repositories.
- **Push protection** — blocks the push outright when it recognises a key.
  This is the one that actually saves you.
