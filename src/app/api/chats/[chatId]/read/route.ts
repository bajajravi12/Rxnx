import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { markChatRead, requireActiveChatMember } from '@/lib/db/chat-members';
import { getMessageRowById } from '@/lib/db/messages';
import { broadcastToChatRoom } from '@/lib/realtime/broadcast';
import { readReceiptSchema } from '@/lib/validation/messages';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

export async function POST(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId } = await params;

    await requireActiveChatMember(env.DB, chatId, user.id);
    const input = await parseJsonBody(request, readReceiptSchema);

    const message = await getMessageRowById(env.DB, input.messageId);
    if (!message || message.chat_id !== chatId) {
      throw ApiError.notFound('Message not found in this chat.');
    }

    const lastReadAt = Date.now();
    await markChatRead(env.DB, chatId, user.id, input.messageId, lastReadAt);

    await broadcastToChatRoom(env, chatId, {
      type: 'read:update',
      chatId,
      userId: user.id,
      lastReadMessageId: input.messageId,
      lastReadAt,
    });

    return apiSuccess({ read: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
