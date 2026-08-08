import { cookies } from 'next/headers';
import { getEnv, getAppConfig } from '@/lib/cloudflare';
import { waitUntil } from '@/lib/cloudflare/context';
import { createSessionForUser } from '@/lib/auth/session';
import { getSessionCookieOptions } from '@/lib/auth/tokens';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '@/lib/auth/password';
import { checkLoginRateLimit, recordFailedLogin, recordSuccessfulLogin } from '@/lib/auth/login-rate-limit';
import { findUserByUsername, toPublicUser } from '@/lib/db/users';
import { pruneExpiredSessions } from '@/lib/db/sessions';
import { loginSchema } from '@/lib/validation/auth';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';
import { getClientIp, getUserAgent } from '@/lib/utils/request';

export const runtime = 'edge';

const INVALID_CREDENTIALS_MESSAGE = 'Incorrect username or password.';

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const config = getAppConfig(env);
    const ipAddress = getClientIp(request);

    const input = await parseJsonBody(request, loginSchema);
    const usernameLower = input.username.toLowerCase();

    const rateLimit = await checkLoginRateLimit(env, { usernameLower, ipAddress });
    if (!rateLimit.allowed) {
      throw ApiError.tooManyRequests(
        'Too many failed login attempts. Please try again later.',
        rateLimit.retryAfterSeconds,
      );
    }

    const user = await findUserByUsername(env.DB, usernameLower);

    if (!user) {
      // Perform a dummy PBKDF2 verification so the response time for a
      // nonexistent username is comparable to a wrong-password response,
      // mitigating username enumeration via timing analysis.
      await verifyPassword(
        input.password,
        DUMMY_PASSWORD_HASH.hash,
        DUMMY_PASSWORD_HASH.salt,
        DUMMY_PASSWORD_HASH.iterations,
      );
      await recordFailedLogin(env, usernameLower, ipAddress);
      throw new ApiError(INVALID_CREDENTIALS_MESSAGE, 401, { code: 'INVALID_CREDENTIALS' });
    }

    const passwordValid = await verifyPassword(
      input.password,
      user.password_hash,
      user.password_salt,
      user.password_iterations,
    );

    if (!passwordValid) {
      await recordFailedLogin(env, usernameLower, ipAddress);
      throw new ApiError(INVALID_CREDENTIALS_MESSAGE, 401, { code: 'INVALID_CREDENTIALS' });
    }

    await recordSuccessfulLogin(env, usernameLower, ipAddress);

    const session = await createSessionForUser(env, {
      userId: user.id,
      rememberMe: input.rememberMe,
      userAgent: getUserAgent(request),
      ipAddress,
    });

    const cookieStore = await cookies();
    cookieStore.set(
      config.sessionCookieName,
      session.token,
      getSessionCookieOptions(
        config.environment,
        input.rememberMe ? config.rememberMeTtlSeconds : config.sessionTtlSeconds,
      ),
    );

    // ~1% of successful logins trigger a lazy sweep of long-expired session
    // rows. Deferred via waitUntil so it never adds latency to this response.
    if (Math.random() < 0.01) {
      waitUntil(pruneExpiredSessions(env.DB));
    }

    return apiSuccess({ user: toPublicUser(user) });
  } catch (error) {
    return handleRouteError(error);
  }
}
