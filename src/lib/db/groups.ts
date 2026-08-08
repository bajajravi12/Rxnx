import { generateId, now } from './ids';
import { buildMessagePreview } from './messages';
import { findUsersByIds, toPublicUser, type PublicUser } from './users';
import { ApiError } from '../utils/api-error';

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupRow {
  id: string;
  chat_id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  avatar_r2_key: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupRole;
  invited_by: string | null;
  joined_at: number;
  left_at: number | null;
}

export interface GroupMemberWithUser {
  userId: string;
  role: GroupRole;
  joinedAt: number;
  user: PublicUser;
}

export async function getGroupByChatId(db: D1Database, chatId: string): Promise<GroupRow | null> {
  const row = await db.prepare('SELECT * FROM groups WHERE chat_id = ? LIMIT 1').bind(chatId).first<GroupRow>();
  return row ?? null;
}

export async function getGroupById(db: D1Database, groupId: string): Promise<GroupRow | null> {
  const row = await db.prepare('SELECT * FROM groups WHERE id = ? LIMIT 1').bind(groupId).first<GroupRow>();
  return row ?? null;
}

export async function getGroupMemberRole(db: D1Database, groupId: string, userId: string): Promise<GroupRole | null> {
  const row = await db
    .prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1')
    .bind(groupId, userId)
    .first<{ role: GroupRole }>();
  return row?.role ?? null;
}

/** Throws 403 unless the user currently holds one of `allowedRoles` in the group. */
export async function requireGroupRole(
  db: D1Database,
  groupId: string,
  userId: string,
  allowedRoles: GroupRole[],
): Promise<GroupRole> {
  const role = await getGroupMemberRole(db, groupId, userId);
  if (!role || !allowedRoles.includes(role)) {
    throw ApiError.forbidden('You do not have permission to do this in this group.');
  }
  return role;
}

export async function listGroupMembers(db: D1Database, groupId: string): Promise<GroupMemberWithUser[]> {
  const { results } = await db
    .prepare(
      `SELECT user_id, role, joined_at FROM group_members
       WHERE group_id = ? AND left_at IS NULL
       ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, joined_at ASC`,
    )
    .bind(groupId)
    .all<{ user_id: string; role: GroupRole; joined_at: number }>();

  const rows = results ?? [];
  const users = await findUsersByIds(db, rows.map((r) => r.user_id));
  const userById = new Map(users.map((u) => [u.id, toPublicUser(u)]));

  return rows
    .map((r) => {
      const user = userById.get(r.user_id);
      return user ? { userId: r.user_id, role: r.role, joinedAt: r.joined_at, user } : null;
    })
    .filter((m): m is GroupMemberWithUser => m !== null);
}

export interface CreateGroupInput {
  name: string;
  description: string;
  createdBy: string;
  createdByDisplayName: string;
  memberIds: string[];
}

export interface CreatedGroup {
  group: GroupRow;
  chatId: string;
}

/**
 * Creates the chat, the group row, membership rows (creator as owner, the
 * rest as members) for both `group_members` (roles) and `chat_members`
 * (per-user read state), and a "created the group" system message — all
 * in one atomic `db.batch()`.
 */
