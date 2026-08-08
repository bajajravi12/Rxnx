import { cookies } from 'next/headers';
import { getEnv, getAppConfig } from '@/lib/cloudflare';
import { revokeSessionToken } from '@/lib/auth/session';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function POST() {
  try {
    const env = getEnv();
    const config = getAppConfig(env);
    const cookieStore = await cookies();
    const token = cookieStore.get(config.sessionCookieName)?.value;

    if (token) {
      await revokeSessionToken(env, token);
    }

    cookieStore.delete(config.sessionCookieName);

    return apiSuccess({ loggedOut: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
