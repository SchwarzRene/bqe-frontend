# Splitting into bqe-frontend and bqe-backend

Everything needed to turn this repository into two: a **bqe-frontend** served
by Cloudflare, and a **bqe-backend** running on Azure. Both deploy on every
push to `main`.

This folder exists only for the move. It ends up in neither new repository —
`split.sh` removes it on the way through.

```
                    schwarzrene.github.io (this repo)
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
          bqe-frontend                     bqe-backend
     webpage/ at the root           FastAPI + the Python jobs
     full git history kept          fresh history
                 │                               │
                 ▼                               ▼
         Cloudflare Pages              Azure Container Apps
      push to main → live            push to main → rolled out
      pull request → preview         scales to zero when idle
```

## Do this

### 1. Create the two repositories

Both must exist and be **completely empty** — no README, no .gitignore, no
licence. An auto-created file makes the first push a non-fast-forward.

- <https://github.com/new> → name `bqe-frontend`, **Public**, add nothing
- <https://github.com/new> → name `bqe-backend`, **Public**, add nothing

Public is worth keeping: GitHub Actions minutes are unlimited on public
repositories (the market-data job alone would use most of the 2,000 free
private minutes), and the backend's container image on ghcr.io is then public
too, so Azure pulls it with no registry credentials. Nothing secret is
committed either way.

### 2. Build them and look before you leap

```bash
./migration/split.sh
```

Nothing is pushed. It writes `../bqe-split/bqe-frontend` and
`../bqe-split/bqe-backend`; look them over.

```bash
cd ../bqe-split/bqe-frontend && git log --oneline -3 && ls
cd ../bqe-backend && ls && python3 -m pytest
```

### 3. Push

```bash
./migration/split.sh --push --work ../bqe-split
```

Or add the remote and push by hand from each directory — the script does
nothing clever.

### 4. Set up Cloudflare

Follow **`bqe-frontend/docs/DEPLOYMENT.md`**. In short: create a Pages project
called `bqe-frontend` by *direct upload*, create an API token with
*Cloudflare Pages: Edit*, and put the token and your account ID into the
repository's Actions secrets. The next push deploys.

### 5. Set up Azure

Follow **`bqe-backend/README.md`**. In short:

```bash
az login
./infra/azure-setup.sh     # resource group, environment, container app
./infra/github-oidc.sh     # lets Actions deploy with no stored password
```

Both scripts print what to paste into GitHub afterwards. Create a GitHub
environment called `production` as well; the deploy job targets it.

### 6. Join the two together

Once the backend has a URL, point the Stack page at it:

```bash
cd bqe-frontend
cp research/stack/live.example.json research/stack/live.json
# set "proxy" to https://<app>.azurecontainerapps.io/api/quotes
git commit -am "Point live quotes at the backend" && git push
```

And tell the backend which origin is allowed to call it:

```bash
az containerapp update --name bqe-backend --resource-group bqe-rg \
  --set-env-vars "ALLOWED_ORIGINS=https://bqe-frontend.pages.dev"
```

### 7. Retire the old site

Only once the new one is confirmed working. Archive this repository, or leave
it as the historical record — but turn GitHub Pages off
(**Settings → Pages → Source: None**) so there are not two live copies of the
site disagreeing with each other.

## What moves where

| | bqe-frontend | bqe-backend |
|---|---|---|
| `webpage/**` | → the repository root | — |
| `automation/scripts/*.py` | — | → `automation/scripts/` |
| `automation/worker/live-quotes.js` | — | → rewritten as `app/services/yahoo.py` |
| `automation/requirements.txt` | — | → `requirements-automation.txt` |
| `.github/workflows/deploy.yml` | → rewritten for Cloudflare | → rewritten for Azure |
| `.github/workflows/market-*.yml` | — | → moved, now commit into bqe-frontend |
| `README.md` | → kept, sections rewritten | → new |
| git history | → kept in full | → fresh |

The site's history is carried over because it is worth having: `git log` on a
stylesheet still explains why a rule is there, and `git log --follow` still
works across the move to the root. The backend starts fresh because it is a
new project — two Python scripts came with it, unchanged apart from their
output paths.

### Why the data still lives in the frontend repository

The market-data jobs move to `bqe-backend`, but the 46 MB of JSON they produce
is still committed into `bqe-frontend`. That is deliberate: it is static data
that changes once a day, which is exactly what a CDN is for, and exactly what
a container that scales to zero is bad at. The jobs check the frontend out,
write, and push; that push triggers the Cloudflare deploy like any other.

This is the one place a cross-repository credential is needed —
`FRONTEND_REPO_TOKEN`, a fine-grained PAT scoped to `bqe-frontend` with
*Contents: write* and nothing else. See `bqe-backend/docs/SECRETS.md`.

## Files here

```
migration/
├── README.md                   this file
├── split.sh                    builds and optionally pushes both repositories
├── patch_frontend_readme.py    rewrites the README sections the move invalidates
├── frontend/                   files overlaid onto the frontend repository
│   ├── .github/workflows/      deploy.yml (Cloudflare), ci.yml (link check)
│   ├── .github/check-links.py  the link checker CI runs
│   ├── _headers                security and caching headers
│   ├── docs/DEPLOYMENT.md      Cloudflare setup
│   └── research/stack/live.example.json
└── backend/                    the complete bqe-backend repository
```

## Known, pre-existing, not fixed here

Two references in the site are already broken on the live page, and the split
does not change that either way. They are listed in
`bqe-frontend/.github/check-links.py` as `KNOWN_MISSING`, so the link check
passes while still failing on anything *new*:

- `research/bqe-decomp/index.html` → `../../plots/ohlc_overlay.png`
  (the `<img>` has an `onerror` that hides it, so nothing visibly breaks)
- `pages/credits.html` → `/assets/audio/ui-sound.mp3`
  (the audio player on the credits page has nothing to play)

Add the files, or remove the references, and delete the matching
`KNOWN_MISSING` entry.
