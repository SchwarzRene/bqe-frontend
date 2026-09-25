// The company window: opens from My companies with everything there is on
// one company — the price chart with averages and volume, performance and
// risk figures, valuation and balance-sheet numbers, analyst consensus,
// earnings, the AI analyst's note and the headlines about it.
//
// Data: /api/market/candles and /api/market/quote (prices), /api/market/profile
// (Yahoo fundamentals), /api/company/analysis (the AI note; signed-in users).
// Everything is drawn as inline SVG; nothing is loaded before the window opens.

import { ago, esc, hlImp, safeUrl } from './format.js';
import { session, signIn } from './chat.js';
import { briefing, byHeadlineImportance, items } from './state.js';

const RANGES = {
  '1D': { interval: '5m', days: 5, lastSession: true },
  '5D': { interval: '30m', days: 8 },
  '1M': { daily: 31 },
  '6M': { daily: 183 },
  '1Y': { daily: 366 },
  '5Y': { interval: '1wk', days: 5 * 366 },
};

const az = {
  open: false,
  company: null, // {symbol, name}
  range: '1Y',
  quote: null,
  profile: null, // object | {error}
  daily: null, // two years of daily bars | {error}
  bars: {}, // range -> bars | {error}, for the intraday and weekly ranges
  note: null, // stored analysis | null
  noteState: 'idle', // idle | checking | writing | error
  noteError: '',
  showAllHeads: false,
};
let el = null;

// --------------------------------------------------------------------------
// data
// --------------------------------------------------------------------------

async function getJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || 'status ' + res.status), { status: res.status });
  return body;
}

const now = () => Math.floor(Date.now() / 1000);
const candlesUrl = (symbol, interval, days) =>
  `/api/market/candles?ticker=${encodeURIComponent(symbol)}&interval=${interval}&period1=${now() - days * 86400}&period2=${now()}`;

function lastSession(bars) {
  for (let i = bars.length - 1; i > 0; i--) if (bars[i].time - bars[i - 1].time > 3 * 3600) return bars.slice(i);
  return bars;
}

async function loadRange(symbol, range) {
  const r = RANGES[range];
  if (r.daily || az.bars[range]) return;
  try {
    const body = await getJson(candlesUrl(symbol, r.interval, r.days));
    az.bars[range] = r.lastSession ? lastSession(body.candles || []) : body.candles || [];
  } catch (err) {
    az.bars[range] = { error: err.message };
  }
}

async function load(c) {
  const sym = c.symbol;
  const done = () => { if (az.open && az.company && az.company.symbol === sym) render(); };
  getJson('/api/market/quote?ticker=' + encodeURIComponent(sym)).then((q) => { az.quote = q; }, () => { az.quote = null; }).then(done);
  getJson(candlesUrl(sym, '1d', 740)).then((b) => { az.daily = b.candles || []; }, (err) => { az.daily = { error: err.message }; }).then(done);
  getJson('/api/market/profile?ticker=' + encodeURIComponent(sym)).then((p) => { az.profile = p; }, (err) => { az.profile = { error: err.message }; }).then(done);
  loadRange(sym, az.range).then(done);
  loadNote(false);
}

/** The AI note: the stored one on open, a new one when asked. Signed-in users only. */
async function loadNote(write) {
  const c = az.company;
  if (!session.user) { az.noteState = 'idle'; render(); return; }
  az.noteState = write ? 'writing' : 'checking';
  az.noteError = '';
  render();
  try {
    const body = write
      ? await getJson('/api/company/analysis', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: c.symbol, name: c.name }) })
      : await getJson('/api/company/analysis?ticker=' + encodeURIComponent(c.symbol), { credentials: 'same-origin' });
    if (az.company !== c) return;
    az.note = body.analysis ? body : null;
    az.noteState = 'idle';
  } catch (err) {
    if (az.company !== c) return;
    az.noteState = 'error';
    az.noteError = err.status === 401 ? 'Your session has ended. Sign in again for the AI analysis.' : err.message;
  }
  render();
}

// --------------------------------------------------------------------------
// numbers
// --------------------------------------------------------------------------

