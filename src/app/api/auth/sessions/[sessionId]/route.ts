import { getEnv } from '@/lib/cloudflare';
import { requireSession } from '@/lib/auth/guard';
import { revokeSessionById } from '@/lib/db/sessions';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function DELETE(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const env = getEnv();
    const session = await requireSession();
    const { sessionId } = await params;

    const revoked = await revokeSessionById(env.DB, session.user.id, sessionId);
    if (!revoked) {
      throw ApiError.notFound('Session not found.');
    }

    return apiSuccess({ revoked: true, wasCurrentSession: sessionId === session.sessionId });
  } catch (error) {
    return handleRouteError(error);
  }
}
