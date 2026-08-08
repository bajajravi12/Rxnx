import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { addGroupMembers, getGroupById, listGroupMembers, requireGroupRole } from '@/lib/db/groups';
import { getMessageRowById, hydrateMessages } from '@/lib/db/messages';
import { broadcastToChatRoom } from '@/lib/realtime/broadcast';
import { addGroupMembersSchema } from '@/lib/validation/groups';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { groupId } = await params;

    await requireGroupRole(env.DB, groupId, user.id, ['owner', 'admin', 'member']);
    const members = await listGroupMembers(env.DB, groupId);

    return apiSuccess({ members });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { groupId } = await params;

    await requireGroupRole(env.DB, groupId, user.id, ['owner', 'admin']);
    const input = await parseJsonBody(request, addGroupMembersSchema);

    const group = await getGroupById(env.DB, groupId);
    if (!group) throw ApiError.notFound('Group not found.');

    const result = await addGroupMembers(env.DB, groupId, group.chat_id, user.id, user.displayName, input.userIds);

    if (result.addedUserIds.length > 0) {
      const latestMessage = await env.DB.prepare(
        'SELECT id FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1',
      )
        .bind(group.chat_id)
        .first<{ id: string }>();

      if (latestMessage) {
        const row = await getMessageRowById(env.DB, latestMessage.id);
        if (row) {
          const [hydrated] = await hydrateMessages(env.DB, [row], user.id);
          if (hydrated) await broadcastToChatRoom(env, group.chat_id, { type: 'message:new', message: hydrated });
        }
      }

      await broadcastToChatRoom(env, group.chat_id, { type: 'member:update', chatId: group.chat_id, reason: 'joined' });
    }

    const members = await listGroupMembers(env.DB, groupId);
    return apiSuccess({ members, addedCount: result.addedUserIds.length }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
