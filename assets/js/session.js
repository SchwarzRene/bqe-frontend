/**
 * Sign-in and per-user storage, shared by the site and the research apps.
 *
 * Signed-in users have their work saved on the server (the Worker's
 * /api/state/:app). Guests can use everything, but nothing is stored
 * anywhere: their work lives in the open tab and is gone on reload.
 *
 *   BQE.user                   Promise<{username, role, ai} | null>
 *                              (ai: may use the AI features; an admin grants it)
 *   BQE.login(name, password)  -> the user, throws Error with a message
 *   BQE.signup({username, password, email, host})  -> the new user, signed in
 *                              (host: where the anti-bot check may ask for a click)
 *   BQE.logout()
 *   BQE.changePassword(current, next)
 *   BQE.exportAccount()        downloads everything stored for the account
 *   BQE.deleteAccount(password)  deletes the account and everything it saved
 *   BQE.store(app)             -> Store (see below)
 *   BQE.prefs.sync(section, local, apply)   display settings that follow the account
 *   BQE.mountAccountChip(el, {note})   status + sign-in/out for app pages
 *
 * A plain script, not a module, so every page can load it the same way.
 */
(function () {
  const BQE = (window.BQE = window.BQE || {});

  async function call(method, path, body) {
    const options = { method, headers: {}, credentials: "same-origin" };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, options);
    } catch {
      throw Object.assign(new Error("Can't reach the server — check your connection."), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
    return data;
  }

  // A static preview (python -m http.server) has no API: everyone is a guest.
  BQE.user = call("GET", "/api/auth/me").then((d) => d.user || null, () => null);

  BQE.login = async (username, password) => {
    const { user } = await call("POST", "/api/auth/login", { username, password });
    prefsDoc = null;
    BQE.user = Promise.resolve(user);
    return user;
  };
  // Sign-up settings from the Worker: the minimum password length, and the
  // Cloudflare Turnstile site key when the anti-bot check is switched on.
  let configP = null;
  BQE.config = () => (configP = configP || call("GET", "/api/auth/config").catch(() => ({})));

  let turnstileP = null;
  const loadTurnstile = () => (turnstileP = turnstileP || new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => { turnstileP = null; reject(new Error("The anti-bot check could not load — check your connection.")); };
    document.head.appendChild(script);
  }));

  /** A Turnstile token, or undefined when the check is off. Usually invisible; asks for a click only when unsure. */
  async function turnstileToken(host) {
    const { turnstileSiteKey } = await BQE.config();
    if (!turnstileSiteKey) return undefined;
    const turnstile = await loadTurnstile();
    return new Promise((resolve, reject) => {
      const box = document.createElement("div");
      box.className = "bqe-turnstile";
      (host || document.querySelector("dialog[open]") || document.body).appendChild(box);
      let id = null;
      const finish = (fn) => (value) => {
        try { if (id !== null) turnstile.remove(id); } catch { /* already gone */ }
        box.remove();
        fn(value);
      };
      id = turnstile.render(box, {
        sitekey: turnstileSiteKey,
        // The Worker accepts a token only for this action (TURNSTILE_ACTION in worker/auth.ts).
        action: "signup",
        appearance: "interaction-only",
        callback: finish(resolve),
        "error-callback": finish(() => reject(new Error("The anti-bot check failed — please try again."))),
        "timeout-callback": finish(() => reject(new Error("The anti-bot check timed out — please try again."))),
      });
    });
  }

  BQE.signup = async ({ username, password, email = "", host = null }) => {
    const turnstile = await turnstileToken(host);
    const { user } = await call("POST", "/api/auth/signup", { username, password, email, turnstile });
    BQE.user = Promise.resolve(user);
    return user;
  };
  BQE.logout = async () => {
    prefsDoc = null;
    await call("POST", "/api/auth/logout").catch(() => {});
    BQE.user = Promise.resolve(null);
  };
  BQE.changePassword = (current, next) => call("POST", "/api/auth/password", { current, next });

  BQE.exportAccount = async () => {
    const data = await call("GET", "/api/auth/export");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `bqe-${data.account?.username || "account"}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  BQE.deleteAccount = async (password) => {
    await call("POST", "/api/auth/delete", { password });
    prefsDoc = null;
    BQE.user = Promise.resolve(null);
  };

  /**
   * One app's saved document.
   *
   *   const store = BQE.store("journal");
   *   const data = await store.load();   // null for a guest or a first visit
   *   store.save(data);                  // debounced; a no-op for a guest
   *   store.onStatus = (s) => …          // "saving" | "saved" | "error" | "conflict"
   */
  BQE.store = (app) => {
    let version = 0;
    let signedIn = false;
    let timer = 0;
    let pending = null;
    let inFlight = Promise.resolve();
    const store = { onStatus: null, get signedIn() { return signedIn; } };
    const status = (s, detail) => { try { store.onStatus && store.onStatus(s, detail); } catch { /* ignore */ } };

    store.load = async () => {
      signedIn = !!(await BQE.user);
      if (!signedIn) return null;
      const res = await call("GET", `/api/state/${app}`);
      version = res.version || 0;
      return res.data;
    };

    async function flush() {
      if (!pending) return;
      const data = pending;
      pending = null;
      status("saving");
      try {
        const res = await call("PUT", `/api/state/${app}`, { version, data });
        version = res.version;
        status("saved", res.updated);
      } catch (error) {
        if (error.status === 401) signedIn = false;
        status(error.status === 409 ? "conflict" : "error", error.message);
      }
    }

    store.save = (data, { now = false } = {}) => {
      if (!signedIn) return Promise.resolve();
      pending = data;
      clearTimeout(timer);
      const run = () => (inFlight = inFlight.then(flush));
      if (now) return run();
      timer = setTimeout(run, 800);
      return Promise.resolve();
    };

    // Don't lose the last edit when the tab closes mid-debounce.
    window.addEventListener("pagehide", () => {
      if (!pending || !signedIn) return;
      fetch(`/api/state/${app}`, {
        method: "PUT",
        keepalive: true,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, data: pending }),
      }).catch(() => {});
    });
    return store;
  };

  /**
   * Display preferences (theme, regions, language …), saved to the account
   * so they follow the user to any device. Each app keeps its own copy in
   * localStorage as well, so a guest keeps them too and the page can apply
   * them before the account has answered.
   *
   *   BQE.prefs.sync("journal", {theme}, (saved) => apply(saved))
   *       signed in: the account's settings win and are passed to apply();
   *       an account without any yet takes this browser's `local` ones.
   *   BQE.prefs.save("journal", {theme})   debounced; a no-op for a guest
   */
  let prefsDoc = null;
  const prefsTimers = {};
  const prefsPending = {};
  const loadPrefs = () => (prefsDoc = prefsDoc || BQE.user.then((user) =>
    user ? call("GET", "/api/state/prefs").then((r) => r.data || {}, () => null) : null));

  function flushPrefs(keepalive = false) {
    const body = Object.assign({}, prefsPending);
    for (const k of Object.keys(prefsPending)) { delete prefsPending[k]; clearTimeout(prefsTimers[k]); }
    if (!Object.keys(body).length) return;
    fetch("/api/state/prefs", {
      method: "PATCH",
      keepalive,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  BQE.prefs = {
    async save(section, value) {
      if (!(await BQE.user)) return;
      prefsPending[section] = value;
      clearTimeout(prefsTimers[section]);
      prefsTimers[section] = setTimeout(() => flushPrefs(), 600);
    },
    async sync(section, local, apply) {
      const doc = await loadPrefs();
      if (!doc) return; // guest, or the account could not be read: keep this browser's
      const saved = doc[section];
      if (saved && typeof saved === "object") {
        try { apply(saved); } catch (error) { console.warn("prefs", section, error); }
      } else if (local && Object.keys(local).length) {
        BQE.prefs.save(section, local);
      }
    },
  };
  // A setting changed just before the tab closes is still saved.
  window.addEventListener("pagehide", () => flushPrefs(true));

  // ── Account chip for app pages (which do not carry the site header) ──────

  const CHIP_CSS = `
    .bqe-chip{display:inline-flex;align-items:center;gap:.5em;font:12px/1.3 system-ui,sans-serif;
      padding:4px 10px;border:1px solid currentColor;border-radius:999px;opacity:.85}
    .bqe-chip button{font:inherit;color:inherit;background:none;border:0;padding:0;
      text-decoration:underline;cursor:pointer}
    .bqe-chip .bqe-dot{width:7px;height:7px;border-radius:50%;background:#9aa4b2}
    .bqe-chip.is-user .bqe-dot{background:#3fb950}
    dialog.bqe-login{border:1px solid #30363d;border-radius:10px;padding:20px 22px;max-width:320px;
      background:#0d1117;color:#e6edf3;font:14px/1.4 system-ui,sans-serif}
    dialog.bqe-login::backdrop{background:rgba(0,0,0,.55)}
    dialog.bqe-login h2{margin:0 0 12px;font-size:17px}
    dialog.bqe-login label{display:block;margin:10px 0 4px;font-size:12px;opacity:.8}
    dialog.bqe-login input{width:100%;box-sizing:border-box;padding:8px;border-radius:6px;
      border:1px solid #30363d;background:#161b22;color:inherit;font:inherit}
    dialog.bqe-login .row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
    dialog.bqe-login button{font:inherit;padding:7px 14px;border-radius:6px;border:1px solid #30363d;
      background:#21262d;color:inherit;cursor:pointer}
    dialog.bqe-login button[type=submit]{background:#d4a017;border-color:#d4a017;color:#111}
    dialog.bqe-login .err{color:#f87171;min-height:1.3em;margin:8px 0 0;font-size:13px}
    dialog.bqe-login .note{font-size:12px;opacity:.7;margin:10px 0 0}
    dialog.bqe-login .switch{font-size:12px;opacity:.85;margin:6px 0 0}
    dialog.bqe-login .switch button{display:inline;min-height:0;padding:0;border:0;background:none;color:#d4a017;text-decoration:underline;font-weight:600}`;

  function injectCss() {
    if (document.getElementById("bqe-chip-css")) return;
    const style = document.createElement("style");
    style.id = "bqe-chip-css";
    style.textContent = CHIP_CSS;
    document.head.appendChild(style);
  }

  /** A minimal sign-in dialog. Resolves with the user, or null if cancelled. */
  BQE.openLogin = ({ note = "" } = {}) => new Promise((resolve) => {
    injectCss();
    const dialog = document.createElement("dialog");
    dialog.className = "bqe-login";
    dialog.setAttribute("aria-labelledby", "bqe-login-title");
    dialog.innerHTML = `
      <form method="dialog">
        <h2 id="bqe-login-title">Sign in</h2>
        <label for="bqe-u">Username</label>
        <input id="bqe-u" name="username" autocomplete="username" required>
        <label for="bqe-p">Password</label>
        <input id="bqe-p" name="password" type="password" autocomplete="current-password" required>
        <div class="extra" hidden>
          <label for="bqe-c">Repeat the password</label>
          <input id="bqe-c" name="confirm" type="password" autocomplete="new-password">
          <label for="bqe-e">Email (optional)</label>
          <input id="bqe-e" name="email" type="email" autocomplete="email">
        </div>
        <p class="err" role="alert"></p>
        <p class="switch">No account yet? <button type="button">Create one</button></p>
        ${note ? `<p class="note"></p>` : ""}
        <div class="row"><button type="button" value="cancel">Cancel</button><button type="submit">Sign in</button></div>
      </form>`;
    if (note) dialog.querySelector(".note").textContent = note;
    document.body.appendChild(dialog);
    const form = dialog.querySelector("form");
    const err = dialog.querySelector(".err");
    const done = (user) => { dialog.close(); dialog.remove(); resolve(user); };
    // One form for both: "Create one" adds the email and repeat fields.
    let signingUp = false;
    const toggle = () => {
      signingUp = !signingUp;
      dialog.querySelector("h2").textContent = signingUp ? "Create an account" : "Sign in";
      dialog.querySelector("[type=submit]").textContent = signingUp ? "Create account" : "Sign in";
      dialog.querySelector(".extra").hidden = !signingUp;
      dialog.querySelector(".switch").innerHTML = signingUp
        ? 'Already have one? <button type="button">Sign in</button>'
        : 'No account yet? <button type="button">Create one</button>';
      form.password.autocomplete = signingUp ? "new-password" : "current-password";
      form.confirm.required = signingUp;
      err.textContent = "";
    };
    dialog.querySelector(".switch").addEventListener("click", (e) => { if (e.target.closest("button")) toggle(); });
    dialog.querySelector('[value="cancel"]').addEventListener("click", () => done(null));
    dialog.addEventListener("cancel", () => done(null));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      try {
        if (!signingUp) return done(await BQE.login(form.username.value, form.password.value));
        if (form.password.value !== form.confirm.value) throw new Error("The passwords don't match.");
        done(await BQE.signup({ username: form.username.value, password: form.password.value, email: form.email.value, host: form }));
      } catch (error) {
        err.textContent = error.message;
      }
    });
    dialog.showModal();
    form.username.focus();
  });

  /**
   * Show who is signed in and whether work is being saved, with sign-in /
   * sign-out. Signing in or out reloads the page, so the app starts again
   * from the saved document (or from nothing, for a guest).
   */
  BQE.mountAccountChip = async (el, { note = "Your work in this app is saved to your account." } = {}) => {
    if (!el) return;
    injectCss();
    const user = await BQE.user;
    el.classList.add("bqe-chip");
    el.classList.toggle("is-user", !!user);
    el.innerHTML = `<span class="bqe-dot" aria-hidden="true"></span><span class="bqe-label"></span><button type="button"></button>`;
    const label = el.querySelector(".bqe-label");
    const button = el.querySelector("button");
    if (user) {
      label.textContent = `${user.username} · saved`;
      label.title = note;
      button.textContent = "Sign out";
      button.addEventListener("click", async () => { await BQE.logout(); location.reload(); });
    } else {
      label.textContent = "Guest · not saved";
      label.title = "You can try everything, but nothing is stored: your work is gone when you leave or reload.";
      button.textContent = "Sign in";
      button.addEventListener("click", async () => {
        const signedIn = await BQE.openLogin({ note: "Signing in reloads this page; what you did as a guest is not kept." });
        if (signedIn) location.reload();
      });
    }
  };
})();
