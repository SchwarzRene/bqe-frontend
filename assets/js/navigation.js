/**
 * Navigation Module - Mobile Menu & Login Modal
 * Burger menu is initialized exactly ONCE via MutationObserver.
 */

// ─── Mobile Nav ───────────────────────────────────────────────────────────────

function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav    = document.getElementById('primary-navigation');

  if (!toggle || !nav) return;
  // Guard: only attach listeners once
  if (toggle.dataset.navReady === 'true') return;
  toggle.dataset.navReady = 'true';

  function openMenu() {
    nav.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close navigation menu');
  }

  function closeMenu() {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation menu');
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    nav.classList.contains('is-open') ? closeMenu() : openMenu();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      closeMenu();
      toggle.focus();
    }
  });

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target) && !toggle.contains(e.target)) {
      closeMenu();
    }
  });

  // Close when a nav link is clicked
  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => closeMenu());
  });
}

// ─── Nav Wave ─────────────────────────────────────────────────────────────────
// A slim signal trace, drawn through the *measured* centre of each mobile
// menu item (never guessed coordinates), echoing the hero's price line at a
// scale that fits a small UI element. Only meaningful once the nav has
// switched to its stacked mobile layout.

function initNavWave() {
  const nav = document.getElementById('primary-navigation');
  const list = nav && nav.querySelector('.nav-list');
  if (!nav || !list) return;

  const svgNS = 'http://www.w3.org/2000/svg';
  let svg = nav.querySelector('.nav-wave');
  if (!svg) {
    svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'nav-wave');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('class', 'nav-wave-path');
    svg.appendChild(path);
    nav.insertBefore(svg, list);
  }
  const path = svg.querySelector('.nav-wave-path');

  function draw() {
    // Bail out on desktop, where the nav is a horizontal row (position:
    // static) rather than the absolutely-positioned mobile dropdown.
    if (getComputedStyle(nav).position !== 'absolute') return;
    if (!nav.classList.contains('is-open')) return;

    const items = Array.from(list.querySelectorAll('.nav-item'));
    if (!items.length) return;

    const navRect = nav.getBoundingClientRect();
    const w = navRect.width;
    const h = navRect.height;
    if (!w || !h) return;

    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.querySelectorAll('.nav-wave-node').forEach((n) => n.remove());

    // The trace lives in the left gutter, clear of the link labels
    // (.nav-link has matching left padding in the mobile media query).
    const baseX = 22;
    const amp = 8;

    const points = items.map((item, i) => {
      const r = item.getBoundingClientRect();
      return {
        x: baseX + (i % 2 === 0 ? -amp : amp),
        y: r.top - navRect.top + r.height / 2,
        current: !!item.querySelector('[aria-current="page"]'),
      };
    });

    // Smooth curve through each measured point, entering above the first
    // item and continuing past the last.
    let d = `M ${baseX} 0`;
    let prev = { x: baseX, y: 0 };
    points.forEach((p) => {
      const midY = (prev.y + p.y) / 2;
      d += ` C ${prev.x} ${midY}, ${p.x} ${midY}, ${p.x} ${p.y}`;
      prev = p;
    });
    const tailY = Math.max(h, prev.y + 20);
    d += ` C ${prev.x} ${(prev.y + tailY) / 2}, ${baseX} ${(prev.y + tailY) / 2}, ${baseX} ${tailY}`;
    path.setAttribute('d', d);

    points.forEach((p) => {
      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('class', 'nav-wave-node' + (p.current ? ' is-current' : ''));
      dot.setAttribute('cx', p.x);
      dot.setAttribute('cy', p.y);
      dot.setAttribute('r', p.current ? 4 : 3);
      svg.appendChild(dot);
    });
  }

  // Redraw once the menu opens (layout only exists once it's visible),
  // and whenever the viewport changes while it's open.
  new MutationObserver(() => requestAnimationFrame(draw))
    .observe(nav, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', () => requestAnimationFrame(draw));
}

// ─── Login Modal ──────────────────────────────────────────────────────────────

function initLoginModal() {
  const loginBtn   = document.getElementById('login-btn');
  const loginModal = document.getElementById('login-modal');
  const loginClose = document.getElementById('login-close');
  const loginForm  = document.getElementById('login-form');

  if (!loginBtn || !loginModal) return;
  if (loginBtn.dataset.loginReady === 'true') return;
  loginBtn.dataset.loginReady = 'true';

  loginBtn.addEventListener('click', () => {
    loginModal.removeAttribute('hidden');
    loginModal.focus();
  });

  loginClose.addEventListener('click', () => {
    loginModal.setAttribute('hidden', '');
    loginBtn.focus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !loginModal.hasAttribute('hidden')) {
      loginModal.setAttribute('hidden', '');
      loginBtn.focus();
    }
  });

  loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) {
      loginModal.setAttribute('hidden', '');
      loginBtn.focus();
    }
  });

  wireAccount(loginBtn, loginModal, loginForm);
}

// The session helper lives in its own file so the research apps, which do
// not carry this header, can load it too.
function loadSession() {
  if (window.BQE && window.BQE.login) return Promise.resolve(window.BQE);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/assets/js/session.js';
    script.onload = () => resolve(window.BQE);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function wireAccount(loginBtn, loginModal, loginForm) {
  let BQE;
  try { BQE = await loadSession(); } catch (_) { return; }

  const panel = document.getElementById('account-panel');
  const title = document.getElementById('login-title');
  const error = document.getElementById('login-error');

  function show(user) {
    loginForm.hidden = !!user;
    panel.hidden = !user;
    title.textContent = user ? 'Account' : 'Login';
    loginBtn.textContent = user ? user.username : 'Login';
    loginBtn.setAttribute('aria-label', user ? `Account: ${user.username}` : 'Open login');
    if (user) document.getElementById('account-name').textContent = user.username;
  }
  show(await BQE.user);

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const user = await BQE.login(loginForm.username.value, loginForm.password.value);
      loginForm.reset();
      show(user);
    } catch (err) {
      error.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });

  const passwordForm = document.getElementById('password-form');
  const passwordStatus = document.getElementById('password-status');
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    passwordStatus.textContent = '';
    passwordStatus.classList.remove('is-ok');
    try {
      await BQE.changePassword(passwordForm.current.value, passwordForm.next.value);
      passwordForm.reset();
      passwordStatus.textContent = 'Password changed. Other devices have been signed out.';
      passwordStatus.classList.add('is-ok');
    } catch (err) {
      passwordStatus.textContent = err.message;
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await BQE.logout();
    show(null);
  });
}

// ─── Bootstrap: watch for header being injected ───────────────────────────────

const navObserver = new MutationObserver(() => {
  const toggle   = document.querySelector('.nav-toggle');
  const loginBtn = document.getElementById('login-btn');

  if (toggle) {
    initMobileNav();   // guard inside prevents duplicate registration
    initNavWave();
    navObserver.disconnect(); // stop watching once header is found
  }
  if (loginBtn) {
    initLoginModal();  // guard inside prevents duplicate registration
  }
});

navObserver.observe(document.body, { childList: true, subtree: true });
