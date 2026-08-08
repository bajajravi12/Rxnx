import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { mintWsTicket } from '@/lib/realtime/ticket';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function GET(_request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId } = await params;

    if (env.REALTIME_MODE === 'polling' || !env.REALTIME_WORKER_URL) {
      throw new ApiError('This deployment runs in polling mode — no WebSocket ticket is available.', 501);
    }

    const membership = await env.DB.prepare(
      'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
    )
      .bind(chatId, user.id)
      .first();

    if (!membership) {
      throw ApiError.forbidden('You are not a member of this chat.');
    }

    const ticket = await mintWsTicket(env.SESSIONS_KV, {
      userId: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      chatId,
    });

    return apiSuccess({
      ticket,
      url: `${env.REALTIME_WORKER_URL}/ws/chat/${chatId}?ticket=${ticket}`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
