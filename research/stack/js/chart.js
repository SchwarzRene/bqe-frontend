// Stack — Chart painting on canvas.
// Classic script: shares one global scope with the other files in js/, so the
// load order in index.html matters.
"use strict";

/* ============================================================
   4. Chart painting
   ============================================================ */
let theme = readTheme();
function readTheme(){
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  return {
    pane:v("--pane"), grid:v("--grid"), fg:v("--fg"), muted:v("--muted"),
    up:v("--up"), down:v("--down"), mark:v("--mark"), rule:v("--rule"),
    focus:v("--focus"), focusSoft:v("--focusSoft")
  };
}
function fmt(p){
  if (p >= 1000) return p.toLocaleString("en-US",{minimumFractionDigits:1,maximumFractionDigits:1});
  if (p >= 100)  return p.toFixed(2);
  return p.toFixed(2);
}
function niceStep(raw){
  const e = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw/e;
  return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*e;
}
function sizeCanvas(cv){
  if (cv._fixed) return true;                       // offscreen export canvas
  const dpr = Math.min(window.devicePixelRatio||1, 2.5);
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return false;
  if (cv.width !== Math.round(w*dpr) || cv.height !== Math.round(h*dpr)){
    cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
  }
  cv._dpr = dpr;
  return true;
}

const RIGHT_PAD = 0.06;        // blank slots after the last bar, as a share of the window
const PSCALE_MIN = 0.25, PSCALE_MAX = 6;

