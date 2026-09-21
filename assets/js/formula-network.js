/**
 * Formula Network - the mathematics band on the start page.
 *
 * Two layers over a dark gradient. In front, a field of generated formulas
 * drifts leftwards and fades in and out: sums, integrals, limits, matrices,
 * vector identities and moments, assembled from templates rather than taken
 * from a fixed list, so the same line rarely comes round twice. Behind them
 * sits the same market mesh as the hero - nodes carry a value that ticks on
 * its own schedule, edges join nearest neighbours and take their colour from
 * recent momentum, and a node whose value reaches zero dies and is replaced.
 *
 * A shared market regime (calm, bull, bear, crash) biases every tick at once,
 * so the mesh drifts together instead of each node wandering alone.
 *
 * Clicking sends a ripple through the mesh: nearby formulas get an outward
 * shove that decays back to their drift, and nearby nodes take a short burst
 * of ticks, all in the same direction - a manual trade at the click point.
 *
 * It draws into its own section rather than the viewport, so the page still
 * scrolls normally, and it stops drawing whenever the section is off-screen
 * or the tab is in the background.
 */

(function () {
  'use strict';

  var section = document.querySelector('.formula-network');
  var canvas = section && section.querySelector('.formula-canvas');
  // the tight copy block, not the full-width container around it
  var content = section && section.querySelector('.formula-copy');
  if (!section || !canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  var reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var NET_MAX_NEIGHBORS = 3;

  // ── keep-out zone ─────────────────────────────────────────────────────────
  // Measured from the copy block itself rather than a hardcoded ellipse,
  // so it keeps matching the copy at every breakpoint. Nodes bounce off it,
  // and formulas drifting across it fade down instead of sitting behind the
  // words. The copy is set left, so the zone sits left with it. FLOATER_PAD widens it for the formulas only: a line is anchored at
  // its left edge but runs a couple of hundred pixels to the right of it.
  var textCX = 0, textCY = 0, textRX = 0, textRY = 0;
  var FLOATER_PAD = 110;

  function measureText() {
    if (!content) { textRX = 0; textRY = 0; return; }
    var sb = section.getBoundingClientRect();
    var cb = content.getBoundingClientRect();
    textCX = cb.left - sb.left + cb.width / 2;
    textCY = cb.top - sb.top + cb.height / 2;
    textRX = Math.min(cb.width / 2 + 48, W * 0.48);
    textRY = Math.min(cb.height / 2 + 36, H * 0.44);
  }

  function pushOutsideText(p) {
    if (!textRX || !textRY) return false;
    var dx = (p.x - textCX) / textRX;
    var dy = (p.y - textCY) / textRY;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1 && d > 0.0001) {
      var scale = 1 / d;
      p.x = textCX + dx * textRX * scale;
      p.y = textCY + dy * textRY * scale;
      return true;
    }
    return d === 0;
  }

  // 1 well clear of the copy, falling to 0 at its centre.
  function keepOutFactor(x, y) {
    if (!textRX || !textRY) return 1;
    var dx = (x - textCX) / (textRX + FLOATER_PAD);
    var dy = (y - textCY) / textRY;
    var d2 = dx * dx + dy * dy;
    return d2 >= 1 ? 1 : d2;
  }

  function resize() {
    W = section.clientWidth;
    H = section.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    measureText();
    measureDensity();
    netBuildNodes();
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ── formula generator ─────────────────────────────────────────────────────
  var VARS = ['a', 'b', 'c', 'f', 'g', 'h', 'k', 'm', 'n', 'x', 'y', 'z',
              'φ', 'ψ', 'λ', 'α', 'β', 'σ'];
  var SUBS = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
               '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
               'i': 'ᵢ', 'j': 'ⱼ', 'n': 'ₙ', 'k': 'ₖ' };
  var SUPS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
               'n': 'ⁿ', '-1': '⁻¹' };
  function sub(s) { return String(s).split('').map(function (c) { return SUBS[c] || c; }).join(''); }
  function sup(s) { return String(s).split('').map(function (c) { return SUPS[c] || c; }).join(''); }
  function v() { return pick(VARS); }
  function n() { return randInt(0, 9); }
  function trig() { return pick(['sin', 'cos', 'tan']); }

  function bracketMatrix() {
    var rows = randInt(2, 3);
    var out = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < rows; c++) row.push(pick([0, 0, 0, 1]));
      out.push(row.join(' '));
    }
    return '[' + out.join(' | ') + ']';
  }

  var LINE_TEMPLATES = [
    function () { return v() + '(' + v() + ') = Σ' + sub('i') + '₌' + sub(n()) + sup('n') + ' ' + v() + sub('i') + '²/' + v() + sub('k') + n(); },
    function () { return '∫' + sub(n()) + sup('n') + ' ' + v() + '(x) dx = ' + v() + '(' + v() + sup('2') + ' - ' + n() + ')'; },
    function () { return v() + sub(n()) + ' = (' + v() + ' + ' + v() + sup('2') + ')/(' + n() + ' - ' + v() + ')'; },
    function () { return 'f' + sub(n()) + '(' + v() + ' = ' + bracketMatrix() + ') = ' + v() + '/' + v() + sup('2'); },
    function () { return '∑' + sub('k₌' + n()) + sup('n') + ' ' + v() + '(' + v() + sub('k') + ')' + sup('-1') + ' = ' + v(); },
    function () { return 'P' + sub(n() + '-' + n()) + ' = ∫' + sub('A') + 'ᵃ (' + v() + sub('i') + ' - ' + v() + sub(n()) + ')²/' + n(); },
    function () { return v() + '′(' + v() + ') = lim ' + v() + '→' + n() + ' [' + v() + '(' + v() + '+h) - ' + v() + '(' + v() + ')]/h'; },
    function () { return 'Φ(' + v() + ') = ' + n() + '/' + v() + sup('2') + ' · ∫ ' + v() + sub(n()) + ' d' + v(); },
    function () { return bracketMatrix() + ' × ' + bracketMatrix(); },
    function () { return v() + '(' + v() + '(' + n() + ')) ' + v() + ' = ' + bracketMatrix(); },
    // trig / exponential / log family
    function () { return trig() + '(' + v() + sub(n()) + ') + ' + trig() + '(' + v() + ') = ' + n(); },
    function () { return 'e' + sup('i' + v()) + ' = cos(' + v() + ') + i·sin(' + v() + ')'; },
    function () { return 'log' + sub(n()) + '(' + v() + v() + ') = log' + sub(n()) + v() + ' + log' + sub(n()) + v(); },
    function () { return v() + '(t) = ' + v() + sub(n()) + '·e' + sup('-' + v()) + 'ᵗ'; },
    function () { return 'd/d' + v() + ' [' + trig() + '(' + v() + ')] = ' + n() + '·' + trig() + '(' + v() + ')'; },
    function () { return '√(' + v() + sup('2') + ' + ' + v() + sup('2') + ') = ' + v() + sub(n()); },
    // calculus / limits / series
    function () { return 'lim' + sub(v() + '→∞') + ' (' + n() + '/' + v() + ' + ' + n() + ') = ' + n(); },
    function () { return '∂' + v() + '/∂' + v() + ' = ' + v() + sub(n()) + ' + ' + v() + sup('2'); },
    function () { return '∇·' + v() + ' = ' + v() + sub(n()) + ' - ∂' + v() + '/∂t'; },
    function () { return v() + 'ⁿ⁺¹ = ' + v() + sup('n') + ' + ' + n() + '·' + v() + sub(n()); },
    // vectors / sets / logic
    function () { return '|' + v() + '⃗| = √(' + v() + sub(n()) + sup('2') + ' + ' + v() + sub(n()) + sup('2') + ')'; },
    function () { return v() + '⃗ · ' + v() + '⃗ = |' + v() + '||' + v() + '|cos(θ' + sub(n()) + ')'; },
    function () { return '{' + v() + ' ∈ ℝ | ' + v() + ' > ' + n() + '} ∩ {' + v() + ' < ' + n() + '}'; },
    function () { return '∀' + v() + ' ∈ ' + v() + sup('n') + ', ' + v() + '(' + v() + ') ≥ ' + n(); },
    // probability / statistics
    function () { return 'E[' + v() + '] = Σ ' + v() + sub('i') + '·P(' + v() + sub('i') + ')'; },
    function () { return 'σ' + sup('2') + ' = ' + n() + '/n · Σ(' + v() + sub('i') + ' - μ)' + sup('2'); }
  ];

  // Keep a short memory of what was drawn so the same template doesn't come
  // back while it is still on screen.
  var recentTemplateIdx = [];
  function genLine() {
    var idx;
    var attempts = 0;
    do {
      idx = randInt(0, LINE_TEMPLATES.length - 1);
      attempts++;
    } while (recentTemplateIdx.indexOf(idx) !== -1 && attempts < 20);
    recentTemplateIdx.push(idx);
    if (recentTemplateIdx.length > 6) recentTemplateIdx.shift();
    return LINE_TEMPLATES[idx]();
  }

  function genHex() {
    var chars = '0123456789abcdef', len = randInt(4, 6), s = '#0a';
    for (var i = 0; i < len; i++) s += chars[randInt(0, 15)];
    return s;
  }

  // ── floating formula field ────────────────────────────────────────────────
  // Count and type size both follow the canvas area, so a phone gets a legible
  // scattering rather than a desktop's worth of formulas crushed into a third
  // of the width. A wide canvas lands back on the reference numbers: 30
  // floaters, sizes up to 26px.
  var floaters = [];
  var MAX_FLOATERS = 30;
  var LINE_SIZES = [15, 17, 19, 22, 26];
  var IMPULSE_DECAY = 3.2; // higher = snaps back to drift speed faster

  var TYPE_SCALE = 1;

  function measureDensity() {
    MAX_FLOATERS = clamp(Math.round((W * H) / 23000), 10, 30);
    TYPE_SCALE = W < 640 ? 0.78 : (W < 900 ? 0.88 : 1);
    LINE_SIZES = W < 640 ? [12, 13, 15, 16, 18]
               : W < 900 ? [13, 15, 17, 19, 22]
               : [15, 17, 19, 22, 26];
  }

  function spawnFloater() {
    var roll = Math.random();
    var kind = roll < 0.22 ? 'hex' : (roll < 0.42 ? 'fraction' : 'line');
    var f = {
      kind: kind,
      x: rand(-40, W - 40),
      y: rand(H * 0.06, H * 0.94),
      vx: -rand(0.18, 0.55) * (kind === 'hex' ? 0.6 : 1),
      ix: 0, iy: 0, // impulse from clicks, decays back to 0
      life: 0,
      fadeIn: rand(2.0, 3.5),
      hold: rand(6, 12),
      fadeOut: rand(2.5, 4)
    };
    if (kind === 'hex') {
      f.text = genHex();
      f.size = rand(11, 13) * TYPE_SCALE;
      f.maxAlpha = rand(0.30, 0.5);
    } else if (kind === 'fraction') {
      var numStyle = randInt(0, 2);
      f.num = numStyle === 0 ? (v() + sup(String(n())) + (Math.random() < 0.5 ? '+' + v() + sub(n()) : ''))
            : numStyle === 1 ? (trig() + '(' + v() + sub(n()) + ')')
            : ('√' + v() + sub(n()));
      f.den = Math.random() < 0.5 ? (v() + sub(n()) + (Math.random() < 0.5 ? ' - ' + n() : '')) : (n() + v() + ' + ' + n());
      f.prefix = Math.random() < 0.4 ? (v() + '(x) = ') : '';
      f.size = rand(14, 19) * TYPE_SCALE;
      f.maxAlpha = rand(0.45, 0.8);
    } else {
      f.text = genLine();
      f.size = pick(LINE_SIZES);
      f.maxAlpha = rand(0.5, 0.88);
    }
    floaters.push(f);
  }

  function seedFloaters() {
    floaters = [];
    for (var i = 0; i < MAX_FLOATERS; i++) {
      spawnFloater();
      floaters[i].life = rand(0, 8); // stagger, so they don't all fade together
    }
  }

  function updateFloaters(dt) {
    for (var i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.life += dt;
      f.x += (f.vx * 60 + f.ix) * dt;
      f.y += f.iy * dt;
      var decay = Math.exp(-IMPULSE_DECAY * dt);
      f.ix *= decay;
      f.iy *= decay;
      var total = f.fadeIn + f.hold + f.fadeOut;
      if (f.life > total || f.x < -220) floaters.splice(i, 1);
    }
    while (floaters.length < MAX_FLOATERS) spawnFloater();
  }

  function alphaFor(f) {
    if (f.life < f.fadeIn) return (f.life / f.fadeIn) * f.maxAlpha;
    if (f.life < f.fadeIn + f.hold) return f.maxAlpha;
    var t = (f.life - f.fadeIn - f.hold) / f.fadeOut;
    return Math.max(0, (1 - t) * f.maxAlpha);
  }

  function drawFraction(f, a) {
    ctx.font = 'italic ' + f.size + "px Georgia, 'Times New Roman', serif";
    var numText = f.prefix + f.num;
    var denText = f.den;
    var numW = ctx.measureText(numText).width;
    var denW = ctx.measureText(denText).width;
    var barW = Math.max(numW, denW) + 6;
    ctx.fillStyle = 'rgba(198,209,232,' + a.toFixed(3) + ')';
    ctx.fillText(numText, f.x + (barW - numW) / 2, f.y - 3);
    ctx.fillText(denText, f.x + (barW - denW) / 2, f.y + f.size + 5);
    ctx.strokeStyle = 'rgba(198,209,232,' + (a * 0.9).toFixed(3) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y + f.size * 0.28);
    ctx.lineTo(f.x + barW, f.y + f.size * 0.28);
    ctx.stroke();
  }

  function drawFloaters() {
    ctx.textBaseline = 'alphabetic';
    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      var a = alphaFor(f) * keepOutFactor(f.x, f.y);
      if (a <= 0.003) continue;
      if (f.kind === 'hex') {
        ctx.font = f.size + "px 'SFMono-Regular', Consolas, Menlo, monospace";
        ctx.fillStyle = 'rgba(150,163,190,' + a.toFixed(3) + ')';
        ctx.fillText(f.text, f.x, f.y);
      } else if (f.kind === 'fraction') {
        drawFraction(f, a);
      } else {
        ctx.font = 'italic ' + f.size + "px Georgia, 'Times New Roman', serif";
        ctx.fillStyle = 'rgba(198,209,232,' + a.toFixed(3) + ')';
        ctx.fillText(f.text, f.x, f.y);
      }
    }
  }

  // ── node network ──────────────────────────────────────────────────────────
  var netNodes = [];
  var netEdgeMap = {};   // key -> edge, persists across rebuilds so edges fade
  var netFloats = [];    // floating +/- change readouts
  var netPendingSpawns = 0;
  var netSpawnTimer = 0;
  var NET_DEATH_DUR = 0.9;
  var NET_SPAWN_DUR = 0.7;

  function netNextChangeTimer(tier) {
    if (tier === 'low') return 5 + Math.random() * 7;        // rarely updates
    if (tier === 'high') return 0.35 + Math.random() * 0.9;  // fast and often
    return 1.6 + Math.random() * 2.6;                        // occasional
  }

  function netMakeNode(x, y) {
    var roll = Math.random();
    var tier = roll < 0.55 ? 'low' : (roll < 0.86 ? 'mid' : 'high');
    var node = {
      x: x, y: y,
      z: 0.35 + Math.random() * 0.65,
      vx: (Math.random() - 0.5) * 5.5,
      vy: (Math.random() - 0.5) * 5.5,
      phase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.6 + Math.random() * 0.9,
      value: 18 + Math.random() * 480,
      trend: 0, // -1..1 recent momentum, drives edge colour
      tier: tier,
      dying: false,
      deathT: 0,
      spawnT: 0
    };
    node.changeTimer = netNextChangeTimer(tier);
    return node;
  }

  function netBuildNodes() {
    netNodes = [];
    netEdgeMap = {};
    netFloats = [];
    netPendingSpawns = 0;
    var targetCount = Math.max(24, Math.min(56, Math.round((W * H) / 42000)));
    var cols = Math.max(1, Math.round(Math.sqrt(targetCount * W / H)));
    var rows = Math.max(1, Math.ceil(targetCount / cols));
    var cellW = W / cols, cellH = H / rows;
    var made = 0;
    for (var r = 0; r < rows && made < targetCount; r++) {
      for (var c = 0; c < cols && made < targetCount; c++) {
        var jx = (Math.random() - 0.5) * cellW * 0.85;
        var jy = (Math.random() - 0.5) * cellH * 0.85;
        var node = netMakeNode(cellW * (c + 0.5) + jx, cellH * (r + 0.5) + jy);
        pushOutsideText(node);
        node.spawnT = 1; // already arrived on first build, no pop-in
        netNodes.push(node);
        made++;
      }
    }
    netRebuildEdges();
  }

  function netDist2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  function netRebuildEdges() {
    var wanted = {};
    var maxD = Math.min(W, H) * 0.34;
    var maxD2 = maxD * maxD;
    for (var i = 0; i < netNodes.length; i++) {
      if (netNodes[i].dying) continue;
      var dists = [];
      for (var j = 0; j < netNodes.length; j++) {
        if (i === j || netNodes[j].dying) continue;
        var d2 = netDist2(netNodes[i], netNodes[j]);
        if (d2 < maxD2) dists.push({ j: j, d2: d2 });
      }
      dists.sort(function (a, b) { return a.d2 - b.d2; });
      var k = Math.min(NET_MAX_NEIGHBORS, dists.length);
      for (var m = 0; m < k; m++) {
        var a2 = i, b2 = dists[m].j;
        if (a2 > b2) { var tmp = a2; a2 = b2; b2 = tmp; }
        wanted[a2 + '_' + b2] = [a2, b2];
      }
    }
    var key;
    for (key in wanted) {
      if (!netEdgeMap[key]) {
        var pair = wanted[key];
        netEdgeMap[key] = { a: netNodes[pair[0]], b: netNodes[pair[1]], alpha: 0, target: 0.9 };
      } else {
        netEdgeMap[key].target = 0.9;
      }
    }
    for (key in netEdgeMap) {
      if (!wanted[key]) netEdgeMap[key].target = 0;
    }
  }

  function netFadeOutEdgesFor(node) {
    for (var key in netEdgeMap) {
      var e = netEdgeMap[key];
      if (e.a === node || e.b === node) e.target = 0;
    }
  }

  // Market regime: a shared mood that biases every node's random walk at once,
  // so moves aren't purely independent - the whole mesh can drift green
  // together (bull run) or red together (crash), not just single nodes
  // wiggling on their own.
  var MARKET_REGIMES = [
    { name: 'calm',  bias: 0,     dur: [8, 14] },
    { name: 'bull',  bias: 0.38,  dur: [6, 10] },
    { name: 'bear',  bias: -0.32, dur: [6, 10] },
    { name: 'crash', bias: -0.9,  dur: [3, 5] }
  ];
  var marketRegime = MARKET_REGIMES[0];
  var marketTimer = rand(6, 10);

  function pickNextRegime() {
    var roll = Math.random();
    if (roll < 0.45) return MARKET_REGIMES[0];
    if (roll < 0.72) return MARKET_REGIMES[1];
    if (roll < 0.94) return MARKET_REGIMES[2];
    return MARKET_REGIMES[3];
  }

  var netLastRebuild = 0;
  function netUpdate(dt) {
    marketTimer -= dt;
    if (marketTimer <= 0) {
      marketRegime = pickNextRegime();
      marketTimer = rand(marketRegime.dur[0], marketRegime.dur[1]);
    }

    for (var i = netNodes.length - 1; i >= 0; i--) {
      var node = netNodes[i];
      if (node.dying) {
        node.deathT += dt;
        if (node.deathT >= NET_DEATH_DUR) { netNodes.splice(i, 1); netPendingSpawns++; }
        continue;
      }
      node.x += node.vx * dt * node.z;
      node.y += node.vy * dt * node.z;
      if (node.x < 0) { node.x = 0; node.vx *= -1; }
      if (node.x > W) { node.x = W; node.vx *= -1; }
      if (node.y < 0) { node.y = 0; node.vy *= -1; }
      if (node.y > H) { node.y = H; node.vy *= -1; }
      // and bounce off the keep-out zone, so nothing drifts behind the copy
      var kx = (node.x - textCX) / (textRX || 1);
      var ky = (node.y - textCY) / (textRY || 1);
      if (textRX && kx * kx + ky * ky < 1) {
        pushOutsideText(node);
        var klen = Math.sqrt(kx * kx + ky * ky) || 1;
        var knx = kx / klen, kny = ky / klen;
        var vDotN = node.vx * knx + node.vy * kny;
        node.vx -= 2 * vDotN * knx;
        node.vy -= 2 * vDotN * kny;
      }

      if (node.spawnT < 1) node.spawnT = Math.min(1, node.spawnT + dt / NET_SPAWN_DUR);

      // trend decays gently toward neutral, so edge colour reflects *recent*
      // momentum rather than one old tick forever
      node.trend *= Math.exp(-0.4 * dt);

      node.changeTimer -= dt;
      if (node.changeTimer <= 0) {
        node.changeTimer = netNextChangeTimer(node.tier);
        var scaleBase = node.tier === 'low' ? 1.2 : (node.tier === 'high' ? 7 : 3);
        var biasBase = node.tier === 'low' ? 0.04 : (node.tier === 'high' ? 0.18 : 0.09);
        var scale = scaleBase + node.value * (node.tier === 'high' ? 0.09 : node.tier === 'low' ? 0.012 : 0.04);
        var delta = (Math.random() * 2 - 1) * scale - scale * biasBase + marketRegime.bias * scale * 0.6;
        node.value = Math.max(0, node.value + delta);
        node.trend = clamp(node.trend + (delta >= 0 ? 1 : -1) * Math.min(1, Math.abs(delta) / (scale || 1)) * 0.5, -1, 1);
        if (Math.abs(delta) > 0.15) {
          netFloats.push({ x: node.x, y: node.y, z: node.z, text: (delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(2), up: delta >= 0, life: 0 });
        }
        if (node.value <= 0) {
          node.dying = true; node.deathT = 0;
          netFadeOutEdgesFor(node);
        }
      }
    }

    for (var f = netFloats.length - 1; f >= 0; f--) {
      var fl = netFloats[f];
      fl.life += dt; fl.y -= dt * 16;
      if (fl.life > 1.3) netFloats.splice(f, 1);
    }

    if (netPendingSpawns > 0) {
      netSpawnTimer -= dt;
      if (netSpawnTimer <= 0) {
        netSpawnTimer = 0.35 + Math.random() * 0.75;
        netPendingSpawns--;
        var margin = Math.min(W, H) * 0.08;
        var spawned = netMakeNode(margin + Math.random() * (W - margin * 2), margin + Math.random() * (H - margin * 2));
        pushOutsideText(spawned);
        netNodes.push(spawned);
      }
    }

    netLastRebuild += dt;
    if (netLastRebuild > 2.6) { netRebuildEdges(); netLastRebuild = 0; }
  }

  function netEaseOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

  function netDrawEdges() {
    for (var key in netEdgeMap) {
      var e = netEdgeMap[key];
      e.alpha += (e.target - e.alpha) * 0.045;
      if (e.target === 0 && e.alpha < 0.01) { delete netEdgeMap[key]; continue; }

      // blend the neutral edge colour toward green (rising) or red (falling)
      // from the average trend of the two nodes it joins
      var tr = (e.a.trend + e.b.trend) / 2;
      var mixT = clamp(Math.abs(tr), 0, 1);
      var baseC = [214, 225, 245];
      var target = tr >= 0 ? [110, 231, 150] : [248, 113, 113];
      var rC = baseC[0] + (target[0] - baseC[0]) * mixT;
      var gC = baseC[1] + (target[1] - baseC[1]) * mixT;
      var bC = baseC[2] + (target[2] - baseC[2]) * mixT;
      var lineAlpha = (0.14 + 0.14 * mixT) * e.alpha;

      ctx.strokeStyle = 'rgba(' + (rC | 0) + ',' + (gC | 0) + ',' + (bC | 0) + ',' + lineAlpha.toFixed(3) + ')';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
      ctx.stroke();
    }
  }

  function netDrawNodes(t) {
    ctx.textBaseline = 'middle';
    for (var i = 0; i < netNodes.length; i++) {
      var node = netNodes[i];
      var pulse = 0.55 + 0.45 * Math.sin(t * node.pulseSpeed + node.phase);
      var lifeScale = node.dying ? Math.max(0, 1 - node.deathT / NET_DEATH_DUR) : netEaseOutCubic(node.spawnT);
      var r = (1.6 + node.z * 2.6 + pulse * 1.1) * lifeScale;
      if (r <= 0.05) continue;

      var glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 6);
      glow.addColorStop(0, 'rgba(240,180,60,' + (0.32 * node.z).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(240,180,60,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(node.x, node.y, r * 6, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = 'rgba(255,243,214,' + (0.85 * node.z + 0.15).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2); ctx.fill();

      if (node.z > 0.46 && lifeScale > 0.5) {
        ctx.font = "11px 'SF Mono','Roboto Mono',monospace";
        ctx.fillStyle = 'rgba(180,205,255,' + (0.5 * node.z * lifeScale).toFixed(3) + ')';
        ctx.fillText(node.value.toFixed(2), node.x + r + 7, node.y - 2);
      }
    }
  }

  function netDrawFloats() {
    ctx.font = "11px 'SF Mono','Roboto Mono',monospace";
    ctx.textBaseline = 'middle';
    for (var i = 0; i < netFloats.length; i++) {
      var f = netFloats[i];
      var a = (1 - f.life / 1.3) * f.z;
      ctx.fillStyle = f.up ? 'rgba(110,231,150,' + (0.85 * a).toFixed(3) + ')' : 'rgba(248,113,113,' + (0.85 * a).toFixed(3) + ')';
      ctx.fillText(f.text, f.x, f.y - 14);
    }
  }

  // ── click ripple ──────────────────────────────────────────────────────────
  var ripples = [];
  var IMPULSE_RADIUS = 260;
  var IMPULSE_STRENGTH = 420;
  var CLICK_TICK_RADIUS = 220;
  var CLICK_TICK_COUNT = 3;
  var CLICK_TICK_INTERVAL = 0.42; // seconds between ticks in a burst
  var clickBursts = [];

  function applyClickTick(b) {
    for (var ni = 0; ni < netNodes.length; ni++) {
      var nd = netNodes[ni];
      if (nd.dying) continue;
      var ndx = nd.x - b.x, ndy = nd.y - b.y;
      var ndist = Math.hypot(ndx, ndy);
      if (ndist < CLICK_TICK_RADIUS) {
        var closeness = 1 - ndist / CLICK_TICK_RADIUS;
        // harder than a passive market tick - a deliberate trade should land
        var magnitude = (6 + nd.value * 0.06) * closeness * rand(0.85, 1.5);
        var delta = b.dir * magnitude;
        nd.value = Math.max(0, nd.value + delta);
        nd.trend = clamp(nd.trend + b.dir * Math.min(1, magnitude / (nd.value + magnitude || 1)) * 0.7, -1, 1);
        nd.changeTimer = netNextChangeTimer(nd.tier); // don't double-fire right after
        if (magnitude > 0.15) {
          netFloats.push({ x: nd.x, y: nd.y, z: nd.z, text: (delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(2), up: delta >= 0, life: 0 });
        }
        if (nd.value <= 0) {
          nd.dying = true; nd.deathT = 0;
          netFadeOutEdgesFor(nd);
        }
      }
    }
  }

  function updateClickBursts(dt) {
    for (var i = clickBursts.length - 1; i >= 0; i--) {
      var b = clickBursts[i];
      b.timer -= dt;
      if (b.timer <= 0) {
        applyClickTick(b);
        b.remaining--;
        b.timer = CLICK_TICK_INTERVAL;
        if (b.remaining <= 0) clickBursts.splice(i, 1);
      }
    }
  }

  section.addEventListener('pointerdown', function (e) {
    if (reduceMotion) return;
    var rect = section.getBoundingClientRect();
    var cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    ripples.push({ x: cx, y: cy, t: 0 });

    // give nearby formulas an outward shove, like an impulse
    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      var dx = f.x - cx, dy = f.y - cy;
      var dist = Math.hypot(dx, dy) || 0.0001;
      if (dist < IMPULSE_RADIUS) {
        var strength = (1 - dist / IMPULSE_RADIUS) * IMPULSE_STRENGTH;
        f.ix += (dx / dist) * strength;
        f.iy += (dy / dist) * strength;
      }
    }

    // a localised burst of up- or down-ticks through nearby vertices: one
    // direction for the whole burst, landing as several hits a beat apart
    // rather than a lump sum, fading out with distance from the click
    var tickDir = Math.random() < 0.5 ? 1 : -1;
    clickBursts.push({ x: cx, y: cy, dir: tickDir, remaining: CLICK_TICK_COUNT, timer: 0 });
  });

  function updateRipples(dt) {
    for (var i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t > 1.4) ripples.splice(i, 1);
    }
  }

  function drawRippleHighlights() {
    if (!ripples.length) return;
    for (var r = 0; r < ripples.length; r++) {
      var rp = ripples[r];
      var radius = rp.t * 700;
      var band = 90;
      var a = Math.max(0, 1 - rp.t / 1.4);
      for (var key in netEdgeMap) {
        var e = netEdgeMap[key];
        var mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2;
        var d = Math.hypot(mx - rp.x, my - rp.y);
        if (Math.abs(d - radius) < band) {
          var edgeA = a * (1 - Math.abs(d - radius) / band) * 0.9 * e.alpha;
          ctx.strokeStyle = 'rgba(180,232,255,' + edgeA.toFixed(3) + ')';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
          ctx.stroke();
        }
      }
    }
  }

  // ── background ────────────────────────────────────────────────────────────
  function drawBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#070b17');
    g.addColorStop(0.55, '#0a1226');
    g.addColorStop(1, '#0b1730');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var glow = ctx.createRadialGradient(W * 0.78, H * 0.12, 0, W * 0.78, H * 0.12, W * 0.55);
    glow.addColorStop(0, 'rgba(214,163,86,0.10)');
    glow.addColorStop(1, 'rgba(214,163,86,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    var glow2 = ctx.createRadialGradient(W * 0.2, H * 0.75, 0, W * 0.2, H * 0.75, W * 0.5);
    glow2.addColorStop(0, 'rgba(90,150,200,0.06)');
    glow2.addColorStop(1, 'rgba(90,150,200,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);
  }

  function drawGrid(t) {
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    var spacing = 58;
    var offset = (t * 5) % spacing;
    ctx.beginPath();
    for (var x = -spacing + offset; x < W; x += spacing) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (var y = 0; y < H; y += spacing) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function drawMarketMood() {
    // very faint wash so a crash or rally reads at a glance, on top of the
    // per-edge colouring
    var bias = marketRegime.bias;
    if (Math.abs(bias) < 0.05) return;
    var alpha = Math.min(0.05, Math.abs(bias) * 0.06);
    ctx.fillStyle = bias > 0 ? 'rgba(90,200,140,' + alpha.toFixed(3) + ')' : 'rgba(220,80,80,' + alpha.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  // ── run loop ──────────────────────────────────────────────────────────────
  // Only runs while the section is on screen and the tab is visible: a canvas
  // animating under the footer costs battery for nothing.
  function paint(dt, t) {
    if (!W || !H) return;
    updateFloaters(dt);
    netUpdate(dt);
    updateRipples(dt);
    updateClickBursts(dt);

    drawBackground();
    drawGrid(t);
    drawMarketMood();
    drawFloaters();

    netDrawEdges();
    netDrawNodes(t);
    netDrawFloats();
    drawRippleHighlights();
  }

  var lastT = null;
  var rafId = null;
  var onScreen = true;

  function frame(now) {
    var t = now / 1000;
    if (lastT === null) lastT = t;
    var dt = Math.min(0.05, t - lastT);
    lastT = t;
    paint(dt, t);
    rafId = requestAnimationFrame(frame);
  }

  function play() {
    if (rafId !== null || reduceMotion) return;
    lastT = null; // no giant dt after a pause
    rafId = requestAnimationFrame(frame);
  }

  function pause() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  function update() {
    if (onScreen && !document.hidden) play(); else pause();
  }

  resize();
  seedFloaters();

  if (reduceMotion) {
    paint(0, 0); // one static frame, no loop
  } else {
    play();
  }

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      resize();
      if (reduceMotion) paint(0, 0);
    }).observe(section);
  } else {
    window.addEventListener('resize', resize);
  }

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      update();
    }, { threshold: 0 }).observe(section);
  }

  document.addEventListener('visibilitychange', update);
})();
