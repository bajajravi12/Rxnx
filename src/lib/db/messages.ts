import { generateId, now } from './ids';
import { updateChatLastMessage } from './chats';
import { findUsersByIds, toPublicUser, type PublicUser } from './users';
import { listReactionsForMessages, summarizeReactions, type ReactionSummary } from './reactions';
import { listAttachmentsForMessages, toPublicAttachment, type PublicAttachment } from './attachments';

export type MessageContentType = 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document' | 'system';

export interface MessageRow {
  id: string;
  chat_id: string;
  sender_id: string;
  client_id: string | null;
  reply_to_message_id: string | null;
  forwarded_from_message_id: string | null;
  forwarded_from_user_id: string | null;
  content_type: MessageContentType;
  content: string | null;
  is_edited: number;
  edited_at: number | null;
  deleted_for_everyone: number;
  deleted_at: number | null;
  created_at: number;
}

export interface PublicMessage {
  id: string;
  chatId: string;
  senderId: string;
  sender: PublicUser | null;
  clientId: string | null;
  contentType: MessageContentType;
  content: string | null;
  isEdited: boolean;
  editedAt: number | null;
  deletedForEveryone: boolean;
  createdAt: number;
  replyTo: {
    id: string;
    senderId: string;
    senderDisplayName: string;
    contentType: MessageContentType;
    preview: string | null;
  } | null;
  forwardedFrom: { messageId: string; userId: string; displayName: string } | null;
  reactions: ReactionSummary[];
  attachments: PublicAttachment[];
}

export async function getMessageRowById(db: D1Database, messageId: string): Promise<MessageRow | null> {
  const row = await db.prepare('SELECT * FROM messages WHERE id = ? LIMIT 1').bind(messageId).first<MessageRow>();
  return row ?? null;
}

export function buildMessagePreview(contentType: MessageContentType, content: string | null): string {
  switch (contentType) {
    case 'text':
      return (content ?? '').slice(0, 120);
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎥 Video';
    case 'audio':
      return '🎵 Audio';
    case 'voice':
      return '🎤 Voice message';
    case 'document':
      return '📄 Document';
    case 'system':
      return content ?? '';
    default:
      return '';
  }
}

export interface CreateMessageInput {
  chatId: string;
  senderId: string;
  clientId?: string | null;
  contentType: MessageContentType;
  content: string | null;
  replyToMessageId?: string | null;
  forwardedFromMessageId?: string | null;
  forwardedFromUserId?: string | null;
}

/**
 * Inserts a message and, in the same atomic `db.batch()`, denormalizes the
 * chat-list preview onto `chats` and advances the sender's own read
 * position (you've obviously "read" the message you just sent). All three
 * writes succeed or fail together.
 */
export async function createMessage(db: D1Database, input: CreateMessageInput): Promise<MessageRow> {
  const id = generateId('msg');
  const timestamp = now();
  const preview = buildMessagePreview(input.contentType, input.content);

  const statements = [
    db
      .prepare(
        `INSERT INTO messages (
          id, chat_id, sender_id, client_id, reply_to_message_id,
          forwarded_from_message_id, forwarded_from_user_id,
          content_type, content, is_edited, edited_at,
          deleted_for_everyone, deleted_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, NULL, ?)`,
      )
      .bind(
        id,
        input.chatId,
        input.senderId,
        input.clientId ?? null,
        input.replyToMessageId ?? null,
        input.forwardedFromMessageId ?? null,
        input.forwardedFromUserId ?? null,
        input.contentType,
        input.content,
        timestamp,
      ),
    updateChatLastMessage(db, {
      chatId: input.chatId,
      preview,
      senderId: input.senderId,
      contentType: input.contentType,
      at: timestamp,
    }),
    db
      .prepare('UPDATE chat_members SET last_read_message_id = ?, last_read_at = ? WHERE chat_id = ? AND user_id = ?')
      .bind(id, timestamp, input.chatId, input.senderId),
  ];

  await db.batch(statements);

  const row = await getMessageRowById(db, id);
  if (!row) throw new Error(`Failed to read back newly created message ${id}`);
  return row;
}

