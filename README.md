<div align="center">
  <img src="assets/images/logo.png" alt="Black Quant Empire Logo" width="120" height="120">

# schwarzrene.github.io

Website and research pages of **Black Quant Empire** — quantitative trading on Gold and
NASDAQ futures.

**Live:** https://schwarzrene.github.io

</div>

---

This file documents the *repository*: how it is laid out, the conventions each page
follows, and what to do when you add something. The company itself is described on the
site (`index.html`, `about.html`, `strategy.html`).

## How it is served

GitHub Pages serves the `main` branch from the repository root. There is **no build
step**: what is committed is what is served. Push to `main` and the site redeploys in a
minute or two.

Consequences worth remembering:

- Every path in the HTML is **absolute** (`/assets/css/shared.css`). Opening a page as a
  `file://` URL therefore shows it unstyled — always preview through a local server (see
  [Local preview](#local-preview)).
- There is no server-side code. Anything that needs a backend either runs ahead of time
  in GitHub Actions and is committed as JSON (see [Data and automation](#data-and-automation)),
  or lives in the Cloudflare Worker under `worker/`.

## Repository layout

```
├── index.html              Start page (market-network hero, formula-network band)
├── about.html              Über uns — brand and trademark documentation
├── strategy.html           Trading strategy
├── careers.html            Open roles
├── contact.html            Contact form
├── accessibility.html      WCAG / WZG accessibility statement
├── disclaimer.html         Risk disclaimer
├── impressum.html          Austrian Impressum
├── privacy.html            Privacy policy
├── license.html            Licences of third-party material
├── credits.html            Media sources
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
│   │   ├── navigation.js   Burger menu + login modal
│   │   ├── hero-network.js Start page hero animation (canvas)
│   │   ├── formula-network.js Start page formula band animation (canvas)
│   │   └── form.js         Contact form validation (WCAG error handling)
│   ├── images/             Page imagery, each as .webp + .jpg/.png fallback
│   ├── captions/de.vtt     Captions for assets/video.mp4
│   └── video.mp4           Unused since the "Was wir tun" section was replaced
│
├── research/               Research write-ups, one file or folder per project
│   ├── index.html          Research index
│   ├── bqe_decomp.html     Binary encoding for 1-minute OHLCV data
│   ├── marketjepa.html     Self-supervised world model
│   ├── markettape.html     Write-up for the Market Tape app
│   ├── markettape/         The Market Tape app itself
│   └── historymap/         Interactive history atlas (own README)
│
├── stack/                  S&P 500 chart feed (own README)
│   ├── index.html
│   └── data/*.json         One file per ticker, refreshed by Actions
│
├── worker/                 Cloudflare Worker: CORS proxy for live Yahoo quotes
├── scripts/                Python fetchers run by the workflows
│   ├── fetch_market_data.py
│   └── fetch_market_tape.py
├── requirements.txt        Python dependencies for those scripts
└── .github/workflows/      Scheduled data refreshes
    ├── market-data.yml     Weekdays 22:20 UTC → stack/data
    └── market-tape.yml     Weekdays 12:10 and 22:10 UTC → Market Tape
```

## How a page is put together

Every top-level page follows the same skeleton. The header and footer are **not** in the
HTML — `components.js` fetches them and replaces the placeholder divs, so a navigation
change is made once in `components/header.html` and applies everywhere.

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
        <a href="/vorherige.html" class="btn btn-secondary btn-prev">← Vorherige</a>
        <a href="/naechste.html" class="btn btn-secondary btn-next">Nächste →</a>
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
| Page CSS | One file per page in `assets/css/pages/`, loaded *after* `shared.css`; page-specific rules live there, not in a `<style>` block. |
| Accessibility | Skip link, `aria-label` on every `<nav>`, alt text on every image, visible focus. The site publishes an accessibility statement — keep it honest. |
| Images | Ship `.webp` plus a `.jpg`/`.png` fallback of the same name, and set `loading="lazy" decoding="async"` below the fold. |

## Adding to the site

### A new page

1. Copy the skeleton above into `neueseite.html` at the repository root.
2. Create `assets/css/pages/neueseite.css` and link it. Even if it starts empty, the
   page then has a home for its own rules.
3. Add it to the navigation in `components/header.html` — and, if it belongs there, to
   `components/footer.html`. Both are shared, so this is the only place to edit.
4. Wire the `page-navigation` prev/next links on the neighbouring pages so the chain
   stays intact.
5. Copy the cookie banner markup from an existing page.
6. Check it at 1440px, 768px and 390px before pushing.

### A section on an existing page

Add a `<section>` inside `<main>`, wrap the content in `<div class="container">`, and
start it with an `<h2>`. `shared.css` handles the vertical rhythm, the divider and the
alternating background.

> **Careful with `<article>` pages.** `shared.css` makes `article section` full-bleed
> (`width: 100vw` with a negative margin) so long documents like `privacy.html` can span
> the viewport. If your article sits inside a narrower column, you must neutralise that
> — `about.css` shows how (`.about-text-side section { width: 100%; margin-left: 0; }`).

### An image or a video

- Images go in `assets/images/` as a `.webp` plus a `.jpg`/`.png` fallback.
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
  `assets/images/` for the loading state and for `prefers-reduced-motion`.
- **When you replace a media file or a stylesheet in place, bump its version query**
  (`video.mp4?v=2`, `home.css?v=3`). Browsers and the Pages CDN cache these aggressively;
  without a new URL, phones keep serving the old file.

### The start page hero

The hero is a canvas animation (`assets/js/hero-network.js`), not a video: nodes are
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

### The start page formula band

Below the hero, `.formula-network` is a second canvas animation
(`assets/js/formula-network.js`). It replaced the old "Was wir tun" section: the focus
list it carried lives in full on `strategy.html`, and the risk warning it ended with is
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
  canvas sits at 0, `.formula-vignette` and `.formula-hint` at 1, `.formula-content`
  at 2.
- It has **no** keep-out zone, unlike the hero. Its copy is set left and in grey —
  informative text, not a title — on a `.formula-copy` panel in the hero's own ground
  colour (`--color-black` / `#050810`), and that panel carries the contrast instead, so
  the artwork runs behind it untouched.
- Each sentence is one line (`white-space: nowrap` on `.formula-lead` and
  `.formula-sub`); their `clamp()` sizes are tuned so neither wraps or overflows down to
  320px. Give the two lines their own classes rather than styling `.formula-copy > p` —
  that selector outranks `.formula-sub` and silently flattens both to one size.
- Its gradient starts on the hero's ground and climbs to the lighter blue, in both
  `drawBackground()` and the `.formula-network` CSS fallback; the two must agree. A
  `.band-divider` of pure black separates it from the hero, since both canvases meet
  on `#050810` and would otherwise run together. Nodes bounce off it; formulas fade down as they cross it rather than
  sitting behind the words, and `FLOATER_PAD` widens it for them alone, since a formula
  is anchored at its left edge but runs a long way right of it. Change the copy freely —
  the zone follows.
- Floater count and type size follow the canvas area (`measureDensity`), so a phone gets
  a legible scattering instead of a desktop's worth of formulas. A wide canvas lands back
  on the reference numbers: 30 floaters, line sizes up to 26px.

### A research project

Self-contained work goes in its own folder under `research/` with an `index.html` and a
short `README.md` (see `research/historymap/`). A single write-up can be one HTML file at
`research/`. Either way, link it from `research/index.html` and from the footer.

### A page that needs live data

Follow the pattern `stack/` uses, because Pages cannot run code:

1. Write a fetcher in `scripts/` that produces compact JSON.
2. Add its dependencies to `requirements.txt`.
3. Add a workflow in `.github/workflows/` that runs it on a schedule and commits the
   result (copy `market-data.yml`; it already handles a branch that moved underneath it).
4. Have the page `fetch()` the committed JSON, and give it a fallback for the window
   before the first run.

If the data has to be *intraday* fresh, it needs the Worker in `worker/` instead —
browsers cannot call Yahoo directly because those endpoints send no CORS headers.

## Data and automation

| Workflow | Schedule (UTC) | Runs | Commits |
|---|---|---|---|
| `market-data.yml` | 22:20, Mon–Fri | `scripts/fetch_market_data.py` | `stack/data/*.json` |
| `market-tape.yml` | 12:10 and 22:10, Mon–Fri | `scripts/fetch_market_tape.py` | Market Tape data |

Both can be started by hand from the **Actions** tab, and both commit under the
repository owner's identity rather than `github-actions[bot]`, so the contributor list
stays accurate.

## Local preview

```bash
python3 -m http.server 8000
# → http://localhost:8000/index.html
```

A plain file server is enough — and it is *required*, because the pages use absolute
paths and `components.js` fetches the header and footer over HTTP.

For the Python fetchers:

```bash
pip install -r requirements.txt
python3 scripts/fetch_market_data.py --out stack/data --limit 5
```

## Deploying

Push to `main`. Pages picks it up; there is nothing to build and nothing to release.

Commits are authored as `SchwarzRene <123473580+SchwarzRene@users.noreply.github.com>`
so everything in the history — including scheduled data commits — is attributed to the
repository owner.
