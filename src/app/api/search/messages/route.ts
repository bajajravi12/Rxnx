import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { requireActiveChatMember } from '@/lib/db/chat-members';
import { searchMessages } from '@/lib/db/search';
import { searchQuerySchema } from '@/lib/validation/search';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseSearchParams } from '@/lib/utils/validate';

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const input = parseSearchParams(new URL(request.url).searchParams, searchQuerySchema);

    if (input.chatId) {
      await requireActiveChatMember(env.DB, input.chatId, user.id);
    }

    const messages = await searchMessages(env.DB, user.id, input.q, {
      chatId: input.chatId,
      limit: input.limit,
    });

    return apiSuccess({ messages });
  } catch (error) {
    return handleRouteError(error);
  }
}
