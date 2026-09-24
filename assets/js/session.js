/**
 * Sign-in and per-user storage, shared by the site and the research apps.
 *
 * Signed-in users have their work saved on the server (the Worker's
 * /api/state/:app). Guests can use everything, but nothing is stored
 * anywhere: their work lives in the open tab and is gone on reload.
 *
 *   BQE.user                   Promise<{username} | null>
 *   BQE.login(name, password)  -> {username}, throws Error with a message
 *   BQE.logout()
 *   BQE.changePassword(current, next)
 *   BQE.store(app)             -> Store (see below)
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
    BQE.user = Promise.resolve(user);
    return user;
  };
  BQE.logout = async () => {
    await call("POST", "/api/auth/logout").catch(() => {});
    BQE.user = Promise.resolve(null);
  };
  BQE.changePassword = (current, next) => call("POST", "/api/auth/password", { current, next });

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
    dialog.bqe-login .note{font-size:12px;opacity:.7;margin:10px 0 0}`;

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
        <p class="err" role="alert"></p>
        ${note ? `<p class="note"></p>` : ""}
        <div class="row"><button type="button" value="cancel">Cancel</button><button type="submit">Sign in</button></div>
      </form>`;
    if (note) dialog.querySelector(".note").textContent = note;
    document.body.appendChild(dialog);
    const form = dialog.querySelector("form");
    const err = dialog.querySelector(".err");
    const done = (user) => { dialog.close(); dialog.remove(); resolve(user); };
    dialog.querySelector('[value="cancel"]').addEventListener("click", () => done(null));
    dialog.addEventListener("cancel", () => done(null));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      try {
        done(await BQE.login(form.username.value, form.password.value));
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
