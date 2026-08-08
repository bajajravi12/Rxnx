import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { requireActiveChatMember } from '@/lib/db/chat-members';
import { getMessageRowById } from '@/lib/db/messages';
import { listReactionsForMessages, removeReaction, setReaction, summarizeReactions } from '@/lib/db/reactions';
import { broadcastToChatRoom } from '@/lib/realtime/broadcast';
import { reactionSchema } from '@/lib/validation/messages';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

interface RouteParams {
  params: Promise<{ messageId: string }>;
}

async function loadMessageAndVerifyMembership(env: CloudflareEnv, userId: string, messageId: string) {
  const message = await getMessageRowById(env.DB, messageId);
  if (!message) throw ApiError.notFound('Message not found.');
  await requireActiveChatMember(env.DB, message.chat_id, userId);
  return message;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { messageId } = await params;

    const message = await loadMessageAndVerifyMembership(env, user.id, messageId);
    const input = await parseJsonBody(request, reactionSchema);

    await setReaction(env.DB, messageId, user.id, input.emoji);

    const reactions = await listReactionsForMessages(env.DB, [messageId]);
    const summary = summarizeReactions(reactions, messageId, user.id);

    await broadcastToChatRoom(env, message.chat_id, {
      type: 'reaction:update',
      messageId,
      reactions: summary,
    });

    return apiSuccess({ reactions: summary });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { messageId } = await params;

    const message = await loadMessageAndVerifyMembership(env, user.id, messageId);

    await removeReaction(env.DB, messageId, user.id);

    const reactions = await listReactionsForMessages(env.DB, [messageId]);
    const summary = summarizeReactions(reactions, messageId, user.id);

    await broadcastToChatRoom(env, message.chat_id, {
      type: 'reaction:update',
      messageId,
      reactions: summary,
    });

    return apiSuccess({ reactions: summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
