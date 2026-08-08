import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { listReadPositions, requireActiveChatMember } from '@/lib/db/chat-members';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function GET(_request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { chatId } = await params;

    await requireActiveChatMember(env.DB, chatId, user.id);

    const positions = await listReadPositions(env.DB, chatId);

    return apiSuccess({ positions });
  } catch (error) {
    return handleRouteError(error);
  }
}
