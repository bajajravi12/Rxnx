import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { findUserByUsername, toPublicUser } from '@/lib/db/users';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const env = getEnv();
    await requireUser();
    const { username } = await params;

    const user = await findUserByUsername(env.DB, username);
    if (!user) {
      throw ApiError.notFound('No user found with that username.');
    }

    return apiSuccess({ user: toPublicUser(user) });
  } catch (error) {
    return handleRouteError(error);
  }
}
