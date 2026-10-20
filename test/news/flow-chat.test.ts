// Market News end to end: the chat and the S&P 500 screen (real SQLite, stubbed internet).

import { afterEach, describe, expect, it, vi } from "vitest";
import { handleChat } from "../../worker/news/index";
import { handleConversations } from "../../worker/news/conversations";
import { mergeScreen, screenRow } from "../../worker/screen";
import { ingest, cfg, NOW, gemini, internet, envWith, briefingFrom, sha256 } from "./flow-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Market News flow: chat", () => {
  it("answers stock-idea questions from the S&P 500 screen", async () => {
    const prompts: string[] = [];
    const results: any[] = [];
    internet({
      chat: (body) => {
        prompts.push(body.systemInstruction.parts[0].text);
        const last = body.contents[body.contents.length - 1];
        const reply = last.parts[0].functionResponse;
        if (!reply) return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "screen_stocks", args: { sort_by: "r1m", order: "asc", limit: 2 } } }] } }] }));
        results.push(reply);
        if (reply.name === "screen_stocks") return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "get_company", args: { query: "nvidia" } } }] } }] }));
        return gemini("Weakest: SLIP. Screen-based ideas, not investment advice.\nSOURCES: none");
      },
    });
    const env = envWith();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW + 10 * 60_000);
    await ingest(env, Date.now(), cfg);
    env.DB.raw.exec("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('" +
      (await sha256("tok")) + "', 1, '2026-01-01', '2999-01-01')");
    const bars = (drift: number) => {
      const end = Math.floor(NOW / 86_400_000) - 1;
      const t = Array.from({ length: 260 }, (_, i) => end - 259 + i);
      const c = t.map((_, i) => 100 * (1 + drift) ** i);
      return { tu: 86_400_000, t, o: c, h: c, l: c, c };
    };
    await mergeScreen(env, [
      screenRow({ s: "NVDA", n: "NVIDIA Corporation", sec: "Information Technology" }, bars(0.004))!,
      screenRow({ s: "SLIP", n: "Slip Industries", sec: "Industrials" }, bars(-0.004))!,
      screenRow({ s: "FLAT", n: "Flat Co.", sec: "Utilities" }, bars(0))!,
    ]);

    const res = await handleChat(new Request("https://site/api/chat", {
      method: "POST",
      headers: { Cookie: "bqe_session=tok", Origin: "https://site" },
      body: JSON.stringify({ messages: [{ role: "user", content: "What could be a short today?" }], page: "stocks" }),
    }), env);
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.answer).toBe("Weakest: SLIP. Screen-based ideas, not investment advice.");

    // The summary is in the prompt, and the rules allow ideas.
    expect(prompts[0]).toContain("S&P 500 SCREEN\nAs of the close on 2026-09-23; 3 constituents");
    expect(prompts[0]).toMatch(/Bottom 10 over 1 month:\nSLIP Slip Industries \(Industrials\)/);
    expect(prompts[0]).toContain("Stock ideas: when asked for picks, longs, shorts");
    // screen_stocks ranks the whole screen; get_company finds Nvidia by name,
    // with its live price and its headlines.
    expect(results[0].response.rows.map((r: string) => r.split(" ")[0])).toEqual(["SLIP", "FLAT"]);
    const nvda = results[1].response;
    expect(nvda.screen).toMatch(/^NVDA NVIDIA Corporation \(Information Technology\)/);
    expect(nvda.live.price).toBe(110);
    expect(nvda.headlines.map((h: any) => h.title)).toContain("Nvidia shares recover part of this week's losses");
  });

  it("answers signed-in users with sources, counts the limit, and refuses past it", async () => {
    internet({
      briefing: briefingFrom,
      chat: (body) => {
        const last = body.contents[body.contents.length - 1];
        if (last.parts[0].functionResponse) {
          const price = last.parts[0].functionResponse.response;
          return gemini(`Nvidia is up ${price.changePercentOver5Days}% over five days.\nSOURCES: ${body.systemInstruction.parts[0].text.match(/\n([0-9a-f]{12}) \|[^\n]*Nvidia/)[1]}`);
        }
        return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "get_price", args: { symbol: "NVDA" } } }] } }] }));
      },
    });
    const env = envWith();
    env.NEWS_CHAT_DAILY_LIMIT = "1";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW + 10 * 60_000);
    await ingest(env, Date.now(), cfg);
    env.DB.raw.exec("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('" +
      (await sha256("tok")) + "', 1, '2026-01-01', '2999-01-01')");

    const ask = () => handleChat(new Request("https://site/api/chat", {
      method: "POST",
      headers: { Cookie: "bqe_session=tok", Origin: "https://site" },
      body: JSON.stringify({ messages: [{ role: "user", content: "How is Nvidia doing?" }], page: "stocks" }),
    }), env);
    const res = await ask();
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.answer).toBe("Nvidia is up 10% over five days.");
    expect(body.sources).toEqual([{ label: "Wire", url: "https://wire.example/nvda", id: expect.any(String) }]);
    expect(body.remaining).toBe(0);

    // The question and the answer are saved to the account.
    expect(body.conversationId).toMatch(/^[0-9a-f]{32}$/);
    const saved: any = await (await handleConversations(new Request(`https://site/api/chats/${body.conversationId}`, {
      headers: { Cookie: "bqe_session=tok" },
    }), env, body.conversationId)).json();
    expect(saved.title).toBe("How is Nvidia doing?");
    expect(saved.messages.map((m: any) => [m.role, m.text])).toEqual([
      ["user", "How is Nvidia doing?"],
      ["assistant", "Nvidia is up 10% over five days."],
    ]);
    expect(saved.messages[1].sources).toEqual([{ label: "Wire", url: "https://wire.example/nvda" }]);

    const again = await ask();
    expect(again.status).toBe(429);
  });

  it("shows Gemini's reason when the chat fails, and does not count the question", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("generativelanguage")
        ? new Response(JSON.stringify({ error: { code: 404, status: "NOT_FOUND", message: "models/gemini-9 is not found for API version v1beta" } }), { status: 404 })
        : new Response("", { status: 404 }));
    const env = envWith();
    env.DB.raw.exec("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('" + (await sha256("tok")) + "', 1, '2026-01-01', '2999-01-01')");
    const res = await handleChat(new Request("https://site/api/chat", {
      method: "POST",
      headers: { Cookie: "bqe_session=tok", Origin: "https://site" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    }), env);
    expect(res.status).toBe(502);
    expect((await res.json<any>()).error).toBe("The model could not answer: NOT_FOUND — models/gemini-9 is not found for API version v1beta");
    expect(env.DB.raw.prepare("SELECT count FROM news_chat_usage").get()).toEqual({ count: 0 });
  });
});
