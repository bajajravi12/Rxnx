import { generateId, now } from './ids';

export interface RecordLoginAttemptInput {
  usernameLower: string;
  ipAddress: string | null;
  success: boolean;
}

export async function recordLoginAttempt(db: D1Database, input: RecordLoginAttemptInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO login_attempts (id, username_lower, ip_address, success, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(generateId('atmpt'), input.usernameLower, input.ipAddress, input.success ? 1 : 0, now())
    .run();
}

export async function countRecentFailedAttemptsByUsername(
  db: D1Database,
  usernameLower: string,
  sinceMs: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as count FROM login_attempts
       WHERE username_lower = ? AND success = 0 AND created_at > ?`,
    )
    .bind(usernameLower, sinceMs)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function countRecentFailedAttemptsByIp(
  db: D1Database,
  ipAddress: string,
  sinceMs: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as count FROM login_attempts
       WHERE ip_address = ? AND success = 0 AND created_at > ?`,
    )
    .bind(ipAddress, sinceMs)
    .first<{ count: number }>();
  return row?.count ?? 0;
}
