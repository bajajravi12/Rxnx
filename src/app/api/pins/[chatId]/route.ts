import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { requireActiveChatMember } from '@/lib/db/chat-members';
import { fetchMessagesByIdsPublic, getMessageRowById } from '@/lib/db/messages';
import { listPinnedMessageIds, pinMessage, unpinMessage } from '@/lib/db/pinned-messages';
import { broadcastToChatRoom } from '@/lib/realtime/broadcast';
import { pinMessageSchema } from '@/lib/validation/messages';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

interface RouteParams {
  params: Promise<{ chatId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId } = await params;

    await requireActiveChatMember(env.DB, chatId, user.id);

    const messageIds = await listPinnedMessageIds(env.DB, chatId);
    const messages = await fetchMessagesByIdsPublic(env.DB, messageIds, user.id);

    return apiSuccess({ messages });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId } = await params;

    await requireActiveChatMember(env.DB, chatId, user.id);
    const input = await parseJsonBody(request, pinMessageSchema);

    const message = await getMessageRowById(env.DB, input.messageId);
    if (!message || message.chat_id !== chatId) {
      throw ApiError.notFound('Message not found in this chat.');
    }

    await pinMessage(env.DB, chatId, input.messageId, user.id);
    await broadcastToChatRoom(env, chatId, { type: 'pin:update', chatId, messageId: input.messageId, pinned: true });

    return apiSuccess({ pinned: true }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId } = await params;

    await requireActiveChatMember(env.DB, chatId, user.id);
    const messageId = new URL(request.url).searchParams.get('messageId');
    if (!messageId) {
      throw new ApiError('messageId query parameter is required', 400);
    }

    await unpinMessage(env.DB, chatId, messageId);
    await broadcastToChatRoom(env, chatId, { type: 'pin:update', chatId, messageId, pinned: false });

    return apiSuccess({ pinned: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
