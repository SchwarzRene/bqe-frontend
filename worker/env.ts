export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;

  // [vars] in wrangler.toml
  STACK_BATCH?: string;
  MARKETTAPE_TICKERS?: string;
  GEMINI_MODEL?: string;

  // Secrets — `npx wrangler secret put NAME`, never in wrangler.toml.
  GEMINI_API_KEY?: string; // Market Tape; free key from aistudio.google.com
  ADMIN_TOKEN?: string; // guards /api/admin/*
}
