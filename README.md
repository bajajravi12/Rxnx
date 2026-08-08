# Nova

A fast, focused, Telegram-inspired realtime messaging app, built on Next.js 15 and Cloudflare's edge platform (Pages, Workers, D1, KV, R2, Durable Objects).

## Architecture

Nova is **two coordinated deployables from one repo**, not a single app:

1. **`nova-chat-web`** (Cloudflare Pages) — the Next.js 15 App Router application: every page, every REST API route (`src/app/api/**`), auth, and all D1/R2 reads and writes.
2. **`nova-chat-realtime`** (Cloudflare Workers) — a small Hono app that owns two Durable Object classes:
   - **`ChatRoomDurableObject`** — one instance per chat (direct or group). Holds the live WebSocket connections for whoever currently has that chat open, and fans out new messages, edits, deletes, reactions, read receipts, and typing indicators.
   - **`PresenceDurableObject`** — one instance per user. Tracks online/offline status across tabs/devices, and doubles as a lightweight per-user event bus (e.g. "a message arrived in a chat you're not currently viewing") so the sidebar can update live without polling.

Why split them: the Pages app can bind to those same Durable Object classes *cross-script* (see `script_name` in `wrangler.toml`), so REST routes and WebSocket routes both talk to the same DO instances without needing to duplicate realtime logic in two places.

**Auth handoff between the two:** the browser never talks to the realtime worker directly with a session cookie (different origin). Instead, the Pages app mints a short-lived, one-time-use WebSocket ticket (`src/lib/realtime/ticket.ts`, stored in `SESSIONS_KV`, 30s TTL) via `GET /api/ws/[chatId]` or `GET /api/ws/presence`, and the client connects to the realtime worker with that ticket.

**Uploads** stream directly through the Pages app's own edge routes into R2 (`env.UPLOADS_BUCKET.put(key, request.body)`), rather than using S3-style presigned URLs — R2 presigning needs AWS SigV4 credentials, a different credential system from the R2 binding, so streaming through the Worker (same-origin, so the session cookie just works, no ticket needed) was the simpler correct choice here.

## Tech stack

- Next.js 15 (App Router) · React 19 · TypeScript 5.7 (strict)
- Hono (realtime worker only) · Cloudflare D1 / KV / R2 / Durable Objects
- Tailwind CSS 3 · Framer Motion · `@tanstack/react-virtual` · Zod · nanoid

## Project structure

```
src/
  app/
    (auth)/login, register/          # public auth pages
    (main)/                          # authenticated shell (sidebar + content)
      chats/[chatId]/                # conversation view
      groups/[groupId]/              # group info/management
      search/, settings/
    api/                             # every REST route (edge runtime)
  components/                        # ui/, chat/, sidebar/, composer/, group/, settings/, upload/, providers/
  hooks/                             # use-chats, use-chat-messages, use-realtime-socket, ...
  lib/
    auth/, db/, realtime/, validation/, utils/, cloudflare/
  workers/                           # the realtime worker's own source (Durable Objects, Hono entry)
    durable-objects/chat-room.ts, presence.ts
    index.ts

db/
  migrations/                        # 0001 initial schema, 0002 nullable attachment message_id
  seed/seed.sql                      # demo data for local UI development
```

`src/workers/**` is a separate TypeScript project (`tsconfig.worker.json`) — it never imports via the `@/` alias, since it's bundled independently by `wrangler`, not by Next.js.

## Prerequisites

- Node.js 20+
- A Cloudflare account with Workers Paid plan (Durable Objects require it) and `wrangler` CLI (`npm install -g wrangler`, or use `npx wrangler`)

## First-time setup

```bash
npm install
```

### 1. Create the Cloudflare resources

```bash
wrangler d1 create nova-chat-db
wrangler kv namespace create SESSIONS_KV
wrangler kv namespace create SESSIONS_KV --preview
wrangler kv namespace create RATE_LIMIT_KV
wrangler kv namespace create RATE_LIMIT_KV --preview
wrangler r2 bucket create nova-chat-uploads
```

Each command prints an id. Copy them into the `REPLACE_WITH_*` placeholders in **both** `wrangler.toml` and `wrangler.realtime.toml` (they share the same D1 database and `SESSIONS_KV` namespace — search for `REPLACE_WITH_` to find every spot).

### 2. Set the session secret

```bash
openssl rand -base64 48   # copy the output

cp .dev.vars.example .dev.vars   # paste it in for local dev
wrangler secret put SESSION_SECRET --config wrangler.toml           # for the Pages deploy
wrangler secret put SESSION_SECRET --config wrangler.realtime.toml  # for the Workers deploy
```

### 3. Run migrations

```bash
npm run db:migrate:local    # local dev D1
npm run db:migrate:remote   # production D1 — run once, before first deploy
```

### 4. (Optional) seed local data

```bash
npm run db:seed:local
```

This inserts three demo users and some chats/messages/a group for UI development — but their password hashes are placeholders that **will not authenticate**. Register those same usernames (`alice`, `bob`, `carol`) through the real `/api/auth/register` endpoint instead; the seed exists purely to populate a chat list without clicking through onboarding repeatedly.

## Local development

Nova needs **two dev servers running simultaneously** (matching the two-deployable architecture above):

```bash
npm run dev             # Next.js app — http://localhost:3000
npm run dev:realtime    # realtime Worker — wrangler dev, separate terminal
```

