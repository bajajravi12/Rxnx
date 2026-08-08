import { createSession, findSessionByTokenHash, revokeSessionByTokenHash } from '@/lib/db/sessions';
import { findUserById, toPublicUser, type PublicUser } from '@/lib/db/users';
import { generateSessionToken, hashSessionToken } from './tokens';

interface SessionCacheValue {
  userId: string;
  sessionId: string;
  expiresAt: number;
}

function sessionCacheKey(tokenHash: string): string {
  return `session:${tokenHash}`;
}

export interface CreateUserSessionInput {
  userId: string;
  rememberMe: boolean;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface CreatedSession {
  token: string;
  sessionId: string;
  expiresAt: number;
}

/**
 * Creates a new session for a user: generates the raw token, persists its
 * hash to D1 (source of truth, supports listing/revoking sessions later),
 * and warms the KV cache so the very next request authenticates without a
 * D1 round-trip.
 */
export async function createSessionForUser(
  env: CloudflareEnv,
  input: CreateUserSessionInput,
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const tokenHash = await hashSessionToken(token);
  const ttlSeconds = input.rememberMe
    ? Number.parseInt(env.REMEMBER_ME_TTL_SECONDS, 10)
    : Number.parseInt(env.SESSION_TTL_SECONDS, 10);
  const expiresAt = Date.now() + ttlSeconds * 1000;

  const session = await createSession(env.DB, {
    userId: input.userId,
    tokenHash,
    rememberMe: input.rememberMe,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
    expiresAt,
  });

  const cacheValue: SessionCacheValue = { userId: input.userId, sessionId: session.id, expiresAt };
  await env.SESSIONS_KV.put(sessionCacheKey(tokenHash), JSON.stringify(cacheValue), {
    expirationTtl: ttlSeconds,
  });

  return { token, sessionId: session.id, expiresAt };
}

export interface ValidatedSession {
  user: PublicUser;
  sessionId: string;
  tokenHash: string;
}

/**
 * Validates a raw session token from a cookie. Tries the KV cache first
 * (single-digit-millisecond read); on a cache miss, falls back to D1 (the
 * cache may have been evicted, or this is a session created before this
 * code path warmed it) and re-populates KV so subsequent requests are fast
 * again. Returns null for any invalid, expired, or revoked session.
 */
export async function validateSessionToken(
  env: CloudflareEnv,
  token: string,
): Promise<ValidatedSession | null> {
  const tokenHash = await hashSessionToken(token);
  const nowMs = Date.now();

  const cached = await env.SESSIONS_KV.get(sessionCacheKey(tokenHash));
  if (cached) {
    const value = JSON.parse(cached) as SessionCacheValue;
    if (value.expiresAt <= nowMs) {
      await env.SESSIONS_KV.delete(sessionCacheKey(tokenHash));
      return null;
    }
    const user = await findUserById(env.DB, value.userId);
    if (!user) return null;
    return { user: toPublicUser(user), sessionId: value.sessionId, tokenHash };
  }

  const session = await findSessionByTokenHash(env.DB, tokenHash);
  if (!session || session.revoked_at !== null || session.expires_at <= nowMs) {
    return null;
  }

  const user = await findUserById(env.DB, session.user_id);
  if (!user) return null;

  const remainingTtlSeconds = Math.max(1, Math.floor((session.expires_at - nowMs) / 1000));
  const cacheValue: SessionCacheValue = {
    userId: session.user_id,
    sessionId: session.id,
    expiresAt: session.expires_at,
  };
  await env.SESSIONS_KV.put(sessionCacheKey(tokenHash), JSON.stringify(cacheValue), {
    expirationTtl: remainingTtlSeconds,
  });

  return { user: toPublicUser(user), sessionId: session.id, tokenHash };
}

/** Revokes a session in both D1 (durable) and KV (immediate effect on the next request). */
export async function revokeSessionToken(env: CloudflareEnv, token: string): Promise<void> {
  const tokenHash = await hashSessionToken(token);
  await Promise.all([
    revokeSessionByTokenHash(env.DB, tokenHash),
    env.SESSIONS_KV.delete(sessionCacheKey(tokenHash)),
  ]);
}
