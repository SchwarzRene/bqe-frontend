# bqe-backend

The API and the market-data automation behind the BQE site.

Deployed to **Azure Container Apps** on every push to `main`. The frontend
lives in [`bqe-frontend`](https://github.com/SchwarzRene/bqe-frontend) and is
deployed separately to Cloudflare.

```
                     push to main
                          │
                    ┌─────▼─────┐
                    │    CI     │  ruff · pytest · docker build · smoke test
                    └─────┬─────┘
                          │ green
                    ┌─────▼─────┐
                    │   build   │  image → ghcr.io/schwarzrene/bqe-backend:<sha>
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  deploy   │  az containerapp update → wait for /healthz
                    └───────────┘
```

## What it does

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | Liveness probe. Azure uses it; so does the deploy workflow. |
| `GET /api/quotes/{symbol}` | Daily and hourly bars for one ticker, for the Stack page. |
| `GET /docs` | Interactive API docs. Disabled in production. |

`/api/quotes` replaces the Cloudflare Worker the site used to call. Yahoo's
chart endpoint sends no CORS headers, so a browser cannot reach it directly;
this service calls it server-side and returns the same column-wise shape the
committed snapshot uses, with prices adjusted by the `adjclose` ratio so a
level drawn on one sits at the same height on the other.

Separately, `automation/scripts/` holds the two scheduled jobs that build the
committed price snapshots. They run on GitHub Actions and commit their output
into `bqe-frontend` — see [Automation](#automation).

## Running it locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                  # .env is git-ignored

uvicorn app.main:app --reload --port 8080
```

Then:

```bash
curl localhost:8080/healthz
curl localhost:8080/api/quotes/AAPL | head -c 300
open http://localhost:8080/docs
```

In Docker, the way it actually runs in Azure:

```bash
docker build -t bqe-backend .
docker run --rm -p 8080:8080 --env-file .env bqe-backend
```

## Checks

```bash
ruff check . && ruff format --check .   # lint and formatting
pytest                                  # 13 tests, no network
```

The tests mock Yahoo with `respx`, so they are fast and deterministic and
never depend on an upstream being up. They pin the two things the page
actually relies on: the `adjclose` scaling, and the column layout of the
series. CI runs all of it, builds the image, and boots the container to check
it answers `/healthz` before anything reaches Azure.

## Deploying

### One-time setup

```bash
az login
az account set --subscription "<your subscription>"

./infra/azure-setup.sh     # resource group, environment, container app
./infra/github-oidc.sh     # lets Actions deploy without an Azure password
```

Both scripts are idempotent — re-running them changes nothing that already
exists. They print what to paste into GitHub afterwards.

Then in **Settings → Secrets and variables → Actions**:

| | Name | Value |
|---|---|---|
| Secret | `AZURE_CLIENT_ID` | printed by `github-oidc.sh` |
| Secret | `AZURE_TENANT_ID` | printed by `github-oidc.sh` |
| Secret | `AZURE_SUBSCRIPTION_ID` | printed by `github-oidc.sh` |
| Secret | `ANTHROPIC_API_KEY` | your key, for the market-tape job |
| Secret | `FRONTEND_REPO_TOKEN` | fine-grained PAT, see [docs/SECRETS.md](docs/SECRETS.md) |
| Variable | `AZURE_RESOURCE_GROUP` | `bqe-rg` |
| Variable | `AZURE_CONTAINER_APP` | `bqe-backend` |

Create a GitHub **environment** called `production`
(Settings → Environments). The deploy job targets it, and it is where you
can later add a required approval before anything ships.

### After that

Push to `main`. That is the whole deployment process.

### Cost

Sized to sit inside Azure's monthly free grant for Container Apps —
180,000 vCPU-seconds, 360,000 GiB-seconds and 2,000,000 requests per
subscription. The app runs at 0.25 vCPU / 0.5 GiB and **scales to zero**, so
an idle hour costs nothing.

Scaling to zero means the first request after a quiet period pays a cold
start of a few seconds. That is deliberate and safe here: the Stack page
gives every live request a 4-second deadline and falls back to the committed
snapshot, so a cold start shows yesterday's close rather than an error.

If you ever want to remove the cold start, `--min-replicas 1` does it — but
one always-on replica is roughly 648,000 vCPU-seconds a month, well past the
free grant, so it will appear on a bill.

## Automation

| Workflow | Schedule | Writes |
|---|---|---|
| `market-data.yml` | 22:20 UTC, weekdays | `bqe-frontend/research/stack/data` |
| `market-tape.yml` | 12:10 and 22:10 UTC, weekdays | `bqe-frontend/research/markettape/data` |

These are the same jobs as before the split, with one change: the scripts
live here, and the JSON they produce is committed into `bqe-frontend`, whose
own push-to-deploy then publishes it. That keeps 46 MB of price data on
Cloudflare's CDN, where it is free and fast, instead of being served by a
container that scales to zero.

Both can be run by hand from the **Actions** tab, and `market-data` takes a
`limit` input so you can try it against 20 tickers instead of 500.

## Secrets

See **[docs/SECRETS.md](docs/SECRETS.md)** — where every key lives, why none
of them is in git, and what to do if one ever is.

## Layout

```
app/
  main.py            FastAPI app, CORS, lifespan
  config.py          environment-driven settings, no secret defaults
  routers/           health, quotes
  services/
    yahoo.py         the Worker port: chart fetch + adjclose scaling
    cache.py         in-process TTL cache
automation/scripts/  the two scheduled market-data jobs
infra/               one-time Azure and GitHub OIDC setup
tests/               pytest, Yahoo mocked with respx
Dockerfile           two-stage build, non-root, uvicorn with two workers
```
