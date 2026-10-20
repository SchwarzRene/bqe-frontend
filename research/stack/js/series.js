// Stack — Simulated price series, the fallback when no real bars are available.
// Classic script: shares one global scope with the other files in js/, so the
// load order in index.html matters.
"use strict";

/* ============================================================
   2. Price series (simulated: the fallback when no real bars are available)
   One deterministic daily series per symbol; weekly, monthly and
   hourly bars are aggregated from it, so a level drawn on one
   timeframe lands in exactly the same place on the others.
   ============================================================ */
function xmur3(str){
  let h = 1779033703 ^ str.length;
  for (let i=0;i<str.length;i++){
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h>>>16), 2246822507);
    h = Math.imul(h ^ (h>>>13), 3266489909);
    return (h ^= h>>>16) >>> 0;
  };
}
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a>>>15), 1 | a);
    t = (t + Math.imul(t ^ (t>>>7), 61 | t)) ^ t;
    return ((t ^ (t>>>14)) >>> 0) / 4294967296;
  };
}
const DAY = 86400000;

function tradingDays(n){
  // n weekday timestamps ending on the most recent weekday (UTC midnight)
  let end = Math.floor(Date.now()/DAY)*DAY;
  let d = new Date(end);
  while (d.getUTCDay()===0 || d.getUTCDay()===6) { end -= DAY; d = new Date(end); }
  const out = new Array(n);
  let t = end;
  for (let i=n-1;i>=0;i--){
    out[i] = t;
    do { t -= DAY; } while (new Date(t).getUTCDay()===0 || new Date(t).getUTCDay()===6);
  }
  return out;
}
const DAY_TIMES = tradingDays(2650);

function buildDaily(sym){
  const seed = xmur3(sym);
  const r = mulberry32(seed());
  const n = DAY_TIMES.length;
  const base = 9 + Math.exp(1 + r()*5.4);         // ~12 to ~630
  const annVol = 0.16 + r()*0.34;
  let drift = (r()-0.30) * 0.20;
  let volMul = 1;
  let anchor = Math.log(base);                     // slow trend the price hugs
  let lp = anchor;
  const bars = new Array(n);
  let nextRegime = 90 + Math.floor(r()*160);
  let nextEvent = 40 + Math.floor(r()*30);

  for (let i=0;i<n;i++){
    if (i === nextRegime){
      volMul = 0.7 + r()*1.1;
      if (r() < 0.32) drift = -drift * (0.4 + r()*1.2);
      nextRegime = i + 90 + Math.floor(r()*170);
    }
    const dv = (annVol*volMul)/Math.sqrt(252);
    const g = Math.sqrt(-2*Math.log(1-r())) * Math.cos(2*Math.PI*r());
    anchor += drift/252;
    const dev = lp - anchor;
    let ret = dv*g - 0.006*dev - (Math.abs(dev) > 0.85 ? 0.05*dev : 0);
    let gap = 0;
    if (i === nextEvent){                          // quarterly report gap
      gap = (r()-0.5) * (0.05 + r()*0.09);
      nextEvent = i + 58 + Math.floor(r()*12);
    }
    const o = Math.exp(lp + gap);
    const c = o * Math.exp(ret);
    const span = Math.abs(c-o) + o*dv*(0.5 + r()*1.4);
    const h = Math.max(o,c) + span*r()*0.6;
    const l = Math.min(o,c) - span*r()*0.6;
    bars[i] = { t: DAY_TIMES[i], o, h: Math.max(h,o,c), l: Math.min(l,o,c), c };
    lp = Math.log(c);
  }
  return bars;
}

function groupBy(daily, keyFn){
  const out = [];
  let cur = null, key = null;
  for (const b of daily){
    const k = keyFn(b.t);
    if (k !== key){
      if (cur) out.push(cur);
      key = k;
      cur = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c };
    } else {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
    }
  }
  if (cur) out.push(cur);
  return out;
}
const weekKey  = t => { const d=new Date(t); const s=t - ((d.getUTCDay()+6)%7)*DAY; return Math.floor(s/DAY); };
const monthKey = t => { const d=new Date(t); return d.getUTCFullYear()*12 + d.getUTCMonth(); };

function buildHourly(sym, daily, days){
  const r = mulberry32(xmur3(sym+"|h1")());
  const src = daily.slice(-days);
  const perDay = 7;                                 // 09:30 -> 16:00 ET
  const out = [];
  for (const d of src){
    const closes = new Array(perDay);
    const bridge = new Array(perDay);
    let acc = 0;
    for (let k=0;k<perDay;k++){ acc += r()-0.5; bridge[k] = acc; }
    for (let k=0;k<perDay;k++){
      const f = (k+1)/perDay;
      const detr = bridge[k] - bridge[perDay-1]*f;
      const v = d.o + (d.c-d.o)*f + detr*(d.h-d.l)*0.42;
      closes[k] = Math.min(d.h, Math.max(d.l, v));
    }
    closes[perDay-1] = d.c;
    let hiK=0, loK=0;
    for (let k=0;k<perDay;k++){
      if (closes[k] > closes[hiK]) hiK = k;
      if (closes[k] < closes[loK]) loK = k;
    }
    for (let k=0;k<perDay;k++){
      const o = k===0 ? d.o : closes[k-1];
      const c = closes[k];
      const w = (d.h-d.l)*0.14*r();
      let h = Math.min(d.h, Math.max(o,c)+w);
      let l = Math.max(d.l, Math.min(o,c)-w);
      if (k===hiK) h = d.h;
      if (k===loK) l = d.l;
      out.push({
        t: d.t + 13.5*3600000 + k*3600000,
        o, c,
        h: Math.max(h,o,c),
        l: Math.min(l,o,c)
      });
    }
  }
  return out;
}

const cache = new Map();
function simSeries(sym){
  let s = cache.get(sym);
  if (s) return s;
  const daily = buildDaily(sym);
  s = {
    D: daily,
    W: groupBy(daily, weekKey),
    M: groupBy(daily, monthKey),
    H1: buildHourly(sym, daily, 55)
  };
  if (cache.size > 90) cache.delete(cache.keys().next().value);
  cache.set(sym, s);
  return s;
}

const TF = [
  { id:"M",  label:"Monthly", bars:96  },
  { id:"W",  label:"Weekly",  bars:130 },
  { id:"D",  label:"Daily",   bars:150 },
  { id:"H1", label:"1 hour",  bars:130 }
];
