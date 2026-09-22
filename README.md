<div align="center">
  <img src="webpage/assets/images/logo.png" alt="Black Quant Empire Logo" width="120" height="120">

# schwarzrene.github.io

Website and research pages of **Black Quant Empire** — quantitative trading on Gold and
NASDAQ futures.

**Live:** https://schwarzrene.github.io

</div>

---

This file documents the *repository*: how it is laid out, the conventions each page
follows, and what to do when you add something. The company itself is described on the
site (`webpage/index.html`, `webpage/pages/about.html`, `webpage/pages/strategy.html`).

## How it is served

GitHub Pages publishes **`webpage/`**, and nothing else in the repository reaches the
web. There is still no build step — what is committed is what is served — but the
publishing runs as a workflow (`.github/workflows/deploy.yml`), because the "deploy
from a branch" source can only ever publish the repository root or a folder named
`docs/`. Push to `main` with anything under `webpage/` changed and the site redeploys
in a minute or two.

This needs **Settings → Pages → Build and deployment → Source** set to *GitHub
Actions*. With the branch source selected instead, nothing the workflow uploads is ever
served.

Consequences worth remembering:

- `webpage/` **is** the site root. Every path in the HTML is absolute against it —
  `/assets/css/shared.css` is `webpage/assets/css/shared.css` on disk — so a local
  preview has to be served from inside that folder (see
  [Local preview](#local-preview)), and opening a page as a `file://` URL shows it
  unstyled.
- Everything the site never serves stays outside `webpage/`: the Python fetchers, their
  requirements and the Cloudflare Worker are all under `automation/`.
- There is no server-side code. Anything that needs a backend either runs ahead of time
  in GitHub Actions and is committed as JSON (see [Data and automation](#data-and-automation)),
  or lives in the Cloudflare Worker under `automation/worker/`.
- A push made by a workflow deliberately does not trigger another workflow, so the two
  data jobs cannot set off the deploy by committing. `deploy.yml` therefore also runs
  when either of them finishes — that is what puts refreshed JSON on the live site.

## Repository layout

```
├── README.md
├── .github/workflows/
│   ├── deploy.yml          Publishes webpage/ to Pages
│   ├── market-data.yml     Weekdays 22:20 UTC → Stack data
│   └── market-tape.yml     Weekdays 12:10 and 22:10 UTC → Market Tape data
│
├── webpage/                Everything Pages publishes — and nothing else
│   ├── index.html          Start page (market-network hero, formula-network band)
│   │
│   ├── pages/              Every other top-level page
│   │   ├── about.html          Über uns — brand and trademark documentation
│   │   ├── strategy.html       Trading strategy
│   │   ├── careers.html        Open roles
│   │   ├── contact.html        Contact form
│   │   ├── accessibility.html  WCAG / WZG accessibility statement
│   │   ├── disclaimer.html     Risk disclaimer
│   │   ├── impressum.html      Austrian Impressum
│   │   ├── privacy.html        Privacy policy
│   │   ├── license.html        Licences of third-party material
│   │   └── credits.html        Media sources
│   │
│   ├── components/         HTML fragments injected at runtime
│   │   ├── header.html     Logo, login button, primary navigation
│   │   └── footer.html     Footer links, legal links, year
│   │
│   ├── assets/
│   │   ├── css/
│   │   │   ├── shared.css  Design tokens + every shared component
│   │   │   └── pages/*.css One stylesheet per page, loaded after shared.css
│   │   ├── js/
│   │   │   ├── components.js   Injects header/footer, sets aria-current, fills the year
│   │   │   ├── navigation.js   Burger menu + its nav wave + login modal
│   │   │   ├── hero-network.js Start page hero animation (canvas)
│   │   │   ├── formula-network.js Start page formula band animation (canvas)
│   │   │   ├── research-hero.js  Research intro band animation (canvas)
│   │   │   ├── research-graph.js Research project graph, list view and search
│   │   │   └── form.js         Contact form validation (WCAG error handling)
│   │   ├── images/         Page imagery, each as .webp + .jpg/.png fallback
│   │   ├── captions/de.vtt Captions for assets/video.mp4
│   │   └── video.mp4       Unused since the "Was wir tun" section was replaced
│   │
│   └── research/           One folder per project, plus the index over them
│       ├── index.html      Research index (project graph / list)
│       ├── RESEARCH_PAPER_STYLE_GUIDE.md  How a write-up is styled
│       ├── bqe-decomp/     Binary encoding for 1-minute OHLCV data
│       │   ├── index.html
│       │   └── utils/*.png Its figures
│       ├── marketjepa/     Self-supervised world model
│       │   └── index.html
│       ├── markettape.html Write-up for the Market Tape app
│       ├── markettape/     The Market Tape app itself (own README)
│       ├── historymap/     Interactive history atlas (own README)
│       └── stack/          S&P 500 chart feed (own README)
│           ├── index.html
│           └── data/*.json One file per ticker, refreshed by Actions
│
└── automation/             Everything Pages never sees
    ├── requirements.txt    Python dependencies for the fetchers
    ├── scripts/
    │   ├── fetch_market_data.py
    │   └── fetch_market_tape.py
    └── worker/             Cloudflare Worker: CORS proxy for live Yahoo quotes
```

**Why the research projects are all folders.** `webpage/assets/js/research-graph.js`
lists BQE-DeComp, MarketJEPA, HistoryMap, Market Tape and Stack as five equal projects —
the graph, the list and the search treat them the same way. Stack living at the
repository root and MarketJEPA being a single loose file were the only two things that
disagreed with that; now the layout on disk says what the site already said.

## How a page is put together

Every page under `webpage/pages/` follows the same skeleton. The header and footer are **not** in the
HTML — `components.js` fetches them and replaces the placeholder divs, so a navigation
change is made once in `webpage/components/header.html` and applies everywhere.

The header carries three links — Startseite, Research, Kontakt. Über uns, Karriere and
Handelsstrategie are all reachable from the footer, which is where the pages a visitor
looks up rather than navigates to belong. Below 768px those three links become the
burger menu, and `initNavWave()` in `navigation.js` threads a slim signal trace down
its left gutter: the path is built from the links' **measured** positions, never from
guessed coordinates, so it keeps fitting whatever the menu holds, and the node on the
current page is gold rather than blue.

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="…" />
    <title>Seitenname - Black Quant Empire</title>

    <link rel="stylesheet" href="/assets/css/shared.css" />
    <link rel="stylesheet" href="/assets/css/pages/seitenname.css" />
    <link rel="icon" href="/assets/images/logo.png" type="image/png" />
  </head>

  <body>
    <a href="#main-content" class="skip-link">Zum Hauptinhalt springen</a>
    <div id="header-placeholder"></div>

    <main id="main-content">
      <section class="hero seitenname-hero">
        <div class="container text-center">
          <h1>Seitenname</h1>
          <p class="lead">Ein Satz, der die Seite einordnet.</p>
        </div>
      </section>

      <!-- content sections -->

      <nav class="page-navigation" aria-label="Seitennavigation">
        <a href="/pages/vorherige.html" class="btn btn-secondary btn-prev">← Vorherige</a>
        <a href="/pages/naechste.html" class="btn btn-secondary btn-next">Nächste →</a>
      </nav>
    </main>

    <div id="footer-placeholder"></div>
    <script src="/assets/js/components.js"></script>
    <script src="/assets/js/navigation.js"></script>
    <!-- cookie banner markup -->
  </body>
</html>
```

### Conventions these pages keep to

| Area | Rule |
|---|---|
| Language | Content is German, `lang="de"`. Code comments and these docs are English. |
| Headings | Exactly one `<h1>` per page, in the hero. Sections use `<h2>`, subsections `<h3>` — never skip a level. |
| Title | `Seitenname - Black Quant Empire` |
| Styling | Colours, spacing, type sizes come from the `:root` tokens in `shared.css`. Use `var(--space-4)`, not `16px`. |
| Overlays | A translucent overlay or glow uses the channel triplets — `rgba(var(--rgb-gold), 0.2)`, `--rgb-navy`, `--rgb-black` — so it follows the palette instead of pinning the colour it was written against. `rgba(0,0,0,…)` shadows are fine as they are. |
| Page CSS | One file per page in `webpage/assets/css/pages/`, loaded *after* `shared.css`; page-specific rules live there, not in a `<style>` block. |
| Accessibility | Skip link, `aria-label` on every `<nav>`, alt text on every image, visible focus. The site publishes an accessibility statement — keep it honest. |
| Images | Ship `.webp` plus a `.jpg`/`.png` fallback of the same name, and set `loading="lazy" decoding="async"` below the fold. |

## Adding to the site

### A new page

1. Copy the skeleton above into `webpage/pages/neueseite.html`.
2. Create `webpage/assets/css/pages/neueseite.css` and link it. Even if it starts empty, the
   page then has a home for its own rules.
3. Add it to the navigation in `webpage/components/header.html` — and, if it belongs there, to
   `webpage/components/footer.html`. Both are shared, so this is the only place to edit.
4. Wire the `page-navigation` prev/next links on the neighbouring pages so the chain
   stays intact.
5. Copy the cookie banner markup from an existing page.
6. Check it at 1440px, 768px and 390px before pushing.

### A section on an existing page

Add a `<section>` inside `<main>`, wrap the content in `<div class="container">`, and
start it with an `<h2>`. `shared.css` handles the vertical rhythm, the divider and the
alternating background.

> **Careful with `<article>` pages.** `shared.css` makes `article section` full-bleed
> (`width: 100vw` with a negative margin) so long documents like `pages/privacy.html` can span
> the viewport. If your article sits inside a narrower column, you must neutralise that
> — `about.css` shows how (`.about-text-side section { width: 100%; margin-left: 0; }`).

### An image or a video

- Images go in `webpage/assets/images/` as a `.webp` plus a `.jpg`/`.png` fallback.
- Video is committed to the repository, so encode before adding — a phone should not
  download a 1080p master:

  ```bash
  ffmpeg -i source.mp4 -an -vf "scale=1280:720:flags=lanczos" \
    -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart \
    assets/beispiel.mp4
  ```

  `-an` drops the audio (a background video must be silent anyway — browsers only
  autoplay muted video) and `+faststart` moves the index to the front so playback can
  begin before the file finishes downloading. Keep the source frame rate: resampling
  30 fps to 25 duplicates frames unevenly and judders. Also export a poster frame to
  `webpage/assets/images/` for the loading state and for `prefers-reduced-motion`.
- **When you replace a media file or a stylesheet in place, bump its version query**
  (`video.mp4?v=2`, `home.css?v=3`). Browsers and the Pages CDN cache these aggressively;
  without a new URL, phones keep serving the old file.

### The start page hero

The hero is a canvas animation (`webpage/assets/js/hero-network.js`), not a video: nodes are
quotes that tick on their own schedule and expire when they reach zero, over a price
line following an Ornstein-Uhlenbeck process.

Three things to keep intact when touching it:

- It sizes itself to the `.hero` element, not the viewport, and re-fits through a
  `ResizeObserver`. Nothing in it may assume `window.innerWidth`.
- Its keep-out ellipse is measured from the `.hero-content` box, so nodes bounce off
  the headline instead of drifting behind it. Change the copy freely — the zone
  follows. Add a layer of your own and give it a positive `z-index`; the canvas,
  vignette and grain occupy 0 and 1.
- It only runs while the hero is on screen and the tab is visible (`IntersectionObserver`
  plus `visibilitychange`), and under `prefers-reduced-motion` it paints one static
  frame and never starts the loop.
- `hero-rise` animates **transform only**. Opacity is deliberately absent from both the
  elements and the keyframes: a base `opacity: 0`, or a from-state pinned by `fill-mode`
  backwards, leaves the headline invisible whenever the animation does not advance —
  which is exactly how the hero copy used to disappear. Do not reintroduce an opacity
  fade here.
- A click is a trade at that point: an expanding ring brightens the edges it sweeps
  over, and nearby vertices take a burst of ticks in one direction, a beat apart. The
  listener is on `.hero`, not the canvas, so clicks over the headline count too — and
  because nodes are drawn under an ambient camera translate, the click is put back into
  node space (`lastCam`) before it is matched against them. The formula band below
  shares this behaviour.
- Its colours are written literally in `hero-network.js` and mirrored by the `.hero`
  fallback gradient in `home.css`, deliberately: the canvas cannot read CSS tokens, and
  the two must agree. They are where the site's palette came from — change them and the
  tokens in `shared.css` together, or the page splits into two colour schemes.

### The research index

`webpage/research/index.html` is two canvases and a set of links. The band behind the heading
runs the start page's own market network (`webpage/assets/js/research-hero.js`); below it,
`webpage/assets/js/research-graph.js` draws one soft cloud per category and lays the projects
over it as real `<a>` elements — focusable, linkable, readable by a screen reader.
Only the clouds and the category names are painted; nothing you can click is canvas.

- **`PAPERS` in `research-graph.js` is the index.** Adding an entry there adds the
  project to the graph, the list and the search at once. The no-script list in
  `webpage/research/index.html` carries the same five projects, and the footer its own copy —
  all three are updated together.
- **Graph and list are one set of nodes in two layouts.** Each node is a small physics
  body: a spring pull toward whatever its current mode wants, damped so it settles,
  bouncing off its neighbours on the way. The toggle changes the target, not the
  markup.
- Each rock is generated from its project's `id`, so a project keeps the same
  silhouette across reloads; the same seed drives its spin direction and period.
- Under `prefers-reduced-motion` nothing orbits: nodes land on their target
  immediately and the animation loop never starts.
- The intro canvas needs an explicit `width`/`height` in CSS. `inset: 0` alone anchors
  a replaced element at its intrinsic size — the backing store, which is
  `devicePixelRatio` times larger — and the whole mesh then draws at double scale on a
  phone.

### The start page formula band

Below the hero, `.formula-network` is a second canvas animation
(`webpage/assets/js/formula-network.js`). It replaced the old "Was wir tun" section: the focus
list it carried lives in full on `pages/strategy.html`, and the risk warning it ended with is
in the site-wide footer, so nothing moved out of reach.

Formulas are generated from templates in `LINE_TEMPLATES`, not drawn from a fixed list —
add a template and it joins the rotation. Behind them runs the same mesh as the hero,
with a shared market regime (calm, bull, bear, crash) biasing every node's tick at once.

It follows the same rules as the hero — sizes to its section rather than the viewport,
re-fits through a `ResizeObserver`, runs only while on screen and visible, and paints a
single frame under `prefers-reduced-motion`. Two things are its own:

- A click here also shoves nearby formulas outward, on top of the ripple and tick burst
  the hero does. As in the hero, the listener is on the section and the canvas is
  `pointer-events: none`. Anything layered over it needs a positive `z-index`: the
  canvas sits at 0 and `.formula-content` at 2. Nothing announces the interaction —
  the band carries no hint line, so a click is there to be found.
- It has **no** keep-out zone, unlike the hero. Its copy is set left and in grey —
  informative text, not a title — on a `.formula-copy` panel in the hero's own ground
  colour (`--color-black` / `#050810`), and that panel carries the contrast instead, so
  the artwork runs behind it untouched.
- The panel sits half a gutter outboard of the site's content column on screens from
  1024px, and rides near the top of the band rather than its middle below 768px, where
  the section is tall relative to the copy.
- Each sentence is one line (`white-space: nowrap` on `.formula-lead` and
  `.formula-sub`); their `clamp()` sizes are tuned so neither wraps or overflows down to
  320px. Give the two lines their own classes rather than styling `.formula-copy > p` —
  that selector outranks `.formula-sub` and silently flattens both to one size.
- Its gradient starts on the hero's ground and climbs to the lighter blue, in both
  `drawBackground()` and the `.formula-network` CSS fallback; the two must agree. A
  `.band-divider` of pure black separates it from the hero, since both canvases meet
  on `#050810` and would otherwise run together. It repeats the `border-bottom` that
  `shared.css` puts on every `<section>`, so the black band is framed by the same rule
  top and bottom — the divider is a `<div>` and would not get one otherwise. Nodes bounce off it; formulas fade down as they cross it rather than
  sitting behind the words, and `FLOATER_PAD` widens it for them alone, since a formula
  is anchored at its left edge but runs a long way right of it. Change the copy freely —
  the zone follows.
- Floater count and type size follow the canvas area (`measureDensity`), so a phone gets
  a legible scattering instead of a desktop's worth of formulas. A wide canvas lands back
  on the reference numbers: 30 floaters, line sizes up to 26px.

### A research project

Work goes in its own folder under `webpage/research/`, with an `index.html` and, if it
carries tooling or data of its own, a short `README.md` (see
`webpage/research/historymap/`). That holds for a plain write-up too:
`bqe-decomp/index.html` and `marketjepa/index.html` are single documents in a folder of
their own, which is what keeps their figures beside them (`bqe-decomp/utils/`) and their
URL a clean `/research/bqe-decomp/`. A paper is styled from its own embedded CSS rather
than `shared.css` — `webpage/research/RESEARCH_PAPER_STYLE_GUIDE.md` is the reference
for that, and for redesigning the write-ups that still predate it. List every project in
three places, which are meant to agree: the `PAPERS`
array in `webpage/assets/js/research-graph.js` (the graph, the list and the search all read it),
the `<noscript>` list in `webpage/research/index.html`, and the Research column of the footer.
A new category also needs a cluster centre in `CLUSTER_CENTERS`, an entry in `COLORS`
and a swatch in the page's legend.

### A page that needs live data

Follow the pattern `webpage/research/stack/` uses, because Pages cannot run code:

1. Write a fetcher in `automation/scripts/` that produces compact JSON.
2. Add its dependencies to `automation/requirements.txt`.
3. Add a workflow in `.github/workflows/` that runs it on a schedule and commits the
   result (copy `market-data.yml`; it already handles a branch that moved underneath it).
4. Have the page `fetch()` the committed JSON, and give it a fallback for the window
   before the first run.

If the data has to be *intraday* fresh, it needs the Worker in `automation/worker/` instead —
browsers cannot call Yahoo directly because those endpoints send no CORS headers.

## Data and automation

| Workflow | Schedule (UTC) | Runs | Commits |
|---|---|---|---|
| `market-data.yml` | 22:20, Mon–Fri | `automation/scripts/fetch_market_data.py` | `webpage/research/stack/data/*.json` |
| `market-tape.yml` | 12:10 and 22:10, Mon–Fri | `automation/scripts/fetch_market_tape.py` | Market Tape data |

Both can be started by hand from the **Actions** tab, and both commit under the
repository owner's identity rather than `github-actions[bot]`, so the contributor list
stays accurate.

## Local preview

Serve `webpage/`, not the repository root — it is the site root, and an absolute path
like `/assets/css/shared.css` only resolves from inside it:

```bash
cd webpage
python3 -m http.server 8000
# → http://localhost:8000/index.html
```

A plain file server is enough — and it is *required*, because the pages use absolute
paths and `components.js` fetches the header and footer over HTTP.

For the Python fetchers, from the repository root:

```bash
pip install -r automation/requirements.txt
python3 automation/scripts/fetch_market_data.py \
  --out webpage/research/stack/data --limit 5
```

## Deploying

Push to `main`. `deploy.yml` uploads `webpage/` and Pages serves it; there is nothing to
build and nothing to release. It runs on any push that touches `webpage/`, when either
data workflow finishes, and by hand from the **Actions** tab.

Commits are authored as `SchwarzRene <123473580+SchwarzRene@users.noreply.github.com>`
so everything in the history — including scheduled data commits — is attributed to the
repository owner.
