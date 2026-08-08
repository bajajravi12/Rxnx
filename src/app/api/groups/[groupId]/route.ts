import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { deleteGroupChat, getGroupById, listGroupMembers, requireGroupRole, updateGroup } from '@/lib/db/groups';
import { updateGroupSchema } from '@/lib/validation/groups';
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

    const group = await getGroupById(env.DB, groupId);
    if (!group) throw ApiError.notFound('Group not found.');

    const members = await listGroupMembers(env.DB, groupId);

    return apiSuccess({ group, members });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { groupId } = await params;

    await requireGroupRole(env.DB, groupId, user.id, ['owner', 'admin']);
    const input = await parseJsonBody(request, updateGroupSchema);

    const group = await updateGroup(env.DB, groupId, input);

    return apiSuccess({ group });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { groupId } = await params;

    await requireGroupRole(env.DB, groupId, user.id, ['owner']);

    const group = await getGroupById(env.DB, groupId);
    if (!group) throw ApiError.notFound('Group not found.');

    await deleteGroupChat(env.DB, group.chat_id);

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
