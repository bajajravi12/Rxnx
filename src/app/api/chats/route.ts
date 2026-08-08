import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { getOrCreateDirectChat, listChatsForUser } from '@/lib/db/chats';
import { findUserById } from '@/lib/db/users';
import { isBlockedEitherWay } from '@/lib/db/blocked-users';
import { createChatSchema } from '@/lib/validation/messages';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';

    const chats = await listChatsForUser(env.DB, user.id, { includeArchived });
    return apiSuccess({ chats });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const input = await parseJsonBody(request, createChatSchema);

    if (input.userId !== user.id) {
      const otherUser = await findUserById(env.DB, input.userId);
      if (!otherUser) {
        throw ApiError.notFound('User not found.');
      }
      if (await isBlockedEitherWay(env.DB, user.id, input.userId)) {
        throw ApiError.forbidden('You cannot start a chat with this user.');
      }
    }

    const chat = await getOrCreateDirectChat(env.DB, user.id, input.userId);
    return apiSuccess({ chat }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
