export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;

  // [vars] in wrangler.toml
  STACK_BATCH?: string;
  MARKETTAPE_TICKERS?: string;
  GEMINI_MODEL?: string;
  GEMINI_CHAT_MODEL?: string; // Market News chat; falls back to GEMINI_MODEL
  NEWS_CHAT_SEARCH?: string; // "on" = Google Search grounding for the chat
  NEWS_CHAT_DAILY_LIMIT?: string; // questions per user per day

  // Secrets — `npx wrangler secret put NAME`, never in wrangler.toml.
  GEMINI_API_KEY?: string; // Market News + its calendar job; free key from aistudio.google.com
  ADMIN_TOKEN?: string; // guards /api/admin/*
}
