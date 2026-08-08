import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { requireActiveChatMember } from '@/lib/db/chat-members';
import { listMessagesAroundId } from '@/lib/db/messages';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string; messageId: string }> },
) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId, messageId } = await params;

    await requireActiveChatMember(env.DB, chatId, user.id);

    const result = await listMessagesAroundId(env.DB, chatId, messageId, user.id);
    if (!result) {
      throw ApiError.notFound('That message no longer exists.');
    }

    return apiSuccess(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
