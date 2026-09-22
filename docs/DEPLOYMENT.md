# Deployment

The site is a **Cloudflare Worker serving static assets**, connected directly
to this repository. Push to `main` and it is live, usually inside a minute.

```
push to main ──▶ Cloudflare pulls ──▶ ./build.sh ──▶ _site/ ──▶ wrangler deploy ──▶ live
open a PR    ──▶ Cloudflare pulls ──▶ ./build.sh ──▶ _site/ ──▶ preview version URL
```

There is **no API token and no GitHub secret**. Cloudflare watches the
repository through its GitHub App, so nothing here holds a credential and
nothing expires.

## Why a Worker and not Pages

Either would serve this site. Cloudflare now steers new Git-connected projects
to Workers, and Workers is where static assets are getting the attention, so
that is what this uses. Nothing about the site changes: no code runs, the
Worker is a CDN in front of `_site/`, and `_headers` still applies.

## The two files that make it work

**`wrangler.toml`** tells Cloudflare what to publish:

```toml
name = "bqe-frontend"

[assets]
directory = "./_site"
```

Without it, wrangler improvises — it treats the *whole repository* as the
assets directory, sweeps in `.git`, and fails because a pack file is bigger
than the 25 MiB per-asset limit:

```
✘ [ERROR] Asset too large.
  We found a file .git/objects/pack/pack-….pack with a size of 31.9 MiB.
```

If you ever see that, `wrangler.toml` is missing, not being found, or the
build command did not run.

**`build.sh`** produces `_site/`: everything in the repository except the
parts that are furniture rather than site content — `.git`, `.github/`,
`.gitignore`, `docs/`, `README.md`, `wrangler.toml` and itself. It refuses to
publish a tree with no `index.html`. Plain `sh` and `cp`, so it behaves the
same in Cloudflare's build container as on your machine:

```bash
./build.sh && cd _site && python3 -m http.server 8000
```

## One-time setup

In the Cloudflare dashboard: **Workers & Pages** → **Create** →
**Import a repository** (or your existing `bqe-frontend` Worker →
**Settings** → **Build**).

| Field | Value |
|---|---|
| Repository | `SchwarzRene/bqe-frontend` |
| Production branch | `main` |
| Build command | `./build.sh` |
| Deploy command | `npx wrangler deploy` |
| Root directory | *(leave empty)* |

**Save.** The next push deploys, and the site is at
`https://bqe-frontend.<your-subdomain>.workers.dev`.

> The `name` in `wrangler.toml` must match the Worker you are deploying into.
> If the dashboard created a Worker under a different name, either rename it
> or change `name` in `wrangler.toml` — otherwise the deploy creates a second,
> separate Worker.

## Pull request previews

Cloudflare builds non-production branches and pull requests to preview
versions, each with its own URL, and reports them on the pull request.
Preview versions do not touch the production URL.

## What CI does, and what it does not

`.github/workflows/ci.yml` runs on every push and pull request and checks that
every internal link and asset reference resolves, that `index.html` exists,
and that nothing resembling a credential has been committed.

**It does not gate the deploy.** Cloudflare pulls from GitHub independently, so
a red CI run will not stop a deploy. That is the trade for not having an API
token: the deploy path does not pass through GitHub Actions, so GitHub Actions
cannot veto it. The check still runs and its result is visible on the commit.

## Custom domain

Your Worker → **Settings** → **Domains & Routes** → **Add** → **Custom
domain**.

If the domain's DNS is already on Cloudflare this is two clicks and the
certificate is issued automatically.

After the domain is live, two things should be updated:

1. **`ALLOWED_ORIGINS` on the backend**, or the browser will refuse the live
   quote requests from the new origin:

   ```bash
   az containerapp update --name bqe-backend --resource-group bqe-rg \
     --set-env-vars "ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com"
   ```

2. **The `Live:` line in `README.md`**, so the repository does not advertise
   the old address.

## Connecting the site to the backend

The Stack page reads committed snapshots by default and only asks the backend
for fresher bars if you tell it where the backend is.

```bash
cp research/stack/live.example.json research/stack/live.json
# edit live.json, then commit it
```

```json
{ "proxy": "https://bqe-backend.<region>.azurecontainerapps.io/api/quotes" }
```

The page appends `/SYMBOL`, so the URL must end at `/api/quotes` with no
trailing slash. The badge in the page header reads **Live · Yahoo** once the
backend answers.

To turn it off again, delete `research/stack/live.json`. The page falls back to
the committed snapshot — which it also does on its own whenever the backend is
slow, asleep or rate-limited, since every live request has a four-second
deadline.

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

**Live quotes stopped working.** Check in this order: is
`research/stack/live.json` present and pointing at the right URL; does
`curl <backend>/healthz` answer; does the browser console show a CORS error
(then `ALLOWED_ORIGINS` on the backend does not include this origin). A silent
fall-back to snapshot data is the designed behaviour, not a failure.
