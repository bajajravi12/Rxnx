import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { getChatById } from '@/lib/db/chats';
import { requireActiveChatMember, updateChatMemberSettings } from '@/lib/db/chat-members';
import { chatMemberSettingsSchema } from '@/lib/validation/messages';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

export async function GET(_request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId } = await params;

    await requireActiveChatMember(env.DB, chatId, user.id);

    const chat = await getChatById(env.DB, chatId);
    if (!chat) throw ApiError.notFound('Chat not found.');

    return apiSuccess({ chat });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId } = await params;

    await requireActiveChatMember(env.DB, chatId, user.id);
    const input = await parseJsonBody(request, chatMemberSettingsSchema);

    await updateChatMemberSettings(env.DB, chatId, user.id, input);

    return apiSuccess({ updated: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
