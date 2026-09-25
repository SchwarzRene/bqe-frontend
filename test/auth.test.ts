// Sign-up, sign-in, the AI-access gate and the admin terminal's API, end to
// end against a real SQLite database with the repository's migrations.

import { describe, expect, it } from "vitest";
import worker from "../worker/index";
import { d1 } from "./d1";

const ORIGIN = "https://site";

function envWith() {
  return { DB: d1(), ASSETS: { fetch: async () => new Response("asset") } } as any;
}

async function call(env: any, method: string, path: string, body?: unknown, cookie = "", ip = "1.2.3.4") {
  const headers: Record<string, string> = { Origin: ORIGIN, "CF-Connecting-IP": ip };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await worker.fetch!(
    new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }) as any,
    env,
    {} as any,
  );
  const data: any = await res.json().catch(() => null);
  const set = res.headers.get("Set-Cookie") || "";
  return { status: res.status, data, cookie: set.split(";")[0] };
}

async function signup(env: any, username: string, extra: Record<string, unknown> = {}, ip?: string) {
  return call(env, "POST", "/api/auth/signup", { username, password: "correct horse", ...extra }, "", ip);
}

/** A signed-up user promoted to admin in the database, as the migration does for the owner. */
async function admin(env: any) {
  const r = await signup(env, "boss");
  env.DB.raw.exec("UPDATE users SET role = 'admin' WHERE username = 'boss'");
  return r.cookie;
}

describe("sign-up", () => {
  it("creates an account without AI access and signs it in", async () => {
    const env = envWith();
    const r = await signup(env, "alice", { email: "alice@example.com" });
    expect(r.status).toBe(201);
    expect(r.data.user).toEqual({ username: "alice", role: "user", ai: false });
    expect(r.cookie).toMatch(/^bqe_session=.+/);

    const me = await call(env, "GET", "/api/auth/me", undefined, r.cookie);
    expect(me.data.user).toEqual({ username: "alice", role: "user", ai: false });

    const again = await call(env, "POST", "/api/auth/login", { username: "ALICE", password: "correct horse" });
    expect(again.status).toBe(200);
    expect(env.DB.raw.prepare("SELECT last_login_at FROM users WHERE username = 'alice'").get().last_login_at).toBeTruthy();
  });

  it("refuses bad names, short passwords, bad emails and duplicates", async () => {
    const env = envWith();
    expect((await signup(env, "a")).status).toBe(400);
    expect((await signup(env, "has space")).status).toBe(400);
    expect((await call(env, "POST", "/api/auth/signup", { username: "bob", password: "short" })).status).toBe(400);
    expect((await signup(env, "bob", { email: "nope" })).status).toBe(400);
    expect((await signup(env, "bob", { email: "bob@example.com" })).status).toBe(201);
    expect((await signup(env, "BOB")).data.error).toBe("That username is taken.");
    expect((await signup(env, "bobby", { email: "BOB@example.com" })).status).toBe(409);
    expect((await signup(env, "ceo")).status).toBe(409); // the migrated owner account
  });

  it("limits accounts per visitor per day", async () => {
    const env = envWith();
    for (let i = 0; i < 5; i++) expect((await signup(env, `user${i}`, {}, "9.9.9.9")).status).toBe(201);
    expect((await signup(env, "user5", {}, "9.9.9.9")).status).toBe(429);
    expect((await signup(env, "user5", {}, "8.8.8.8")).status).toBe(201);
  });

  it("refuses a sign-up from another site", async () => {
    const env = envWith();
    const res = await worker.fetch!(
      new Request(ORIGIN + "/api/auth/signup", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
        body: JSON.stringify({ username: "mallory", password: "correct horse" }),
      }) as any,
      env,
      {} as any,
    );
    expect(res.status).toBe(403);
  });
});