// view: {count, offset, pscale}  offset = bars hidden at the right edge
function paint(cv, bars, view, drawings, opt){
  if (!sizeCanvas(cv)) return;
  const ctx = cv.getContext("2d");
  const dpr = cv._dpr, W = cv.width/dpr, H = cv.height/dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if (opt.bg){ ctx.fillStyle = opt.bg; ctx.fillRect(0,0,W,H); }
  else ctx.clearRect(0,0,W,H);
  const big = !!opt.big;

  const padL = 6, padR = big ? 58 : 46, padT = big ? 12 : 16, padB = big ? 20 : 8;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  if (x1 <= x0 || y1 <= y0) return;

  const total = bars.length;
  const count = Math.max(1, Math.min(view.count, total));
  const off = Math.max(0, Math.min(view.offset, total - count));
  const i1 = total - off, i0 = i1 - count;
  const vis = bars.slice(i0, i1);

  let min = Infinity, max = -Infinity;
  for (const b of vis){ if (b.l<min) min=b.l; if (b.h>max) max=b.h; }
  const span0 = (max-min) || max*0.02 || 1;

  // pull drawn levels into view when they sit near the data
  for (const d of drawings){
    const ps = d.kind === "level" ? [d.price] : [d.p1, d.p2];
    for (const p of ps){
      if (p > min - span0*0.9 && p < max + span0*0.9){
        if (p<min) min=p; if (p>max) max=p;
      }
    }
  }
  const pad = (max-min)*0.07 || max*0.02 || 1;
  min -= pad; max += pad;
  // price-axis zoom: >1 shows a wider range (candles flatten), <1 a tighter one
  const ps = Math.min(PSCALE_MAX, Math.max(PSCALE_MIN, view.pscale || 1));
  if (ps !== 1){
    const mid = (min+max)/2, half = (max-min)/2*ps;
    min = mid-half; max = mid+half;
  }
  const rng = max-min;

  const yOf = p => y0 + (max-p)/rng*(y1-y0);
  const pOf = y => max - (y-y0)/(y1-y0)*rng;
  // A few empty slots after the last bar, so the newest candle is never
  // jammed against the price axis and there is room to draw ahead of it.
  const padBars = Math.max(1, Math.round(count*RIGHT_PAD));
  const cw = (x1-x0)/(count+padBars);
  const xOf = k => x0 + cw*(k+0.5);                 // k = index within view
  const xOfIdx = i => xOf(i - i0);

  function xOfTime(t){
    if (t <= bars[0].t){
      const sp = bars.length>1 ? bars[1].t-bars[0].t : DAY;
      return xOfIdx((t-bars[0].t)/sp);
    }
    if (t >= bars[total-1].t){
      const sp = bars.length>1 ? bars[total-1].t-bars[total-2].t : DAY;
      return xOfIdx(total-1 + (t-bars[total-1].t)/sp);
    }
    let lo=0, hi=total-1;
    while (hi-lo > 1){ const m=(lo+hi)>>1; if (bars[m].t <= t) lo=m; else hi=m; }
    const f = (t-bars[lo].t)/((bars[hi].t-bars[lo].t)||1);
    return xOfIdx(lo+f);
  }
  function timeOfX(x){
    const idx = (x-x0)/cw - 0.5 + i0;
    const lo = Math.max(0, Math.min(total-2, Math.floor(idx)));
    const f = idx - lo;
    return bars[lo].t + (bars[lo+1].t-bars[lo].t)*f;
  }

  // grid + price ladder
  const step = niceStep(rng/ (big?6:3.2));
  ctx.strokeStyle = theme.grid; ctx.lineWidth = 1;
  ctx.fillStyle = theme.muted;
  ctx.font = (big?"11.5px":"10px") + " Archivo, Arial, sans-serif";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  for (let p = Math.ceil(min/step)*step; p < max; p += step){
    const y = Math.round(yOf(p)) + .5;
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
    ctx.fillText(fmt(p), x1+6, y);
  }

  if (big){
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    const every = Math.max(1, Math.round(count/5));
    for (let k=0;k<count;k+=every){
      const d = new Date(vis[k].t);
      const lbl = opt.tf === "H1"
        ? (d.getUTCMonth()+1)+"/"+d.getUTCDate()+" "+String(d.getUTCHours()).padStart(2,"0")+":"+String(d.getUTCMinutes()).padStart(2,"0")
        : opt.tf === "M" ? d.toLocaleString("en-US",{month:"short",timeZone:"UTC"})+" "+String(d.getUTCFullYear()).slice(2)
        : (d.getUTCMonth()+1)+"/"+d.getUTCDate()+"/"+String(d.getUTCFullYear()).slice(2);
      ctx.fillText(lbl, xOf(k), H-6);
    }
  }

  // where the faster timeframes are currently looking
  const bands = [];
  if (opt.ranges){
    for (const rg of opt.ranges){
      let a = xOfTime(rg.t0), b = xOfTime(rg.t1);
      if (b < a){ const s = a; a = b; b = s; }
      if (b <= x0 || a >= x1) continue;
      a = Math.max(x0, a); b = Math.min(x1, b);
      if (b-a < 3){ const m = (a+b)/2; a = Math.max(x0, m-1.5); b = Math.min(x1, m+1.5); }
      bands.push({ a, b, label: rg.label });
      ctx.fillStyle = theme.focusSoft;
      ctx.fillRect(a, y0, b-a, y1-y0);
      ctx.strokeStyle = theme.focus; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(a)+.5, y0); ctx.lineTo(Math.round(a)+.5, y1);
      ctx.moveTo(Math.round(b)+.5, y0); ctx.lineTo(Math.round(b)+.5, y1);
      ctx.stroke();
    }
  }

  /* Candles.
     Everything is snapped to whole device pixels: a body drawn on a
     fractional boundary is spread across two columns by the rasteriser, which
     at small pane sizes turns a row of candles into a grey smear of varying
     widths. Bodies and wicks go into one path per direction, so a pane costs
     two fills instead of four state changes per bar.
     Below ~1.6px per bar there is no room for a body at all — those draw as
     high-low bars, which is what the pixels can actually carry. */
  const px = 1/dpr;
  const snap = v => Math.round(v*dpr)/dpr;
  const dense = cw < 1.6;
  const bodyW = Math.max(px, Math.min(16, Math.round(cw*0.62*dpr)/dpr));
  const wickW = cw >= 5 ? Math.max(px, Math.round(bodyW*0.2*dpr)/dpr) : px;
  const upPath = new Path2D(), downPath = new Path2D();
  for (let k=0;k<count;k++){
    const b = vis[k], up = b.c >= b.o;
    const path = up ? upPath : downPath;
    const x = snap(xOf(k));
    const yh = snap(yOf(b.h)), yl = snap(yOf(b.l));
    path.rect(snap(x-wickW/2), yh, wickW, Math.max(px, yl-yh));
    if (dense) continue;
    const top = snap(Math.min(yOf(b.o), yOf(b.c)));
    const bot = snap(Math.max(yOf(b.o), yOf(b.c)));
    path.rect(snap(x-bodyW/2), top, bodyW, Math.max(px, bot-top));
  }
  ctx.fillStyle = theme.up;   ctx.fill(upPath);
  ctx.fillStyle = theme.down; ctx.fill(downPath);

  if (bands.length){
    ctx.font = (big?"10.5px":"9px") + " Archivo, Arial, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const bd of bands){
      if (bd.b-bd.a < 24) continue;
      const cx = (bd.a+bd.b)/2, tw = ctx.measureText(bd.label).width;
      ctx.fillStyle = theme.pane;
      ctx.fillRect(cx-tw/2-3, y0+1, tw+6, 12);
      ctx.fillStyle = theme.focus;
      ctx.fillText(bd.label, cx, y0+2);
    }
  }

  // last price marker
  const last = vis[count-1];
  const lastUp = last.c >= vis[0].o;
  const ly = Math.round(yOf(last.c))+.5;
  ctx.setLineDash([2,3]);
  ctx.strokeStyle = lastUp ? theme.up : theme.down;
  ctx.beginPath(); ctx.moveTo(x0,ly); ctx.lineTo(x1,ly); ctx.stroke();
  ctx.setLineDash([]);
  const tag = fmt(last.c), tw = ctx.measureText(tag).width + 10;
  ctx.fillStyle = lastUp ? theme.up : theme.down;
  ctx.fillRect(x1+2, ly-8, Math.min(tw, padR-4), 16);
  ctx.fillStyle = theme.pane;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(tag, x1+7, ly);

  // drawn lines
  ctx.lineWidth = 1.6;
  for (const d of drawings){
    ctx.strokeStyle = theme.mark; ctx.fillStyle = theme.mark;
    if (d.kind === "level"){
      const y = yOf(d.price);
      if (y < y0-2 || y > y1+2) continue;
      ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = (big?"11px":"9.5px")+" Archivo, Arial, sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillText(fmt(d.price), x0+4, y-2);
    } else {
      const ax = xOfTime(d.t1), ay = yOf(d.p1);
      const bx = xOfTime(d.t2), by = yOf(d.p2);
      if (Math.abs(bx-ax) < 0.01) continue;
      const m = (by-ay)/(bx-ax);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0,y0,x1-x0,y1-y0); ctx.clip();
      ctx.beginPath();
      ctx.moveTo(x0, ay + m*(x0-ax));
      ctx.lineTo(x1, ay + m*(x1-ax));
      ctx.stroke();
      ctx.restore();
    }
  }

  // preview while a trend line is being placed
  if (opt.preview){
    const p = opt.preview;
    ctx.strokeStyle = theme.mark; ctx.setLineDash([4,4]); ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(xOfTime(p.t1), yOf(p.p1));
    ctx.lineTo(xOfTime(p.t2), yOf(p.p2));
    ctx.stroke(); ctx.setLineDash([]);
  }

  if (opt.title){
    ctx.fillStyle = theme.fg;
    ctx.font = "600 17px Archivo, Arial, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(opt.title, x0+8, y0+4);
  }

  cv._geom = { x0,x1,y0,y1,min,max,i0,i1,count,cw,padR,yOf,pOf,xOfTime,timeOfX,total };
}

