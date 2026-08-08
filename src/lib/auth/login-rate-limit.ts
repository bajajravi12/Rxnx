import {
  countRecentFailedAttemptsByIp,
  countRecentFailedAttemptsByUsername,
  recordLoginAttempt,
} from '@/lib/db/login-attempts';

const USERNAME_MAX_ATTEMPTS = 5;
const USERNAME_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const USERNAME_LOCKOUT_SECONDS = 15 * 60;

const IP_MAX_ATTEMPTS = 20;
const IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const IP_LOCKOUT_SECONDS = 30 * 60;

function usernameLockKey(usernameLower: string): string {
  return `lock:login:user:${usernameLower}`;
}

function ipLockKey(ipAddress: string): string {
  return `lock:login:ip:${ipAddress}`;
}

export interface RateLimitCheckInput {
  usernameLower: string;
  ipAddress: string | null;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: 'username' | 'ip';
}

/**
 * Checks whether a login attempt should proceed. Two layers:
 *   1. A cheap KV read against a "locked until" flag — handles the hot
 *      path during an active brute-force burst without touching D1 at all.
 *   2. If not already locked, an authoritative COUNT against the D1
 *      `login_attempts` audit table for both the username and the IP. If
 *      either exceeds its threshold within its window, a KV lock is set
 *      (auto-expiring via `expirationTtl`) and the attempt is rejected.
 *
 * Username-based limits are intentionally stricter (5 / 15 min) than
 * IP-based limits (20 / hour) since many legitimate users can share an IP
 * (NAT, offices, mobile carriers) but a single username being hammered is
 * always suspicious.
 */
export async function checkLoginRateLimit(
  env: CloudflareEnv,
  input: RateLimitCheckInput,
): Promise<RateLimitResult> {
  const kv = env.RATE_LIMIT_KV;

  const usernameLockedUntil = await kv.get(usernameLockKey(input.usernameLower));
  if (usernameLockedUntil) {
    const retryAfterSeconds = secondsUntil(Number(usernameLockedUntil));
    if (retryAfterSeconds > 0) {
      return { allowed: false, retryAfterSeconds, reason: 'username' };
    }
  }

  if (input.ipAddress) {
    const ipLockedUntil = await kv.get(ipLockKey(input.ipAddress));
    if (ipLockedUntil) {
      const retryAfterSeconds = secondsUntil(Number(ipLockedUntil));
      if (retryAfterSeconds > 0) {
        return { allowed: false, retryAfterSeconds, reason: 'ip' };
      }
    }
  }

  const db = env.DB;
  const nowMs = Date.now();

  const failedByUsername = await countRecentFailedAttemptsByUsername(
    db,
    input.usernameLower,
    nowMs - USERNAME_WINDOW_MS,
  );
  if (failedByUsername >= USERNAME_MAX_ATTEMPTS) {
    const lockedUntil = nowMs + USERNAME_LOCKOUT_SECONDS * 1000;
    await kv.put(usernameLockKey(input.usernameLower), String(lockedUntil), {
      expirationTtl: USERNAME_LOCKOUT_SECONDS,
    });
    return { allowed: false, retryAfterSeconds: USERNAME_LOCKOUT_SECONDS, reason: 'username' };
  }

  if (input.ipAddress) {
    const failedByIp = await countRecentFailedAttemptsByIp(db, input.ipAddress, nowMs - IP_WINDOW_MS);
    if (failedByIp >= IP_MAX_ATTEMPTS) {
      const lockedUntil = nowMs + IP_LOCKOUT_SECONDS * 1000;
      await kv.put(ipLockKey(input.ipAddress), String(lockedUntil), {
        expirationTtl: IP_LOCKOUT_SECONDS,
      });
      return { allowed: false, retryAfterSeconds: IP_LOCKOUT_SECONDS, reason: 'ip' };
    }
  }

  return { allowed: true };
}

/** Records a failed login attempt in the D1 audit trail. */
export async function recordFailedLogin(
  env: CloudflareEnv,
  usernameLower: string,
  ipAddress: string | null,
): Promise<void> {
  await recordLoginAttempt(env.DB, { usernameLower, ipAddress, success: false });
}

/**
 * Records a successful login and clears any KV lock for this username/IP
 * so a legitimate user who eventually gets the password right isn't stuck
 * waiting out a lockout window unnecessarily.
 */
export async function recordSuccessfulLogin(
  env: CloudflareEnv,
  usernameLower: string,
  ipAddress: string | null,
): Promise<void> {
  await recordLoginAttempt(env.DB, { usernameLower, ipAddress, success: true });
  await env.RATE_LIMIT_KV.delete(usernameLockKey(usernameLower));
  if (ipAddress) {
    await env.RATE_LIMIT_KV.delete(ipLockKey(ipAddress));
  }
}

function secondsUntil(timestampMs: number): number {
  return Math.max(0, Math.ceil((timestampMs - Date.now()) / 1000));
}
