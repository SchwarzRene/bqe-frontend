# Development

Checks for the Worker: `npm test` (unit tests; layout and the frozen test clock are explained in [`test/README.md`](../test/README.md)), `npm run typecheck`. CI (`.github/workflows/ci.yml`) also runs the internal-link checker (`python3 .github/check-links.py`) and a dry-run bundle of the Worker.

## Local preview

Serve the repository root — it is the site root, and an absolute path like
`/assets/css/shared.css` only resolves from there:

```bash
python3 -m http.server 8000
# → http://localhost:8000/index.html
```

A plain file server is enough — and it is *required*, because the pages use
absolute paths and `components.js` fetches the header and footer over HTTP.

To run the Worker too — API, D1 and all — against a local database:

```bash
npm install
npx wrangler d1 migrations apply bqe --local
npm run dev                                  # → http://localhost:8787
curl "localhost:8787/__scheduled?cron=*+22-23+*+*+1-5"     # fire the Stack job
curl "localhost:8787/__scheduled?cron=*/15+*+*+*+*"        # fire the Market News tick
curl "localhost:8787/__scheduled?cron=5,20,35,50+*+*+*+*"  # fire the commodity prices tick
```

For the Market News briefing and chat locally, put `GEMINI_API_KEY=...` in `.dev.vars` (git-ignored, and never copied into `_site/` by `build.sh`).

## Deploying

Push to `main`. Cloudflare builds, deploys the Worker and applies any new D1
migrations. The only secrets are the Gemini key and the admin token, both
stored on the Worker, never in git.

Full setup — the Cloudflare project, the two API secrets, the custom domain —
is in **[DEPLOYMENT.md](DEPLOYMENT.md)**.