export async function createGroup(db: D1Database, input: CreateGroupInput): Promise<CreatedGroup> {
  const chatId = generateId('chat');
  const groupId = generateId('grp');
  const messageId = generateId('msg');
  const timestamp = now();

  const allMemberIds = Array.from(new Set([input.createdBy, ...input.memberIds]));
  const systemText = `${input.createdByDisplayName} created the group`;
  const preview = buildMessagePreview('system', systemText);

  const statements = [
    db
      .prepare(
        `INSERT INTO chats (
          id, type, direct_key, last_message_preview, last_message_sender_id,
          last_message_type, last_message_at, created_at, updated_at
        ) VALUES (?, 'group', NULL, ?, ?, 'system', ?, ?, ?)`,
      )
      .bind(chatId, preview, input.createdBy, timestamp, timestamp, timestamp),
    db
      .prepare(
        `INSERT INTO groups (id, chat_id, name, description, avatar_url, avatar_r2_key, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
      )
      .bind(groupId, chatId, input.name, input.description, input.createdBy, timestamp, timestamp),
    db
      .prepare(
        `INSERT INTO messages (
          id, chat_id, sender_id, client_id, reply_to_message_id,
          forwarded_from_message_id, forwarded_from_user_id,
          content_type, content, is_edited, edited_at, deleted_for_everyone, deleted_at, created_at
        ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 'system', ?, 0, NULL, 0, NULL, ?)`,
      )
      .bind(messageId, chatId, input.createdBy, systemText, timestamp),
    ...allMemberIds.flatMap((userId) => [
      db
        .prepare(
          `INSERT INTO group_members (id, group_id, user_id, role, invited_by, joined_at, left_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        )
        .bind(
          generateId('gm'),
          groupId,
          userId,
          userId === input.createdBy ? 'owner' : 'member',
          userId === input.createdBy ? null : input.createdBy,
          timestamp,
        ),
      db
        .prepare(
          `INSERT INTO chat_members (
            id, chat_id, user_id, last_read_message_id, last_read_at,
            is_muted, is_archived, is_pinned, joined_at, left_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, NULL)`,
        )
        .bind(generateId('cm'), chatId, userId, messageId, timestamp, timestamp),
    ]),
  ];

  await db.batch(statements);

  const group = await getGroupByChatId(db, chatId);
  if (!group) throw new Error(`Failed to read back newly created group for chat ${chatId}`);
  return { group, chatId };
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
}

export async function updateGroup(db: D1Database, groupId: string, input: UpdateGroupInput): Promise<GroupRow> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    sets.push('name = ?');
    values.push(input.name);
  }
  if (input.description !== undefined) {
    sets.push('description = ?');
    values.push(input.description);
  }

  if (sets.length > 0) {
    sets.push('updated_at = ?');
    values.push(now(), groupId);
    await db.prepare(`UPDATE groups SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const updated = await getGroupById(db, groupId);
  if (!updated) throw new Error(`Group ${groupId} not found after update`);
  return updated;
}

/** Deletes the entire chat (cascades to the group, its members, messages, pins, and attachments). Owner-only, enforced by the caller. */
export async function deleteGroupChat(db: D1Database, chatId: string): Promise<void> {
  await db.prepare('DELETE FROM chats WHERE id = ?').bind(chatId).run();
}

export interface AddGroupMembersResult {
  addedUserIds: string[];
  alreadyMemberUserIds: string[];
}

/**
 * Adds new members (idempotent — anyone already an active member is
 * skipped rather than erroring) plus a "X added Y, Z" system message, all
 * atomically.
 */
export async function addGroupMembers(
  db: D1Database,
  groupId: string,
  chatId: string,
  invitedBy: string,
  invitedByDisplayName: string,
  userIds: string[],
): Promise<AddGroupMembersResult> {
  const { results: existingRows } = await db
    .prepare(
      `SELECT user_id FROM group_members WHERE group_id = ? AND user_id IN (${userIds.map(() => '?').join(', ')}) AND left_at IS NULL`,
    )
    .bind(groupId, ...userIds)
    .all<{ user_id: string }>();
  const alreadyMember = new Set((existingRows ?? []).map((r) => r.user_id));

  const toAdd = userIds.filter((id) => !alreadyMember.has(id));
  if (toAdd.length === 0) {
    return { addedUserIds: [], alreadyMemberUserIds: Array.from(alreadyMember) };
  }

  const addedUsers = await findUsersByIds(db, toAdd);
  const namesList = addedUsers.map((u) => u.display_name).join(', ');
  const systemText = `${invitedByDisplayName} added ${namesList}`;
  const timestamp = now();
  const messageId = generateId('msg');
  const preview = buildMessagePreview('system', systemText);

  const statements = [
    db
      .prepare(
        `UPDATE chats SET last_message_preview = ?, last_message_sender_id = ?, last_message_type = 'system', last_message_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(preview, invitedBy, timestamp, timestamp, chatId),
    db
      .prepare(
        `INSERT INTO messages (
          id, chat_id, sender_id, client_id, reply_to_message_id,
          forwarded_from_message_id, forwarded_from_user_id,
          content_type, content, is_edited, edited_at, deleted_for_everyone, deleted_at, created_at
        ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 'system', ?, 0, NULL, 0, NULL, ?)`,
      )
      .bind(messageId, chatId, invitedBy, systemText, timestamp),
    ...toAdd.flatMap((userId) => [
      // Re-adding a user who previously left re-activates their existing
      // rows (clearing left_at) rather than violating the UNIQUE(group_id, user_id)
      // / UNIQUE(chat_id, user_id) constraints with a fresh insert.
      db
        .prepare(
          `INSERT INTO group_members (id, group_id, user_id, role, invited_by, joined_at, left_at)
           VALUES (?, ?, ?, 'member', ?, ?, NULL)
           ON CONFLICT(group_id, user_id) DO UPDATE SET left_at = NULL, invited_by = excluded.invited_by, joined_at = excluded.joined_at`,
        )
        .bind(generateId('gm'), groupId, userId, invitedBy, timestamp),
      db
        .prepare(
          `INSERT INTO chat_members (
            id, chat_id, user_id, last_read_message_id, last_read_at,
            is_muted, is_archived, is_pinned, joined_at, left_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, NULL)
           ON CONFLICT(chat_id, user_id) DO UPDATE SET left_at = NULL, joined_at = excluded.joined_at`,
        )
        .bind(generateId('cm'), chatId, userId, messageId, timestamp, timestamp),
    ]),
  ];

  await db.batch(statements);

  return { addedUserIds: toAdd, alreadyMemberUserIds: Array.from(alreadyMember) };
}

