# Research Paper Style Guide

How individual write-ups under `/research/*.html` (e.g. `bqe_decomp.html`,
`marketjepa.html`) should be styled so they read as part of Black Quant
Empire rather than as separate, unbranded documents. Each paper is still a
**self-contained HTML file** — no shared header/footer, no dependency on
`shared.css` at runtime — but its own embedded `<style>` block must be built
from the same tokens the rest of the site uses.

This doc is the reference for redesigning the remaining papers (HistoryMap,
Market News, Stack, and any new one) the same way BQE-DeComp and MarketJEPA
were done.

---

## 1. Why standalone, not shared CSS

Papers are long, media-heavy, single-purpose documents with their own
one-off components (byte-plane diagrams, benchmark grids, version logs).
Pulling in `shared.css` + `research.css` would fight with all of that. So
instead: **keep the paper self-contained, but hard-code the site's actual
color values** into its own `:root` block, rather than inventing a new
palette per paper (which is what the old tan/gold theme did).

---

## 2. Color tokens — copy these exactly

Source of truth: `assets/css/shared.css` on the live site. Every paper's
`:root` should resolve to these values (variable *names* inside the paper
can stay whatever the paper already uses — `--accent`, `--fg`, etc. — as
long as the *values* match):

```css
:root {
  /* backgrounds */
  --fg:           #A8B6C9;   /* body copy   → --color-gray-300 */
  --fg-strong:    #EEF2F8;   /* headings    → --color-white    */
  --muted:        #7C8DA6;   /* meta text   → --color-gray-400 */
  --bg:           #050810;   /* page ground → --color-black       */
  --bg-soft:      #070B15;   /* card ground → --color-black-soft  */
  --bg-muted:     #0F1A2C;   /* inset ground→ --color-black-muted */
  --card:         #070B15;

  /* accent (gold) */
  --accent:       #F0B429;   /* → --color-gold       */
  --accent-light: #FFD166;   /* → --color-gold-light */
  --accent-dark:  #C88F14;   /* → --color-gold-dark  */

  /* structural tint */
  --border:       rgba(240,180,41,0.18);  /* gold @ 18% */
  --navy:         rgba(19,35,61,0.5);     /* --color-navy @ 50% */

  /* semantic */
  --green: #6EE796;  /* → --color-success    */
  --red:   #F87171;  /* → --color-error      */
  --blue:  #59C0FF;  /* → --color-navy-light */
}
```

### Find-and-replace map (old tan theme → site palette)

If you're starting from a paper that still uses the old self-invented tan
theme, this is the exact substitution table used on BQE-DeComp / MarketJEPA:

| Old (paper-only tan theme) | New (site token)                  |
|---|---|
| `#C4A86B`                  | `#F0B429` gold                    |
| `#D4B87B`                  | `#FFD166` gold-light              |
| `#9E8A55`, `#A89050`       | `#C88F14` gold-dark               |
| `rgba(196,168,107,*)`      | `rgba(240,180,41,*)`              |
| `#0A0A0A`                  | `#050810` black                   |
| `#131313`                  | `#070B15` black-soft              |
| `#1F1F1F`, `#1a1a1a`       | `#0F1A2C` black-muted             |
| `#0f172a` (pre bg)         | `#0F1A2C`                          |
| `#FFFFFF`                  | `#EEF2F8` white                   |
| `#B8B8B8`                  | `#A8B6C9` gray-300                |
| `#6B7280`, `#94a3b8`       | `#7C8DA6` gray-400                |
| `#5dc87a`, `#86efac`       | `#6EE796` success                 |
| `rgba(74,196,120,*)`, `rgba(93,200,122,*)` | `rgba(110,231,150,*)` |
| `#c87a7a`, `#fca5a5`       | `#F87171` error                   |
| `rgba(200,122,122,*)`, `rgba(180,100,100,*)` | `rgba(248,113,113,*)` |
| `#7dd3fc`                  | `#59C0FF` navy-light              |
| `rgba(125,211,252,*)`      | `rgba(89,192,255,*)`              |
| `rgba(26,43,74,*)`         | `rgba(19,35,61,*)`                |

Do this as a global search-and-replace across the **whole file**, not just
the `<style>` block — inline `style="…"` attributes in the body (badges,
version-log tags, bar charts) reuse these same literals and are easy to
miss otherwise.

---

## 3. Typography

