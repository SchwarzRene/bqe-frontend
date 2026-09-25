// Ask AI and the sign-in it needs. AI features (the chat, and a fresh
// briefing on Refresh) are for signed-in users an admin has granted AI
// access (user.ai); the Worker refuses both otherwise, before any model call. Everyone can read the scheduled
// briefing, the calendar and the headlines.

import { esc, safeUrl } from './format.js';
import { allRegions, PAGES, R_NAME, regionParam, state } from './state.js';

const CHAT_ENDPOINT = '/api/chat';
const SUGGEST = {
  general: ['What happened today?', 'Did the Fed decide anything this week?', 'What is going on with Russia?'],
  stocks: ['Why are chip stocks moving?', 'Anything new on my companies?', 'Which earnings are coming up?'],
  commodities: ['What is moving oil?', 'Why are soybeans moving?', 'What is next on the commodity calendar?'],
  calendar: ['What are the key events this week?', 'What is expected from the next Fed decision?', 'Which data came in above consensus?'],
};

export const chat = { open: false, messages: [], remaining: null };
export const session = { user: null };

const $ = (id) => document.getElementById(id);
const chatEl = $('chat');
const logEl = $('chat-log');
const inputEl = $('chat-input');
const askBtn = $('ask');
const accountEl = $('account');
const refreshBtn = $('refresh');
const BQE = window.BQE;
const NO_AI = 'AI features are not enabled for your account yet. An administrator has to grant access — until then you can read the briefing, the calendar and the headlines as usual.';

/** May the signed-in user use the AI features? */
export const hasAi = () => !!(session.user && session.user.ai);

export function renderSuggest() {
  const page = PAGES.find((p) => p[0] === state.page)[1];
  $('chat-context').textContent = `Knows today’s headlines, calendar and results · on ${page}, ${allRegions() ? 'all regions' : state.regions.map((c) => R_NAME[c]).join(' + ')}`;
  $('chat-suggest').innerHTML = chat.messages.length > 6 ? '' :
    SUGGEST[state.page].map((q) => `<button type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join('');
  $('chat-note').textContent = 'Answers come from the collected headlines and may miss context. Not investment advice.' +
    (chat.remaining != null ? ` ${chat.remaining} question${chat.remaining === 1 ? '' : 's'} left today.` : '');
}

function renderLog() {
  inputEl.disabled = !hasAi();
  if (!hasAi()) {
    logEl.innerHTML = `<div class="msg bot err"><p>${esc(NO_AI)}</p></div>`;
    return;
  }
  logEl.innerHTML = chat.messages.length ? chat.messages.map((m) => {
    if (m.role === 'user') return `<div class="msg user">${esc(m.text)}</div>`;
    if (m.pending) return '<div class="msg bot pending">Reading today’s headlines…</div>';
    const paras = String(m.text).split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('');
    const srcs = (m.sources || []).map((s) => `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join('');
    return `<div class="msg bot${m.error ? ' err' : ''}">${paras}${srcs ? `<div class="srcs">${srcs}</div>` : ''}</div>`;
  }).join('') : '<div class="msg bot"><p>Ask me about today’s news, markets, commodities or upcoming events. I answer from the headlines, calendar and results this app has collected.</p></div>';
  logEl.scrollTop = logEl.scrollHeight;
}

async function answer() {
  const res = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      messages: chat.messages.filter((m) => !m.pending && !m.error).map((m) => ({ role: m.role, content: m.text })),
      page: state.page, region: regionParam(), tz: state.tz,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { setUser(null); throw new Error('Your session has ended. Sign in again to keep asking.'); }
  if (res.status === 403 && data.code === 'ai_access') { setUser({ ...session.user, ai: false }); throw new Error(NO_AI); }
  if (typeof data.remaining === 'number') chat.remaining = data.remaining;
  if (!res.ok) throw new Error(data.error || 'The answer could not be loaded (status ' + res.status + ').');
  return { text: data.answer, sources: data.sources || [] };
}

