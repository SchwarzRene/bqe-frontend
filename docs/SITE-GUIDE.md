# Site guide

How a page is put together, the conventions pages keep to, and how to add something.

## How a page is put together

Every page under `pages/` follows the same skeleton. The header and footer are **not** in the
HTML — `components.js` fetches them and replaces the placeholder divs, so a navigation
change is made once in `components/header.html` and applies everywhere.

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
| Page CSS | One file per page in `assets/css/pages/`, loaded *after* `shared.css`; page-specific rules live there, not in a `<style>` block. |
| Accessibility | Skip link, `aria-label` on every `<nav>`, alt text on every image, visible focus. The site publishes an accessibility statement — keep it honest. |
| Images | Ship `.webp` plus a `.jpg`/`.png` fallback of the same name, and set `loading="lazy" decoding="async"` below the fold. |

## Adding to the site

### A new page

1. Copy the skeleton above into `pages/neueseite.html`.
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
> (`width: 100vw` with a negative margin) so long documents like `pages/privacy.html` can span
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

### The research index

`research/index.html` is a canvas band and a grid of cards. The band behind the heading
runs the start page's own market network (`assets/js/research-hero.js`); below it, each
project is a plain `<li class="project-card">` with its artwork, category, kind
(write-up or tool), description and stack. The title's link is stretched over the whole
card in `research.css`, so the card is one target while a screen reader hears only the
project name.

- **The markup is the index.** The page reads in full without script;
  `assets/js/research-filter.js` only reveals the toolbar, counts each category from the
  cards, and hides the ones that do not match the chosen category and the typed words.
- **Artwork** lives in `assets/images/research/<project>.svg`: square, 360-unit viewBox,
  motif kept in the middle three quarters — the card shows it through a 4:3 window.
- Under `prefers-reduced-motion` the cards do not lift or zoom on hover.

### The start page formula band

Below the hero, `.formula-network` is a second canvas animation
(`assets/js/formula-network.js`). It replaced the old "Was wir tun" section: the focus
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

Work goes in its own folder under `research/`, with an `index.html` and, if it
carries tooling or data of its own, a short `README.md` (see
`research/historymap/`). That holds for a plain write-up too:
`bqe-decomp/index.html` and `marketjepa/index.html` are single documents in a folder of
their own, which is what keeps their figures beside them (`bqe-decomp/utils/`) and their
URL a clean `/research/bqe-decomp/`. A paper is styled from its own embedded CSS rather
than `shared.css` — `research/RESEARCH_PAPER_STYLE_GUIDE.md` is the reference
for that, and for redesigning the write-ups that still predate it. List every project in
two places, which are meant to agree: a card in
`research/index.html` (with its artwork in `assets/images/research/`) and the Research
column of the footer. A new category also needs a filter button in the page's toolbar
and a `.project-tag--<category>` colour in `research.css`.

### A page that needs live data

Everything dynamic goes through the Worker. Two patterns, depending on how
fresh the data has to be:

**Refreshed on a schedule, stored in D1** — what `research/stack/` and
Market News (`research/markettape/`, `worker/news/`) do:

1. Write the job as a function in `worker/` that fetches, shapes and stores
   JSON (`putDocument()` in `worker/stack.ts` for a single document, or a
   table of its own via a new file in `migrations/`).
2. Add a cron expression to `[triggers]` in `wrangler.toml` and a `case` for
   it in `scheduled()` in `worker/index.ts`.
3. Serve it at the path the page reads, and add that path to
   `run_worker_first`. Fall back to `env.ASSETS.fetch(request)` so a committed
   copy covers the time before the first run.

**Fresh on load** — add a route under `/api/` in `worker/index.ts`, as
`/api/quotes` does for live bars. Browsers cannot call Yahoo directly (no
CORS headers), which is why this lives on the Worker. Cache upstream answers
with `caches.default`, and give the page a short deadline and a fallback so a
slow upstream degrades to stored data rather than an error.
