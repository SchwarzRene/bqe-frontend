/**
 * The admin terminal (/pages/admin.html): every account, with AI access,
 * suspension, role, password reset and deletion — as buttons in the table
 * and as commands at the prompt. Talks to /api/admin/users (worker/admin.ts),
 * which checks the admin role on every request.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const gate = $('term-gate');
  const app = $('term-app');
  const rows = $('term-rows');
  const log = $('term-log');
  const input = $('term-input');

  const state = { users: [], me: null, view: 'all', filter: '' };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  async function api(method, path, body) {
    const init = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  }

  // ── output ───────────────────────────────────────────────────────────────

  function print(text, kind = '') {
    const line = document.createElement('div');
    line.className = 'term-line' + (kind ? ' is-' + kind : '');
    line.textContent = text;
    log.appendChild(line);
    while (log.childElementCount > 200) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  function visible() {
    const q = state.filter.toLowerCase();
    return state.users.filter((u) => {
      if (q && !u.username.toLowerCase().includes(q) && !(u.email || '').toLowerCase().includes(q)) return false;
      switch (state.view) {
        case 'pending': return !u.ai;
        case 'ai': return u.ai;
        case 'admin': return u.role === 'admin';
        case 'disabled': return u.disabled;
        default: return true;
      }
    });
  }

  function render() {
    const all = state.users;
    const n = (f) => all.filter(f).length;
    $('term-stats').innerHTML = [
      ['users', all.length],
      ['ai access', n((u) => u.ai)],
      ['waiting for ai', n((u) => !u.ai && !u.disabled)],
      ['admins', n((u) => u.role === 'admin')],
      ['suspended', n((u) => u.disabled)],
    ].map(([k, v]) => `<span><b>${v}</b> ${k}</span>`).join('');

    const list = visible();
    rows.innerHTML = list.length ? list.map((u) => {
      const self = u.id === state.me;
      const admin = u.role === 'admin';
      return `<tr data-id="${u.id}" class="${u.disabled ? 'is-disabled' : ''}">
        <th scope="row"><span class="u-name">${esc(u.username)}</span>${self ? ' <span class="tag">you</span>' : ''}
          <span class="u-mail">${esc(u.email || '')}</span></th>
        <td><span class="tag ${admin ? 'tag-gold' : ''}">${admin ? 'admin' : 'user'}</span></td>
        <td>${admin
          ? '<span class="tag tag-on" title="Admins always have AI access">always</span>'
          : `<button type="button" class="switch" role="switch" aria-checked="${u.ai}" data-act="ai"
               aria-label="AI access for ${esc(u.username)}"><i></i><span>${u.ai ? 'granted' : 'restricted'}</span></button>`}</td>
        <td>${u.disabled ? '<span class="tag tag-off">suspended</span>' : `<span class="tag">active</span>${u.sessions ? ` <span class="dim">${u.sessions} session${u.sessions === 1 ? '' : 's'}</span>` : ''}`}</td>
        <td class="dim">${esc(when(u.createdAt))}</td>
        <td class="dim">${esc(when(u.lastLoginAt))}</td>
        <td class="num">${u.aiToday}</td>
        <td><div class="acts">
          ${self ? '' : `<button type="button" class="term-btn" data-act="disable">${u.disabled ? 'unsuspend' : 'suspend'}</button>`}
          ${self ? '' : `<button type="button" class="term-btn" data-act="role">${admin ? 'demote' : 'make admin'}</button>`}
          <button type="button" class="term-btn" data-act="reset">reset pw</button>
          ${self ? '' : '<button type="button" class="term-btn term-danger" data-act="delete">delete</button>'}
        </div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="dim empty">No accounts match.</td></tr>`;
  }

  async function load() {
    const data = await api('GET', '/api/admin/users');
    state.users = data.users;
    state.me = data.me;
    render();
  }

  // ── actions (shared by the table and the prompt) ─────────────────────────

  function find(name) {
    const u = state.users.find((x) => x.username.toLowerCase() === String(name || '').toLowerCase());
    if (!u) throw new Error(`no such user: ${name || '(none given)'}`);
    return u;
  }

  function replace(user) {
    state.users = state.users.map((u) => (u.id === user.id ? user : u));
    render();
  }

  const actions = {
    async ai(u, on) {
      const { user } = await api('PATCH', `/api/admin/users/${u.id}`, { ai: on });
      replace(user);
      print(`${on ? 'granted' : 'revoked'} ai access: ${u.username}`, 'ok');
    },
    async disable(u, on) {
      const { user } = await api('PATCH', `/api/admin/users/${u.id}`, { disabled: on });
      replace(user);
      print(`${on ? 'suspended (and signed out)' : 'unsuspended'}: ${u.username}`, 'ok');
    },
    async role(u, role) {
      if (role === 'admin' && !confirm(`Make ${u.username} an admin? Admins can manage every account.`)) return print('cancelled');
      const { user } = await api('PATCH', `/api/admin/users/${u.id}`, { role });
      replace(user);
      print(`${u.username} is now ${role === 'admin' ? 'an admin' : 'a user'}`, 'ok');
    },
    async reset(u) {
      if (!confirm(`Reset the password of ${u.username}? Their sessions end and they sign in with a temporary password.`)) return print('cancelled');
      const { password } = await api('POST', `/api/admin/users/${u.id}/password`);
      print(`temporary password for ${u.username}: ${password}`, 'ok');
      print('pass it on privately; they can change it under Login → Change password');
      await load();
    },
    async delete(u) {
      if (!confirm(`Delete ${u.username} and everything saved to the account? This can't be undone.`)) return print('cancelled');
      await api('DELETE', `/api/admin/users/${u.id}`);
      state.users = state.users.filter((x) => x.id !== u.id);
      render();
      print(`deleted: ${u.username}`, 'ok');
    },
  };

  rows.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-act]');
    if (!button) return;
    const u = state.users.find((x) => x.id === Number(button.closest('tr').dataset.id));
    if (!u) return;
    button.disabled = true;
    try {
      switch (button.dataset.act) {
        case 'ai': await actions.ai(u, !u.ai); break;
        case 'disable': await actions.disable(u, !u.disabled); break;
        case 'role': await actions.role(u, u.role === 'admin' ? 'user' : 'admin'); break;
        case 'reset': await actions.reset(u); break;
        case 'delete': await actions.delete(u); break;
      }
    } catch (err) {
      print(`error: ${err.message}`, 'err');
    } finally {
      button.disabled = false;
    }
  });

  // ── the prompt ───────────────────────────────────────────────────────────

  const HELP = [
    'commands:',
    '  list [ai|noai|admin|suspended]   show accounts in the log',
    '  grant <user…>                    give ai access',
    '  revoke <user…>                   take ai access away',
    '  grant-all                        give ai access to everyone waiting',
    '  suspend <user> / unsuspend <user>',
    '  promote <user> / demote <user>   admin role',
    '  reset <user>                     new temporary password',
    '  delete <user>                    remove the account',
    '  whois <user>                     details of one account',
    '  reload · clear · help',
  ];

  async function run(line) {
    const [cmd, ...args] = line.trim().split(/\s+/);
    if (!cmd) return;
    print(`admin@bqe:~$ ${line}`, 'cmd');
    switch (cmd.toLowerCase()) {
      case 'help': case '?': HELP.forEach((l) => print(l)); break;
      case 'clear': log.innerHTML = ''; break;
      case 'reload': await load(); print(`${state.users.length} accounts loaded`, 'ok'); break;
      case 'list': case 'ls': {
        const f = (args[0] || '').toLowerCase();
        const pick = { ai: (u) => u.ai, noai: (u) => !u.ai, admin: (u) => u.role === 'admin', admins: (u) => u.role === 'admin', suspended: (u) => u.disabled }[f] || (() => true);
        const list = state.users.filter(pick);
        list.forEach((u) => print(`${u.username.padEnd(20)} ${u.role.padEnd(6)} ai:${u.ai ? 'yes' : 'no '} ${u.disabled ? 'SUSPENDED' : ''}`));
        print(`${list.length} account${list.length === 1 ? '' : 's'}`);
        break;
      }
      case 'whois': {
        const u = find(args[0]);
        print(`${u.username} (#${u.id}) · ${u.role} · ai ${u.ai ? 'granted' : 'restricted'} · ${u.disabled ? 'suspended' : 'active'}`);
        print(`email ${u.email || '—'} · created ${when(u.createdAt)} · last sign-in ${when(u.lastLoginAt)} · ${u.sessions} session(s) · ${u.aiToday} ai requests today`);
        break;
      }
      case 'grant': case 'revoke':
        if (!args.length) throw new Error(`usage: ${cmd} <user…>`);
        for (const name of args) await actions.ai(find(name), cmd === 'grant');
        break;
      case 'grant-all': {
        const waiting = state.users.filter((u) => !u.ai && !u.disabled);
        if (!waiting.length) { print('nobody is waiting for ai access'); break; }
        if (!confirm(`Grant AI access to ${waiting.length} account(s)?`)) { print('cancelled'); break; }
        for (const u of waiting) await actions.ai(u, true);
        break;
      }
      case 'suspend': case 'unsuspend': await actions.disable(find(args[0]), cmd === 'suspend'); break;
      case 'promote': case 'demote': await actions.role(find(args[0]), cmd === 'promote' ? 'admin' : 'user'); break;
      case 'reset': await actions.reset(find(args[0])); break;
      case 'delete': case 'rm': await actions.delete(find(args[0])); break;
      default: throw new Error(`unknown command: ${cmd} — type help`);
    }
  }

  const history = [];
  let back = 0;
  $('term-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const line = input.value;
    input.value = '';
    if (line.trim()) history.push(line);
    back = history.length;
    input.disabled = true;
    try {
      await run(line);
    } catch (err) {
      print(`error: ${err.message}`, 'err');
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    back = Math.max(0, Math.min(history.length, back + (e.key === 'ArrowUp' ? -1 : 1)));
    input.value = history[back] || '';
  });

  $('term-filter').addEventListener('input', (e) => { state.filter = e.target.value.trim(); render(); });
  document.querySelector('.term-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    state.view = b.dataset.view;
    document.querySelectorAll('.term-chips [data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  });
  $('term-reload').addEventListener('click', () => load().catch((err) => print(`error: ${err.message}`, 'err')));

  // ── start ────────────────────────────────────────────────────────────────

  function locked(message, withSignIn) {
    gate.innerHTML = `<p class="term-line is-err"></p>${withSignIn ? '<button type="button" class="term-btn" id="term-signin">sign in</button>' : ''}`;
    gate.querySelector('p').textContent = message;
    if (withSignIn) {
      $('term-signin').addEventListener('click', async () => {
        if (await window.BQE.openLogin({ note: 'The admin terminal is for admin accounts.' })) location.reload();
      });
    }
  }

  async function start() {
    const user = await window.BQE.user;
    if (!user) return locked('permission denied: sign in with an admin account.', true);
    $('term-who').textContent = user.username;
    if (user.role !== 'admin') return locked(`permission denied: ${user.username} is not an admin.`, false);
    try {
      await load();
    } catch (err) {
      return locked(`error: ${err.message}`, err.status === 401);
    }
    gate.hidden = true;
    app.hidden = false;
    const waiting = state.users.filter((u) => !u.ai && !u.disabled).length;
    print(`signed in as ${user.username} · ${state.users.length} accounts · ${waiting} waiting for ai access`, 'ok');
    print('type help for commands, or use the buttons in the table');
  }

  start();
})();
