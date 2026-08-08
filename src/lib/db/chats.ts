import { generateId, now } from './ids';
import { findUsersByIds, toPublicUser, type PublicUser } from './users';

export interface ChatRow {
  id: string;
  type: 'direct' | 'group';
  direct_key: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  last_message_type: string | null;
  last_message_at: number | null;
  created_at: number;
  updated_at: number;
}

export function buildDirectKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':');
}

export async function getChatById(db: D1Database, chatId: string): Promise<ChatRow | null> {
  const row = await db.prepare('SELECT * FROM chats WHERE id = ? LIMIT 1').bind(chatId).first<ChatRow>();
  return row ?? null;
}

/**
 * Finds or creates the 1:1 chat between two users (or, when userIdA ===
 * userIdB, that user's "Saved Messages" self-chat). Race-safe: if two
 * concurrent requests both try to create the same direct chat, the UNIQUE
 * index on `chats.direct_key` lets exactly one `db.batch()` insert win —
 * the loser catches the constraint error and re-fetches the winner's row
 * instead of surfacing an error to the client.
 */
export async function getOrCreateDirectChat(
  db: D1Database,
  userIdA: string,
  userIdB: string,
): Promise<ChatRow> {
  const directKey = buildDirectKey(userIdA, userIdB);

  const existing = await db
    .prepare('SELECT * FROM chats WHERE direct_key = ? LIMIT 1')
    .bind(directKey)
    .first<ChatRow>();
  if (existing) return existing;

  const id = generateId('chat');
  const timestamp = now();
  const memberIds = userIdA === userIdB ? [userIdA] : [userIdA, userIdB];

  const statements = [
    db
      .prepare(
        `INSERT INTO chats (
          id, type, direct_key, last_message_preview, last_message_sender_id,
          last_message_type, last_message_at, created_at, updated_at
        ) VALUES (?, 'direct', ?, NULL, NULL, NULL, NULL, ?, ?)`,
      )
      .bind(id, directKey, timestamp, timestamp),
    ...memberIds.map((uid) =>
      db
        .prepare(
          `INSERT INTO chat_members (
            id, chat_id, user_id, last_read_message_id, last_read_at,
            is_muted, is_archived, is_pinned, joined_at, left_at
          ) VALUES (?, ?, ?, NULL, NULL, 0, 0, 0, ?, NULL)`,
        )
        .bind(generateId('cm'), id, uid, timestamp),
    ),
  ];

  try {
    await db.batch(statements);
  } catch {
    const winner = await db
      .prepare('SELECT * FROM chats WHERE direct_key = ? LIMIT 1')
      .bind(directKey)
      .first<ChatRow>();
    if (winner) return winner;
    throw new Error(`Failed to create direct chat between ${userIdA} and ${userIdB}`);
  }

  const created = await getChatById(db, id);
  if (!created) throw new Error(`Failed to read back newly created chat ${id}`);
  return created;
}

export function getOrCreateSelfChat(db: D1Database, userId: string): Promise<ChatRow> {
  return getOrCreateDirectChat(db, userId, userId);
}

export interface UpdateChatLastMessageInput {
  chatId: string;
  preview: string | null;
  senderId: string;
  contentType: string;
  at: number;
}