async function send(question) {
  const q = question.trim();
  if (!q || chat.messages.some((m) => m.pending)) return;
  chat.messages.push({ role: 'user', text: q });
  const pending = { role: 'assistant', pending: true };
  chat.messages.push(pending);
  renderLog(); renderSuggest();
  try {
    const a = await answer();
    Object.assign(pending, { pending: false, text: a.text, sources: a.sources });
  } catch (err) {
    Object.assign(pending, { pending: false, error: true, text: err.message });
  }
  renderLog(); renderSuggest();
}

// On a phone the panel covers the screen. It follows the visible part of the
// viewport (window.visualViewport), so the input stays above the on-screen
// keyboard and the panel does not slide under the browser's bars.
const phone = window.matchMedia('(max-width: 640px)');
const touch = window.matchMedia('(pointer: coarse)');

function fitChat() {
  const vv = window.visualViewport;
  if (!chat.open || !vv || !phone.matches) {
    chatEl.style.top = '';
    chatEl.style.height = '';
    return;
  }
  chatEl.style.top = vv.offsetTop + 'px';
  chatEl.style.height = vv.height + 'px';
  logEl.scrollTop = logEl.scrollHeight;
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitChat);
  window.visualViewport.addEventListener('scroll', fitChat);
}
phone.addEventListener('change', fitChat);

function setChat(open) {
  chat.open = open;
  chatEl.hidden = !open;
  askBtn.setAttribute('aria-expanded', String(open));
  // The page behind does not scroll while the chat covers it.
  document.body.classList.toggle('chat-open', open);
  fitChat();
  // On touch screens the keyboard would hide the suggestions: no autofocus there.
  if (open) { renderSuggest(); renderLog(); if (!touch.matches) inputEl.focus(); } else { askBtn.focus(); }
}

export function setUser(user) {
  session.user = user;
  const ai = hasAi();
  // "guest" draws the lock on Ask AI: shown to anyone who can't use it.
  document.body.classList.toggle('guest', !ai);
  askBtn.title = ai ? '' : user ? 'AI access has not been granted to your account yet' : 'Sign in to ask AI';
  askBtn.setAttribute('aria-label', ai ? 'Ask AI' : user ? 'Ask AI (AI access required)' : 'Ask AI (sign in required)');
  refreshBtn.title = ai ? 'Fetch headlines and build a fresh briefing' : 'Reload the latest briefing. Users with AI access can build a fresh one.';
  accountEl.classList.toggle('is-user', !!user);
  accountEl.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="who"></span><button type="button"></button>';
  accountEl.querySelector('.who').textContent = user ? user.username : 'Guest';
  accountEl.querySelector('button').textContent = user ? 'Sign out' : 'Sign in';
  if (!user && chat.open) setChat(false);
  if (chat.open) renderLog();
}

export async function signIn(note) {
  if (!BQE) return null;
  const user = await BQE.openLogin({ note });
  if (user) setUser(user);
  return user;
}

export function initChat() {
  accountEl.addEventListener('click', async (e) => {
    if (!e.target.closest('button')) return;
    if (session.user) { await BQE.logout(); setUser(null); chat.messages = []; chat.remaining = null; }
    else await signIn('Signing in saves your work. Ask AI and fresh briefings need AI access, which an admin grants.');
  });
  askBtn.addEventListener('click', async () => {
    if (!session.user && !(await signIn('Ask AI is for signed-in users.'))) return;
    setChat(!chat.open);
  });
  $('chat-close').addEventListener('click', () => setChat(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chat.open) setChat(false); });
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = inputEl.value;
    inputEl.value = '';
    send(q);
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('chat-form').requestSubmit(); }
  });
  $('chat-suggest').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ask]');
    if (b) send(b.dataset.ask);
  });
  setUser(null);
  if (BQE) BQE.user.then(setUser);
}
