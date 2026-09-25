export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;

  // [vars] in wrangler.toml
  STACK_BATCH?: string;
  GEMINI_MODEL?: string;
  GEMINI_CHAT_MODEL?: string; // Market News chat; falls back to GEMINI_MODEL
  GEMINI_FALLBACK_MODEL?: string; // comma-separated, tried in order when the model is overloaded or over quota; "off" for none
  NEWS_CHAT_SEARCH?: string; // "on" = Google Search grounding for the chat
  NEWS_CHAT_DAILY_LIMIT?: string; // questions per user per day

  // Secrets — `npx wrangler secret put NAME`, never in wrangler.toml.
  GEMINI_API_KEY?: string; // Market News briefing and chat; free key from aistudio.google.com
  ADMIN_TOKEN?: string; // guards /api/admin/*
}
