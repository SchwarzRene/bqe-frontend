# Deployment

The site is served by **Cloudflare Pages**. Push to `main` and it is live,
usually inside a minute. Pull requests get their own preview URL.

```
push to main ──▶ GitHub Actions ──▶ assemble _site/ ──▶ wrangler pages deploy ──▶ live
pull request ──▶ GitHub Actions ──▶ assemble _site/ ──▶ preview URL on the PR
```

## One-time setup

### 1. Create the Pages project

The project has to exist before a workflow can deploy into it.

In the Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
**Create using direct upload**, name it exactly **`bqe-frontend`**, and create
it. Upload nothing; the first workflow run fills it.

> Use **direct upload**, not "Connect to Git". Connecting the repository would
> give you a second deploy path that runs alongside this one, and the two would
> race on every push. One or the other, and the workflow is the one with the
> preview comments and the publish-directory filtering.

If you prefer a name other than `bqe-frontend`, change `PROJECT_NAME` at the top
of `.github/workflows/deploy.yml` to match.

### 2. Create the API token

Cloudflare dashboard → **My Profile** → **API Tokens** → **Create Token** →
**Custom token**:

| Field | Value |
|---|---|
| Permissions | Account → **Cloudflare Pages** → **Edit** |
| Account Resources | Include → your account |
| TTL | leave as is, or set an expiry and diary a rotation |

That single permission is all the deploy needs. Do not use a Global API Key —
it can do everything to everything you own, and cannot be scoped or revoked
individually.

Copy the token now; Cloudflare shows it once.

### 3. Find the account ID

Cloudflare dashboard → **Workers & Pages** → the right-hand sidebar shows
**Account ID**. Or from the URL: `dash.cloudflare.com/<account-id>/...`.

### 4. Put both in GitHub

**bqe-frontend → Settings → Secrets and variables → Actions → New repository
secret**:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | the ID from step 3 |

Both are secrets. Neither belongs in a file in this repository — see
[bqe-backend/docs/SECRETS.md](https://github.com/SchwarzRene/bqe-backend/blob/main/docs/SECRETS.md)
for why, and for how the rest of the keys are handled.

### 5. Push

```bash
git push origin main
```

Watch it in the **Actions** tab. When it finishes the site is at
`https://bqe-frontend.pages.dev`.

## Custom domain

Cloudflare dashboard → your Pages project → **Custom domains** → **Set up a
domain**.

If the domain's DNS is already on Cloudflare, this is two clicks and the
certificate is issued automatically. If it is elsewhere, Cloudflare tells you
the CNAME to add at your registrar.

After the domain is live, two things should be updated:

1. **`ALLOWED_ORIGINS` on the backend**, or the browser will refuse the live
   quote requests from the new origin:

   ```bash
   az containerapp update --name bqe-backend --resource-group bqe-rg \
     --set-env-vars "ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com"
   ```

2. **The `Live:` line in `README.md`**, so the repository does not advertise the
   old address.

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

The workflow assembles `_site/` with `rsync`, excluding `.git`, `.github`,
`docs/`, `README.md` and `CNAME`. Everything else in the repository is served,
including the ~46 MB of price snapshots under `research/stack/data/`.

Cloudflare Pages limits worth knowing: **20,000 files** and **25 MB per file**
per deployment. The site is currently around 660 files with nothing near 5 MB,
so there is a lot of headroom — but the stack data is 500 of those files, so
keep it in mind if you add another per-ticker dataset.

## Rolling back

Cloudflare dashboard → the Pages project → **Deployments** → find the last good
one → **Rollback**. It is immediate and needs no git operation.

Then fix the problem properly on `main`, because the next push deploys again.

## Troubleshooting

**The workflow fails with `project not found`.** The Pages project does not
exist yet, or its name does not match `PROJECT_NAME` in the workflow. Step 1.

**The workflow fails with `Authentication error`.** The token is missing, wrong,
expired, or lacks *Cloudflare Pages: Edit*. Re-create it and update the secret.

**The site deploys but pages are unstyled.** Something broke the absolute paths.
Every page references `/assets/...` from the site root; check that the file is
actually at that path in `_site/` and not nested a level deeper.

**Live quotes stopped working.** Check in this order: is `research/stack/live.json`
present and pointing at the right URL; does `curl <backend>/healthz` answer;
does the browser console show a CORS error (then `ALLOWED_ORIGINS` on the
backend does not include this origin). A silent fall-back to snapshot data is
the designed behaviour, not a failure.
