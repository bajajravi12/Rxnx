import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { searchGroups, searchMessages, searchUsers } from '@/lib/db/search';
import { searchQuerySchema } from '@/lib/validation/search';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseSearchParams } from '@/lib/utils/validate';

export const runtime = 'edge';

const GLOBAL_SEARCH_LIMIT_PER_CATEGORY = 6;

export async function GET(request: Request) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const input = parseSearchParams(new URL(request.url).searchParams, searchQuerySchema);

    const [users, groups, messages] = await Promise.all([
      searchUsers(env.DB, user.id, input.q, GLOBAL_SEARCH_LIMIT_PER_CATEGORY),
      searchGroups(env.DB, user.id, input.q, GLOBAL_SEARCH_LIMIT_PER_CATEGORY),
      searchMessages(env.DB, user.id, input.q, { limit: GLOBAL_SEARCH_LIMIT_PER_CATEGORY }),
    ]);

    return apiSuccess({ users, groups, messages });
  } catch (error) {
    return handleRouteError(error);
  }
}