export function updateChatLastMessage(db: D1Database, input: UpdateChatLastMessageInput) {
  return db
    .prepare(
      `UPDATE chats
       SET last_message_preview = ?, last_message_sender_id = ?, last_message_type = ?, last_message_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(input.preview, input.senderId, input.contentType, input.at, input.at, input.chatId);
}

export interface ChatListItem {
  chatId: string;
  type: 'direct' | 'group';
  isSelf: boolean;
  title: string;
  avatarUrl: string | null;
  otherUser: PublicUser | null;
  group: { id: string; name: string; memberCount: number } | null;
  lastMessagePreview: string | null;
  lastMessageSenderId: string | null;
  lastMessageAt: number | null;
  unreadCount: number;
  isMuted: boolean;
  isArchived: boolean;
  isPinned: boolean;
  updatedAt: number;
}

interface ChatListRow {
  chat_id: string;
  chat_type: 'direct' | 'group';
  direct_key: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  last_message_at: number | null;
  updated_at: number;
  last_read_message_id: string | null;
  last_read_at: number | null;
  is_muted: number;
  is_archived: number;
  is_pinned: number;
  unread_count: number;
}

export interface ListChatsOptions {
  includeArchived?: boolean;
}

/**
 * Returns the fully-assembled chat list for a user's sidebar: unread
 * counts, last-message preview, and (depending on chat type) either the
 * other participant's public profile or the group's name/avatar/member
 * count. Built as one aggregate query plus two small batched lookups
 * (direct-chat counterparts, group metadata) rather than one giant join,
 * which keeps the SQL simple to reason about and avoids fan-out row
 * duplication from joining group_members.
 */
export async function listChatsForUser(
  db: D1Database,
  userId: string,
  options: ListChatsOptions = {},
): Promise<ChatListItem[]> {
  const archivedClause = options.includeArchived ? '' : 'AND cm.is_archived = 0';

  const { results } = await db
    .prepare(
      `SELECT
         c.id as chat_id,
         c.type as chat_type,
         c.direct_key as direct_key,
         c.last_message_preview as last_message_preview,
         c.last_message_sender_id as last_message_sender_id,
         c.last_message_at as last_message_at,
         c.updated_at as updated_at,
         cm.last_read_message_id as last_read_message_id,
         cm.last_read_at as last_read_at,
         cm.is_muted as is_muted,
         cm.is_archived as is_archived,
         cm.is_pinned as is_pinned,
         (
           SELECT COUNT(*) FROM messages m
           WHERE m.chat_id = c.id
             AND m.sender_id != ?1
             AND m.deleted_for_everyone = 0
             AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
             AND m.id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = ?1)
         ) as unread_count
       FROM chat_members cm
       JOIN chats c ON c.id = cm.chat_id
       WHERE cm.user_id = ?1 AND cm.left_at IS NULL ${archivedClause}
       ORDER BY cm.is_pinned DESC, c.updated_at DESC`,
    )
    .bind(userId)
    .all<ChatListRow>();

  const rows = results ?? [];
  if (rows.length === 0) return [];

  const directChatIds = rows.filter((r) => r.chat_type === 'direct').map((r) => r.chat_id);
  const groupChatIds = rows.filter((r) => r.chat_type === 'group').map((r) => r.chat_id);

  const otherUserByChatId = new Map<string, PublicUser>();
  const selfChatIds = new Set<string>();

  if (directChatIds.length > 0) {
    const placeholders = directChatIds.map(() => '?').join(', ');
    const { results: otherMembers } = await db
      .prepare(
        `SELECT chat_id, user_id FROM chat_members WHERE chat_id IN (${placeholders}) AND user_id != ?`,
      )
      .bind(...directChatIds, userId)
      .all<{ chat_id: string; user_id: string }>();

    const otherUserIds = Array.from(new Set((otherMembers ?? []).map((r) => r.user_id)));
    const otherUsers = otherUserIds.length > 0 ? await findUsersByIds(db, otherUserIds) : [];
    const userById = new Map(otherUsers.map((u) => [u.id, toPublicUser(u)]));

    for (const member of otherMembers ?? []) {
      const user = userById.get(member.user_id);
      if (user) otherUserByChatId.set(member.chat_id, user);
    }

    // A direct chat with no "other" member row is the current user's
    // Saved Messages self-chat.
    for (const chatId of directChatIds) {
      if (!otherUserByChatId.has(chatId)) selfChatIds.add(chatId);
    }
  }

  const groupByChatId = new Map<
    string,
    { id: string; name: string; avatarUrl: string | null; memberCount: number }
  >();

  if (groupChatIds.length > 0) {
    const placeholders = groupChatIds.map(() => '?').join(', ');
    const { results: groupRows } = await db
      .prepare(
        `SELECT g.id as id, g.chat_id as chat_id, g.name as name, g.avatar_url as avatar_url,
                (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.left_at IS NULL) as member_count
         FROM groups g WHERE g.chat_id IN (${placeholders})`,
      )
      .bind(...groupChatIds)
      .all<{ id: string; chat_id: string; name: string; avatar_url: string | null; member_count: number }>();

    for (const g of groupRows ?? []) {
      groupByChatId.set(g.chat_id, {
        id: g.id,
        name: g.name,
        avatarUrl: g.avatar_url,
        memberCount: g.member_count,
      });
    }
  }

  return rows.map((row): ChatListItem => {
    const isSelf = selfChatIds.has(row.chat_id);
    const otherUser = otherUserByChatId.get(row.chat_id) ?? null;
    const group = groupByChatId.get(row.chat_id) ?? null;

    const title = isSelf
      ? 'Saved Messages'
      : row.chat_type === 'direct'
        ? (otherUser?.displayName ?? 'Unknown user')
        : (group?.name ?? 'Group');

    const avatarUrl = isSelf
      ? null
      : row.chat_type === 'direct'
        ? (otherUser?.avatarUrl ?? null)
        : (group?.avatarUrl ?? null);

    return {
      chatId: row.chat_id,
      type: row.chat_type,
      isSelf,
      title,
      avatarUrl,
      otherUser: row.chat_type === 'direct' ? otherUser : null,
      group:
        row.chat_type === 'group' && group ? { id: group.id, name: group.name, memberCount: group.memberCount } : null,
      lastMessagePreview: row.last_message_preview,
      lastMessageSenderId: row.last_message_sender_id,
      lastMessageAt: row.last_message_at,
      unreadCount: row.unread_count,
      isMuted: row.is_muted === 1,
      isArchived: row.is_archived === 1,
      isPinned: row.is_pinned === 1,
      updatedAt: row.updated_at,
    };
  });
}
