/** Cloudflare's rate-limiting binding ([[ratelimits]] in wrangler.toml). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;

  // [[ratelimits]] in wrangler.toml. Optional so tests and local previews run without them.
  AUTH_LIMITER?: RateLimiter; // /api/auth/* per visitor
  MARKET_LIMITER?: RateLimiter; // /api/market/*, /api/quotes/* per visitor

  // [vars] in wrangler.toml
  STACK_BATCH?: string;
  GEMINI_MODEL?: string;
  GEMINI_CHAT_MODEL?: string; // Market News chat; falls back to GEMINI_MODEL
  GEMINI_FALLBACK_MODEL?: string; // comma-separated, tried in order when the model is overloaded or over quota; "off" for none
  NEWS_CHAT_SEARCH?: string; // "on" = Google Search grounding for the chat
  NEWS_CHAT_DAILY_LIMIT?: string; // questions per user per day
  SIGNUP_HOURLY_LIMIT?: string; // new accounts per hour, site-wide
  PBKDF2_ITERATIONS?: string; // for passwords set from now on; older ones are rehashed at sign-in
  PASSWORD_BREACH_CHECK?: string; // "off" skips the Have I Been Pwned lookup for new passwords
  TURNSTILE_SITE_KEY?: string; // public; with TURNSTILE_SECRET, sign-up needs a Turnstile token
  TURNSTILE_HOSTNAMES?: string; // comma-separated hostnames a token may be solved on; unset = the request's own host

  // Secrets — `npx wrangler secret put NAME`, never in wrangler.toml.
  GEMINI_API_KEY?: string; // Market News briefing and chat; free key from aistudio.google.com
  ADMIN_TOKEN?: string; // guards /api/admin/run/*
  IP_HASH_SECRET?: string; // keys the daily visitor hash, so a copy of the database cannot be reversed to IPs
  TURNSTILE_SECRET?: string; // Cloudflare Turnstile, for sign-up
}
