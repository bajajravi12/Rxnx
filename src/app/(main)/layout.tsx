import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { getEnv, getAppConfig } from '@/lib/cloudflare';
import { SessionProvider } from '@/components/providers/session-provider';
import { ChatsProvider } from '@/components/providers/chats-provider';
import { RealtimeModeProvider } from '@/components/providers/realtime-mode-provider';
import { Sidebar } from '@/components/sidebar/sidebar';

export const runtime = 'edge';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { realtimeMode } = getAppConfig(getEnv());

  return (
    <RealtimeModeProvider mode={realtimeMode}>
      <SessionProvider initialUser={user}>
        <ChatsProvider>
          <div className="flex h-screen overflow-hidden bg-surface">
            <Sidebar />
            <main className="flex min-w-0 flex-1 flex-col">{children}</main>
          </div>
        </ChatsProvider>
      </SessionProvider>
    </RealtimeModeProvider>
  );
}