/** Removes a member (kick, or self-leave) — soft-deletes both membership rows and posts a system message. */
export async function removeGroupMember(
  db: D1Database,
  groupId: string,
  chatId: string,
  userId: string,
  removedByDisplayName: string,
  targetDisplayName: string,
  wasSelfLeave: boolean,
): Promise<void> {
  const timestamp = now();
  const messageId = generateId('msg');
  const systemText = wasSelfLeave ? `${targetDisplayName} left the group` : `${removedByDisplayName} removed ${targetDisplayName}`;
  const preview = buildMessagePreview('system', systemText);

  const statements = [
    db
      .prepare('UPDATE group_members SET left_at = ? WHERE group_id = ? AND user_id = ?')
      .bind(timestamp, groupId, userId),
    db
      .prepare('UPDATE chat_members SET left_at = ? WHERE chat_id = ? AND user_id = ?')
      .bind(timestamp, chatId, userId),
    db
      .prepare(
        `UPDATE chats SET last_message_preview = ?, last_message_sender_id = ?, last_message_type = 'system', last_message_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(preview, userId, timestamp, timestamp, chatId),
    db
      .prepare(
        `INSERT INTO messages (
          id, chat_id, sender_id, client_id, reply_to_message_id,
          forwarded_from_message_id, forwarded_from_user_id,
          content_type, content, is_edited, edited_at, deleted_for_everyone, deleted_at, created_at
        ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 'system', ?, 0, NULL, 0, NULL, ?)`,
      )
      .bind(messageId, chatId, userId, systemText, timestamp),
  ];

  await db.batch(statements);
}

export async function updateGroupMemberRole(
  db: D1Database,
  groupId: string,
  userId: string,
  role: Exclude<GroupRole, 'owner'>,
): Promise<void> {
  await db
    .prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ? AND left_at IS NULL')
    .bind(role, groupId, userId)
    .run();
}
