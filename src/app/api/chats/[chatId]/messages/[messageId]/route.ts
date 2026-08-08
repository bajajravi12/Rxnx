import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { requireActiveChatMember } from '@/lib/db/chat-members';
import {
  deleteMessageForEveryone,
  deleteMessageForMe,
  editMessage,
  getMessageRowById,
  hydrateMessages,
} from '@/lib/db/messages';
import { broadcastToChatRoom } from '@/lib/realtime/broadcast';
import { editMessageSchema } from '@/lib/validation/messages';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

interface RouteParams {
  params: Promise<{ chatId: string; messageId: string }>;
}

/**
 * Loads the message and confirms both (a) it actually belongs to the
 * chatId in the URL and (b) the caller is an active member of that chat.
 * Trusting the URL's chatId alone (without cross-checking the message's
 * real chat_id) would let a mismatched chatId/messageId pair slip through
 * ownership checks that only look at sender_id.
 */
async function loadOwnedMessageInChat(env: CloudflareEnv, chatId: string, userId: string, messageId: string) {
  await requireActiveChatMember(env.DB, chatId, userId);

  const message = await getMessageRowById(env.DB, messageId);
  if (!message || message.chat_id !== chatId) {
    throw ApiError.notFound('Message not found in this chat.');
  }
  return message;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId, messageId } = await params;

    await loadOwnedMessageInChat(env, chatId, user.id, messageId);
    const input = await parseJsonBody(request, editMessageSchema);

    const updated = await editMessage(env.DB, { messageId, senderId: user.id, content: input.content });
    if (!updated) {
      throw ApiError.forbidden('You can only edit your own messages, and only before they are deleted.');
    }

    const [hydrated] = await hydrateMessages(env.DB, [updated], user.id);
    if (!hydrated) throw new Error('Failed to hydrate edited message');

    await broadcastToChatRoom(env, chatId, { type: 'message:edit', message: hydrated });

    return apiSuccess({ message: hydrated });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId, messageId } = await params;

    await loadOwnedMessageInChat(env, chatId, user.id, messageId);
    const forEveryone = new URL(request.url).searchParams.get('forEveryone') === 'true';

    if (forEveryone) {
      const deleted = await deleteMessageForEveryone(env.DB, messageId, user.id);
      if (!deleted) {
        throw ApiError.forbidden('You can only delete your own messages for everyone.');
      }
      await broadcastToChatRoom(env, chatId, { type: 'message:delete', messageId, deletedForEveryone: true });
    } else {
      await deleteMessageForMe(env.DB, messageId, user.id);
      // Delete-for-me is a purely local view change — no broadcast, since
      // it must not affect what other members see.
    }

    return apiSuccess({ deleted: true, forEveryone });
  } catch (error) {
    return handleRouteError(error);
  }
}
