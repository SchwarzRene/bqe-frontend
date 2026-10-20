<div align="center">
  <img src="assets/images/logo.png" alt="Black Quant Empire Logo" width="120" height="120">

# bqe-frontend

Website and research pages of **Black Quant Empire** — quantitative trading on Gold and
NASDAQ futures.

**Live:** https://bqe-frontend.pages.dev

</div>

---

A static site plus one Cloudflare Worker (API, scheduled data jobs, D1 database). The company
itself is described on the site (`index.html`, `pages/about.html`, `pages/strategy.html`); this
repository's documentation is about the code.

## Quick start

```bash
python3 -m http.server 8000      # the site only → http://localhost:8000/
```

The repository root is the site root, so serve from it — `file://` shows pages unstyled. To run the
Worker, D1 and cron jobs as well:

```bash
npm install
npx wrangler d1 migrations apply bqe --local
npm run dev                      # → http://localhost:8787
npm test && npm run typecheck    # the checks CI runs
```

Push to `main` and Cloudflare builds and deploys. Details in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Where things are

| Folder | Contents |
|---|---|
| `index.html`, `pages/`, `components/` | The start page, every other page, and the shared header and footer |
| `assets/` | `css/shared.css` and one stylesheet per page, `js/` site scripts, images, vendored libraries |
| `research/` | One folder per project: write-ups and apps (Market News, Stack, Trading Journal, History Map, Backtest Lab) |
| `worker/`, `migrations/`, `test/` | The Cloudflare Worker, its D1 schema, its tests |
| `docs/` | All documentation — start at [docs/README.md](docs/README.md) |
| `build.sh`, `_headers`, `wrangler.toml` | What gets published, how it is cached and secured, how the Worker is configured |

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** — how the site is served, the full folder layout
- **[Site guide](docs/SITE-GUIDE.md)** — page skeleton, conventions, adding pages and research projects
- **[Worker](docs/WORKER.md)** — API routes, accounts and admin terminal, scheduled jobs
- **[Development](docs/DEVELOPMENT.md)** and **[Deployment](docs/DEPLOYMENT.md)** — local setup, Cloudflare setup
- Each research project has its own README next to its code.