const fmtNum = (v, d = 2) => (v == null ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtPct = (v, d = 1, sign = true) => (v == null ? '–' : `${sign && v > 0 ? '+' : ''}${(v * 100).toFixed(d)}%`);
function fmtBig(v) {
  if (v == null) return '–';
  const a = Math.abs(v);
  const [n, u] = a >= 1e12 ? [v / 1e12, 'T'] : a >= 1e9 ? [v / 1e9, 'B'] : a >= 1e6 ? [v / 1e6, 'M'] : a >= 1e3 ? [v / 1e3, 'K'] : [v, ''];
  return n.toLocaleString('en-US', { maximumFractionDigits: a >= 1e3 && Math.abs(n) < 100 ? 1 : 0 }) + u;
}
const cls = (v) => (v == null ? '' : v >= 0 ? 'pos' : 'neg');
const dailyBars = () => (Array.isArray(az.daily) ? az.daily : []);

/** The same figures the analyst gets (worker/news/analyst.ts priceStats), from a year of daily bars. */
function stats() {
  const all = dailyBars();
  if (all.length < 2) return null;
  const lastT = all[all.length - 1].time;
  const bars = all.filter((b) => b.time >= lastT - 366 * 86400);
  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const back = (days) => { const b = bars.find((x) => x.time >= lastT - days * 86400); return b && b !== bars[bars.length - 1] ? last / b.close - 1 : null; };
  const year = new Date(lastT * 1000).getUTCFullYear();
  const jan = bars.find((b) => new Date(b.time * 1000).getUTCFullYear() === year);
  const logs = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  const sd = Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, logs.length - 1));
  let peak = closes[0], worst = 0;
  closes.forEach((c) => { peak = Math.max(peak, c); worst = Math.min(worst, c / peak - 1); });
  const ma = (n) => (all.length >= n ? all.slice(-n).reduce((a, b) => a + b.close, 0) / n : null);
  const vols = bars.map((b) => b.volume || 0);
  const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const recent = vols.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, vols.length);
  return {
    last,
    returns: [['1W', back(7)], ['1M', back(30)], ['3M', back(91)], ['6M', back(182)], ['YTD', jan && jan !== bars[bars.length - 1] ? last / jan.close - 1 : null], ['1Y', back(365) ?? last / closes[0] - 1]],
    volatility: logs.length > 10 ? sd * Math.sqrt(252) : null,
    maxDrawdown: worst,
    high: Math.max(...closes), low: Math.min(...closes),
    fromHigh: last / Math.max(...closes) - 1,
    vsMa50: ma(50) ? last / ma(50) - 1 : null,
    vsMa200: ma(200) ? last / ma(200) - 1 : null,
    volumeVsAvg: avgVol ? recent / avgVol - 1 : null,
    avgVolume: avgVol,
  };
}

/** Moving average of the closes, aligned to `bars`, taken over the full daily history. */
function movingAverage(bars, n) {
  const all = dailyBars();
  const idx = new Map(all.map((b, i) => [b.time, i]));
  let sum = 0;
  const prefix = [0];
  all.forEach((b) => { sum += b.close; prefix.push(sum); });
  return bars.map((b) => {
    const i = idx.get(b.time);
    return i != null && i + 1 >= n ? (prefix[i + 1] - prefix[i + 1 - n]) / n : null;
  });
}

// --------------------------------------------------------------------------
// charts
// --------------------------------------------------------------------------

function barsFor(range) {
  const r = RANGES[range];
  if (r.daily) {
    const all = dailyBars();
    if (!all.length) return az.daily && az.daily.error ? az.daily : null;
    const lastT = all[all.length - 1].time;
    return all.filter((b) => b.time >= lastT - r.daily * 86400);
  }
  return az.bars[range] || null;
}

