import { getEnv } from '@/lib/cloudflare';
import { requireSession } from '@/lib/auth/guard';
import { revokeAllUserSessions } from '@/lib/db/sessions';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function POST() {
  try {
    const env = getEnv();
    const session = await requireSession();

    await revokeAllUserSessions(env.DB, session.user.id, session.sessionId);

    return apiSuccess({ revoked: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
