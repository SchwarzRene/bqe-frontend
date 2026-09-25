// Ask AI and the sign-in it needs. AI features (the chat, and a fresh
// briefing on Refresh) are for signed-in users; the Worker refuses both
// without a session before any model call. Everyone can read the scheduled
// briefing, the calendar and the headlines.

import { esc, safeUrl } from './format.js';
import { PAGES, REGIONS, state } from './state.js';

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

export function renderSuggest() {
  const page = PAGES.find((p) => p[0] === state.page)[1];
  $('chat-context').textContent = `Knows today’s headlines, calendar and results · on ${page}, ${REGIONS.find((r) => r[0] === state.region)[1]}`;
  $('chat-suggest').innerHTML = chat.messages.length > 6 ? '' :
    SUGGEST[state.page].map((q) => `<button type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join('');
  $('chat-note').textContent = 'Answers come from the collected headlines and may miss context. Not investment advice.' +
    (chat.remaining != null ? ` ${chat.remaining} question${chat.remaining === 1 ? '' : 's'} left today.` : '');
}

function renderLog() {
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
      page: state.page, region: state.region, tz: state.tz,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { setUser(null); throw new Error('Your session has ended. Sign in again to keep asking.'); }
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

function setChat(open) {
  chat.open = open;
  chatEl.hidden = !open;
  askBtn.setAttribute('aria-expanded', String(open));
  if (open) { renderSuggest(); renderLog(); inputEl.focus(); } else { askBtn.focus(); }
}

export function setUser(user) {
  session.user = user;
  document.body.classList.toggle('guest', !user);
  askBtn.title = user ? '' : 'Sign in to ask AI';
  askBtn.setAttribute('aria-label', user ? 'Ask AI' : 'Ask AI (sign in required)');
  refreshBtn.title = user ? 'Fetch headlines and build a fresh briefing' : 'Reload the latest briefing. Signed-in users can build a fresh one.';
  accountEl.classList.toggle('is-user', !!user);
  accountEl.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="who"></span><button type="button"></button>';
  accountEl.querySelector('.who').textContent = user ? user.username : 'Guest';
  accountEl.querySelector('button').textContent = user ? 'Sign out' : 'Sign in';
  if (!user && chat.open) setChat(false);
}

async function signIn(note) {
  if (!BQE) return null;
  const user = await BQE.openLogin({ note });
  if (user) setUser(user);
  return user;
}

export function initChat() {
  accountEl.addEventListener('click', async (e) => {
    if (!e.target.closest('button')) return;
    if (session.user) { await BQE.logout(); setUser(null); chat.messages = []; chat.remaining = null; }
    else await signIn('Signing in unlocks Ask AI and fresh briefings.');
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