export interface ListMessagesOptions {
  userId: string;
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor` — fetches messages older than it. */
  cursor?: string | null;
}

export interface ListMessagesResult {
  messages: PublicMessage[];
  nextCursor: string | null;
}

function encodeCursor(createdAt: number, id: string): string {
  return `${createdAt}:${id}`;
}

function decodeCursor(cursor: string): { createdAt: number; id: string } | null {
  const [createdAtRaw, id] = cursor.split(':');
  const createdAt = Number.parseInt(createdAtRaw ?? '', 10);
  if (!Number.isFinite(createdAt) || !id) return null;
  return { createdAt, id };
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * Cursor-paginated message history for infinite scroll, newest-first
 * fetch internally but returned oldest-first (ready to render top-to-
 * bottom). Excludes messages the requesting user has "deleted for me" and
 * assembles sender/reply/reaction/attachment relations via a small number
 * of batched follow-up queries rather than one large join.
 */
export async function listMessagesForChat(
  db: D1Database,
  chatId: string,
  options: ListMessagesOptions,
): Promise<ListMessagesResult> {
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  const cursorClause = cursor ? 'AND (created_at < ? OR (created_at = ? AND id < ?))' : '';
  const bindings: unknown[] = [chatId, options.userId];
  if (cursor) bindings.push(cursor.createdAt, cursor.createdAt, cursor.id);
  bindings.push(limit + 1);

  const query = `
    SELECT * FROM messages
    WHERE chat_id = ?
      AND id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = ?)
      ${cursorClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `;

  const { results } = await db.prepare(query).bind(...bindings).all<MessageRow>();
  const rows = results ?? [];

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const oldestInPage = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && oldestInPage ? encodeCursor(oldestInPage.created_at, oldestInPage.id) : null;

  const messages = await hydrateMessages(db, pageRows, options.userId);
  // Reverse to oldest-first for rendering.
  return { messages: messages.reverse(), nextCursor };
}

/**
 * Attaches sender, reply-preview, reaction, and attachment data to a set
 * of raw message rows. Shared by both the paginated list and single-
 * message fetch (e.g. after create/edit) so the client-facing shape is
 * always assembled in exactly one place.
 */
export async function hydrateMessages(
  db: D1Database,
  rows: MessageRow[],
  currentUserId: string,
): Promise<PublicMessage[]> {
  if (rows.length === 0) return [];

  const messageIds = rows.map((r) => r.id);
  const senderIds = new Set(rows.map((r) => r.sender_id));
  const replyToIds = rows.map((r) => r.reply_to_message_id).filter((id): id is string => Boolean(id));
  const forwardedFromUserIds = rows
    .map((r) => r.forwarded_from_user_id)
    .filter((id): id is string => Boolean(id));

  const replyRows = replyToIds.length > 0 ? await fetchMessageRowsByIds(db, replyToIds) : [];
  for (const r of replyRows) senderIds.add(r.sender_id);
  for (const id of forwardedFromUserIds) senderIds.add(id);

  const [users, reactions, attachments] = await Promise.all([
    findUsersByIds(db, Array.from(senderIds)),
    listReactionsForMessages(db, messageIds),
    listAttachmentsForMessages(db, messageIds),
  ]);

  const userById = new Map(users.map((u) => [u.id, toPublicUser(u)]));
  const replyById = new Map(replyRows.map((r) => [r.id, r]));
  const attachmentsByMessageId = new Map<string, PublicAttachment[]>();
  for (const attachment of attachments) {
    const list = attachmentsByMessageId.get(attachment.message_id) ?? [];
    list.push(toPublicAttachment(attachment));
    attachmentsByMessageId.set(attachment.message_id, list);
  }

  return rows.map((row): PublicMessage => {
    const replyRow = row.reply_to_message_id ? replyById.get(row.reply_to_message_id) : undefined;
    const replySender = replyRow ? userById.get(replyRow.sender_id) : undefined;
    const forwardedFromUser = row.forwarded_from_user_id ? userById.get(row.forwarded_from_user_id) : undefined;

    return {
      id: row.id,
      chatId: row.chat_id,
      senderId: row.sender_id,
      sender: userById.get(row.sender_id) ?? null,
      clientId: row.client_id,
      contentType: row.content_type,
      content: row.deleted_for_everyone === 1 ? null : row.content,
      isEdited: row.is_edited === 1,
      editedAt: row.edited_at,
      deletedForEveryone: row.deleted_for_everyone === 1,
      createdAt: row.created_at,
      replyTo:
        replyRow && replySender
          ? {
              id: replyRow.id,
              senderId: replyRow.sender_id,
              senderDisplayName: replySender.displayName,
              contentType: replyRow.content_type,
              preview:
                replyRow.deleted_for_everyone === 1
                  ? null
                  : buildMessagePreview(replyRow.content_type, replyRow.content),
            }
          : null,
      forwardedFrom:
        row.forwarded_from_message_id && row.forwarded_from_user_id && forwardedFromUser
          ? {
              messageId: row.forwarded_from_message_id,
              userId: row.forwarded_from_user_id,
              displayName: forwardedFromUser.displayName,
            }
          : null,
      reactions: summarizeReactions(reactions, row.id, currentUserId),
      attachments: attachmentsByMessageId.get(row.id) ?? [],
    };
  });
}

export interface MessagesAroundResult {
  messages: PublicMessage[];
  nextCursor: string | null;
  targetMessageId: string;
}

/**
 * Fetches a window of messages centered on `targetMessageId` — used when
 * jumping to a search result that likely isn't in the normally-loaded
 * "most recent" page. Returns null if the target doesn't exist, was
 * deleted, or isn't in this chat. `nextCursor` continues loading *older*
 * history from the window exactly like the normal paginated list; there
 * is no equivalent "load newer" once you've jumped away from the live
 * tail — re-opening the chat (or scrolling in the normal timeline) is
 * what gets you back to the latest messages, the same tradeoff most chat
 * apps make for a "jump to result" view rather than a fully bidirectional
 * infinite-scroll-from-anywhere window.
 */
export async function listMessagesAroundId(
  db: D1Database,
  chatId: string,
  targetMessageId: string,
  userId: string,
  options: { before?: number; after?: number } = {},
): Promise<MessagesAroundResult | null> {
  const target = await getMessageRowById(db, targetMessageId);
  if (!target || target.chat_id !== chatId) return null;

  const before = options.before ?? 30;
  const after = options.after ?? 20;

  const deletionClause = 'AND id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = ?)';

  const { results: olderResults } = await db
    .prepare(
      `SELECT * FROM messages
       WHERE chat_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ${deletionClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ${before}`,
    )
    .bind(chatId, target.created_at, target.created_at, target.id, userId)
    .all<MessageRow>();

  const { results: newerResults } = await db
    .prepare(
      `SELECT * FROM messages
       WHERE chat_id = ? AND (created_at > ? OR (created_at = ? AND id > ?)) ${deletionClause}
       ORDER BY created_at ASC, id ASC
       LIMIT ${after}`,
    )
    .bind(chatId, target.created_at, target.created_at, target.id, userId)
    .all<MessageRow>();

  const olderRows = (olderResults ?? []).slice().reverse();
  const newerRows = newerResults ?? [];
  const combinedRows = [...olderRows, target, ...newerRows];

  const oldestInWindow = olderRows[0] ?? target;
  const hasMoreOlder = (olderResults ?? []).length === before;
  const nextCursor = hasMoreOlder ? encodeCursor(oldestInWindow.created_at, oldestInWindow.id) : null;

  const messages = await hydrateMessages(db, combinedRows, userId);
  return { messages, nextCursor, targetMessageId };
}

/**
 * Fetches and hydrates a specific set of messages by id, preserving the
 * order of `messageIds` (D1's `IN (...)` does not guarantee result order).
 * Used by the pinned-messages route, where pin order — not created_at
 * order — is what the caller wants.
 */
export async function fetchMessagesByIdsPublic(
  db: D1Database,
  messageIds: string[],
  currentUserId: string,
): Promise<PublicMessage[]> {
  if (messageIds.length === 0) return [];
  const rows = await fetchMessageRowsByIds(db, messageIds);
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const orderedRows = messageIds.map((id) => rowById.get(id)).filter((r): r is MessageRow => Boolean(r));
  return hydrateMessages(db, orderedRows, currentUserId);
}

async function fetchMessageRowsByIds(db: D1Database, ids: string[]): Promise<MessageRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const result = await db
    .prepare(`SELECT * FROM messages WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<MessageRow>();
  return result.results ?? [];
}

export interface EditMessageInput {
  messageId: string;
  senderId: string;
  content: string;
}

/** Returns the updated row, or null if the message doesn't exist / isn't owned by senderId / was deleted-for-everyone. */
export async function editMessage(db: D1Database, input: EditMessageInput): Promise<MessageRow | null> {
  const timestamp = now();
  const result = await db
    .prepare(
      `UPDATE messages SET content = ?, is_edited = 1, edited_at = ?
       WHERE id = ? AND sender_id = ? AND deleted_for_everyone = 0`,
    )
    .bind(input.content, timestamp, input.messageId, input.senderId)
    .run();

  if (!result.meta.changes) return null;
  return getMessageRowById(db, input.messageId);
}

/** Only the original sender may hard-delete-for-everyone in this build (group admins deleting others' messages is a Step 12 permission extension). */
export async function deleteMessageForEveryone(db: D1Database, messageId: string, senderId: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE messages SET deleted_for_everyone = 1, deleted_at = ?, content = NULL
       WHERE id = ? AND sender_id = ?`,
    )
    .bind(now(), messageId, senderId)
    .run();
  return result.meta.changes > 0;
}

export async function deleteMessageForMe(db: D1Database, messageId: string, userId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO message_deletions (id, message_id, user_id, deleted_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(message_id, user_id) DO NOTHING`,
    )
    .bind(generateId('mdel'), messageId, userId, now())
    .run();
}
