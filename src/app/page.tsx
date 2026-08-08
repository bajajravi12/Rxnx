import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';

export const runtime = 'edge';

export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? '/chats' : '/login');
}
