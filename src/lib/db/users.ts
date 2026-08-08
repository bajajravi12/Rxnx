import { generateId, now } from './ids';

/** Full row shape as stored in D1 — includes sensitive password fields. */
export interface UserRow {
  id: string;
  username: string;
  username_lower: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  avatar_r2_key: string | null;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  is_online: number;
  last_seen_at: number | null;
  created_at: number;
  updated_at: number;
}

/** Safe-to-return-to-clients shape — never includes password fields. */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: number | null;
  createdAt: number;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    isOnline: row.is_online === 1,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  };
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
}

export async function createUser(db: D1Database, input: CreateUserInput): Promise<UserRow> {
  const id = generateId('usr');
  const timestamp = now();
  const usernameLower = input.username.toLowerCase();

  await db
    .prepare(
      `INSERT INTO users (
        id, username, username_lower, display_name, bio, avatar_url, avatar_r2_key,
        password_hash, password_salt, password_iterations,
        is_online, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '', NULL, NULL, ?, ?, ?, 0, NULL, ?, ?)`,
    )
    .bind(
      id,
      input.username,
      usernameLower,
      input.displayName,
      input.passwordHash,
      input.passwordSalt,
      input.passwordIterations,
      timestamp,
      timestamp,
    )
    .run();

  const row = await findUserById(db, id);
  if (!row) {
    // Should be unreachable — the insert above just succeeded — but keeps
    // the return type honest instead of a non-null assertion.
    throw new Error(`Failed to read back newly created user ${id}`);
  }
  return row;
}

export async function findUserByUsername(db: D1Database, username: string): Promise<UserRow | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE username_lower = ? LIMIT 1')
    .bind(username.toLowerCase())
    .first<UserRow>();
  return row ?? null;
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').bind(id).first<UserRow>();
  return row ?? null;
}

export async function findUsersByIds(db: D1Database, ids: string[]): Promise<UserRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const result = await db
    .prepare(`SELECT * FROM users WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<UserRow>();
  return result.results ?? [];
}

export async function usernameExists(db: D1Database, username: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM users WHERE username_lower = ? LIMIT 1')
    .bind(username.toLowerCase())
    .first();
  return row !== null;
}

export interface UpdatePasswordInput {
  userId: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
}

export async function updateUserPassword(db: D1Database, input: UpdatePasswordInput): Promise<void> {
  await db
    .prepare(
      `UPDATE users
       SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(input.passwordHash, input.passwordSalt, input.passwordIterations, now(), input.userId)
    .run();
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
}

export async function updateUserProfile(
  db: D1Database,
  userId: string,
  input: UpdateProfileInput,
): Promise<UserRow> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.displayName !== undefined) {
    sets.push('display_name = ?');
    values.push(input.displayName);
  }
  if (input.bio !== undefined) {
    sets.push('bio = ?');
    values.push(input.bio);
  }

  if (sets.length > 0) {
    sets.push('updated_at = ?');
    values.push(now());
    values.push(userId);
    await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const row = await findUserById(db, userId);
  if (!row) {
    throw new Error(`User ${userId} not found after profile update`);
  }
  return row;
}

export async function updateUserAvatar(
  db: D1Database,
  userId: string,
  avatarUrl: string | null,
  avatarR2Key: string | null,
): Promise<UserRow> {
  await db
    .prepare('UPDATE users SET avatar_url = ?, avatar_r2_key = ?, updated_at = ? WHERE id = ?')
    .bind(avatarUrl, avatarR2Key, now(), userId)
    .run();

  const row = await findUserById(db, userId);
  if (!row) throw new Error(`User ${userId} not found after avatar update`);
  return row;
}

export async function setUserOnlineStatus(
  db: D1Database,
  userId: string,
  isOnline: boolean,
  lastSeenAt: number,
): Promise<void> {
  await db
    .prepare('UPDATE users SET is_online = ?, last_seen_at = ?, updated_at = ? WHERE id = ?')
    .bind(isOnline ? 1 : 0, lastSeenAt, now(), userId)
    .run();
}
