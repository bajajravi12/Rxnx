import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { blockUser, listBlockedUsers } from '@/lib/db/blocked-users';
import { findUserById } from '@/lib/db/users';
import { blockUserSchema } from '@/lib/validation/settings';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

export async function GET() {
  try {
    const env = getEnv();
    const user = await requireUser();

    const users = await listBlockedUsers(env.DB, user.id);

    return apiSuccess({ users });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const input = await parseJsonBody(request, blockUserSchema);

    if (input.userId === user.id) {
      throw new ApiError('You cannot block yourself.', 400);
    }

    const target = await findUserById(env.DB, input.userId);
    if (!target) throw ApiError.notFound('User not found.');

    await blockUser(env.DB, user.id, input.userId);

    return apiSuccess({ blocked: true }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
