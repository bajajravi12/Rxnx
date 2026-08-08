import type { ChatServerEvent, PresenceServerEvent } from './events';

/**
 * Notifies the ChatRoomDurableObject for `chatId` of an event so it can
 * push it to every currently-connected member's WebSocket. Called by API
 * routes *after* the corresponding D1 write has already succeeded — D1
 * remains the source of truth even if this best-effort push fails (e.g.
 * the DO is briefly unreachable); a client that missed a live update will
 * still see it on their next fetch/reconnect.
 *
 * In a free-tier deploy (REALTIME_MODE=polling, no Durable Objects bound
 * at all) this is a deliberate no-op — clients discover the same event via
 * their next poll instead. Never throws either way, so callers can fire
 * this without wrapping every call site in its own try/catch.
 */
export async function broadcastToChatRoom(
  env: CloudflareEnv,
  chatId: string,
  event: ChatServerEvent,
): Promise<void> {
  if (env.REALTIME_MODE === 'polling' || !env.CHAT_ROOM) return;

  try {
    const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(chatId));
    await stub.fetch('https://internal/internal/broadcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch (error) {
    console.error(`[broadcast] failed to notify chat room ${chatId}`, error);
  }
}

/**
 * Pushes a cross-chat notification over a specific user's presence
 * socket — this is how the sidebar learns about a new message in a chat
 * the user isn't currently viewing, without polling. A no-op if that user
 * has no open presence connection (they'll simply see it on next load),
 * and equally a no-op in polling mode (see broadcastToChatRoom above).
 */
export async function notifyUserPresence(
  env: CloudflareEnv,
  userId: string,
  event: PresenceServerEvent,
): Promise<void> {
  if (env.REALTIME_MODE === 'polling' || !env.PRESENCE) return;

  try {
    const stub = env.PRESENCE.get(env.PRESENCE.idFromName(userId));
    await stub.fetch('https://internal/internal/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch (error) {
    console.error(`[broadcast] failed to notify user ${userId}`, error);
  }
}
