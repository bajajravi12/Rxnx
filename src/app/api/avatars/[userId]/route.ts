import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { findUserById } from '@/lib/db/users';
import { ApiError } from '@/lib/utils/api-error';
import { handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const env = getEnv();
    await requireUser();
    const { userId } = await params;

    const user = await findUserById(env.DB, userId);
    if (!user || !user.avatar_r2_key) {
      throw ApiError.notFound('No avatar set for this user.');
    }

    const object = await env.UPLOADS_BUCKET.get(user.avatar_r2_key);
    if (!object || !object.body) {
      throw ApiError.notFound('Avatar file not found in storage.');
    }

    return new Response(object.body, {
      headers: {
        'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
        'cache-control': 'private, max-age=86400',
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
