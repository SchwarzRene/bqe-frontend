# Deployment

The site is served by **Cloudflare Pages**, connected directly to this
repository. Push to `main` and it is live, usually inside a minute.

```
push to main ──▶ Cloudflare pulls ──▶ ./build.sh ──▶ _site/ ──▶ live
open a PR    ──▶ Cloudflare pulls ──▶ ./build.sh ──▶ _site/ ──▶ preview URL
```

There is **no API token and no GitHub secret** in this setup. Cloudflare
watches the repository through its GitHub App, so nothing here holds a
credential and nothing expires.

## One-time setup

All of it is in the Cloudflare dashboard; it takes about two minutes.

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorise Cloudflare's GitHub App, and give it access to
   **`SchwarzRene/bqe-frontend`**. Read-only access to this one repository is
   enough.
3. Select the repository, then set:

   | Field | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | **None** |
   | Build command | `./build.sh` |
   | Build output directory | `_site` |
   | Root directory | *(leave empty)* |

4. **Save and Deploy.**

The first build runs immediately. When it finishes the site is at
`https://bqe-frontend.pages.dev`.

That is the whole setup. Every later push deploys by itself.

### Why there is a build step for a site with no build

`build.sh` copies the repository into `_site/`, leaving out the things that
are repository furniture rather than site content: `.github/`, `docs/`,
`README.md` and the script itself. Publishing the root directly would work,
but it would also serve the workflow files and the documentation, which
nobody visiting the site wants and which quietly advertises how the
repository is laid out.

It is plain `sh` and `cp` — no rsync, no bash-isms — so it behaves identically
in Cloudflare's build container and on your machine:

```bash
./build.sh && cd _site && python3 -m http.server 8000
```

## Pull request previews

Cloudflare builds every branch and every pull request, each to its own URL,
and posts that URL as a check on the pull request. Nothing needs configuring
— it comes with the Git connection.

Preview builds do not touch the production domain.

## What CI does, and what it does not

`.github/workflows/ci.yml` runs on every push and pull request and checks that
every internal link and asset reference resolves, that `index.html` exists,
and that nothing resembling a credential has been committed.

**It does not gate the deploy.** Cloudflare pulls from GitHub independently, so
a red CI run will not stop a deploy. That is the trade for not having an API
token: the deploy path does not pass through GitHub Actions, so GitHub Actions
cannot veto it.

In practice the check is fast and the failure is visible on the commit. If you
ever want a hard gate instead, the deploy has to move back into a workflow,
which means an API token again.

## Custom domain

Cloudflare dashboard → your Pages project → **Custom domains** → **Set up a
domain**.

If the domain's DNS is already on Cloudflare this is two clicks and the
certificate is issued automatically. If it is elsewhere, Cloudflare tells you
the CNAME to add at your registrar.

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

## What gets published

Everything except `.git`, `.github/`, `.gitignore`, `docs/`, `build.sh`,
`README.md` and `CNAME` — currently about 660 files and 117 MB, most of it the
price snapshots under `research/stack/data/`.

Cloudflare Pages limits worth knowing: **20,000 files** and **25 MB per file**
per deployment. Nothing here is near 5 MB, so there is plenty of headroom —
but the stack data is 500 of those files, so keep it in mind if you add
another per-ticker dataset.

## Rolling back

Cloudflare dashboard → the Pages project → **Deployments** → find the last good
one → **Rollback**. Immediate, and no git operation needed.

Then fix the problem properly on `main`, because the next push deploys again.

## Troubleshooting

**A push did not deploy.** Check the Cloudflare project's **Deployments** tab
first — if no build was even queued, the GitHub App has lost access to the
repository. Re-authorise it under GitHub → Settings → Applications.

**The build fails with `build.sh: not found` or a permission error.** The
script's executable bit did not survive. `git update-index --chmod=+x build.sh`
and push.

**The site deploys but pages are unstyled.** Something broke the absolute
paths. Every page references `/assets/...` from the site root; check the file
is really at that path inside `_site/` after running `./build.sh` locally.

**Live quotes stopped working.** Check in this order: is
`research/stack/live.json` present and pointing at the right URL; does
`curl <backend>/healthz` answer; does the browser console show a CORS error
(then `ALLOWED_ORIGINS` on the backend does not include this origin). A silent
fall-back to snapshot data is the designed behaviour, not a failure.
