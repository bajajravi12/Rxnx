import { generateId, now } from './ids';
import { ApiError } from '../utils/api-error';

export interface ChatMemberRow {
  id: string;
  chat_id: string;
  user_id: string;
  last_read_message_id: string | null;
  last_read_at: number | null;
  is_muted: number;
  is_archived: number;
  is_pinned: number;
  joined_at: number;
  left_at: number | null;
}

export async function addChatMember(
  db: D1Database,
  chatId: string,
  userId: string,
  joinedAt: number = now(),
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chat_members (id, chat_id, user_id, last_read_message_id, last_read_at, is_muted, is_archived, is_pinned, joined_at, left_at)
       VALUES (?, ?, ?, NULL, NULL, 0, 0, 0, ?, NULL)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET left_at = NULL, joined_at = excluded.joined_at`,
    )
    .bind(generateId('cm'), chatId, userId, joinedAt)
    .run();
}

export async function getChatMember(db: D1Database, chatId: string, userId: string): Promise<ChatMemberRow | null> {
  const row = await db
    .prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ? LIMIT 1')
    .bind(chatId, userId)
    .first<ChatMemberRow>();
  return row ?? null;
}

export async function isActiveChatMember(db: D1Database, chatId: string, userId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1')
    .bind(chatId, userId)
    .first();
  return row !== null;
}

export async function listActiveChatMemberIds(db: D1Database, chatId: string): Promise<string[]> {
  const result = await db
    .prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND left_at IS NULL')
    .bind(chatId)
    .all<{ user_id: string }>();
  return (result.results ?? []).map((row) => row.user_id);
}

export interface UpdateChatMemberSettingsInput {
  isMuted?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
}

export async function updateChatMemberSettings(
  db: D1Database,
  chatId: string,
  userId: string,
  input: UpdateChatMemberSettingsInput,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.isMuted !== undefined) {
    sets.push('is_muted = ?');
    values.push(input.isMuted ? 1 : 0);
  }
  if (input.isArchived !== undefined) {
    sets.push('is_archived = ?');
    values.push(input.isArchived ? 1 : 0);
  }
  if (input.isPinned !== undefined) {
    sets.push('is_pinned = ?');
    values.push(input.isPinned ? 1 : 0);
  }

  if (sets.length === 0) return;

  values.push(chatId, userId);
  await db
    .prepare(`UPDATE chat_members SET ${sets.join(', ')} WHERE chat_id = ? AND user_id = ?`)
    .bind(...values)
    .run();
}

export async function markChatRead(
  db: D1Database,
  chatId: string,
  userId: string,
  lastReadMessageId: string,
  lastReadAt: number = now(),
): Promise<void> {
  await db
    .prepare('UPDATE chat_members SET last_read_message_id = ?, last_read_at = ? WHERE chat_id = ? AND user_id = ?')
    .bind(lastReadMessageId, lastReadAt, chatId, userId)
    .run();
}

export async function listReadPositions(
  db: D1Database,
  chatId: string,
): Promise<Array<{ userId: string; lastReadMessageId: string | null; lastReadAt: number | null }>> {
  const { results } = await db
    .prepare(
      'SELECT user_id, last_read_message_id, last_read_at FROM chat_members WHERE chat_id = ? AND left_at IS NULL',
    )
    .bind(chatId)
    .all<{ user_id: string; last_read_message_id: string | null; last_read_at: number | null }>();

  return (results ?? []).map((r) => ({
    userId: r.user_id,
    lastReadMessageId: r.last_read_message_id,
    lastReadAt: r.last_read_at,
  }));
}

/** Throws 403 if the user is not an active member of the chat — shared by every chat-scoped route. */
export async function requireActiveChatMember(db: D1Database, chatId: string, userId: string): Promise<void> {
  const member = await isActiveChatMember(db, chatId, userId);
  if (!member) {
    throw ApiError.forbidden('You are not a member of this chat.');
  }
}

/** Soft-removes a member from a chat (group leave/kick) without deleting message history. */
export async function removeChatMember(db: D1Database, chatId: string, userId: string): Promise<void> {
  await db
    .prepare('UPDATE chat_members SET left_at = ? WHERE chat_id = ? AND user_id = ?')
    .bind(now(), chatId, userId)
    .run();
}
