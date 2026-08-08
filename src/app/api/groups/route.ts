import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { createGroup } from '@/lib/db/groups';
import { getMessageRowById, hydrateMessages } from '@/lib/db/messages';
import { broadcastToChatRoom } from '@/lib/realtime/broadcast';
import { createGroupSchema } from '@/lib/validation/groups';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const input = await parseJsonBody(request, createGroupSchema);

    const { group, chatId } = await createGroup(env.DB, {
      name: input.name,
      description: input.description ?? '',
      createdBy: user.id,
      createdByDisplayName: user.displayName,
      memberIds: input.memberIds,
    });

    // Broadcast the "created the group" system message so anyone who
    // happens to already be connected (unlikely for a brand-new chat, but
    // consistent with every other message-creating action) sees it live.
    const messages = await env.DB.prepare(
      'SELECT id FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 1',
    )
      .bind(chatId)
      .first<{ id: string }>();
    if (messages) {
      const row = await getMessageRowById(env.DB, messages.id);
      if (row) {
        const [hydrated] = await hydrateMessages(env.DB, [row], user.id);
        if (hydrated) await broadcastToChatRoom(env, chatId, { type: 'message:new', message: hydrated });
      }
    }

    return apiSuccess({ group, chatId }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
