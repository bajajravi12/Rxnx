import { generateId, now } from './ids';
import { findUsersByIds, toPublicUser, type PublicUser } from './users';

/** True if either user has blocked the other (block is checked bidirectionally). */
export async function isBlockedEitherWay(db: D1Database, userIdA: string, userIdB: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM blocked_users
       WHERE (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?)
       LIMIT 1`,
    )
    .bind(userIdA, userIdB, userIdB, userIdA)
    .first();
  return row !== null;
}

export async function blockUser(db: D1Database, userId: string, blockedUserId: string): Promise<void> {
  if (userId === blockedUserId) return;
  await db
    .prepare(
      `INSERT INTO blocked_users (id, user_id, blocked_user_id, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, blocked_user_id) DO NOTHING`,
    )
    .bind(generateId('blk'), userId, blockedUserId, now())
    .run();
}

export async function unblockUser(db: D1Database, userId: string, blockedUserId: string): Promise<void> {
  await db
    .prepare('DELETE FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?')
    .bind(userId, blockedUserId)
    .run();
}

/** Users that `userId` has blocked (one-directional — does not include users who have blocked `userId`, since that's not this user's list to manage). */
export async function listBlockedUsers(db: D1Database, userId: string): Promise<PublicUser[]> {
  const { results } = await db
    .prepare('SELECT blocked_user_id FROM blocked_users WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all<{ blocked_user_id: string }>();

  const ids = (results ?? []).map((r) => r.blocked_user_id);
  if (ids.length === 0) return [];

  const users = await findUsersByIds(db, ids);
  // Preserve block-order (most recently blocked first) rather than
  // whatever order the IN-clause lookup happens to return.
  const byId = new Map(users.map((u) => [u.id, toPublicUser(u)]));
  return ids.map((id) => byId.get(id)).filter((u): u is PublicUser => u !== undefined);
}
