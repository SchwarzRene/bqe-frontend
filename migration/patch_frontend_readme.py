#!/usr/bin/env python3
"""Rewrite the sections of the old README that the repository split made wrong.

The old README documents conventions worth keeping — how a page is put
together, how to add an image, how the research index works. None of that
changed. What changed is where the site is served from, where the automation
lives, and what a local preview looks like, so only those sections are
replaced. Everything else is carried over with its `webpage/` path prefixes
dropped, since that folder is now the repository root.

Usage: patch_frontend_readme.py <path to the frontend README.md>
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SERVED = """## How it is served

Cloudflare Pages publishes the repository root. There is no build step — what is
committed is what is served. Push to `main` and `.github/workflows/deploy.yml`
assembles a publish directory, hands it to Cloudflare, and the site is live,
usually inside a minute.

Pull requests are deployed too, to a preview URL of their own, and the workflow
comments that URL on the pull request. A change can therefore be looked at on a
real CDN before it reaches the production domain.

Consequences worth remembering:

- The **repository root is the site root**. Every path in the HTML is absolute
  against it — `/assets/css/shared.css` is `assets/css/shared.css` on disk — so a
  local preview must be served from the root (see [Local preview](#local-preview)),
  and opening a page as a `file://` URL shows it unstyled.
- Repository furniture never reaches the CDN. The deploy workflow excludes
  `.git`, `.github`, `docs/` and `README.md` when it assembles the publish
  directory, so adding documentation here cannot bloat the site.
- There is no server-side code in this repository. Anything needing a backend
  either runs ahead of time and is committed as JSON (see
  [Data and automation](#data-and-automation)), or lives in
  [`bqe-backend`](https://github.com/SchwarzRene/bqe-backend).
- `_headers` at the root sets the security and caching headers Cloudflare
  applies. Edit it there, not in the workflow."""

DATA = """## Data and automation

The scheduled jobs that produce this data live in
**[`bqe-backend`](https://github.com/SchwarzRene/bqe-backend)**, not here.

| Workflow (in bqe-backend) | Schedule (UTC) | Commits into this repository |
|---|---|---|
| `market-data.yml` | 22:20, Mon–Fri | `research/stack/data/*.json` |
| `market-tape.yml` | 12:10 and 22:10, Mon–Fri | `research/markettape/data/*.json` |

They check this repository out, write the refreshed JSON, and push. That push
triggers the deploy workflow here like any other, so new data reaches the site
by the normal route.

The data is committed rather than served from an API on purpose: it is 46 MB of
static JSON that changes once a day, which is exactly what a CDN is good at and
exactly what a scale-to-zero container is bad at.

Both jobs can be started by hand from the **Actions** tab of `bqe-backend`."""

PREVIEW = """## Local preview

Serve the repository root — it is the site root, and an absolute path like
`/assets/css/shared.css` only resolves from there:

```bash
python3 -m http.server 8000
# → http://localhost:8000/index.html
```

A plain file server is enough — and it is *required*, because the pages use
absolute paths and `components.js` fetches the header and footer over HTTP.

To preview exactly what Cloudflare will serve, including `_headers`:

```bash
npx wrangler pages dev .
```

The Python fetchers are not in this repository any more; see
[`bqe-backend`](https://github.com/SchwarzRene/bqe-backend)."""

DEPLOYING = """## Deploying

Push to `main`. There is nothing to build and nothing to release.

Full setup — the Cloudflare project, the two API secrets, the custom domain —
is in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**."""

LAYOUT = """## Repository layout

The repository root **is** the site root: everything here is served, except the
four things the deploy workflow excludes (`.git`, `.github`, `docs/`, `README.md`).

```
├── README.md               This file (not published)
├── _headers                Security and caching headers Cloudflare applies
├── docs/
│   └── DEPLOYMENT.md       Cloudflare setup, secrets, custom domain
├── .github/workflows/
│   └── deploy.yml          Push to main → Cloudflare; pull request → preview URL
│
├── index.html              Start page (market-network hero, formula-network band)
│
├── pages/                  Every other top-level page
│   ├── about.html          Über uns — brand and trademark documentation
│   ├── strategy.html       Trading strategy
│   ├── careers.html        Open roles
│   ├── contact.html        Contact form
│   ├── accessibility.html  WCAG / WZG accessibility statement
│   ├── disclaimer.html     Risk disclaimer
│   ├── impressum.html      Austrian Impressum
│   ├── privacy.html        Privacy policy
│   ├── license.html        Licences of third-party material
│   └── credits.html        Media sources
│
├── components/             HTML fragments injected at runtime
│   ├── header.html         Logo, login button, primary navigation
│   └── footer.html         Footer links, legal links, year
│
├── assets/
│   ├── css/
│   │   ├── shared.css      Design tokens + every shared component
│   │   └── pages/*.css     One stylesheet per page, loaded after shared.css
│   ├── js/
│   │   ├── components.js   Injects header/footer, sets aria-current, fills the year
│   │   ├── navigation.js   Burger menu + its nav wave + login modal
│   │   ├── hero-network.js Start page hero animation (canvas)
│   │   ├── formula-network.js Start page formula band animation (canvas)
│   │   ├── research-hero.js  Research intro band animation (canvas)
│   │   ├── research-graph.js Research project graph, list view and search
│   │   └── form.js         Contact form validation (WCAG error handling)
│   ├── images/             Page imagery, each as .webp + .jpg/.png fallback
│   ├── captions/de.vtt     Captions for assets/video.mp4
│   └── video.mp4           Unused since the "Was wir tun" section was replaced
│
└── research/               One folder per project, plus the index over them
    ├── index.html          Research index (project graph / list)
    ├── RESEARCH_PAPER_STYLE_GUIDE.md  How a write-up is styled
    ├── bqe-decomp/         Binary encoding for 1-minute OHLCV data
    │   ├── index.html
    │   └── utils/*.png     Its figures
    ├── marketjepa/         Self-supervised world model
    │   └── index.html
    ├── markettape.html     Write-up for the Market Tape app
    ├── markettape/         The Market Tape app itself (own README)
    ├── historymap/         Interactive history atlas (own README)
    └── stack/              S&P 500 chart feed (own README)
        ├── index.html
        ├── live.example.json  Template for pointing the page at bqe-backend
        └── data/*.json     One file per ticker, refreshed from bqe-backend
```

The fetchers, their dependencies and the live-quotes service are **not** here any
more — they live in
[`bqe-backend`](https://github.com/SchwarzRene/bqe-backend).

**Why the research projects are all folders.** `assets/js/research-graph.js`
lists BQE-DeComp, MarketJEPA, HistoryMap, Market Tape and Stack as five equal
projects — the graph, the list and the search treat them the same way, and the
layout on disk says what the site already said."""


LIVE_DATA = """### A page that needs live data

Cloudflare Pages serves files; it runs no code. So there are two routes, and
which one you want depends on how fresh the data has to be.

**Refreshed daily, committed as JSON** — the pattern `research/stack/` uses:

1. Write a fetcher in `bqe-backend`'s `automation/scripts/` that produces compact JSON.
2. Add its dependencies to `bqe-backend`'s `requirements-automation.txt`.
3. Add a workflow there that runs it on a schedule and commits the result into
   this repository (copy `market-data.yml`; it already checks this repository
   out and handles a branch that moved underneath it).
4. Have the page `fetch()` the committed JSON, with a fallback for the window
   before the first run.

**Fresh on load** — add an endpoint to the `bqe-backend` API and call it from
the page, as `research/stack/` does for live quotes. This is the only route for
anything intraday: browsers cannot call Yahoo directly, because those endpoints
send no CORS headers. Give every such request a short deadline and a fall-back
to committed data, so a slow or sleeping backend degrades to yesterday's close
rather than an error.

"""


REPLACEMENTS = {
    "How it is served": SERVED,
    "Repository layout": LAYOUT,
    "Data and automation": DATA,
    "Local preview": PREVIEW,
    "Deploying": DEPLOYING,
}


def split_sections(text: str) -> list[str]:
    """Split on level-2 headings, keeping each heading with its body."""
    parts = re.split(r"(?m)^(?=## )", text)
    return parts


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")

    sections = split_sections(text)
    out: list[str] = []
    replaced: set[str] = set()

    for section in sections:
        heading = section[3:].split("\n", 1)[0].strip() if section.startswith("## ") else None
        if heading in REPLACEMENTS:
            out.append(REPLACEMENTS[heading] + "\n\n")
            replaced.add(heading)
        else:
            out.append(section)

    missing = set(REPLACEMENTS) - replaced
    if missing:
        print(f"warning: sections not found, left unchanged: {sorted(missing)}", file=sys.stderr)

    text = "".join(out)

    # A level-3 subsection, so the ## splitter above does not reach it.
    text, count = re.subn(
        r"### A page that needs live data\n.*?(?=\n## |\n### )",
        LIVE_DATA.replace("\\", "\\\\"),
        text,
        flags=re.S,
    )
    if count != 1:
        print(f"warning: 'A page that needs live data' matched {count} times", file=sys.stderr)

    # webpage/ is the repository root now, so the prefix is simply gone.
    text = text.replace("webpage/", "")

    # Identity and links.
    text = text.replace("# schwarzrene.github.io\n", "# bqe-frontend\n")
    text = text.replace(
        "**Live:** https://schwarzrene.github.io",
        "**Live:** https://bqe-frontend.pages.dev",
    )
    text = text.replace(
        "This file documents the *repository*:",
        "This file documents the *frontend repository*:",
    )

    # The Worker is gone; its job is an endpoint on the backend now.
    text = text.replace(
        "deploy the Worker in `automation/worker/` and point `live.json` beside this\nfile at it — see `automation/worker/README.md`.",
        "point `live.json` beside this file at the deployed `bqe-backend`\n(`https://<app>.azurecontainerapps.io/api/quotes`) — see that repository's README.",
    )
    text = re.sub(
        r"automation/worker/[A-Za-z.]*",
        "the bqe-backend service",
        text,
    )
    text = text.replace("the Cloudflare Worker", "the backend service")
    text = text.replace("the Worker", "the backend")

    path.write_text(text, encoding="utf-8")
    print(f"patched {path} ({len(replaced)} sections rewritten)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
