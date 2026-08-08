import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { unblockUser } from '@/lib/db/blocked-users';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { userId } = await params;

    await unblockUser(env.DB, user.id, userId);

    return apiSuccess({ unblocked: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