/** The main chart: close as a line with area, 50/200-day averages, volume below. */
function priceChart() {
  const bars = barsFor(az.range);
  const W = 760, H = 260, VH = 56, PAD = 6;
  if (!bars) return `<div class="az-chart az-wait">Loading the chart…</div>`;
  if (bars.error || bars.length < 2) return `<div class="az-chart az-wait">${bars.error ? 'No chart: ' + esc(bars.error) : 'No trades in this range yet.'}</div>`;
  const closes = bars.map((b) => b.close);
  const daily = !!RANGES[az.range].daily;
  const ma50 = daily ? movingAverage(bars, 50) : [];
  const ma200 = daily ? movingAverage(bars, 200) : [];
  const q = az.quote;
  const base = az.range === '1D' && q && q.previous_close ? q.previous_close : closes[0];
  const vals = closes.concat(ma50.filter((v) => v != null), ma200.filter((v) => v != null), [base]);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (i) => PAD + (i / (bars.length - 1)) * (W - 2 * PAD);
  const y = (v) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
  const path = (arr) => arr.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join('L');
  const line = 'M' + path(closes);
  const up = closes[closes.length - 1] >= base;
  const vmax = Math.max(...bars.map((b) => b.volume || 0)) || 1;
  const bw = Math.max(1, (W - 2 * PAD) / bars.length - 1);
  const grid = [0.25, 0.5, 0.75].map((f) => { const v = min + span * (1 - f); return `<line class="g" x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="gl" x="${W - 4}" y="${y(v) - 4}" text-anchor="end">${fmtNum(v)}</text>`; }).join('');
  return `<div class="az-chart" data-az-chart>
    <svg class="az-svg ${up ? 'up' : 'down'}" viewBox="0 0 ${W} ${H + VH + 8}" preserveAspectRatio="none" role="img" aria-label="${esc(az.company.symbol)} price, ${az.range}">
      <defs><linearGradient id="azg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".28"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      ${grid}
      <line class="base" x1="0" x2="${W}" y1="${y(base)}" y2="${y(base)}"/>
      <path d="${line}L${x(bars.length - 1)},${H}L${x(0)},${H}Z" fill="url(#azg)"/>
      ${ma200.some((v) => v != null) ? `<path class="ma ma200" d="M${path(ma200)}"/>` : ''}
      ${ma50.some((v) => v != null) ? `<path class="ma ma50" d="M${path(ma50)}"/>` : ''}
      <path class="px" d="${line}"/>
      <g class="vol">${bars.map((b, i) => { const h = ((b.volume || 0) / vmax) * VH; return `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(H + 8 + VH - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" class="${i && b.close < bars[i - 1].close ? 'dn' : ''}"/>`; }).join('')}</g>
      <line class="cross" x1="0" x2="0" y1="0" y2="${H + VH + 8}" style="display:none"/>
    </svg>
    <div class="az-tip" hidden></div>
    <div class="az-legend">
      <span><i class="lk px"></i>Close</span>
      ${ma50.some((v) => v != null) ? '<span><i class="lk ma50"></i>50-day avg</span>' : ''}
      ${ma200.some((v) => v != null) ? '<span><i class="lk ma200"></i>200-day avg</span>' : ''}
      <span><i class="lk vol"></i>Volume</span>
      <span class="meta">${esc(axisDate(bars[0].time))} – ${esc(axisDate(bars[bars.length - 1].time))}</span>
    </div>
  </div>`;
}

function axisDate(t) {
  const opts = ['1D', '5D'].includes(az.range) ? { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : { day: 'numeric', month: 'short', year: '2-digit' };
  return new Intl.DateTimeFormat('en-GB', opts).format(new Date(t * 1000));
}

/** Pointer (mouse or finger) over the chart: a crosshair and the bar's figures. */
function chartPointer(e) {
  const box = e.target.closest('[data-az-chart]');
  if (!box) return;
  const bars = barsFor(az.range);
  if (!Array.isArray(bars) || bars.length < 2) return;
  const svg = box.querySelector('svg');
  const r = svg.getBoundingClientRect();
  const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const i = Math.round(f * (bars.length - 1));
  const b = bars[i];
  const W = 760, PAD = 6;
  const cross = svg.querySelector('.cross');
  const cx = PAD + (i / (bars.length - 1)) * (W - 2 * PAD);
  cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.display = '';
  const tip = box.querySelector('.az-tip');
  const prev = i ? bars[i - 1].close : null;
  tip.hidden = false;
  tip.innerHTML = `<b>${esc(axisDate(b.time))}</b> ${fmtNum(b.close)}${prev ? ` <span class="${cls(b.close / prev - 1)}">${fmtPct(b.close / prev - 1, 2)}</span>` : ''}<br><span class="meta">Vol ${fmtBig(b.volume)}</span>`;
  const left = (cx / W) * r.width;
  tip.style.left = Math.min(r.width - tip.offsetWidth, Math.max(0, left - tip.offsetWidth / 2)) + 'px';
}
function chartLeave(e) {
  const box = e.target.closest('[data-az-chart]');
  if (!box) return;
  const cross = box.querySelector('.cross');
  if (cross) cross.style.display = 'none';
  const tip = box.querySelector('.az-tip');
  if (tip) tip.hidden = true;
}

/** A horizontal range (52-week, analyst targets) with markers. */
function rangeBar(label, lo, hi, marks) {
  if (lo == null || hi == null || hi <= lo) return '';
  const pos = (v) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  return `<div class="az-range">
    <div class="az-range-h"><span>${esc(label)}</span><span class="meta">${fmtNum(lo)} – ${fmtNum(hi)}</span></div>
    <div class="az-track">${marks.filter((m) => m.v != null).map((m) => `<span class="az-mark ${m.cls}" style="left:${pos(m.v)}%" title="${esc(m.label)} ${fmtNum(m.v)}"><i></i><em>${esc(m.label)}</em></span>`).join('')}</div>
  </div>`;
}

function performance(s) {
  if (!s) return '';
  const max = Math.max(0.05, ...s.returns.map(([, v]) => Math.abs(v || 0)));
  return `<section class="az-card">
    <h3 class="az-h">Performance</h3>
    <div class="az-perf">${s.returns.map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="bar"><i class="${cls(v)}" style="${v == null ? '' : `${v >= 0 ? 'left:50%' : `right:50%`};width:${(Math.abs(v) / max) * 50}%`}"></i></span><span class="v ${cls(v)}">${fmtPct(v)}</span></div>`).join('')}</div>
    <h3 class="az-h" style="margin-top:14px">Risk and trend</h3>
    <div class="az-kv">
      ${kv('Volatility (1y, annualised)', fmtPct(s.volatility, 1, false))}
      ${kv('Max drawdown (1y)', fmtPct(s.maxDrawdown), cls(s.maxDrawdown))}
      ${kv('From 1-year high', fmtPct(s.fromHigh), cls(s.fromHigh))}
      ${kv('vs. 50-day average', fmtPct(s.vsMa50), cls(s.vsMa50))}
      ${kv('vs. 200-day average', fmtPct(s.vsMa200), cls(s.vsMa200))}
      ${kv('Volume, last 5 days vs. average', fmtPct(s.volumeVsAvg), cls(s.volumeVsAvg))}
    </div>
  </section>`;
}

const kv = (k, v, c = '') => (v === '–' ? '' : `<div><span>${esc(k)}</span><b class="${c}">${esc(v)}</b></div>`);

function figures(p, s) {
  if (!p || p.error) return `<section class="az-card"><h3 class="az-h">Key figures</h3><p class="meta">${p && p.error ? 'Company figures are unavailable right now.' : 'Loading…'}</p></section>`;
  const st = p.stats || {};
  const cur = p.currency || '';
  const last = az.quote && az.quote.price != null ? az.quote.price : s && s.last;
  return `<section class="az-card">
    <h3 class="az-h">Key figures</h3>
    <div class="az-kv">
      ${kv('Market cap', st.marketCap != null ? `${fmtBig(st.marketCap)} ${cur}` : '–')}
      ${kv('P/E (trailing)', st.trailingPE != null ? fmtNum(st.trailingPE, 1) : '–')}
      ${kv('P/E (forward)', st.forwardPE != null ? fmtNum(st.forwardPE, 1) : '–')}
      ${kv('PEG', st.pegRatio != null ? fmtNum(st.pegRatio, 2) : '–')}
      ${kv('Price / book', st.priceToBook != null ? fmtNum(st.priceToBook, 1) : '–')}
      ${kv('Dividend yield', fmtPct(st.dividendYield, 2, false))}
      ${kv('Beta', st.beta != null ? fmtNum(st.beta, 2) : '–')}
      ${kv('Revenue (ttm)', st.revenue != null ? `${fmtBig(st.revenue)} ${cur}` : '–')}
      ${kv('Revenue growth', fmtPct(st.revenueGrowth), cls(st.revenueGrowth))}
      ${kv('Earnings growth', fmtPct(st.earningsGrowth), cls(st.earningsGrowth))}
      ${kv('Gross margin', fmtPct(st.grossMargin, 1, false))}
      ${kv('Operating margin', fmtPct(st.operatingMargin, 1, false))}
      ${kv('Profit margin', fmtPct(st.profitMargin, 1, false))}
      ${kv('Return on equity', fmtPct(st.returnOnEquity, 1, false))}
      ${kv('Debt / equity', st.debtToEquity != null ? fmtNum(st.debtToEquity / 100, 2) : '–')}
      ${kv('Current ratio', st.currentRatio != null ? fmtNum(st.currentRatio, 2) : '–')}
      ${kv('Free cash flow', st.freeCashflow != null ? `${fmtBig(st.freeCashflow)} ${cur}` : '–', cls(st.freeCashflow))}
      ${kv('Cash / debt', st.totalCash != null && st.totalDebt != null ? `${fmtBig(st.totalCash)} / ${fmtBig(st.totalDebt)}` : '–')}
      ${kv('Short interest', fmtPct(st.shortPercent, 1, false))}
      ${kv('Avg. volume', st.avgVolume != null ? fmtBig(st.avgVolume) : '–')}
    </div>
    ${rangeBar('52-week range', st.low52 ?? (s && s.low), st.high52 ?? (s && s.high), [{ v: last, label: 'Now', cls: 'now' }, { v: st.avg200, label: '200d', cls: 'avg' }])}
  </section>`;
}

function analysts(p) {
  if (!p || p.error) return '';
  const a = p.analysts || {};
  const t = a.trend;
  const total = t ? t.strongBuy + t.buy + t.hold + t.sell + t.strongSell : 0;
  if (!total && a.targetMean == null) return '';
  const last = az.quote && az.quote.price;
  const seg = t ? [['strongBuy', 'Strong buy'], ['buy', 'Buy'], ['hold', 'Hold'], ['sell', 'Sell'], ['strongSell', 'Strong sell']] : [];
  return `<section class="az-card">
    <h3 class="az-h">Wall Street analysts</h3>
    <p class="meta" style="margin-bottom:10px">${a.count ? `${a.count} analysts` : 'Analysts'}${a.recommendation ? ` · consensus <b class="az-rec">${esc(a.recommendation.replace('_', ' '))}</b>` : ''}. Their view, not ours.</p>
    ${total ? `<div class="az-stack">${seg.map(([k, l]) => (t[k] ? `<i class="${k}" style="flex:${t[k]}" title="${l}: ${t[k]}"><span>${t[k]}</span></i>` : '')).join('')}</div>
      <div class="az-stack-l">${seg.map(([k, l]) => `<span><i class="${k}"></i>${l} ${t[k]}</span>`).join('')}</div>` : ''}
    ${rangeBar('Price targets', Math.min(a.targetLow ?? Infinity, last ?? Infinity), Math.max(a.targetHigh ?? -Infinity, last ?? -Infinity), [{ v: last, label: 'Now', cls: 'now' }, { v: a.targetMean, label: 'Mean target', cls: 'target' }, { v: a.targetLow, label: 'Low', cls: 'lo' }, { v: a.targetHigh, label: 'High', cls: 'hi' }])}
  </section>`;
}

function earnings(p) {
  if (!p || p.error) return '';
  const e = p.earnings || {};
  const qs = (e.quarterly || []).filter((q) => q.actual != null || q.estimate != null);
  const ys = (e.yearly || []).filter((y) => y.revenue != null);
  if (!qs.length && !ys.length && !(e.next || []).length) return '';
  const qv = qs.flatMap((q) => [q.actual, q.estimate]).filter((v) => v != null);
  // Fit the scale to the figures, with room around them; zero only when a quarter was a loss.
  const lo = Math.min(...qv), hi = Math.max(...qv), pad = (hi - lo || Math.abs(hi) || 1) * 0.25;
  const qmin = lo < 0 ? Math.min(0, lo - pad) : lo - pad, qmax = hi + pad, qspan = qmax - qmin || 1;
  const W = 320, H = 120;
  const qx = (i) => 24 + (i / Math.max(1, qs.length - 1)) * (W - 48);
  const qy = (v) => 10 + (1 - (v - qmin) / qspan) * (H - 30);
  const ymax = Math.max(...ys.map((y) => y.revenue), 1);
  const nextDate = (e.next || [])[0];
  return `<section class="az-card">
    <h3 class="az-h">Earnings</h3>
    ${nextDate ? `<p class="az-next">Next report: <b>${esc(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(nextDate)))}</b>${e.epsEstimate != null ? ` · EPS estimate ${fmtNum(e.epsEstimate)}` : ''}${e.revenueEstimate != null ? ` · revenue estimate ${fmtBig(e.revenueEstimate)}` : ''}</p>` : ''}
    <div class="az-two">
      ${qs.length ? `<div><div class="meta">EPS per quarter: actual vs. estimate</div>
        <svg class="az-eps" viewBox="0 0 ${W} ${H}" role="img" aria-label="EPS per quarter">
          ${qmin < 0 ? `<line class="g" x1="0" x2="${W}" y1="${qy(0)}" y2="${qy(0)}"/>` : ''}
          ${qs.map((q, i) => `${q.estimate != null ? `<circle class="est" cx="${qx(i)}" cy="${qy(q.estimate)}" r="6"/>` : ''}${q.actual != null ? `<circle class="act ${q.estimate != null ? (q.actual >= q.estimate ? 'beat' : 'miss') : ''}" cx="${qx(i)}" cy="${qy(q.actual)}" r="5"><title>${esc(q.quarter)}: ${q.actual}${q.estimate != null ? ` vs. ${q.estimate}` : ''}</title></circle>` : ''}<text x="${qx(i)}" y="${H - 4}" text-anchor="middle">${esc(q.quarter)}</text>`).join('')}
        </svg>
        <div class="az-stack-l"><span><i class="beat"></i>Beat</span><span><i class="miss"></i>Missed</span><span><i class="est"></i>Estimate</span></div></div>` : ''}
      ${ys.length ? `<div><div class="meta">Revenue and earnings per year</div>
        <div class="az-years">${ys.map((y) => `<div class="col"><div class="bars"><i class="rev" style="height:${(y.revenue / ymax) * 100}%" title="Revenue ${fmtBig(y.revenue)}"></i><i class="earn ${y.earnings < 0 ? 'neg' : ''}" style="height:${(Math.abs(y.earnings || 0) / ymax) * 100}%" title="Earnings ${fmtBig(y.earnings)}"></i></div><span>${esc(y.year)}</span><small>${fmtBig(y.revenue)}</small></div>`).join('')}</div>
        <div class="az-stack-l"><span><i class="rev"></i>Revenue</span><span><i class="earn"></i>Earnings</span></div></div>` : ''}
    </div>
  </section>`;
}

// --------------------------------------------------------------------------
// the AI note, headlines, about
// --------------------------------------------------------------------------

const TONE = { positive: ['Positive', 'pos'], mixed: ['Mixed', 'mixed'], negative: ['Negative', 'neg'], quiet: ['Quiet', 'quiet'] };

function note() {
  const head = `<div class="az-ai-h"><h3 class="az-h"><span aria-hidden="true">🧠</span> AI analyst</h3>`;
  if (!session.user) {
    return `<section class="az-card az-ai">${head}</div>
      <p>An analyst's note on this company, written by AI from the prices, figures, analyst consensus and the week's headlines: what is driving it, what to expect, catalysts, risks and what to watch.</p>
      <button type="button" class="btn primary" data-az-signin>Sign in to read it</button></section>`;
  }
  if (az.noteState === 'checking') return `<section class="az-card az-ai">${head}</div><p class="meta">Looking for today’s note…</p></section>`;
  if (az.noteState === 'writing') {
    return `<section class="az-card az-ai">${head}</div><div class="az-skel"><i></i><i></i><i></i><i style="width:60%"></i></div><p class="meta">The analyst is reading the numbers and headlines. This takes a few seconds.</p></section>`;
  }
  const n = az.note;
  if (!n) {
    return `<section class="az-card az-ai">${head}</div>
      <p>Get a short note on ${esc(az.company.name)}: what is driving it, what to expect, the catalysts and risks, and what to watch.</p>
      ${az.noteState === 'error' ? `<p class="az-err">${esc(az.noteError)}</p>` : ''}
      <button type="button" class="btn primary" data-az-write>Write the analysis</button>
      <p class="meta" style="margin-top:8px">Uses one of your daily AI requests. The note is kept for six hours and shared with everyone who opens ${esc(az.company.symbol)}.</p></section>`;
  }
  const a = n.analysis;
  const [toneLabel, toneCls] = TONE[a.tone] || TONE.mixed;
  const lst = (title, emoji, arr) => (arr && arr.length ? `<div class="az-list"><h4><span aria-hidden="true">${emoji}</span> ${title}</h4><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
  return `<section class="az-card az-ai">${head}<span class="az-tone ${toneCls}">News and price tone: ${toneLabel}</span></div>
    <p class="az-sum">${esc(a.summary)}</p>
    <div class="az-lists">
      ${lst('What to expect', '🔭', a.expect)}
      ${lst('Catalysts', '🚀', a.catalysts)}
      ${lst('Risks', '⚠️', a.risks)}
      ${lst('Watch', '👁️', a.watch)}
    </div>
    ${a.sources && a.sources.length ? `<div class="az-src">${a.sources.map((s) => `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener" title="${esc(s.title)}">${esc(s.label)} ↗</a>`).join('')}</div>` : ''}
    <p class="meta az-foot">Written ${esc(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', day: 'numeric', month: 'short' }).format(new Date(n.generatedAt)))} by AI from prices, figures and headlines. It can be wrong or miss context. Not investment advice.</p>
  </section>`;
}

/** Headlines about the company: the briefing's own first, then any with its ticker or name. */
export function headlinesAbout(c) {
  const entry = ((briefing() && briefing().companies) || []).find((x) => x.ticker === c.symbol);
  const cited = new Set(entry ? entry.ids : []);
  const word = String(c.name || '').replace(/\b(inc|corp|corporation|group|holdings?|plc|ag|se|sa|nv|co|ltd|limited|company)\b\.?/gi, '').trim();
  const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameRe = word.length >= 3 && word.toUpperCase() !== c.symbol ? new RegExp(`\\b${escRe(word)}\\b`, 'i') : null;
  const base = c.symbol.split('.')[0];
  const tickerRe = base.length >= 3 ? new RegExp(`\\b${escRe(base)}\\b`) : null;
  return items()
    .filter((i) => cited.has(i.id) || (i.tickers || []).includes(c.symbol) || (nameRe && nameRe.test(i.title)) || (tickerRe && tickerRe.test(i.title)))
    .sort((a, b) => (cited.has(b.id) - cited.has(a.id)) || byHeadlineImportance(a, b));
}

function headlines() {
  const all = headlinesAbout(az.company);
  const entry = ((briefing() && briefing().companies) || []).find((x) => x.ticker === az.company.symbol);
  const shown = az.showAllHeads ? all : all.slice(0, 5);
  return `<section class="az-card">
    <h3 class="az-h">Headlines, last 24 hours <span class="meta">${all.length}</span></h3>
    ${entry && entry.line ? `<p class="az-line"><span class="co-news" aria-hidden="true"></span><span><b>Today’s briefing:</b> ${esc(entry.line)}</span></p>` : ''}
    ${all.length ? `<div class="az-heads">${shown.map((i) => `<a href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener"><span class="t">${esc(i.title)}</span><span class="m">${hlImp(i)}${esc(i.source)} · ${esc(ago(i.publishedAt))} ↗</span></a>`).join('')}</div>
      ${all.length > shown.length ? `<button type="button" class="linkish" data-az-more>Show all ${all.length}</button>` : ''}` : '<p class="meta">No headlines about it in the last 24 hours.</p>'}
  </section>`;
}

function about(p) {
  if (!p || p.error || !p.summary) return '';
  return `<section class="az-card">
    <h3 class="az-h">About</h3>
    <details class="az-about"><summary>${esc(p.summary.slice(0, 220))}${p.summary.length > 220 ? '… <span class="linkish">more</span>' : ''}</summary><p>${esc(p.summary)}</p></details>
    <div class="az-kv" style="margin-top:10px">
      ${kv('Sector', p.sector || '–')}${kv('Industry', p.industry || '–')}${kv('Country', p.country || '–')}
      ${kv('Employees', p.employees != null ? p.employees.toLocaleString('en-US') : '–')}
    </div>
    ${p.website ? `<a class="more-link" href="${esc(safeUrl(p.website))}" target="_blank" rel="noopener">${esc(p.website.replace(/^https?:\/\//, ''))} ↗</a>` : ''}
  </section>`;
}

// --------------------------------------------------------------------------
// the window
// --------------------------------------------------------------------------

function render() {
  if (!el || !az.open) return;
  const c = az.company;
  const p = az.profile && !az.profile.error ? az.profile : null;
  const q = az.quote;
  const s = stats();
  const dayCh = q && q.previous_close ? q.price / q.previous_close - 1 : null;
  const scroll = el.querySelector('.az-body') ? el.querySelector('.az-body').scrollTop : 0;
  el.innerHTML = `
    <div class="az-backdrop" data-az-close></div>
    <div class="az-panel" role="dialog" aria-modal="true" aria-labelledby="az-h">
      <header class="az-head">
        <div class="az-title">
          <h2 id="az-h"><span class="sym">${esc(c.symbol)}</span> ${esc((p && p.name) || c.name)}</h2>
          <p class="meta">${esc([p && p.sector, p && p.industry, (p && p.exchange) || (q && q.exchange)].filter(Boolean).join(' · ') || 'Loading…')}</p>
        </div>
        <div class="az-price">${q ? `<b>${fmtNum(q.price)} <small>${esc(q.currency || '')}</small></b>${dayCh != null ? `<span class="${cls(dayCh)}">${fmtPct(dayCh, 2)} today</span>` : ''}` : ''}</div>
        <button type="button" class="icon-btn" data-az-close aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </header>
      <div class="az-body">
        <section class="az-card">
          <div class="az-chart-h">
            <div class="seg small" role="group" aria-label="Range">${Object.keys(RANGES).map((r) => `<button type="button" data-az-range="${r}" aria-pressed="${az.range === r}">${r}</button>`).join('')}</div>
            ${(() => { const b = barsFor(az.range); if (!Array.isArray(b) || b.length < 2) return ''; const ch = (az.range === '1D' && q && q.previous_close ? q.price / q.previous_close : b[b.length - 1].close / b[0].close) - 1; return `<span class="${cls(ch)} az-rch">${fmtPct(ch, 2)} over ${az.range}</span>`; })()}
          </div>
          ${priceChart()}
        </section>
        <div class="az-grid">
          <div class="az-col">${note()}${performance(s)}${earnings(p)}</div>
          <div class="az-col">${figures(az.profile, s)}${analysts(p)}${headlines()}${about(p)}</div>
        </div>
        <p class="meta az-disc">Prices and company figures from Yahoo, delayed. Not investment advice.</p>
      </div>
    </div>`;
  el.querySelector('.az-body').scrollTop = scroll;
}

export function openAnalysis(c) {
  if (!el) {
    el = document.createElement('div');
    el.className = 'az';
    el.id = 'analysis';
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    el.addEventListener('pointermove', chartPointer);
    el.addEventListener('pointerdown', chartPointer);
    el.addEventListener('pointerleave', chartLeave, true);
    window.addEventListener('popstate', () => { if (az.open) close(false); });
  }
  Object.assign(az, { open: true, company: c, quote: null, profile: null, daily: null, bars: {}, note: null, noteState: 'idle', noteError: '', showAllHeads: false });
  el.hidden = false;
  document.body.classList.add('az-open');
  // The phone's back button closes the window instead of leaving the page.
  history.pushState({ az: true }, '');
  render();
  load(c);
  const btn = el.querySelector('[data-az-close].icon-btn');
  if (btn) btn.focus();
}

function close(viaHistory = true) {
  az.open = false;
  if (el) el.hidden = true;
  document.body.classList.remove('az-open');
  if (viaHistory && history.state && history.state.az) history.back();
}

export const analysisOpen = () => az.open;
export function closeAnalysis() { if (az.open) close(); }

async function onClick(e) {
  const t = e.target.closest('[data-az-close], [data-az-range], [data-az-write], [data-az-signin], [data-az-more]');
  if (!t) return;
  const ds = t.dataset;
  if ('azClose' in ds) close();
  else if (ds.azRange) {
    az.range = ds.azRange;
    render();
    await loadRange(az.company.symbol, az.range);
    render();
  } else if ('azWrite' in ds) loadNote(true);
  else if ('azSignin' in ds) {
    if (await signIn('Sign in for the AI analyst’s note.')) loadNote(false);
  } else if ('azMore' in ds) { az.showAllHeads = true; render(); }
}
