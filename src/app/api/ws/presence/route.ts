import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { mintWsTicket } from '@/lib/realtime/ticket';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function GET() {
  try {
    const env = getEnv();
    const user = await requireUser();

    if (env.REALTIME_MODE === 'polling' || !env.REALTIME_WORKER_URL) {
      throw new ApiError('This deployment runs in polling mode — no WebSocket ticket is available.', 501);
    }

    const ticket = await mintWsTicket(env.SESSIONS_KV, {
      userId: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      chatId: null,
    });

    return apiSuccess({
      ticket,
      url: `${env.REALTIME_WORKER_URL}/ws/presence?ticket=${ticket}`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
