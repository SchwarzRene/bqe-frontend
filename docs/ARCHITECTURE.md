# Architecture

How the site is served, and what that means for the files in this repository.

## How it is served

The site is a Cloudflare Worker serving static assets, connected directly to
this repository. Push to `main` and Cloudflare pulls, runs `./build.sh`, and
deploys `_site/` together with the Worker in `worker/` — live usually inside
a minute. Static files are served straight from the CDN; the Worker only runs
for `/api/*`, for the price and rundown data, and on its cron schedule. There
is no other server: this replaced `bqe-backend` (Azure Container Apps plus
GitHub Actions jobs).

```
visitor ─▶ Cloudflare ─┬─ static file ─────────────▶ _site/ (CDN)
                       ├─ /api/quotes/:symbol ──────▶ Worker ─▶ Yahoo (cached 60 s)
                       ├─ /api/contact ─────────────▶ Worker ─▶ D1
                       ├─ /api/auth/*, /api/state/* ─▶ Worker ─▶ D1 (accounts, saved work)
                       ├─ /api/market/* ────────────▶ Worker ─▶ Yahoo (Trading Journal)
                       ├─ /api/commodities/prices ──▶ Worker ─▶ D1 (filled by cron from Yahoo/Dukascopy)
                       └─ /research/*/data/*.json ──▶ Worker ─▶ D1, else the committed file
cron ──────────────────────────────────────────────▶ Worker ─▶ Yahoo · Wikipedia · Gemini ─▶ D1
```

There is no API token and no GitHub secret anywhere in this setup. Cloudflare
watches the repository through its GitHub App, so there is no credential to
store, leak or renew.

Pull requests and branches are built too, each to a preview URL of its own,
which Cloudflare posts as a check on the pull request. A change can therefore
be looked at on a real CDN before it reaches the production domain.

Consequences worth remembering:

- The **repository root is the site root**. Every path in the HTML is absolute
  against it — `/assets/css/shared.css` is `assets/css/shared.css` on disk — so a
  local preview must be served from the root (see [DEVELOPMENT.md](DEVELOPMENT.md#local-preview)),
  and opening a page as a `file://` URL shows it unstyled.
- Only the site reaches the CDN. `build.sh` copies an allowlist — `index.html`,
  `_headers`, `assets/`, `components/`, `pages/`, `research/` — and refuses to
  publish any hidden file, so the Worker's source, the docs and a local
  `.dev.vars` with your secrets never do. A new top-level folder is published
  only once it is added to `SITE` in `build.sh`.
- No third-party script runs on the site: the two libraries the apps use
  (Leaflet, Lightweight Charts) are vendored in `assets/vendor/`, and
  `_headers` sets a Content-Security-Policy that allows scripts from this
  site only (plus Cloudflare Turnstile). No inline `<script>` or `onclick=`:
  put code in a `.js` file.
- All server-side code is in `worker/` (see [WORKER.md](WORKER.md)). Its
  data lives in a Cloudflare D1 database called `bqe`.
- `_headers` at the root sets the security and caching headers Cloudflare
  applies to static files. Responses the Worker builds itself get the same
  security headers from `worker/http.ts`, since `_headers` does not reach them.

## Repository layout

The repository root **is** the site root, but only the folders `build.sh` lists are served.

```
├── README.md               Entry point (not published)
├── index.html              Start page (market-network hero, formula-network band)
├── _headers                Security and caching headers Cloudflare applies to static files
├── graph390b.png           Research-graph image, published at the root; nothing in the repo links to it
├── build.sh                Assembles _site/ — what Cloudflare publishes (an allowlist)
│
├── pages/                  Every other top-level page (about, strategy, careers, contact,
│                           accessibility, disclaimer, impressum, privacy, license, credits, admin)
├── components/             HTML fragments injected at runtime: header.html, footer.html
├── assets/
│   ├── css/shared.css      Design tokens + every shared component
│   ├── css/pages/*.css     One stylesheet per page, loaded after shared.css
│   ├── js/                 Site scripts: components, navigation, session, form, admin,
│   │                       and the canvas animations (hero-network, formula-network, research-hero)
│   ├── images/             Page imagery, .webp plus a .jpg/.png fallback
│   ├── captions/en.vtt     Captions for assets/video.mp4 (the video itself is currently unused)
│   └── vendor/             Vendored third-party libraries (own README)
│
├── research/               One folder per project, plus the index over them
│   ├── index.html          Research index (a card per project)
│   ├── RESEARCH_PAPER_STYLE_GUIDE.md
│   ├── bqe-decomp/         Write-up: binary encoding for 1-minute OHLCV data
│   ├── marketjepa/         Write-up: self-supervised world model
│   ├── chain-checker/      Write-up: LLM chain test bench
│   ├── markettape.html     Write-up for Market News
│   ├── markettape/         The Market News app            (own README)
│   ├── stack/              S&P 500 chart feed             (own README; scripts in js/)
│   ├── tradingjournal/     Trade log and chart markup     (own README)
│   ├── historymap/         Interactive history atlas      (own README)
│   └── backtest-lab/       mt5bt backtester as WebAssembly (own README)
│
├── worker/                 The Worker: API, data serving, scheduled jobs (see WORKER.md)
│   ├── index.ts            Router and cron dispatch
│   ├── auth.ts admin.ts state.ts profile.ts contact.ts   Accounts, admin terminal, saved work
│   ├── stack.ts screen.ts market.ts yahoo.ts              S&P 500 prices, screener, Yahoo access
│   ├── news/               Market News: feeds, ranking, briefing, calendar, chat, analyst
│   └── prices/             Commodity prices (Yahoo / Dukascopy), indicators, archive
├── migrations/             D1 schema, applied by wrangler
├── test/                   Worker and Backtest Lab tests (vitest)
├── scripts/set-password.mjs  Sets an account's password without committing it
├── wrangler.toml           Worker config: assets, D1 binding, cron schedule, variables
├── package.json            Tooling (wrangler, typescript, vitest)
│
├── docs/                   Everything written about the project (see docs/README.md)
└── .github/                CI workflow and the internal-link checker
```

**Why the research projects are all folders.** The research index lists every project as an
equal card — write-ups and tools alike — and the layout on disk says what the site already says.

Everything under `research/` is published, including its Markdown files. They contain nothing
secret, but do not put anything there that should stay private.

## Large files, on purpose

A few files are long and deliberately not split:

| File | Why it stays whole |
|---|---|
| `research/backtest-lab/{app,charts,optimizer}.js`, `style.css`, `schema.json` | Copied unmodified from the engine repo and overwritten by its `wasm/build.sh`; edits here would be lost. |
| `research/bqe-decomp/index.html`, `marketjepa/index.html`, `chain-checker/index.html`, `markettape.html` | Write-ups are self-contained documents with their own `<style>` block ([style guide](../research/RESEARCH_PAPER_STYLE_GUIDE.md)). |
| `assets/css/shared.css` | One cached stylesheet for every page, organised in numbered sections; there is no CSS build step to stitch parts together. |
| `pages/license.html`, `pages/privacy.html` | Legal text. |
| `research/historymap/data/*.geojson`, `research/stack/data/*.json` | Data, not code. |

Scripts that *are* split follow the same pattern: classic scripts, one global scope, load order
set by the `<script>` tags in the page (no bundler, and the CSP forbids inline script). See
`research/stack/js/`, `research/markettape/js/`, `research/tradingjournal/js/`.
