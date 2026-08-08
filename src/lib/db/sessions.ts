import { generateId, now } from './ids';

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  remember_me: number;
  user_agent: string | null;
  ip_address: string | null;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export interface CreateSessionInput {
  userId: string;
  tokenHash: string;
  rememberMe: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: number;
}

export async function createSession(db: D1Database, input: CreateSessionInput): Promise<SessionRow> {
  const id = generateId('sess');
  const timestamp = now();

  await db
    .prepare(
      `INSERT INTO sessions (
        id, user_id, token_hash, remember_me, user_agent, ip_address,
        created_at, expires_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      id,
      input.userId,
      input.tokenHash,
      input.rememberMe ? 1 : 0,
      input.userAgent,
      input.ipAddress,
      timestamp,
      input.expiresAt,
    )
    .run();

  return {
    id,
    user_id: input.userId,
    token_hash: input.tokenHash,
    remember_me: input.rememberMe ? 1 : 0,
    user_agent: input.userAgent,
    ip_address: input.ipAddress,
    created_at: timestamp,
    expires_at: input.expiresAt,
    revoked_at: null,
  };
}

/** Active (not revoked, not expired) sessions for the "your devices" settings view, newest first. */
export async function listActiveSessionsForUser(db: D1Database, userId: string): Promise<SessionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC`,
    )
    .bind(userId, now())
    .all<SessionRow>();
  return results ?? [];
}

/** Revokes one specific session by id, scoped to userId so a user can never revoke someone else's session by guessing an id. */
export async function revokeSessionById(db: D1Database, userId: string, sessionId: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL')
    .bind(now(), sessionId, userId)
    .run();
  return result.meta.changes > 0;
}

export async function findSessionByTokenHash(db: D1Database, tokenHash: string): Promise<SessionRow | null> {
  const row = await db
    .prepare('SELECT * FROM sessions WHERE token_hash = ? LIMIT 1')
    .bind(tokenHash)
    .first<SessionRow>();
  return row ?? null;
}

export async function revokeSessionByTokenHash(db: D1Database, tokenHash: string): Promise<void> {
  await db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(now(), tokenHash)
    .run();
}

/**
 * Revokes all of a user's sessions except (optionally) the one they're
 * currently using — called on password change so other logged-in devices
 * are signed out while the device performing the change stays logged in.
 */
export async function revokeAllUserSessions(
  db: D1Database,
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  if (exceptSessionId) {
    await db
      .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL')
      .bind(now(), userId, exceptSessionId)
      .run();
  } else {
    await db
      .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .bind(now(), userId)
      .run();
  }
}

/**
 * Best-effort cleanup of long-expired session rows. There is no Cron
 * Trigger wired up for this (out of scope for this build), so callers
 * invoke this opportunistically — e.g. the login route calls it with ~1%
 * probability via `waitUntil` so it never adds latency to a real request
 * but the table doesn't grow unbounded.
 */
export async function pruneExpiredSessions(db: D1Database): Promise<void> {
  const cutoff = now() - 30 * 24 * 60 * 60 * 1000; // 30 days past expiry
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(cutoff).run();
}
