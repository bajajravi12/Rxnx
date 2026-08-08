import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { findUserById, toPublicUser, updateUserAvatar } from '@/lib/db/users';
import { resolveAttachmentKind } from '@/lib/utils/mime';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB — avatars are small, no reason to allow full-size upload limits here

/** Best-effort delete of the previous avatar object so replacing/removing an avatar doesn't leak R2 storage. Never blocks the response on failure. */
async function deleteOldAvatarObject(env: CloudflareEnv, oldR2Key: string | null): Promise<void> {
  if (!oldR2Key) return;
  try {
    await env.UPLOADS_BUCKET.delete(oldR2Key);
  } catch (error) {
    console.error(`[avatar] failed to delete old avatar object ${oldR2Key}`, error);
  }
}

export async function PUT(request: Request) {
  try {
    const env = getEnv();
    const user = await requireUser();

    const mimeType = request.headers.get('content-type') ?? '';
    if (resolveAttachmentKind(mimeType) !== 'image') {
      throw new ApiError('Avatar must be an image file.', 415, { code: 'UNSUPPORTED_TYPE' });
    }

    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (contentLength > MAX_AVATAR_BYTES) {
      throw new ApiError('Avatar image is too large. Maximum size is 5 MB.', 413, { code: 'FILE_TOO_LARGE' });
    }
    if (!request.body) {
      throw new ApiError('Request body is required.', 400);
    }

    const previousRow = await findUserById(env.DB, user.id);

    const r2Key = `avatars/${user.id}/${Date.now()}`;
    await env.UPLOADS_BUCKET.put(r2Key, request.body, { httpMetadata: { contentType: mimeType } });

    // Cache-busting query param so the browser doesn't keep showing a
    // cached copy of the old avatar at the same URL.
    const avatarUrl = `/api/avatars/${user.id}?v=${Date.now()}`;
    const updated = await updateUserAvatar(env.DB, user.id, avatarUrl, r2Key);

    await deleteOldAvatarObject(env, previousRow?.avatar_r2_key ?? null);

    return apiSuccess({ user: toPublicUser(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE() {
  try {
    const env = getEnv();
    const user = await requireUser();

    const previousRow = await findUserById(env.DB, user.id);
    const updated = await updateUserAvatar(env.DB, user.id, null, null);
    await deleteOldAvatarObject(env, previousRow?.avatar_r2_key ?? null);

    return apiSuccess({ user: toPublicUser(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}
