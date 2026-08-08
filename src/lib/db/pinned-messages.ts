import { generateId, now } from './ids';

export interface PinnedMessageRow {
  id: string;
  chat_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: number;
}

export async function pinMessage(db: D1Database, chatId: string, messageId: string, pinnedBy: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO pinned_messages (id, chat_id, message_id, pinned_by, pinned_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, message_id) DO NOTHING`,
    )
    .bind(generateId('pin'), chatId, messageId, pinnedBy, now())
    .run();
}

export async function unpinMessage(db: D1Database, chatId: string, messageId: string): Promise<void> {
  await db
    .prepare('DELETE FROM pinned_messages WHERE chat_id = ? AND message_id = ?')
    .bind(chatId, messageId)
    .run();
}

export async function listPinnedMessageIds(db: D1Database, chatId: string): Promise<string[]> {
  const result = await db
    .prepare('SELECT message_id FROM pinned_messages WHERE chat_id = ? ORDER BY pinned_at DESC')
    .bind(chatId)
    .all<{ message_id: string }>();
  return (result.results ?? []).map((row) => row.message_id);
}

export async function isMessagePinned(db: D1Database, chatId: string, messageId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM pinned_messages WHERE chat_id = ? AND message_id = ? LIMIT 1')
    .bind(chatId, messageId)
    .first();
  return row !== null;
}
