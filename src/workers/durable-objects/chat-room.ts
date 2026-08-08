import type { ChatClientMessage, ChatConnectionAttachment, ChatServerEvent } from '../../lib/realtime/events';

interface ChatRoomEnv {
  DB: D1Database;
}

/**
 * One instance of this Durable Object exists per chat (its id is derived
 * via `idFromName(chatId)`). It does two jobs:
 *
 *  1. Terminates WebSocket connections from chat members (via the
 *     Hibernation API — `state.acceptWebSocket`/`webSocketMessage`/
 *     `webSocketClose` — so the object can be evicted from memory between
 *     bursts of activity without dropping the logical connection or
 *     costing ongoing compute).
 *  2. Accepts trusted internal POST /internal/broadcast calls from the
 *     Next.js API routes (after those routes have already written to D1)
 *     and fans the resulting event out to every currently-connected
 *     member's socket. This DO never writes to D1 itself for message
 *     content — D1 stays the single source of truth, and this object is
 *     purely a live fan-out hub plus the home for genuinely ephemeral
 *     state (who's currently typing).
 */
export class ChatRoomDurableObject {
  private readonly state: DurableObjectState;
  private readonly env: ChatRoomEnv;

  constructor(state: DurableObjectState, env: ChatRoomEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/connect') {
      return this.handleWebSocketUpgrade(request, url);
    }

    if (url.pathname === '/internal/broadcast' && request.method === 'POST') {
      return this.handleInternalBroadcast(request);
    }

    if (url.pathname === '/internal/typers' && request.method === 'GET') {
      return Response.json(this.getCurrentTypers());
    }

    return new Response('Not found', { status: 404 });
  }

  private handleWebSocketUpgrade(request: Request, url: URL): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const userId = url.searchParams.get('userId');
    const displayName = url.searchParams.get('displayName');
    const avatarUrl = url.searchParams.get('avatarUrl');

    if (!userId || !displayName) {
      return new Response('Missing required connection parameters', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Tagging the accepted socket with the userId lets us later ask
    // `state.getWebSockets(userId)` to find all of this user's open
    // sockets in this room (e.g. multiple browser tabs) without keeping a
    // separate in-memory map that wouldn't survive hibernation anyway.
    this.state.acceptWebSocket(server, [userId]);

    const attachment: ChatConnectionAttachment = {
      userId,
      displayName,
      avatarUrl: avatarUrl || null,
      connectedAt: Date.now(),
    };
    server.serializeAttachment(attachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    let parsed: ChatClientMessage;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    const attachment = ws.deserializeAttachment() as ChatConnectionAttachment | null;
    if (!attachment) return;

    if (parsed.type === 'typing:start' || parsed.type === 'typing:stop') {
      this.broadcast(
        {
          type: 'typing:update',
          userId: attachment.userId,
          displayName: attachment.displayName,
          isTyping: parsed.type === 'typing:start',
        },
        ws,
      );
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachment = ws.deserializeAttachment() as ChatConnectionAttachment | null;

    if (!wasClean) {
      try {
        ws.close(code, reason);
      } catch {
        // Socket may already be fully closed — nothing to do.
      }
    }

    if (attachment) {
      const stillHasOtherSockets = this.state
        .getWebSockets(attachment.userId)
        .some((socket) => socket !== ws);

      // If that was this user's last open socket in the room, proactively
      // clear their typing indicator for everyone else rather than waiting
      // for a timeout on the client side.
      if (!stillHasOtherSockets) {
        this.broadcast(
          {
            type: 'typing:update',
            userId: attachment.userId,
            displayName: attachment.displayName,
            isTyping: false,
          },
          ws,
        );
      }
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, 'WebSocket error');
    } catch {
      // ignore — already closed
    }
  }

  private async handleInternalBroadcast(request: Request): Promise<Response> {
    const event = await request.json<ChatServerEvent>();
    this.broadcast(event);
    return Response.json({ delivered: this.state.getWebSockets().length });
  }

  private broadcast(event: ChatServerEvent, exclude?: WebSocket): void {
    const payload = JSON.stringify(event);
    for (const socket of this.state.getWebSockets()) {
      if (socket === exclude) continue;
      try {
        socket.send(payload);
      } catch {
        // A socket that throws here is already in a closed/closing state;
        // the hibernation runtime will clean it up on its own.
      }
    }
  }

  private getCurrentTypers(): Array<{ userId: string; displayName: string }> {
    const seen = new Map<string, string>();
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as ChatConnectionAttachment | null;
      if (attachment) seen.set(attachment.userId, attachment.displayName);
    }
    return Array.from(seen, ([userId, displayName]) => ({ userId, displayName }));
  }
}
