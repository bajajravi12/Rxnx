import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { listActiveChatMemberIds, requireActiveChatMember } from '@/lib/db/chat-members';
import {
  buildMessagePreview,
  createMessage,
  getMessageRowById,
  hydrateMessages,
  listMessagesForChat,
  type MessageContentType,
  type MessageRow,
} from '@/lib/db/messages';
import { copyAttachmentsToMessage, getAttachmentsByIds, linkAttachmentsToMessage } from '@/lib/db/attachments';
import { broadcastToChatRoom, notifyUserPresence } from '@/lib/realtime/broadcast';
import { listMessagesQuerySchema, sendMessageSchema } from '@/lib/validation/messages';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody, parseSearchParams } from '@/lib/utils/validate';

export const runtime = 'edge';

export async function GET(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId } = await params;

    await requireActiveChatMember(env.DB, chatId, user.id);

    const { cursor, limit } = parseSearchParams(new URL(request.url).searchParams, listMessagesQuerySchema);
    const page = await listMessagesForChat(env.DB, chatId, { userId: user.id, cursor, limit });

    return apiSuccess(page);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId } = await params;

    await requireActiveChatMember(env.DB, chatId, user.id);
    const input = await parseJsonBody(request, sendMessageSchema);

    let messageRow: MessageRow;
    let attachmentIdsToLink: string[] = [];

    if (input.forwardMessageId) {
      messageRow = await createForwardedMessage(env, chatId, user.id, input.forwardMessageId);
    } else {
      let contentType: MessageContentType = 'text';

      if (input.attachmentIds && input.attachmentIds.length > 0) {
        const candidates = await getAttachmentsByIds(env.DB, input.attachmentIds);
        const ownedPending = candidates.filter((a) => a.uploaded_by === user.id && a.message_id === null);
        if (ownedPending.length === 0) {
          throw new ApiError('None of the provided attachments are available to send.', 400, {
            code: 'ATTACHMENTS_UNAVAILABLE',
          });
        }
        attachmentIdsToLink = ownedPending.map((a) => a.id);
        contentType = ownedPending[0]!.kind;
      }

      messageRow = await createMessage(env.DB, {
        chatId,
        senderId: user.id,
        clientId: input.clientId ?? null,
        contentType,
        content: input.content ?? null,
        replyToMessageId: input.replyToMessageId ?? null,
      });

      if (attachmentIdsToLink.length > 0) {
        await linkAttachmentsToMessage(env.DB, attachmentIdsToLink, messageRow.id, user.id);
      }
    }

    const [hydrated] = await hydrateMessages(env.DB, [messageRow], user.id);
    if (!hydrated) throw new Error('Failed to hydrate newly created message');

    await broadcastToChatRoom(env, chatId, { type: 'message:new', message: hydrated });

    // The chat-room broadcast above only reaches members who currently
    // have this specific chat open. Everyone else still needs their
    // sidebar (unread count, ordering, last-message preview) to update
    // live — done via each member's already-open presence socket instead
    // of polling.
    const memberIds = await listActiveChatMemberIds(env.DB, chatId);
    const recipientIds = memberIds.filter((id) => id !== user.id);
    await Promise.all(
      recipientIds.map((recipientId) =>
        notifyUserPresence(env, recipientId, {
          type: 'chat:new_message',
          chatId,
          messageId: hydrated.id,
          senderId: user.id,
          senderDisplayName: user.displayName,
          preview: buildMessagePreview(hydrated.contentType, hydrated.content),
          contentType: hydrated.contentType,
          createdAt: hydrated.createdAt,
        }),
      ),
    );

    return apiSuccess({ message: hydrated }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

async function createForwardedMessage(
  env: CloudflareEnv,
  toChatId: string,
  senderId: string,
  originalMessageId: string,
) {
  const original = await getMessageRowById(env.DB, originalMessageId);
  if (!original || original.deleted_for_everyone === 1) {
    throw ApiError.notFound('The message you tried to forward no longer exists.');
  }

  // Forwarding attributes the message to whoever originally sent it, or —
  // if that original message was itself a forward — to its original
  // author, so a chain of forwards always points back to the true source.
  const attributedUserId = original.forwarded_from_user_id ?? original.sender_id;
  const attributedMessageId = original.forwarded_from_message_id ?? original.id;

  return createMessage(env.DB, {
    chatId: toChatId,
    senderId,
    contentType: original.content_type,
    content: original.content,
    forwardedFromMessageId: attributedMessageId,
    forwardedFromUserId: attributedUserId,
  }).then(async (newMessage) => {
    await copyAttachmentsToMessage(env.DB, original.id, newMessage.id, senderId);
    return newMessage;
  });
}
