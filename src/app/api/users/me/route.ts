import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { toPublicUser, updateUserProfile } from '@/lib/db/users';
import { updateProfileSchema } from '@/lib/validation/settings';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

export async function PATCH(request: Request) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const input = await parseJsonBody(request, updateProfileSchema);

    const updated = await updateUserProfile(env.DB, user.id, input);

    return apiSuccess({ user: toPublicUser(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}