No change needed from what the papers already do — their font stack
already matches the site's `--font-body`:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             Helvetica, Arial, sans-serif;
```

Headings stay sans-serif (the site reserves Georgia for the logo wordmark
only, not for `h1`–`h6`). Monospace stays whatever the paper already uses
for code/diagrams (`"SF Mono", ui-monospace, Menlo, Consolas, monospace`).

---

## 4. The masthead

Keep the existing masthead structure (`<header>` with gold top/bottom
border, title, one-line summary, badge row) — it already mirrors the
site's `.page-header` pattern (gold rule above and below, centered content,
diagonal gold-tinted gradient wash). Just make sure its colors resolve
through the token swap above.

---

## 5. Background network (the "static graph and gold dots")

Every paper gets a frozen, non-animated echo of the homepage hero network
(`assets/js/hero-network.js`) as a fixed backdrop. It must be **static
SVG**, not a ported copy of the canvas animation — these are long,
text-heavy, scrollable documents, and an animated loop the length of the
page adds battery/CPU cost for no benefit. A single frozen frame gets the
same visual identity for free.

### Structure

```html
<body>
<div class="bg-network">
  <svg class="bg-network-svg" viewBox="0 0 1600 1000"
       preserveAspectRatio="xMidYMid slice"
       xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(240,180,60,0.30)"/>
        <stop offset="100%" stop-color="rgba(240,180,60,0)"/>
      </radialGradient>
    </defs>
    <g stroke="rgba(214,228,248,0.10)" stroke-width="1"> <!-- edges --> </g>
    <g> <!-- glow + core circle per node --> </g>
  </svg>
</div>
<div class="wrap"> ... paper content ... </div>
</body>
```

```css
.bg-network {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(180deg, #070b15 0%, #0a1220 55%, #050810 100%);
  overflow: hidden;
}
.bg-network-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.bg-network::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 38%,
    rgba(5,8,16,0) 0%, rgba(5,8,16,0.35) 60%, rgba(3,5,10,0.82) 100%);
}
body { background: transparent; }
header, .wrap { position: relative; z-index: 1; }
```

### Generating the node layout

Don't hand-place dots. Generate them the same way `buildNodes()` /
`rebuildEdges()` do on the live hero, just once, offline:

1. Jittered grid, not pure random — ~40 nodes over a `1600×1000` canvas,
   grid cell size derived from a target count, each node offset by up to
   ±42.5% of its cell so it doesn't look mechanical.
2. Each node gets a `z` depth in `[0.35, 1.0]` — this alone drives both
   its radius and its opacity, which is what gives the field visual depth.
3. Edges: for each node, connect to its 2–3 nearest neighbors (`k = 2 +
   i % 2`) within `max_d = min(W,H) * 0.34`. This is what keeps the mesh
   looking like a real graph instead of a random scatter — clusters
   connect locally, nothing connects across the whole canvas.
4. Draw edges first, gold-glow + bright core circles second, in that
   order (edges underneath).

Node styling, straight from `hero-network.js`'s own draw calls:

```
glow  radius = core_radius * 6
glow  fill   = radial-gradient rgba(240,180,60, 0.30·z) → transparent
core  radius = 1.6 + z * 2.6
core  fill   = rgba(255,243,214, 0.85·z + 0.15)
edge  stroke = rgba(214,228,248, 0.10)
```

Regenerate with a new random seed any time you want a different arrangement
— there's no canonical layout, only the algorithm above.

---

## 6. Readability: the content column must be opaque

The background network sits behind **everything**, including the content
column — so the column itself needs a solid backdrop, or every table cell,
paragraph, and code block would need one individually (fragile, easy to
miss one). Fix it once, at the container:

```css
.wrap {
  position: relative;
  z-index: 1;
  background: var(--bg);                 /* solid, NOT transparent */
  box-shadow: 0 0 0 1px var(--border),    /* thin gold-tinted edge */
              0 40px 120px rgba(0,0,0,0.55); /* lift off the network */
}
```

This is the one rule that matters most: **`.wrap`'s background must be a
solid color, never `transparent` or an `rgba()` with alpha < 1.** Because
child elements (tables, `<p>`, `.card`, `.key`/`.warn`/`.ok` boxes) don't
need their own opaque backgrounds — they simply reveal `.wrap`'s solid
color underneath, which is exactly what you want.

The network stays visible in the margins outside the content column
(and, at narrower viewports, above/below the masthead) — enough to read as
"the same site," without ever sitting behind text.

**Checklist when redesigning a paper:**

- [ ] `:root` values swapped to the token table in §2 (whole file, not
      just `<style>`)
- [ ] Masthead keeps gold top/bottom rule + centered badges
- [ ] `.bg-network` fixed backdrop added, static SVG generated per §5
- [ ] `.wrap` given a solid opaque `background` (§6) — this is the
      readability fix, don't skip it
- [ ] Spot-check every custom component the paper uses (diagrams, bar
      charts, version-log entries, benchmark grids) for any color literal
      the find-and-replace table in §2 might have missed
