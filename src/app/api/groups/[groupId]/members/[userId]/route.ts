import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import {
  getGroupById,
  getGroupMemberRole,
  removeGroupMember,
  requireGroupRole,
  updateGroupMemberRole,
} from '@/lib/db/groups';
import { findUserById } from '@/lib/db/users';
import { getMessageRowById, hydrateMessages } from '@/lib/db/messages';
import { broadcastToChatRoom } from '@/lib/realtime/broadcast';
import { updateGroupMemberRoleSchema } from '@/lib/validation/groups';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

interface RouteParams {
  params: Promise<{ groupId: string; userId: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { groupId, userId: targetUserId } = await params;

    const requesterRole = await requireGroupRole(env.DB, groupId, user.id, ['owner', 'admin', 'member']);
    const isSelfLeave = targetUserId === user.id;

    if (isSelfLeave) {
      if (requesterRole === 'owner') {
        throw ApiError.forbidden('As the owner, delete the group instead of leaving it.');
      }
    } else {
      if (requesterRole === 'member') {
        throw ApiError.forbidden('Only group admins or the owner can remove members.');
      }
      const targetRole = await getGroupMemberRole(env.DB, groupId, targetUserId);
      if (!targetRole) {
        throw ApiError.notFound('That person is not a member of this group.');
      }
      if (targetRole === 'owner') {
        throw ApiError.forbidden('The group owner cannot be removed.');
      }
      if (targetRole === 'admin' && requesterRole !== 'owner') {
        throw ApiError.forbidden('Only the owner can remove an admin.');
      }
    }

    const group = await getGroupById(env.DB, groupId);
    if (!group) throw ApiError.notFound('Group not found.');

    const targetUser = await findUserById(env.DB, targetUserId);
    if (!targetUser) throw ApiError.notFound('User not found.');

    await removeGroupMember(
      env.DB,
      groupId,
      group.chat_id,
      targetUserId,
      user.displayName,
      targetUser.display_name,
      isSelfLeave,
    );

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
    await broadcastToChatRoom(env, group.chat_id, { type: 'member:update', chatId: group.chat_id, reason: 'left' });

    return apiSuccess({ removed: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { groupId, userId: targetUserId } = await params;

    await requireGroupRole(env.DB, groupId, user.id, ['owner']);
    const input = await parseJsonBody(request, updateGroupMemberRoleSchema);

    const targetRole = await getGroupMemberRole(env.DB, groupId, targetUserId);
    if (!targetRole) throw ApiError.notFound('That person is not a member of this group.');
    if (targetRole === 'owner') throw ApiError.forbidden("The owner's role cannot be changed.");

    await updateGroupMemberRole(env.DB, groupId, targetUserId, input.role);

    const group = await getGroupById(env.DB, groupId);
    if (group) {
      await broadcastToChatRoom(env, group.chat_id, {
        type: 'member:update',
        chatId: group.chat_id,
        reason: 'role_changed',
      });
    }

    return apiSuccess({ updated: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
