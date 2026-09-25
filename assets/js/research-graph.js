/**
 * Research Graph - the project explorer on research/index.html.
 *
 * Every project is a node: a procedurally drawn asteroid (deterministic per
 * id, so the same project is the same rock on every reload) sitting on one
 * soft cloud per category. The nodes are real anchors in the DOM, so they
 * stay focusable, linkable and readable by assistive technology; the clouds
 * and the category names behind them are decorative layers.
 *
 * Everything that moves per frame is moved with transform and opacity
 * only, so the animation is composited rather than repainted.
 *
 * Graph and list are the same nodes in two layouts, not two renderings.
 * Each node is a small physics body - a spring pull toward wherever its
 * current mode wants it, damped so it settles, colliding with its
 * neighbours on the way - so pressing the toggle sends them flying to the
 * other arrangement rather than cross-fading between two pictures.
 *
 * PAPERS below is the index itself: adding a project here adds it to the
 * graph, the list and the search. Keep it in step with the no-script
 * fallback list in research/index.html and the footer's Research column.
 *
 * Depends on nothing else - load it after assets/css/pages/research.css.
 */

(function () {
  var COLORS = {
    "Infrastructure":     { hex: "#f0b429", rgb: "240, 180, 41",  light: "#ffe6a8" },
    "Machine Learning":   { hex: "#59c0ff", rgb: "89, 192, 255",  light: "#cdeeff" },
    "Interactive":        { hex: "#6ee796", rgb: "110, 231, 150", light: "#d6fbe1" }
  };

  // ---- procedural asteroid shapes -----------------------------------
  // Deterministic per node (same id -> same rock every reload) rather
  // than truly random, so the layout doesn't reshuffle on refresh.
  function seededRandom(seedStr) {
    var h = 0;
    for (var i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) | 0;
    var state = (h >>> 0) || 1;
    return function () {
      // mulberry32
      state |= 0; state = (state + 0x6D2B79F5) | 0;
      var x = Math.imul(state ^ (state >>> 15), 1 | state);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // An irregular, elongated silhouette rather than a perturbed circle: the
  // base radius is shaped by three harmonics (the real lobes/bulges a rock
  // has, at three different scales), then the whole point set is stretched
  // along one random axis before smoothing - a round blob doesn't read as
  // an asteroid, an elongated lumpy one does. The points are stitched into
  // a closed path with the "quadratic through midpoints" trick: vertices
  // become control points and the curve only ever touches the midpoint
  // between consecutive ones, which is what keeps a noisy point set
  // looking like a worn rock instead of a jagged, hand-drawn polygon.
  function asteroidPath(rng, cx, cy, baseR) {
    var pointCount = 16;
    var amp1 = 0.15 + rng() * 0.07, phase1 = rng() * Math.PI * 2;
    var amp2 = 0.09 + rng() * 0.05, phase2 = rng() * Math.PI * 2;
    var amp3 = 0.05 + rng() * 0.04, phase3 = rng() * Math.PI * 2;
    var stretch = 1.12 + rng() * 0.26;
    var axis = rng() * Math.PI;
    var cosA = Math.cos(axis), sinA = Math.sin(axis);

    var pts = [];
    for (var i = 0; i < pointCount; i++) {
      var angle = (i / pointCount) * Math.PI * 2;
      var r = baseR * (
        1 +
        amp1 * Math.sin(angle * 2 + phase1) +
        amp2 * Math.sin(angle * 3 + phase2) +
        amp3 * Math.sin(angle * 5 + phase3) +
        (rng() * 2 - 1) * 0.03
      );
      var rx = Math.cos(angle) * r, ry = Math.sin(angle) * r;
      // rotate into the stretch axis, stretch, rotate back
      var lx = rx * cosA + ry * sinA;
      var ly = -rx * sinA + ry * cosA;
      lx *= stretch;
      var fx = lx * cosA - ly * sinA;
      var fy = lx * sinA + ly * cosA;
      pts.push({ x: cx + fx, y: cy + fy });
    }
    var mid = function (a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    var start = mid(pts[pointCount - 1], pts[0]);
    var d = "M " + start.x.toFixed(2) + " " + start.y.toFixed(2) + " ";
    for (var j = 0; j < pointCount; j++) {
      var next = pts[(j + 1) % pointCount];
      var m = mid(pts[j], next);
      d += "Q " + pts[j].x.toFixed(2) + " " + pts[j].y.toFixed(2) + " " + m.x.toFixed(2) + " " + m.y.toFixed(2) + " ";
    }
    return d + "Z";
  }

  // One radial-fade gradient, reused by every crater on the rock: SVG's
  // default gradientUnits (objectBoundingBox) maps a gradient onto whatever
  // element references it using *that element's own* bounding box - so a
  // single definition, referenced by circles of wildly different sizes,
  // gives each one its own correctly-scaled radial fade for free.
  // fill-opacity then scales that fade's overall strength per crater
  // without needing a separate gradient per crater. Each rock is its own
  // image document (see asteroidImage), so each carries its own copy.
  var CRATER_GRADIENT_ID = "crater-fade";
  function craterGradientDefs() {
    return (
      '<radialGradient id="' + CRATER_GRADIENT_ID + '">' +
        '<stop offset="0%" stop-color="#03050a" stop-opacity="0.95" />' +
        '<stop offset="70%" stop-color="#03050a" stop-opacity="0.4" />' +
        '<stop offset="100%" stop-color="#03050a" stop-opacity="0" />' +
      '</radialGradient>'
    );
  }

  function asteroidSVG(p, color) {
    var rng = seededRandom(p.id);
    var d = asteroidPath(rng, 20, 20, 14.5);
    var gradId = "grad-" + p.id, clipId = "clip-" + p.id, sheenId = "sheen-" + p.id, grainId = "grain-" + p.id;

    // a light source up and to the left, the same corner the front page's
    // own gradients read as "lit from" - every mark below is graded
    // against this direction instead of being scattered evenly
    var lightDir = { x: -0.62, y: -0.62 };
    var lightAngle = Math.atan2(lightDir.y, lightDir.x);

    var marks = "";

    // the specular sheen where the light actually lands, laid down first
    // so everything else sits believably on top of it
    marks +=
      '<ellipse cx="' + (20 + lightDir.x * 6).toFixed(1) + '" cy="' + (20 + lightDir.y * 6).toFixed(1) +
      '" rx="9" ry="7" fill="url(#' + sheenId + ')" />';

    // a dense, size-varied crater field - many small pits and a few large
    // ones, the way an actual cratered surface reads, rather than a
    // handful of evenly-sized dots. Distance uses sqrt(rng()) so craters
    // cover the disc's *area* evenly instead of bunching near the center.
    var craterCount = 15 + Math.floor(rng() * 9); // 15-23
    for (var i = 0; i < craterCount; i++) {
      var angle = rng() * Math.PI * 2;
      var dist = Math.sqrt(rng()) * 11.5;
      var cx = 20 + Math.cos(angle) * dist, cy = 20 + Math.sin(angle) * dist;
      var rr = 0.5 + Math.pow(rng(), 2.2) * 4.3; // biased small, occasional large
      var facing = Math.cos(angle) * lightDir.x + Math.sin(angle) * lightDir.y; // -1..1
      var depth = 0.35 + Math.max(0, -facing) * 0.4 + rng() * 0.1;

      marks +=
        '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + rr.toFixed(2) +
        '" fill="url(#' + CRATER_GRADIENT_ID + ')" fill-opacity="' + depth.toFixed(2) + '" />';

      // larger craters catch a lit rim on the side facing the light
      if (rr > 2.1 && facing > -0.35) {
        var rimX = cx + Math.cos(lightAngle) * rr * 0.55;
        var rimY = cy + Math.sin(lightAngle) * rr * 0.55;
        var rimAlpha = 0.14 + rng() * 0.1;
        marks +=
          '<circle cx="' + rimX.toFixed(1) + '" cy="' + rimY.toFixed(1) + '" r="' + (rr * 0.32).toFixed(2) +
          '" fill="rgba(255,255,255,' + rimAlpha.toFixed(2) + ')" />';
      }
    }

    // small sunlit facets, biased toward the light-facing side
    var lightCount = 3 + Math.floor(rng() * 3); // 3-5
    for (var j = 0; j < lightCount; j++) {
      var lAngle = lightAngle + (rng() - 0.5) * 2.4;
      var lDist = 3 + rng() * 7.5;
      var lx = 20 + Math.cos(lAngle) * lDist, ly = 20 + Math.sin(lAngle) * lDist;
      var lr = 0.8 + rng() * 1.5;
      marks +=
        '<ellipse cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" rx="' + lr.toFixed(2) +
        '" ry="' + (lr * 0.8).toFixed(2) + '" fill="rgba(255,255,255,' + (0.16 + rng() * 0.14).toFixed(2) + ')" />';
    }

    // one or two faint hairline fractures - surface detail that reads as
    // "worn rock" rather than "shaded circle" at a glance
    var fractureCount = 1 + Math.floor(rng() * 2);
    for (var k = 0; k < fractureCount; k++) {
      var fAngle = rng() * Math.PI * 2;
      var fx = 20 + Math.cos(fAngle) * 4, fy = 20 + Math.sin(fAngle) * 4;
      var fx2 = 20 + Math.cos(fAngle) * 11, fy2 = 20 + Math.sin(fAngle) * 11;
      var midCx = (fx + fx2) / 2 + (rng() - 0.5) * 4, midCy = (fy + fy2) / 2 + (rng() - 0.5) * 4;
      marks +=
        '<path d="M ' + fx.toFixed(1) + ' ' + fy.toFixed(1) + ' Q ' + midCx.toFixed(1) + ' ' + midCy.toFixed(1) +
        ' ' + fx2.toFixed(1) + ' ' + fy2.toFixed(1) +
        '" fill="none" stroke="rgba(3,5,10,0.32)" stroke-width="0.5" stroke-linecap="round" />';
    }

    // fine regolith grain, the same feTurbulence technique the front
    // page's own hero uses for its film-grain layer, just scaled down and
    // clipped to this one small rock instead of the whole viewport
    var grainSeed = 1 + Math.floor(rng() * 900);
    var grain =
      '<filter id="' + grainId + '" x="-20%" y="-20%" width="140%" height="140%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="' + grainSeed + '" stitchTiles="stitch" />' +
      '</filter>' +
      '<rect x="-3" y="-3" width="46" height="46" filter="url(#' + grainId + ')" ' +
        'style="mix-blend-mode:overlay;opacity:0.5" />';

    // The baked-in shadow replaces a CSS drop-shadow on the node: a filter
    // on the parent of a spinning layer has to be recomputed every frame.
    var shadowId = "shadow-" + p.id;

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + ASTEROID_VIEWBOX + '">' +
        '<defs>' +
          '<filter id="' + shadowId + '" x="-30%" y="-30%" width="160%" height="160%">' +
            '<feDropShadow dx="0" dy="1" stdDeviation="1.7" flood-color="#000" flood-opacity="0.6" />' +
          '</filter>' +
          '<linearGradient id="' + gradId + '" x1="0.05" y1="0" x2="0.95" y2="1">' +
            '<stop offset="0%" stop-color="' + color.light + '" />' +
            '<stop offset="32%" stop-color="' + color.hex + '" />' +
            '<stop offset="68%" stop-color="#0b1424" />' +
            '<stop offset="100%" stop-color="#020306" />' +
          '</linearGradient>' +
          '<radialGradient id="' + sheenId + '">' +
            '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.4" />' +
            '<stop offset="100%" stop-color="#ffffff" stop-opacity="0" />' +
          '</radialGradient>' +
          craterGradientDefs() +
          '<clipPath id="' + clipId + '"><path d="' + d + '" /></clipPath>' +
        '</defs>' +
        '<g filter="url(#' + shadowId + ')">' +
          '<path d="' + d + '" fill="url(#' + gradId + ')" stroke="' + color.hex + '" stroke-width="0.9" stroke-opacity="0.8" />' +
          '<g clip-path="url(#' + clipId + ')">' + marks + grain + '</g>' +
        '</g>' +
      '</svg>'
    );
  }

  // The rock is handed to the page as an <img>, not inline SVG. Inline, its
  // noise filter, blend mode and clip path were repainted on every frame of
  // the spin - six feTurbulence passes a frame, which is what made the
  // graph stutter. As an image it is rasterised once, and the spin is a
  // compositor-only rotation of that bitmap.
  //
  // The viewBox leaves a wide margin around the 0-40 rock: an image clips to
  // its viewBox, where the inline SVG used to overflow it, and the most
  // stretched rocks reach past the old -3..43 box. research.css sizes and
  // offsets the image by the same numbers so the rock lands where it did.
  var ASTEROID_VIEWBOX = "-13 -13 66 66";
  function asteroidImage(p, color) {
    return (
      '<img class="asteroid-img" alt="" draggable="false" decoding="async" src="data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(asteroidSVG(p, color)) + '" />'
    );
  }
  // ---------------------------------------------------------------------

  // Grouped by category rather than scattered individually: each tag gets
  // its own small cluster center, and members of that cluster orbit close
  // together around it instead of being placed one by one across the whole
  // canvas. A single-member cluster (Infrastructure, Machine Learning) is
  // just its center point; Interactive, with three members, fans them out
  // in a small ring.
  var CLUSTER_CENTERS = {
    "Infrastructure":   { x: 0.20, y: 0.30 },
    "Machine Learning": { x: 0.78, y: 0.26 },
    "Interactive":      { x: 0.50, y: 0.72 }
  };
  var CLUSTER_ORDER = ["Infrastructure", "Machine Learning", "Interactive"];

  // One entry per project, in the order they were published.
  var PAPERS = [
    {
      id: "bqe-decomp", tag: "Infrastructure", title: "BQE-DeComp",
      desc: "A domain-specific binary codec for 1-minute OHLCV equity data. Decodes 4 million rows directly into NumPy arrays in ~9 ms using parallel lz4 decompression across independent row bands.",
      short: "Binary codec that loads 4M rows of OHLCV data in ~9ms.",
      stack: "Rust · PyO3 · lz4", href: "/research/bqe-decomp/"
    },
    {
      id: "marketjepa", tag: "Machine Learning", title: "MarketJEPA",
      desc: "A self-supervised world model for the stock market — a JEPA trained with SIGReg on the full BQE equity universe to learn a latent representation of price action.",
      short: "Self-supervised JEPA world model for stock price action.",
      stack: "PyTorch · JEPA · SIGReg", href: "/research/marketjepa/"
    },
    {
      id: "historymap", tag: "Interactive", title: "HistoryMap",
      desc: "An interactive world-history atlas: historical borders from 9500 BC to 2010 on a time slider, with curated era reports, clickable empires and a capital-cities layer.",
      short: "Interactive atlas of world borders, 9500 BC to 2010.",
      stack: "Leaflet · GeoJSON", href: "/research/historymap/"
    },
    {
      id: "markettape", tag: "Interactive", title: "Market News",
      desc: "A daily briefing on markets, stocks and commodities across the US, Europe, Asia and Russia: free headlines ranked and summarised by a model, an on-now calendar of Fed, ECB, data and earnings events, and a chat that answers from the collected headlines.",
      short: "AI-ranked market briefing with an on-now event calendar.",
      stack: "RSS · Gemini API", href: "/research/markettape/"
    },
    {
      id: "stack", tag: "Interactive", title: "Stack",
      desc: "A scrollable chart feed for the S&P 500: monthly, weekly, daily and hourly candles per stock, with drawn levels shared across timeframes.",
      short: "Multi-timeframe candle charts for the S&P 500.",
      stack: "Canvas · yfinance", href: "/research/stack/"
    },
    {
      id: "tradingjournal", tag: "Interactive", title: "Trading Journal",
      desc: "A trading journal: log trades with live P&L, mark up the chart around each one, keep dated notes linked to the trades they are about, and read the stats that come out of it.",
      short: "Trade log with live P&L, chart markup and a journal.",
      stack: "JavaScript · Lightweight Charts", href: "/research/tradingjournal/"
    }
  ];

  // Give every node its place within its own cluster: an index and a count
  // among its same-tag siblings, so a lone member sits dead on the cluster
  // center and three members fan out evenly around it.
  //
  // List view gets its own separate ordering: Interactive rises to the top
  // of the list even though its cluster sits at the bottom of the graph -
  // the two layouts are allowed to disagree about "top" and "bottom"
  // because they're answering different questions (graph groups by
  // category position; list is just a reading order).
  var LIST_TAG_ORDER = ["Interactive", "Infrastructure", "Machine Learning"];
  (function assignClusterSlots() {
    var seen = {};
    PAPERS.forEach(function (p) { seen[p.tag] = (seen[p.tag] || 0) + 1; });
    var taken = {};
    PAPERS.forEach(function (p) {
      p.clusterCount = seen[p.tag];
      p.clusterIndex = taken[p.tag] || 0;
      taken[p.tag] = p.clusterIndex + 1;
    });

    // flatten by LIST_TAG_ORDER, keeping each category's own members in
    // their original relative order, and number the result 0..n-1
    var flat = [];
    LIST_TAG_ORDER.forEach(function (tag) {
      PAPERS.forEach(function (p) { if (p.tag === tag) flat.push(p); });
    });
    flat.forEach(function (p, i) { p.listIndex = i; });
  })();

  var wrap = document.getElementById("graphWrap");
  var cloudLayer = document.getElementById("graphClouds");
  if (!wrap || !cloudLayer) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var nodeEls = [];
  var t = 0;
  var query = "";

  var searchInput = document.getElementById("searchInput");
  var searchField = document.getElementById("searchField");
  var searchCount = document.getElementById("searchCount");

  function expandSearch() {
    searchField.classList.add("is-expanded");
    searchInput.placeholder = "Search projects, e.g. \u201cJEPA\u201d or \u201cRust\u201d\u2026";
  }
  function collapseSearchIfEmpty() {
    if (searchInput.value.trim()) return;
    searchField.classList.remove("is-expanded");
    searchInput.placeholder = "Search";
  }
  searchInput.addEventListener("focus", expandSearch);
  searchInput.addEventListener("blur", collapseSearchIfEmpty);

  function matches(p, q) {
    if (!q) return true;
    var haystack = (p.title + " " + p.tag + " " + p.stack + " " + p.desc).toLowerCase();
    return haystack.indexOf(q) !== -1;
  }

  function applySearch() {
    query = searchInput.value.trim().toLowerCase();
    var matchedCount = 0;
    nodeEls.forEach(function (p) {
      var isMatch = matches(p, query);
      p.matched = isMatch;
      p.el.classList.toggle("is-filtered-out", !isMatch);
      if (isMatch) matchedCount++;
    });

    if (!query) {
      searchCount.textContent = "";
    } else if (matchedCount === 0) {
      searchCount.textContent = "No projects match “" + searchInput.value.trim() + "”.";
    } else {
      searchCount.textContent = matchedCount + " of " + nodeEls.length + " projects match.";
    }

    draw();
  }

  searchInput.addEventListener("input", applySearch);

  // The graph's size in CSS pixels, read on resize rather than per frame.
  var graphW = 0, graphH = 0;
  function measure() {
    var r = wrap.getBoundingClientRect();
    graphW = r.width; graphH = r.height;
  }

  function buildNodes() {
    PAPERS.forEach(function (p) {
      var color = COLORS[p.tag] || COLORS["Infrastructure"];
      var rng = seededRandom(p.id + "-spin");
      var spinDuration = (46 + rng() * 40).toFixed(1); // 46-86s, slow and calm
      var spinDir = rng() > 0.5 ? "normal" : "reverse";

      var a = document.createElement("a");
      a.className = "node";
      a.href = p.href;
      a.style.setProperty("--node-color", color.hex);
      a.style.setProperty("--node-rgb", color.rgb);
      a.innerHTML =
        '<span class="node-dot" aria-hidden="true">' +
          '<span class="asteroid-spin" style="--spin-duration:' + spinDuration + 's;--spin-dir:' + spinDir + '">' +
            asteroidImage(p, color) +
          '</span>' +
        '</span>' +
        '<span class="node-label">' +
          '<span class="node-meta">' +
            '<span class="node-title">' + p.title + '</span>' +
            '<span class="node-sub">' + p.stack + '</span>' +
          '</span>' +
          '<span class="node-desc">' + p.short + '</span>' +
        '</span>';
      // hovering is just the CSS :hover enlarge - no panel, nothing else
      // reacts to it. Clicking pops the node bigger for a beat before the
      // browser follows the link, so the click itself reads as registered
      // rather than instant.
      a.addEventListener("click", function () {
        var el = this;
        el.classList.add("is-clicked");
        window.setTimeout(function () { el.classList.remove("is-clicked"); }, 380);
      });
      wrap.appendChild(a);
      p.el = a;
      p.matched = true;
      p.physX = 0; p.physY = 0; p.velX = 0; p.velY = 0; // set to a real start position in init()
      nodeEls.push(p);
    });
  }

  // ---- view mode: graph (clustered) vs. list (left-aligned column) ------
  // Positions are no longer eased between two fixed points - each node is a
  // small physics body (position + velocity) pulled toward wherever its
  // current mode wants it, like a weak gravity well, and damped so it
  // settles rather than orbiting forever. Nodes that get pulled through
  // each other's space collide and bounce off with a real impulse, the
  // same way two asteroids passing close would perturb each other rather
  // than pass through.
  var viewMode = "graph";
  var graphWeight = 1; // 1 = fully graph, 0 = fully list; eases toward viewMode each frame

  var viewToggle = document.getElementById("viewToggle");
  var viewToggleLabel = document.getElementById("viewToggleLabel");

  viewToggle.addEventListener("click", function () {
    var next = viewMode === "graph" ? "list" : "graph";
    viewMode = next;

    wrap.classList.toggle("is-list-view", next === "list");
    viewToggle.setAttribute("aria-pressed", next === "list" ? "true" : "false");
    viewToggleLabel.textContent = next === "list" ? "Graph" : "List";

    if (reduceMotion) {
      // no orbiting, no bouncing - just land exactly where the new mode
      // wants each node, instantly
      var w = graphW, h = graphH;
      nodeEls.forEach(function (p) {
        var target = computeForMode(viewMode, p, w, h);
        p.physX = target.x; p.physY = target.y;
        p.velX = 0; p.velY = 0;
      });
      graphWeight = next === "graph" ? 1 : 0;
    }
    draw(); // reflect the change immediately even if the rAF loop isn't running
  });

  function computePositionGraph(p, w, h) {
    var center = CLUSTER_CENTERS[p.tag];
    var base = { x: center.x * w, y: center.y * h };

    // fan siblings out around the cluster center; a lone member gets no
    // offset at all, so single-node clusters sit exactly on their center
    var offsetX = 0, offsetY = 0;
    if (p.clusterCount > 1 && w < 560) {
      // A phone has no room for a ring: four members on it put each label
      // on top of the next rock, and a tap on Stack opened the Trading
      // Journal. Two columns, wide and tall enough that a rock and its
      // title never reach the neighbour's; a last odd member is centred.
      var colX = Math.max(72, w * 0.22);
      var rowY = 100;
      var rows = Math.ceil(p.clusterCount / 2);
      var row = Math.floor(p.clusterIndex / 2);
      var alone = p.clusterIndex === p.clusterCount - 1 && p.clusterCount % 2 === 1;
      offsetX = alone ? 0 : (p.clusterIndex % 2 ? colX : -colX);
      offsetY = (row - (rows - 1) / 2) * rowY;
    } else if (p.clusterCount > 1) {
      // The floor, not the proportion, is what matters on a phone: a ring
      // any tighter than this parks each label under the next node's rock.
      var ringRadius = Math.max(64, Math.min(w, h) * 0.12);
      var angle = (p.clusterIndex / p.clusterCount) * Math.PI * 2 - Math.PI / 2;
      offsetX = Math.cos(angle) * ringRadius;
      offsetY = Math.sin(angle) * ringRadius * 0.82;
    }

    // a small independent drift per node, kept gentle so clusters read as
    // a cohesive little group rather than drifting apart
    var driftX = reduceMotion ? 0 : Math.sin(t * 0.6 + center.x * 10 + p.clusterIndex) * 6;
    var driftY = reduceMotion ? 0 : Math.cos(t * 0.5 + center.y * 10 + p.clusterIndex) * 6;

    return { x: base.x + offsetX + driftX, y: base.y + offsetY + driftY };
  }

  function computePositionList(p, w, h) {
    var count = nodeEls.length || 1;
    var leftX = Math.min(92, Math.max(56, w * 0.14));
    // extra headroom up top: the graph-hint text sits at the same corner
    // the first row would otherwise land on, so the list starts lower
    // than it would if the corner were empty.
    var topPad = Math.max(76, Math.min(96, h * 0.18));
    var bottomPad = Math.min(56, h * 0.14);
    var fullUsable = Math.max(0, h - topPad - bottomPad);
    // rows sit 20% closer together than the full available band would
    // give them - the tightened block is then centered in that band
    // rather than just left hugging the top, so it still reads balanced.
    var usable = fullUsable * 0.8;
    var startY = topPad + (fullUsable - usable) / 2;
    var y = count > 1 ? startY + (p.listIndex / (count - 1)) * usable : h / 2;
    // a tiny idle bob so a settled list doesn't look frozen/dead
    var bob = reduceMotion ? 0 : Math.sin(t * 0.8 + p.listIndex * 1.7) * 3;
    return { x: leftX, y: y + bob };
  }

  function computeForMode(mode, p, w, h) {
    return mode === "list" ? computePositionList(p, w, h) : computePositionGraph(p, w, h);
  }

  // Spring pull toward the target (like a gentle gravity well) plus
  // velocity damping, integrated with real elapsed time so it looks the
  // same regardless of frame rate. Slightly underdamped on purpose: a
  // node overshoots its target a touch and settles back, rather than
  // gliding to a dead stop, which is what makes it read as inertia rather
  // than an animation easing curve.
  var SPRING_K = 46;
  var SPRING_DAMPING = 9;
  var ASTEROID_RADIUS = 22; // rough collision radius, matched to the ~40px rendered dot
  var COLLISION_RESTITUTION = 0.7;

  function updatePhysics(dt) {
    var w = graphW, h = graphH;

    nodeEls.forEach(function (p) {
      var target = computeForMode(viewMode, p, w, h);
      var ax = SPRING_K * (target.x - p.physX);
      var ay = SPRING_K * (target.y - p.physY);
      p.velX += (ax - SPRING_DAMPING * p.velX) * dt;
      p.velY += (ay - SPRING_DAMPING * p.velY) * dt;
      p.physX += p.velX * dt;
      p.physY += p.velY * dt;
    });

    // pairwise collisions: push overlapping asteroids apart and exchange
    // the velocity component along the collision normal, like a real
    // elastic bump between two equal-mass bodies
    var minDist = ASTEROID_RADIUS * 2;
    for (var i = 0; i < nodeEls.length; i++) {
      for (var j = i + 1; j < nodeEls.length; j++) {
        var a = nodeEls[i], b = nodeEls[j];
        var dx = b.physX - a.physX, dy = b.physY - a.physY;
        var dist = Math.hypot(dx, dy) || 0.0001;
        if (dist >= minDist) continue;

        var nx = dx / dist, ny = dy / dist;
        var overlap = minDist - dist;
        a.physX -= nx * overlap * 0.5; a.physY -= ny * overlap * 0.5;
        b.physX += nx * overlap * 0.5; b.physY += ny * overlap * 0.5;

        var relVel = (a.velX - b.velX) * nx + (a.velY - b.velY) * ny;
        if (relVel > 0) {
          var impulse = relVel * COLLISION_RESTITUTION;
          a.velX -= impulse * nx; a.velY -= impulse * ny;
          b.velX += impulse * nx; b.velY += impulse * ny;
        }
      }
    }

    // the cloud/legend crossfade eases independently of the physics -
    // whether the asteroids are still bouncing into place or not, the
    // category chrome fades on its own steady clock
    var targetWeight = viewMode === "graph" ? 1 : 0;
    graphWeight += (targetWeight - graphWeight) * Math.min(1, dt * 3.2);
  }
  // ------------------------------------------------------------------------

  function clusterHasMatch(tag, pts) {
    return pts.some(function (item) { return item.p.tag === tag && item.p.matched; });
  }

  // The clouds and the category names are DOM layers rather than canvas
  // paint. They only ever move, grow and fade, which the compositor does
  // on its own; the canvas they used to be drawn on was a full-width
  // surface at devicePixelRatio, cleared and repainted every frame, and it
  // was most of what this page cost to animate. Each cloud is a fixed-size
  // gradient (research.css) scaled to its radius and faded with opacity.
  var CLOUD_BASE_RADIUS = 128; // half of .graph-cloud's size in research.css
  var CLOUD_FULL_ALPHA = 0.15; // the gradient's centre alpha in research.css
  var clouds = {};
  function buildClouds() {
    CLUSTER_ORDER.forEach(function (tag) {
      var cloud = document.createElement("div");
      cloud.className = "graph-cloud";
      cloud.style.setProperty("--cloud-rgb", COLORS[tag].rgb);
      var label = document.createElement("div");
      label.className = "graph-cloud-label";
      label.style.color = COLORS[tag].hex;
      label.textContent = tag;
      cloudLayer.appendChild(cloud);
      cloudLayer.appendChild(label);
      clouds[tag] = { cloud: cloud, label: label };
    });
  }

  function draw() {
    var pts = nodeEls.map(function (p) { return { p: p, pt: { x: p.physX, y: p.physY } }; });
    var byTag = {};
    pts.forEach(function (item) {
      (byTag[item.p.tag] = byTag[item.p.tag] || []).push(item);
    });


    // one soft "cloud" per cluster, sitting behind everything else - this
    // is what reads the group as one thing at a glance. It fades out as
    // list view takes over, since clustering no longer means anything once
    // nodes are a plain column.
    CLUSTER_ORDER.forEach(function (tag) {
      var members = byTag[tag] || [];
      var layer = clouds[tag];
      if (!members.length || graphWeight <= 0.01) {
        layer.cloud.style.opacity = "0";
        layer.label.style.opacity = "0";
        return;
      }
      var cx = 0, cy = 0;
      members.forEach(function (m) { cx += m.pt.x; cy += m.pt.y; });
      cx /= members.length; cy /= members.length;

      var spread = 0;
      members.forEach(function (m) {
        spread = Math.max(spread, Math.hypot(m.pt.x - cx, m.pt.y - cy));
      });
      var radius = spread + 54;
      var hasMatch = clusterHasMatch(tag, pts);
      var glowAlpha = (hasMatch ? 0.15 : 0.045) * graphWeight;

      layer.cloud.style.transform =
        "translate3d(" + (cx - CLOUD_BASE_RADIUS) + "px," + (cy - CLOUD_BASE_RADIUS) + "px,0) " +
        "scale(" + (radius / CLOUD_BASE_RADIUS) + ")";
      layer.cloud.style.opacity = String(glowAlpha / CLOUD_FULL_ALPHA);

      // the category name, floating above its own cloud (research.css
      // centres it on x and puts its baseline on y)
      layer.label.style.transform = "translate3d(" + cx + "px," + (cy - radius + 18) + "px,0)";
      layer.label.style.opacity = String((hasMatch ? 0.85 : 0.35) * graphWeight);
    });

    // within a cluster, members no longer draw lines to each other - the
    // shared cloud behind them is what reads them as one group. Clusters
    // don't connect to each other either; each cloud stands on its own.

    // position the real DOM nodes to match - this transform lands the
    // anchor exactly on the vertex the edges are drawn to; the dot then
    // centers itself on that same point in its own CSS.
    pts.forEach(function (item) {
      item.p.el.style.transform = "translate3d(" + item.pt.x + "px," + item.pt.y + "px,0)";
    });
  }

  // The loop only runs while the graph is on screen and the tab is in
  // front, like the intro band above it. It used to run for the life of the
  // page, spending every frame on a graph scrolled out of view.
  var lastFrameTime = null;
  var rafId = null;
  var onScreen = true;
  function loop(now) {
    var dt = 0.016;
    if (lastFrameTime !== null) dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    t += dt;
    updatePhysics(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function play() {
    if (rafId !== null || reduceMotion) return;
    // a fresh clock, so the first frame back doesn't integrate the whole
    // time the loop was paused as one step
    lastFrameTime = null;
    rafId = requestAnimationFrame(loop);
  }

  function pause() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  function updateRunning() {
    if (onScreen && !document.hidden) play(); else pause();
  }

  function init() {
    buildClouds();
    buildNodes();
    measure();

    // start every node already sitting at its graph position rather than
    // (0,0), so the very first frame doesn't show them flying in from the
    // corner before anything has been clicked
    var w = graphW, h = graphH;
    nodeEls.forEach(function (p) {
      var start = computeForMode(viewMode, p, w, h);
      p.physX = start.x; p.physY = start.y;
    });

    draw();
    updateRunning();

    function onResize() { measure(); draw(); }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(wrap);
    else window.addEventListener("resize", onResize);

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        updateRunning();
      }, { threshold: 0 }).observe(wrap);
    }
    document.addEventListener("visibilitychange", updateRunning);
    // Coming back from a project with the browser's back button restores
    // this page from the back/forward cache; start from a clean clock.
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) { pause(); updateRunning(); }
    });
  }

  init();
})();
