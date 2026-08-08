import { getEnv } from '@/lib/cloudflare';
import { requireSession } from '@/lib/auth/guard';
import { listActiveSessionsForUser } from '@/lib/db/sessions';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function GET() {
  try {
    const env = getEnv();
    const session = await requireSession();

    const sessions = await listActiveSessionsForUser(env.DB, session.user.id);

    const result = sessions.map((s) => ({
      id: s.id,
      userAgent: s.user_agent,
      ipAddress: s.ip_address,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      isCurrent: s.id === session.sessionId,
    }));

    return apiSuccess({ sessions: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
