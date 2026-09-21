/**
 * Hero Network - the market network behind the start page headline.
 *
 * Nodes are quotes: each carries a value that ticks on its own schedule, most
 * of them quietly, a few of them hard. A node whose value reaches zero dies,
 * its edges fade out, and a new one arrives somewhere else. Behind them a
 * price line follows an Ornstein-Uhlenbeck process, stepped with
 * Euler-Maruyama: dX = theta*(mu - X)*dt + sigma*sqrt(dt)*dW.
 *
 * It draws into the hero section rather than the viewport, so the page still
 * scrolls normally, and it stops drawing whenever the hero is off-screen or
 * the tab is in the background.
 */

(function () {
  'use strict';

  var hero = document.querySelector('.hero');
  var canvas = document.querySelector('.hero-canvas');
  var content = document.querySelector('.hero-content');
  if (!hero || !canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  var reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── keep-out zone ─────────────────────────────────────────────────────────
  // Measured from the headline block itself instead of a hardcoded ellipse, so
  // it keeps matching the copy at every breakpoint. Node centres are pushed
  // outside it and bounce off it, so no vertex ever sits behind the text.
  var textCX = 0, textCY = 0, textRX = 0, textRY = 0;

  function measureText() {
    if (!content) {
      textCX = W / 2;
      textCY = H / 2;
      textRX = Math.min(W * 0.46, 560);
      textRY = Math.min(H * 0.24, 270);
      return;
    }
    var hb = hero.getBoundingClientRect();
    var cb = content.getBoundingClientRect();
    textCX = cb.left - hb.left + cb.width / 2;
    textCY = cb.top - hb.top + cb.height / 2;
    textRX = Math.min(cb.width / 2 + 48, W * 0.48);
    textRY = Math.min(cb.height / 2 + 36, H * 0.44);
  }

  function resize() {
    W = hero.clientWidth;
    H = hero.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    measureText();
    buildLine();
    buildNodes();
  }

  // Shared vertical band for the price line: starts where the headline block
  // ends and runs down to 10% of the hero height above the bottom edge.
  function chartBand() {
    var top = textCY + textRY;
    var bottom = H * 0.9;
    if (bottom < top + 60) bottom = top + 60;
    var halfH = (bottom - top) / 2;
    return { mid: (top + bottom) / 2, rangeHalf: halfH / 0.7 };
  }

  function pushOutsideText(p) {
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

  // ── shared: standard normal generator (Box-Muller) ────────────────────────
  function randn() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Euler-Maruyama step of dX = theta*(mu - X)*dt + sigma*sqrt(dt)*dW
  function stepOU(x, theta, mu, sigma, dt) {
    return x + theta * (mu - x) * dt + sigma * Math.sqrt(dt) * randn();
  }

  // ── node network ──────────────────────────────────────────────────────────
  var nodes = [];
  var edgeMap = {};   // key -> edge, persists across rebuilds so we can fade in/out
  var floats = [];    // floating +/- change readouts
  var pendingSpawns = 0;
  var spawnTimer = 0;
  var DEATH_DUR = 0.9;
  var SPAWN_DUR = 0.7;

  function makeNode(x, y) {
    // Volatility tiers: most nodes are quiet and barely move ("low"), a middle
    // band updates occasionally, and only a small slice ("high") churns fast
    // and hard — so only a handful of points are ever visibly active at once.
    var roll = Math.random();
    var tier = roll < 0.55 ? 'low' : (roll < 0.86 ? 'mid' : 'high');
    var n = {
      x: x, y: y,
      z: 0.35 + Math.random() * 0.65,
      vx: (Math.random() - 0.5) * 5.5,
      vy: (Math.random() - 0.5) * 5.5,
      phase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.6 + Math.random() * 0.9,
      value: randValue(),
      tier: tier,
      dying: false,
      deathT: 0,
      spawnT: 0
    };
    n.changeTimer = nextChangeTimer(tier);
    return n;
  }

  function nextChangeTimer(tier) {
    if (tier === 'low') return 5 + Math.random() * 7;        // rarely updates
    if (tier === 'high') return 0.35 + Math.random() * 0.9;  // fast and often
    return 1.6 + Math.random() * 2.6;                        // occasional
  }

  function buildNodes() {
    nodes = [];
    edgeMap = {};
    floats = [];
    pendingSpawns = 0;
    // A jittered grid covers the hero more evenly than pure random placement,
    // which leaves gaps and clumps.
    var targetCount = Math.max(18, Math.min(46, Math.round((W * H) / 46000)));
    var cols = Math.max(1, Math.round(Math.sqrt(targetCount * W / H)));
    var rows = Math.max(1, Math.ceil(targetCount / cols));
    var cellW = W / cols, cellH = H / rows;
    var made = 0;
    for (var r = 0; r < rows && made < targetCount; r++) {
      for (var c = 0; c < cols && made < targetCount; c++) {
        var jx = (Math.random() - 0.5) * cellW * 0.85;
        var jy = (Math.random() - 0.5) * cellH * 0.85;
        var n = makeNode(cellW * (c + 0.5) + jx, cellH * (r + 0.5) + jy);
        pushOutsideText(n);
        n.spawnT = 1; // already "arrived" on first build, no pop-in animation
        nodes.push(n);
        made++;
      }
    }
    rebuildEdges();
  }

  function randValue() {
    return 18 + Math.random() * 480;
  }

  function dist2(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function rebuildEdges() {
    var wanted = {};
    var maxD = Math.min(W, H) * 0.34;
    var maxD2 = maxD * maxD;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].dying) continue;
      var dists = [];
      for (var j = 0; j < nodes.length; j++) {
        if (i === j || nodes[j].dying) continue;
        var d2 = dist2(nodes[i], nodes[j]);
        if (d2 < maxD2) dists.push({ j: j, d2: d2 });
      }
      dists.sort(function (a, b) { return a.d2 - b.d2; });
      var k = 2 + (i % 2);
      for (var n = 0; n < Math.min(k, dists.length); n++) {
        var a = i, b = dists[n].j;
        if (a > b) { var t = a; a = b; b = t; }
        wanted[a + '_' + b] = [a, b];
      }
    }
    // Fade newly-wanted edges in and unwanted ones out, instead of popping.
    var key;
    for (key in wanted) {
      if (!edgeMap[key]) {
        var pair = wanted[key];
        edgeMap[key] = { a: nodes[pair[0]], b: nodes[pair[1]], alpha: 0, target: 0.9 };
      } else {
        edgeMap[key].target = 0.9;
      }
    }
    for (key in edgeMap) {
      if (!wanted[key]) edgeMap[key].target = 0;
    }
  }

  function fadeOutEdgesFor(node) {
    for (var key in edgeMap) {
      var e = edgeMap[key];
      if (e.a === node || e.b === node) e.target = 0;
    }
  }

  var lastRebuild = 0;
  function updateNodes(dt) {
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];

      if (n.dying) {
        n.deathT += dt;
        if (n.deathT >= DEATH_DUR) {
          nodes.splice(i, 1);
          pendingSpawns++;
        }
        continue;
      }

      if (!reduceMotion) {
        n.x += n.vx * dt * n.z;
        n.y += n.vy * dt * n.z;
        // Bounce off the edges rather than teleport, so edges never jump.
        if (n.x < 0) { n.x = 0; n.vx *= -1; }
        if (n.x > W) { n.x = W; n.vx *= -1; }
        if (n.y < 0) { n.y = 0; n.vy *= -1; }
        if (n.y > H) { n.y = H; n.vy *= -1; }
        // And bounce off the keep-out zone, so nothing drifts behind the copy.
        var dx = (n.x - textCX) / textRX;
        var dy = (n.y - textCY) / textRY;
        if (dx * dx + dy * dy < 1) {
          pushOutsideText(n);
          var nlen = Math.sqrt(dx * dx + dy * dy) || 1;
          var nx2 = dx / nlen, ny2 = dy / nlen;
          var vDotN = n.vx * nx2 + n.vy * ny2;
          n.vx -= 2 * vDotN * nx2;
          n.vy -= 2 * vDotN * ny2;
        }
      }

      if (n.spawnT < 1) n.spawnT = Math.min(1, n.spawnT + dt / SPAWN_DUR);

      n.changeTimer -= dt;
      if (n.changeTimer <= 0) {
        n.changeTimer = nextChangeTimer(n.tier);

        var scaleBase = n.tier === 'low' ? 1.2 : (n.tier === 'high' ? 7 : 3);
        var biasBase = n.tier === 'low' ? 0.04 : (n.tier === 'high' ? 0.18 : 0.09);
        var scale = scaleBase + n.value * (n.tier === 'high' ? 0.09 : n.tier === 'low' ? 0.012 : 0.04);
        // A small downward bias gives nodes a natural lifespan: they eventually
        // reach zero instead of drifting forever. Stronger for volatile tiers.
        var delta = (Math.random() * 2 - 1) * scale - scale * biasBase;
        n.value = Math.max(0, n.value + delta);

        if (Math.abs(delta) > 0.15 && !reduceMotion) {
          floats.push({
            x: n.x, y: n.y, z: n.z,
            text: (delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(2),
            up: delta >= 0,
            life: 0
          });
        }

        if (n.value <= 0) {
          n.dying = true;
          n.deathT = 0;
          fadeOutEdgesFor(n);
        }
      }
    }

    for (var f = floats.length - 1; f >= 0; f--) {
      var fl = floats[f];
      fl.life += dt;
      fl.y -= dt * 16;
      if (fl.life > 1.3) floats.splice(f, 1);
    }

    if (pendingSpawns > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = 0.35 + Math.random() * 0.75;
        pendingSpawns--;
        var margin = Math.min(W, H) * 0.08;
        var nx = margin + Math.random() * (W - margin * 2);
        var ny = margin + Math.random() * (H - margin * 2);
        var newNode = makeNode(nx, ny);
        pushOutsideText(newNode);
        nodes.push(newNode);
      }
    }

    lastRebuild += dt;
    if (!reduceMotion && lastRebuild > 2.6) {
      rebuildEdges();
      lastRebuild = 0;
    }
  }

  function drawEdges() {
    for (var key in edgeMap) {
      var e = edgeMap[key];
      e.alpha += (e.target - e.alpha) * 0.045;
      if (e.target === 0 && e.alpha < 0.01) {
        delete edgeMap[key];
        continue;
      }
      var z = (e.a.z + e.b.z) / 2;
      ctx.strokeStyle = 'rgba(214,228,248,' + (0.11 * z * e.alpha).toFixed(3) + ')';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.stroke();
    }
  }

  function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
  }

  function drawNodes(t) {
    ctx.textBaseline = 'middle';
    ctx.font = '11px "SF Mono", "Roboto Mono", monospace';
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var pulse = 0.55 + 0.45 * Math.sin(t * n.pulseSpeed + n.phase);
      var lifeScale = n.dying
        ? Math.max(0, 1 - n.deathT / DEATH_DUR)
        : easeOutCubic(n.spawnT);
      var r = (1.6 + n.z * 2.6 + pulse * 1.1) * lifeScale;

      if (r <= 0.05) continue;

      var glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 6);
      glow.addColorStop(0, 'rgba(240,180,60,' + (0.32 * n.z).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(240,180,60,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,243,214,' + (0.85 * n.z + 0.15).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();

      if (n.z > 0.46 && lifeScale > 0.5) {
        var la = n.z * lifeScale;
        ctx.fillStyle = 'rgba(180,205,255,' + (0.5 * la).toFixed(3) + ')';
        ctx.fillText(n.value.toFixed(2), n.x + r + 7, n.y - 2);
      }
    }
  }

  function drawFloats() {
    ctx.font = '11px "SF Mono", "Roboto Mono", monospace';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < floats.length; i++) {
      var f = floats[i];
      var a = (1 - f.life / 1.3) * f.z;
      ctx.fillStyle = f.up
        ? 'rgba(110,231,150,' + (0.85 * a).toFixed(3) + ')'
        : 'rgba(248,113,113,' + (0.85 * a).toFixed(3) + ')';
      ctx.fillText(f.text, f.x, f.y - 14);
    }
  }

  // ── click ripple ──────────────────────────────────────────────────────────
  // A click is a trade at that point: an expanding ring brightens the mesh
  // edges it passes over, and the vertices around it take a short burst of
  // ticks, all in the same direction, landing a beat apart rather than as one
  // lump sum. Shared with the formula band below (formula-network.js).
  var ripples = [];
  var clickBursts = [];
  var CLICK_TICK_RADIUS = 220;
  var CLICK_TICK_COUNT = 3;
  var CLICK_TICK_INTERVAL = 0.42; // seconds between ticks in a burst

  function applyClickTick(b) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.dying) continue;
      var d = Math.hypot(n.x - b.x, n.y - b.y);
      if (d >= CLICK_TICK_RADIUS) continue;

      var closeness = 1 - d / CLICK_TICK_RADIUS;
      // harder than a passive tick - a deliberate trade should land
      var magnitude = (6 + n.value * 0.06) * closeness * (0.85 + Math.random() * 0.65);
      var delta = b.dir * magnitude;
      n.value = Math.max(0, n.value + delta);
      n.changeTimer = nextChangeTimer(n.tier); // don't double-fire right after

      if (magnitude > 0.15) {
        floats.push({
          x: n.x, y: n.y, z: n.z,
          text: (delta >= 0 ? '+' : '\u2212') + Math.abs(delta).toFixed(2),
          up: delta >= 0,
          life: 0
        });
      }

      if (n.value <= 0) {
        n.dying = true;
        n.deathT = 0;
        fadeOutEdgesFor(n);
      }
    }
  }

  function updateClickBursts(dt) {
    for (var i = clickBursts.length - 1; i >= 0; i--) {
      var b = clickBursts[i];
      b.timer -= dt;
      if (b.timer > 0) continue;
      applyClickTick(b);
      b.remaining--;
      b.timer = CLICK_TICK_INTERVAL;
      if (b.remaining <= 0) clickBursts.splice(i, 1);
    }
  }

  function updateRipples(dt) {
    for (var i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t > 1.4) ripples.splice(i, 1);
    }
  }

  function drawRippleHighlights() {
    for (var r = 0; r < ripples.length; r++) {
      var rp = ripples[r];
      var radius = rp.t * 700;
      var band = 90;
      var a = Math.max(0, 1 - rp.t / 1.4);
      for (var key in edgeMap) {
        var e = edgeMap[key];
        var mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2;
        var d = Math.hypot(mx - rp.x, my - rp.y);
        if (Math.abs(d - radius) >= band) continue;
        var edgeA = a * (1 - Math.abs(d - radius) / band) * 0.9 * e.alpha;
        ctx.strokeStyle = 'rgba(180,232,255,' + edgeA.toFixed(3) + ')';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(e.b.x, e.b.y);
        ctx.stroke();
      }
    }
  }

  // Nodes are drawn under an ambient camera translate, so a click has to be
  // put back into node space before it can be matched against them.
  var lastCam = { x: 0, y: 0 };

  hero.addEventListener('pointerdown', function (e) {
    if (reduceMotion) return;
    var hb = hero.getBoundingClientRect();
    var cx = e.clientX - hb.left - lastCam.x;
    var cy = e.clientY - hb.top - lastCam.y;
    ripples.push({ x: cx, y: cy, t: 0 });
    clickBursts.push({
      x: cx, y: cy,
      dir: Math.random() < 0.5 ? 1 : -1,
      remaining: CLICK_TICK_COUNT,
      timer: 0
    });
  });

  // ── background price line: Ornstein-Uhlenbeck (mean-reverting) ────────────
  // Bounds are this chart's own normalised value space: L/U = -1/1, mu = 0.
  // Faster theta and lower sigma than a quote feed, so it reads as its own
  // instrument rather than a copy of the nodes.
  var LINE_PX_STEP = 4;
  var LINE_PXPS = 30; // horizontal scroll speed, px/sec
  var LINE_L = -1, LINE_U = 1;
  var LINE_MU = (LINE_L + LINE_U) / 2;
  var LINE_THETA = 0.9;
  var LINE_SIGMA = 0.75;
  var lineScrollAcc = 0;
  var lineState = LINE_MU;
  var linePts = []; // OU values, oldest first, newest = current live edge

  function buildLine() {
    lineState = LINE_MU;
    linePts = [];
    lineScrollAcc = 0;
    var needed = Math.ceil(W / LINE_PX_STEP) + 3;
    var subDt = LINE_PX_STEP / LINE_PXPS;
    for (var i = 0; i < needed; i++) {
      lineState = stepOU(lineState, LINE_THETA, LINE_MU, LINE_SIGMA, subDt);
      linePts.push(lineState);
    }
  }

  function updateLine(dt) {
    if (reduceMotion) return;
    lineScrollAcc += dt * LINE_PXPS;
    var subDt = LINE_PX_STEP / LINE_PXPS;
    while (lineScrollAcc >= LINE_PX_STEP) {
      lineScrollAcc -= LINE_PX_STEP;
      lineState = stepOU(lineState, LINE_THETA, LINE_MU, LINE_SIGMA, subDt);
      linePts.push(lineState);
      var needed = Math.ceil(W / LINE_PX_STEP) + 3;
      while (linePts.length > needed) linePts.shift();
    }
  }

  function drawPriceLine(dt) {
    updateLine(dt);
    var band = chartBand();
    var n = linePts.length;
    if (n < 2) return;

    ctx.beginPath();
    var lastX = 0, lastY = band.mid;
    for (var j = 0; j < n; j++) {
      var x = W - lineScrollAcc - (n - 1 - j) * LINE_PX_STEP;
      var y = band.mid - band.rangeHalf * linePts[j];
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      lastX = x; lastY = y;
    }
    ctx.save();
    ctx.shadowColor = 'rgba(89,192,255,0.85)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(120,205,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // leading dot at the live edge
    ctx.fillStyle = 'rgba(150,220,255,0.9)';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── camera drift (ambient only — the network never follows the cursor) ────
  function camOffset(t) {
    return {
      x: Math.sin(t * 0.05) * W * 0.012,
      y: Math.cos(t * 0.038) * H * 0.012
    };
  }

  function paint(dt, t) {
    ctx.clearRect(0, 0, W, H);

    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#070b15');
    grad.addColorStop(0.55, '#0a1220');
    grad.addColorStop(1, '#050810');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    drawPriceLine(dt);

    var cam = camOffset(t);
    lastCam = cam;
    ctx.save();
    ctx.translate(cam.x, cam.y);
    updateNodes(dt);
    updateRipples(dt);
    updateClickBursts(dt);
    drawEdges();
    drawNodes(t);
    drawFloats();
    drawRippleHighlights();
    ctx.restore();
  }

  // ── run loop ──────────────────────────────────────────────────────────────
  // Only runs while the hero is actually on screen and the tab is visible: a
  // canvas animating under the footer costs battery for nothing.
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

  if (reduceMotion) {
    paint(0, 0); // one static frame, no loop
  } else {
    play();
  }

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      resize();
      if (reduceMotion) paint(0, 0);
    }).observe(hero);
  } else {
    window.addEventListener('resize', resize);
  }

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      update();
    }, { threshold: 0 }).observe(hero);
  }

  document.addEventListener('visibilitychange', update);
})();