`next dev` uses `@cloudflare/next-on-pages`'s `setupDevPlatform()` (wired in `next.config.mjs`) to make D1/KV/R2/DO bindings available locally, reading `.dev.vars` for secrets.

## Deploying

```bash
npm run deploy   # realtime worker first, then the Pages app
```

Order matters the first time: the Pages app's cross-script Durable Object bindings need the realtime worker to already exist. After the first deploy, update `REALTIME_WORKER_URL` in `wrangler.toml` to the real `*.workers.dev` URL (or a custom domain) wrangler assigns.

## Deploying on the free plan

Durable Objects — which power the realtime worker (`nova-chat-realtime`) — need the Workers **Paid** plan ($5/mo). Everything else (Pages, D1, KV, R2) has a usable free tier. If Paid isn't an option right now, Nova can run in **polling mode** instead: no realtime worker at all, the client just re-fetches on an interval.

**What you lose:** typing indicators (there's no reasonable way to poll for those without hammering the API far harder than message polling itself, so they're just off), and messages/edits/reactions/read receipts land with a few seconds of latency instead of instantly. **What you don't lose:** every message is still written to D1 immediately, exactly like the realtime version — polling only affects how fast *other* people's screens catch up, never durability.

Steps, on top of the normal setup above:

1. **Don't create or deploy `nova-chat-realtime` at all.** Skip `wrangler.realtime.toml` entirely.
2. In `wrangler.toml`:
   - Set `REALTIME_MODE = "polling"`.
   - Delete the `REALTIME_WORKER_URL` line.
   - Delete both `[[durable_objects.bindings]]` blocks. This one isn't optional — a `script_name` binding pointing at a worker that was never deployed fails the Pages deploy at publish time, not gracefully at runtime.
3. Deploy just the Pages app: `npm run pages:deploy` (skip `npm run deploy`, which tries to deploy the realtime worker first).

**Upgrading later:** nothing needs to be rewritten. Create the realtime worker resources, fill the D1/KV IDs and `REALTIME_WORKER_URL` back into `wrangler.toml`, restore the `[[durable_objects.bindings]]` blocks, flip `REALTIME_MODE` back to `"websocket"`, and deploy both. The polling code paths in `use-chats.ts` / `use-chat-messages.ts` simply stop being used — they don't need to be removed.

## Useful scripts

| Script | What it does |
|---|---|
| `npm run typecheck` / `typecheck:worker` | `tsc --noEmit` for the Next app / the realtime worker |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run db:studio` | Quick `SELECT name FROM sqlite_master...` against local D1 |
| `npm run pages:preview` | Build + serve the Pages output locally via `wrangler pages dev` |

## API surface

All routes are edge runtime, live under `src/app/api/`:

**Auth** — `POST /auth/register`, `/login`, `/logout`, `/change-password`, `GET /auth/session`, `GET /auth/sessions`, `DELETE /auth/sessions/[sessionId]`, `POST /auth/sessions/revoke-others`
**Chats** — `GET/POST /chats`, `GET/PATCH /chats/[chatId]`, `GET/POST /chats/[chatId]/messages`, `PATCH/DELETE /chats/[chatId]/messages/[messageId]`, `GET /chats/[chatId]/messages/context/[messageId]` (jump-to-message), `POST /chats/[chatId]/read`
**Groups** — `POST /groups`, `GET/PATCH/DELETE /groups/[groupId]`, `GET/POST /groups/[groupId]/members`, `PATCH/DELETE /groups/[groupId]/members/[userId]`
**Reactions & pins** — `POST/DELETE /reactions/[messageId]`, `GET/POST/DELETE /pins/[chatId]`
**Uploads** — `POST /uploads/presign`, `PUT/GET /uploads/[fileId]`
**Search** — `GET /search/global`, `GET /search/messages`
**Users & profile** — `GET /users/[username]`, `PATCH /users/me`, `PUT/DELETE /users/me/avatar`, `GET /avatars/[userId]`
**Blocking** — `GET/POST /blocked`, `DELETE /blocked/[userId]`
**Realtime tickets** — `GET /ws/[chatId]`, `GET /ws/presence`

## Known scope boundaries

Built deliberately, not accidentally missing — documented here rather than silently glossed over:

- **No server-side image thumbnails.** Workers has no `sharp`/image-processing library available; dimensions for images/video are read client-side before upload instead.
- **Read receipts are sent/read only**, not sent/delivered/read — there's no per-recipient delivery-ack storage, only read *positions*, so a third "delivered" tick would be unfounded.
- **Sidebar online dots reflect last-fetch state**, not a live feed — presence updates fan out to a chat's Durable Object (live within an *open* chat), but the sidebar isn't connected to every chat it lists, so it updates on next fetch/focus rather than instantly. Documented tradeoff, not a bug.
- **No group ownership transfer.** An owner can't leave their own group — only delete it — since there's no flow yet to hand ownership to another member first.
- **Groups aren't publicly discoverable.** "Search groups" only searches groups you're already in; joining happens by invite (being added), not by search-and-join.
- **No orphaned-upload cleanup job.** An attachment uploaded but never attached to a sent message (abandoned upload) leaves an R2 object with no referencing message row. No Cron Trigger is wired up to sweep these.
- **Jump-to-message is one-directional.** After jumping to a search result, you can keep scrolling *up* into older history normally, but there's no "load newer" back to the live tail from a jumped-to position — reopening the chat gets you back to latest, the same tradeoff most chat apps make here.
