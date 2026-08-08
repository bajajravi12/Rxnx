import { getEnv } from '@/lib/cloudflare';
import { requireSession } from '@/lib/auth/guard';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { revokeAllUserSessions } from '@/lib/db/sessions';
import { findUserById, updateUserPassword } from '@/lib/db/users';
import { changePasswordSchema } from '@/lib/validation/auth';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const session = await requireSession();
    const input = await parseJsonBody(request, changePasswordSchema);

    const fullUser = await findUserById(env.DB, session.user.id);
    if (!fullUser) {
      throw ApiError.unauthorized('Your session is no longer valid. Please log in again.');
    }

    const currentPasswordValid = await verifyPassword(
      input.currentPassword,
      fullUser.password_hash,
      fullUser.password_salt,
      fullUser.password_iterations,
    );
    if (!currentPasswordValid) {
      throw new ApiError('Your current password is incorrect.', 401, { code: 'INVALID_CREDENTIALS' });
    }

    const { hash, salt, iterations } = await hashPassword(input.newPassword);
    await updateUserPassword(env.DB, {
      userId: fullUser.id,
      passwordHash: hash,
      passwordSalt: salt,
      passwordIterations: iterations,
    });

    // Security best practice: changing your password signs out every other
    // device/session except the one you just used to change it.
    await revokeAllUserSessions(env.DB, fullUser.id, session.sessionId);

    return apiSuccess({ changed: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
