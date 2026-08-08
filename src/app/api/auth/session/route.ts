import { getCurrentUser } from '@/lib/auth/guard';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

export async function GET() {
  try {
    const user = await getCurrentUser();
    return apiSuccess({ user });
  } catch (error) {
    return handleRouteError(error);
  }
}