/* which slice of time a view is showing, and how that maps onto slower charts */
const SPEED = ["H1","D","W","M"];                   // fastest to slowest
const TFNAME = { H1:"1H", D:"Daily", W:"Weekly", M:"Monthly" };

function visibleSpan(bars, view){
  const total = bars.length;
  const count = Math.max(1, Math.min(view.count, total));
  const off = Math.max(0, Math.min(view.offset, total-count));
  const i1 = total-off, i0 = i1-count;
  const gap = total > 1 ? bars[total-1].t - bars[total-2].t : DAY;
  return { t0: bars[i0].t, t1: i1 < total ? bars[i1].t : bars[total-1].t + gap };
}
function rangesFor(sym, tf, views){
  if (!state.locator) return null;
  const depth = SPEED.indexOf(tf);
  if (depth <= 0) return null;
  const s = series(sym);
  if (!s) return null;
  const out = [];
  for (let i = 0; i < depth; i++){
    const id = SPEED[i];
    const sp = visibleSpan(s[id], views[id]);
    out.push({ t0: sp.t0, t1: sp.t1, label: TFNAME[id] });
  }
  return out;
}
function defaultViews(){
  const v = {};
  TF.forEach(t => { v[t.id] = { count: t.bars, offset: 0, pscale: 1 }; });
  return v;
}

function chg(bars){
  const a = bars[bars.length-2], b = bars[bars.length-1];
  if (!a) return 0;
  return (b.c-a.c)/a.c*100;
}
