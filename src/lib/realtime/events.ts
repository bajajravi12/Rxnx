/**
 * Messages a connected client sends INTO a ChatRoomDurableObject over its
 * WebSocket. Kept intentionally tiny — everything that needs to be
 * persisted (messages, edits, deletes, reactions, read receipts, pins)
 * goes through the authenticated REST API instead, which then triggers a
 * broadcast via the DO's internal /internal/broadcast endpoint. Only
 * genuinely ephemeral, never-persisted signals flow directly over the
 * client's own socket.
 */
export type ChatClientMessage =
  | { type: 'typing:start' }
  | { type: 'typing:stop' };

/**
 * Events a ChatRoomDurableObject pushes OUT to every connected client in
 * that chat. `message`/`reactions` payloads intentionally use `unknown`
 * here (rather than importing the full DB row types) to keep this file
 * dependency-free for the worker bundle — API routes serialize the exact
 * client-facing shape (see src/lib/db/messages.ts's MessageWithRelations)
 * before broadcasting.
 */
export type ChatServerEvent =
  | { type: 'message:new'; message: unknown }
  | { type: 'message:edit'; message: unknown }
  | { type: 'message:delete'; messageId: string; deletedForEveryone: boolean }
  | { type: 'reaction:update'; messageId: string; reactions: unknown }
  | { type: 'read:update'; chatId: string; userId: string; lastReadMessageId: string; lastReadAt: number }
  | { type: 'pin:update'; chatId: string; messageId: string; pinned: boolean }
  | { type: 'typing:update'; userId: string; displayName: string; isTyping: boolean }
  | { type: 'presence:update'; userId: string; isOnline: boolean; lastSeenAt: number | null }
  | { type: 'member:update'; chatId: string; reason: 'joined' | 'left' | 'role_changed' };

export interface ChatConnectionAttachment {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  connectedAt: number;
}

export interface PresenceConnectionAttachment {
  userId: string;
  connectedAt: number;
}

/**
 * Events pushed over a user's *presence* socket (one connection per
 * session, independent of which chat is open) rather than a specific
 * chat's room socket. Used for cross-chat notifications like "a new
 * message arrived somewhere in your chat list" so the sidebar can update
 * without the client needing a live connection to every chat it shows.
 */
export type PresenceServerEvent = {
  type: 'chat:new_message';
  chatId: string;
  messageId: string;
  senderId: string;
  senderDisplayName: string;
  preview: string;
  contentType: string;
  createdAt: number;
};
