// Ambient, global declaration (no import/export) so `CloudflareEnv` is
// available everywhere in the Next.js app without an explicit import.
// This must be kept in sync with the bindings declared in wrangler.toml.

interface CloudflareEnv {
  [key: string]: unknown;
  // --- D1 -------------------------------------------------------------
  DB: D1Database;

  // --- KV ---------------------------------------------------------------
  SESSIONS_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;

  // --- R2 -----------------------------------------------------------
  UPLOADS_BUCKET: R2Bucket;

  // --- Durable Objects (cross-script, owned by nova-chat-realtime) ----
  // Optional: a free-tier deployment (Workers Paid plan not available)
  // omits these bindings entirely from wrangler.toml and runs in
  // REALTIME_MODE=polling instead — see src/lib/realtime/broadcast.ts,
  // which never touches these unless the mode is "websocket".
  CHAT_ROOM?: DurableObjectNamespace;
  PRESENCE?: DurableObjectNamespace;

  // --- Vars (wrangler.toml [vars]) — all wrangler vars are strings ----
  ENVIRONMENT: 'production' | 'preview' | 'development';
  APP_NAME: string;
  SESSION_COOKIE_NAME: string;
  SESSION_TTL_SECONDS: string;
  REMEMBER_ME_TTL_SECONDS: string;
  MAX_UPLOAD_BYTES: string;
  // "websocket" (default, needs Workers Paid for Durable Objects) or
  // "polling" (free-tier friendly — see README's "Free tier" section).
  REALTIME_MODE: 'websocket' | 'polling';
  // Only required/used when REALTIME_MODE is "websocket".
  REALTIME_WORKER_URL?: string;

  // --- Secrets (set via `wrangler secret put`, or .dev.vars locally) --
  SESSION_SECRET: string;
}
