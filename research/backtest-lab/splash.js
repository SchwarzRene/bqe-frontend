// Loading splash (copied from the engine repo's web/index.html, where it is inline; the site's CSP forbids inline scripts).
// splash: build the candles, cycle the status text, and offer window.hideSplash() (called by app.js when the first page is ready)
(function () {
  var svg = document.getElementById("splashchart"); if (!svg) return;
  var NS = "http://www.w3.org/2000/svg", n = 18, seed = 11;
  function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  var price = 60, cs = [];
  for (var i = 0; i < n; i++) { var o = price, c = o + (rnd() - 0.40) * 22, hi = Math.max(o, c) + rnd() * 8, lo = Math.min(o, c) - rnd() * 8; price = c; cs.push([o, c, hi, lo]); }
  var mn = Math.min.apply(null, cs.map(function (x) { return x[3]; })), mx = Math.max.apply(null, cs.map(function (x) { return x[2]; }));
  function y(v) { return 140 - (v - mn) / (mx - mn) * 118; }
  var step = 400 / n, g = document.getElementById("splcandles"), pts = [];
  cs.forEach(function (k, i) {
    var x = step * i + step / 2, up = k[1] >= k[0], grp = document.createElementNS(NS, "g");
    grp.setAttribute("class", "spl-c " + (up ? "up" : "dn")); grp.style.setProperty("--i", i);
    var yc = (y(k[2]) + y(k[3])) / 2; grp.style.transformOrigin = x + "px " + yc + "px";
    var w = document.createElementNS(NS, "line"); w.setAttribute("x1", x); w.setAttribute("x2", x); w.setAttribute("y1", y(k[2])); w.setAttribute("y2", y(k[3]));
    var b = document.createElementNS(NS, "rect"); b.setAttribute("x", x - step * 0.3); b.setAttribute("width", step * 0.6); b.setAttribute("y", Math.min(y(k[0]), y(k[1]))); b.setAttribute("height", Math.max(2.5, Math.abs(y(k[0]) - y(k[1])))); b.setAttribute("rx", 1.5);
    grp.appendChild(w); grp.appendChild(b); g.appendChild(grp); pts.push([x, y(k[1])]);
  });
  var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
  var line = document.getElementById("splline"); line.setAttribute("d", d);
  var len = line.getTotalLength ? line.getTotalLength() : 600; line.style.setProperty("--len", len); line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
  // the white tick runs along the price line (driven from JS so it follows the real path in every browser)
  var dot = document.getElementById("spldot"), t0dot = performance.now() + 900;
  (function runDot(now) { if (document.getElementById("splash") === null) return; if (now >= t0dot) { var f = ((now - t0dot) % 2600) / 2600, p = line.getPointAtLength(len * f); dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); dot.style.opacity = 1; } requestAnimationFrame(runDot); })(performance.now());
  var msgs = ["warming up the engine ...", "mapping tick data ...", "loading strategies ...", "almost there ..."], mi = 0, stat = document.getElementById("splstat");
  var timer = setInterval(function () { mi = Math.min(mi + 1, msgs.length - 1); stat.textContent = msgs[mi]; }, 520);
  var s = document.getElementById("splash"), t0 = performance.now(), gone = false;
  function leave() { if (gone) return; gone = true; clearInterval(timer); stat.textContent = "ready"; s.classList.add("out"); setTimeout(function () { s.remove(); }, 750); }
  window.hideSplash = function () { var wait = Math.max(0, 2100 - (performance.now() - t0)); setTimeout(leave, wait); };
  s.addEventListener("click", leave);
  if (/[?&]splash=hold/.test(location.search)) { window.hideSplash = function () {}; }   // preview: keep it on screen
  else setTimeout(window.hideSplash, 9000);                                              // safety net if the app never reports ready
})();
