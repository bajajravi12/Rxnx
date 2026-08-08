import { generateId, now } from './ids';

export interface ReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: number;
}

/** Setting a reaction replaces any existing reaction by that user on that message (one reaction per user per message). */
export async function setReaction(db: D1Database, messageId: string, userId: string, emoji: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at`,
    )
    .bind(generateId('rxn'), messageId, userId, emoji, now())
    .run();
}

export async function removeReaction(db: D1Database, messageId: string, userId: string): Promise<void> {
  await db
    .prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?')
    .bind(messageId, userId)
    .run();
}

export async function listReactionsForMessages(db: D1Database, messageIds: string[]): Promise<ReactionRow[]> {
  if (messageIds.length === 0) return [];
  const placeholders = messageIds.map(() => '?').join(', ');
  const result = await db
    .prepare(`SELECT * FROM message_reactions WHERE message_id IN (${placeholders})`)
    .bind(...messageIds)
    .all<ReactionRow>();
  return result.results ?? [];
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
  reactedByMe: boolean;
}

/** Groups flat reaction rows into a per-message emoji summary, ready for client rendering. */
export function summarizeReactions(
  reactions: ReactionRow[],
  messageId: string,
  currentUserId: string,
): ReactionSummary[] {
  const byEmoji = new Map<string, string[]>();
  for (const reaction of reactions) {
    if (reaction.message_id !== messageId) continue;
    const list = byEmoji.get(reaction.emoji) ?? [];
    list.push(reaction.user_id);
    byEmoji.set(reaction.emoji, list);
  }
  return Array.from(byEmoji.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
    reactedByMe: userIds.includes(currentUserId),
  }));
}
