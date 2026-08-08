import type { PresenceConnectionAttachment } from '../../lib/realtime/events';

interface PresenceEnv {
  DB: D1Database;
  CHAT_ROOM: DurableObjectNamespace;
}

const OFFLINE_GRACE_PERIOD_MS = 5_000;
const PENDING_OFFLINE_STORAGE_KEY = 'pendingOfflineUserId';

/**
 * One instance of this Durable Object exists per user (id derived via
 * `idFromName(userId)`). The client opens a single presence socket per
 * session (independent of which chat is open) when the app loads. While at
 * least one socket is open, the user is "online"; when the last one
 * closes, a short grace period (via a DO alarm) absorbs tab refreshes and
 * brief reconnects before flipping the user to "offline" and stamping
 * last_seen_at.
 *
 * D1's `users.is_online`/`last_seen_at` stay the durable source of truth
 * (read on page load / profile view); this object's job is turning
 * connect/disconnect events into (a) that D1 write and (b) an instant push
 * to everyone who has that user's chats open, instead of making every
 * peer poll for presence changes.
 */
export class PresenceDurableObject {
  private readonly state: DurableObjectState;
  private readonly env: PresenceEnv;

  constructor(state: DurableObjectState, env: PresenceEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/connect') {
      return this.handleWebSocketUpgrade(request, url);
    }

    if (url.pathname === '/internal/status' && request.method === 'GET') {
      return Response.json({ online: this.state.getWebSockets().length > 0 });
    }

    if (url.pathname === '/internal/notify' && request.method === 'POST') {
      return this.handleInternalNotify(request);
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Pushes an arbitrary event to every socket this user currently has
   * open (typically one per browser tab). Used for things that aren't
   * scoped to a single chat room — e.g. "a new message arrived in a chat
   * you're not currently viewing" — so the sidebar can update itself
   * instead of being polled.
   */
  private async handleInternalNotify(request: Request): Promise<Response> {
    const event = await request.json();
    const payload = JSON.stringify(event);
    let delivered = 0;
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(payload);
        delivered++;
      } catch {
        // Socket already closing — hibernation runtime will clean it up.
      }
    }
    return Response.json({ delivered });
  }

  private async handleWebSocketUpgrade(request: Request, url: URL): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const userId = url.searchParams.get('userId');
    if (!userId) {
      return new Response('Missing userId', { status: 400 });
    }

    const wasOffline = this.state.getWebSockets().length === 0;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    this.state.acceptWebSocket(server, [userId]);
    const attachment: PresenceConnectionAttachment = { userId, connectedAt: Date.now() };
    server.serializeAttachment(attachment);

    // A reconnect within the grace period cancels the pending "go offline"
    // alarm set by the previous close.
    const pendingUserId = await this.state.storage.get<string>(PENDING_OFFLINE_STORAGE_KEY);
    if (pendingUserId === userId) {
      await this.state.storage.delete(PENDING_OFFLINE_STORAGE_KEY);
      await this.state.storage.deleteAlarm();
    }

    if (wasOffline) {
      await this.markOnline(userId);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(): Promise<void> {
    // Presence sockets are server -> client only. Any inbound frame (e.g. a
    // client-side keepalive ping) requires no application-level handling.
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as PresenceConnectionAttachment | null;
    if (!attachment) return;

    const stillConnected = this.state.getWebSockets(attachment.userId).length > 0;
    if (!stillConnected) {
      await this.state.storage.put(PENDING_OFFLINE_STORAGE_KEY, attachment.userId);
      await this.state.storage.setAlarm(Date.now() + OFFLINE_GRACE_PERIOD_MS);
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, 'WebSocket error');
    } catch {
      // ignore — already closed
    }
  }

  /** Fired after the grace period following a user's last socket closing. */
  async alarm(): Promise<void> {
    const userId = await this.state.storage.get<string>(PENDING_OFFLINE_STORAGE_KEY);
    if (!userId) return;
    await this.state.storage.delete(PENDING_OFFLINE_STORAGE_KEY);

    const reconnectedInTheMeantime = this.state.getWebSockets(userId).length > 0;
    if (!reconnectedInTheMeantime) {
      await this.markOffline(userId);
    }
  }

  private async markOnline(userId: string): Promise<void> {
    await this.env.DB.prepare('UPDATE users SET is_online = 1, updated_at = ? WHERE id = ?')
      .bind(Date.now(), userId)
      .run();
    await this.fanOutToUserChats(userId, {
      type: 'presence:update',
      userId,
      isOnline: true,
      lastSeenAt: null,
    });
  }

  private async markOffline(userId: string): Promise<void> {
    const lastSeenAt = Date.now();
    await this.env.DB.prepare('UPDATE users SET is_online = 0, last_seen_at = ?, updated_at = ? WHERE id = ?')
      .bind(lastSeenAt, lastSeenAt, userId)
      .run();
    await this.fanOutToUserChats(userId, {
      type: 'presence:update',
      userId,
      isOnline: false,
      lastSeenAt,
    });
  }

  private async fanOutToUserChats(
    userId: string,
    event: { type: 'presence:update'; userId: string; isOnline: boolean; lastSeenAt: number | null },
  ): Promise<void> {
    const { results } = await this.env.DB.prepare(
      'SELECT chat_id FROM chat_members WHERE user_id = ? AND left_at IS NULL',
    )
      .bind(userId)
      .all<{ chat_id: string }>();

    const chatIds = (results ?? []).map((row) => row.chat_id);
    const payload = JSON.stringify(event);

    await Promise.all(
      chatIds.map(async (chatId) => {
        const stub = this.env.CHAT_ROOM.get(this.env.CHAT_ROOM.idFromName(chatId));
        try {
          await stub.fetch('https://internal/internal/broadcast', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: payload,
          });
        } catch {
          // Best-effort: D1 (the source of truth for is_online/last_seen_at)
          // was already updated above, so a failed push here only delays
          // that particular room's connected clients seeing the change
          // until their next reconnect — not a correctness issue.
        }
      }),
    );
  }
}
