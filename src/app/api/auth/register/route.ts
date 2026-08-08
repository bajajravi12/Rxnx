import { cookies } from 'next/headers';
import { getEnv, getAppConfig } from '@/lib/cloudflare';
import { createSessionForUser } from '@/lib/auth/session';
import { getSessionCookieOptions } from '@/lib/auth/tokens';
import { hashPassword } from '@/lib/auth/password';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { createUser, toPublicUser, usernameExists } from '@/lib/db/users';
import { registerSchema } from '@/lib/validation/auth';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';
import { getClientIp, getUserAgent } from '@/lib/utils/request';

export const runtime = 'edge';

const REGISTRATIONS_PER_IP_LIMIT = 5;
const REGISTRATIONS_PER_IP_WINDOW_SECONDS = 60 * 60; // 1 hour

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const config = getAppConfig(env);
    const ipAddress = getClientIp(request);

    if (ipAddress) {
      const rateLimit = await checkRateLimit(
        env.RATE_LIMIT_KV,
        `rl:register:ip:${ipAddress}`,
        REGISTRATIONS_PER_IP_LIMIT,
        REGISTRATIONS_PER_IP_WINDOW_SECONDS,
      );
      if (!rateLimit.allowed) {
        throw ApiError.tooManyRequests(
          'Too many accounts created from this network recently. Please try again later.',
          rateLimit.retryAfterSeconds,
        );
      }
    }

    const input = await parseJsonBody(request, registerSchema);

    if (await usernameExists(env.DB, input.username)) {
      throw ApiError.conflict('That username is already taken.');
    }

    const { hash, salt, iterations } = await hashPassword(input.password);

    const user = await createUser(env.DB, {
      username: input.username,
      displayName: input.displayName?.trim() || input.username,
      passwordHash: hash,
      passwordSalt: salt,
      passwordIterations: iterations,
    });

    const session = await createSessionForUser(env, {
      userId: user.id,
      rememberMe: true,
      userAgent: getUserAgent(request),
      ipAddress,
    });

    const cookieStore = await cookies();
    cookieStore.set(
      config.sessionCookieName,
      session.token,
      getSessionCookieOptions(config.environment, config.rememberMeTtlSeconds),
    );

    return apiSuccess({ user: toPublicUser(user) }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
