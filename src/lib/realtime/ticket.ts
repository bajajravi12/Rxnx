import { generateSessionToken } from '../auth/tokens';

const TICKET_TTL_SECONDS = 30;

export interface WsTicketPayload {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** The chat this ticket authorizes a connection to, or null for a presence-only ticket. */
  chatId: string | null;
  createdAt: number;
}

function ticketKey(ticket: string): string {
  return `ws-ticket:${ticket}`;
}

/**
 * Mints a short-lived (30s), single-use ticket authorizing a WebSocket
 * connection. Called from an authenticated Next.js API route (which has
 * already verified the session cookie + chat membership) right before the
 * browser opens a WebSocket to the realtime worker's separate origin.
 */
export async function mintWsTicket(
  kv: KVNamespace,
  payload: Omit<WsTicketPayload, 'createdAt'>,
): Promise<string> {
  const ticket = generateSessionToken();
  const value: WsTicketPayload = { ...payload, createdAt: Date.now() };
  await kv.put(ticketKey(ticket), JSON.stringify(value), { expirationTtl: TICKET_TTL_SECONDS });
  return ticket;
}

/**
 * Validates and immediately deletes a ticket (one-time use — a captured or
 * replayed ticket value is useless after the first connection attempt).
 * Called from the realtime worker when a client opens a WebSocket.
 */
export async function consumeWsTicket(kv: KVNamespace, ticket: string): Promise<WsTicketPayload | null> {
  const key = ticketKey(ticket);
  const raw = await kv.get(key);
  if (!raw) return null;
  await kv.delete(key);
  try {
    return JSON.parse(raw) as WsTicketPayload;
  } catch {
    return null;
  }
}