describe("AI access", () => {
  it("is refused for a new account before any model call", async () => {
    const env = envWith();
    const { cookie } = await signup(env, "alice");
    const chat = await call(env, "POST", "/api/chat", { messages: [{ role: "user", content: "Hi" }] }, cookie);
    expect(chat.status).toBe(403);
    expect(chat.data.code).toBe("ai_access");
    expect((await call(env, "GET", "/api/company/analysis?ticker=NVDA", undefined, cookie)).status).toBe(403);
    expect((await call(env, "POST", "/api/news/refresh", undefined, cookie)).status).toBe(403);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM news_chat_usage").get()).toEqual({ n: 0 });
  });

  it("is let through once an admin grants it, and blocked again when revoked", async () => {
    const env = envWith();
    const boss = await admin(env);
    const { cookie } = await signup(env, "alice");
    const id = env.DB.raw.prepare("SELECT id FROM users WHERE username = 'alice'").get().id;

    const granted = await call(env, "PATCH", `/api/admin/users/${id}`, { ai: true }, boss);
    expect(granted.data.user).toMatchObject({ username: "alice", ai: true });
    expect((await call(env, "GET", "/api/auth/me", undefined, cookie)).data.user.ai).toBe(true);
    // Past the gate: no stored note yet, and GET never calls the model.
    const note = await call(env, "GET", "/api/company/analysis?ticker=NVDA", undefined, cookie);
    expect(note).toMatchObject({ status: 200, data: { analysis: null, cached: false } });

    await call(env, "PATCH", `/api/admin/users/${id}`, { ai: false }, boss);
    expect((await call(env, "GET", "/api/company/analysis?ticker=NVDA", undefined, cookie)).status).toBe(403);
  });

  it("is always on for admins", async () => {
    const env = envWith();
    const boss = await admin(env);
    expect((await call(env, "GET", "/api/auth/me", undefined, boss)).data.user).toEqual({ username: "boss", role: "admin", ai: true });
    expect(env.DB.raw.prepare("SELECT role, ai_access FROM users WHERE username = 'ceo'").get()).toEqual({ role: "admin", ai_access: 1 });
  });
});

describe("admin terminal API", () => {
  it("is for admins only", async () => {
    const env = envWith();
    expect((await call(env, "GET", "/api/admin/users")).status).toBe(401);
    const { cookie } = await signup(env, "alice");
    expect((await call(env, "GET", "/api/admin/users", undefined, cookie)).status).toBe(403);
    expect((await call(env, "PATCH", "/api/admin/users/1", { ai: true }, cookie)).status).toBe(403);
  });

  it("lists every account", async () => {
    const env = envWith();
    const boss = await admin(env);
    await signup(env, "alice", { email: "alice@example.com" });
    const r = await call(env, "GET", "/api/admin/users", undefined, boss);
    expect(r.status).toBe(200);
    expect(r.data.users.map((u: any) => u.username).sort()).toEqual(["alice", "boss", "ceo"]);
    expect(r.data.users.find((u: any) => u.username === "alice")).toMatchObject({
      email: "alice@example.com", role: "user", ai: false, disabled: false, sessions: 1, aiToday: 0,
    });
  });

  it("suspends an account and signs it out everywhere", async () => {
    const env = envWith();
    const boss = await admin(env);
    const { cookie } = await signup(env, "alice");
    const id = env.DB.raw.prepare("SELECT id FROM users WHERE username = 'alice'").get().id;

    expect((await call(env, "PATCH", `/api/admin/users/${id}`, { disabled: true }, boss)).data.user.disabled).toBe(true);
    expect((await call(env, "GET", "/api/auth/me", undefined, cookie)).data.user).toBeNull();
    const login = await call(env, "POST", "/api/auth/login", { username: "alice", password: "correct horse" });
    expect(login).toMatchObject({ status: 403, data: { error: "This account has been suspended." } });

    await call(env, "PATCH", `/api/admin/users/${id}`, { disabled: false }, boss);
    expect((await call(env, "POST", "/api/auth/login", { username: "alice", password: "correct horse" })).status).toBe(200);
  });

  it("resets a password and deletes an account", async () => {
    const env = envWith();
    const boss = await admin(env);
    await signup(env, "alice");
    const id = env.DB.raw.prepare("SELECT id FROM users WHERE username = 'alice'").get().id;

    const reset = await call(env, "POST", `/api/admin/users/${id}/password`, undefined, boss);
    expect(reset.data.password).toHaveLength(12);
    expect((await call(env, "POST", "/api/auth/login", { username: "alice", password: "correct horse" })).status).toBe(401);
    expect((await call(env, "POST", "/api/auth/login", { username: "alice", password: reset.data.password })).status).toBe(200);

    expect((await call(env, "DELETE", `/api/admin/users/${id}`, undefined, boss)).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM users WHERE username = 'alice'").get()).toEqual({ n: 0 });
    expect((await call(env, "DELETE", `/api/admin/users/${id}`, undefined, boss)).status).toBe(404);
  });

  it("won't let an admin lock themselves out", async () => {
    const env = envWith();
    const boss = await admin(env);
    const me = env.DB.raw.prepare("SELECT id FROM users WHERE username = 'boss'").get().id;
    expect((await call(env, "PATCH", `/api/admin/users/${me}`, { disabled: true }, boss)).status).toBe(400);
    expect((await call(env, "PATCH", `/api/admin/users/${me}`, { role: "user" }, boss)).status).toBe(400);
    expect((await call(env, "DELETE", `/api/admin/users/${me}`, undefined, boss)).status).toBe(400);
    expect((await call(env, "PATCH", `/api/admin/users/${me}`, { role: "nope" }, boss)).status).toBe(400);
  });
});
