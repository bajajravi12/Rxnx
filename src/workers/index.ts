import { Hono } from 'hono';
import { consumeWsTicket } from '../lib/realtime/ticket';
import { ChatRoomDurableObject } from './durable-objects/chat-room';
import { PresenceDurableObject } from './durable-objects/presence';

export { ChatRoomDurableObject, PresenceDurableObject };

interface RealtimeWorkerEnv {
  DB: D1Database;
  SESSIONS_KV: KVNamespace;
  UPLOADS_BUCKET: R2Bucket;
  CHAT_ROOM: DurableObjectNamespace;
  PRESENCE: DurableObjectNamespace;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: RealtimeWorkerEnv }>();

app.get('/health', (c) => c.json({ ok: true, service: 'nova-chat-realtime', time: Date.now() }));

/**
 * WebSocket upgrade for a specific chat room. Requires a short-lived
 * ticket minted by the authenticated Next.js route at
 * GET /api/ws/[chatId] — this worker has no access to the app's session
 * cookie (different origin), so tickets are how authentication crosses
 * that boundary safely.
 */
app.get('/ws/chat/:chatId', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  const chatId = c.req.param('chatId');
  const ticket = c.req.query('ticket');
  if (!ticket) return c.text('Missing ticket', 401);

  const payload = await consumeWsTicket(c.env.SESSIONS_KV, ticket);
  if (!payload) return c.text('Invalid or expired ticket', 401);
  if (payload.chatId !== chatId) return c.text('Ticket does not authorize this chat', 403);

  const membership = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
  )
    .bind(chatId, payload.userId)
    .first();
  if (!membership) return c.text('You are not a member of this chat', 403);

  const stub = c.env.CHAT_ROOM.get(c.env.CHAT_ROOM.idFromName(chatId));

  const connectUrl = new URL(c.req.url);
  connectUrl.pathname = '/connect';
  connectUrl.search = '';
  connectUrl.searchParams.set('userId', payload.userId);
  connectUrl.searchParams.set('displayName', payload.displayName);
  if (payload.avatarUrl) connectUrl.searchParams.set('avatarUrl', payload.avatarUrl);

  // Passing the original request as the second argument preserves the
  // runtime's internal WebSocket-upgrade linkage (headers alone aren't
  // enough) — this is Cloudflare's documented pattern for forwarding a
  // WebSocket upgrade to a Durable Object at a rewritten URL.
  return stub.fetch(connectUrl.toString(), c.req.raw as unknown as RequestInit);
});

/** WebSocket upgrade for the per-user presence channel. */
app.get('/ws/presence', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  const ticket = c.req.query('ticket');
  if (!ticket) return c.text('Missing ticket', 401);

  const payload = await consumeWsTicket(c.env.SESSIONS_KV, ticket);
  if (!payload) return c.text('Invalid or expired ticket', 401);

  const stub = c.env.PRESENCE.get(c.env.PRESENCE.idFromName(payload.userId));

  const connectUrl = new URL(c.req.url);
  connectUrl.pathname = '/connect';
  connectUrl.search = '';
  connectUrl.searchParams.set('userId', payload.userId);

  return stub.fetch(connectUrl.toString(), c.req.raw as unknown as RequestInit);
});

export default app;
