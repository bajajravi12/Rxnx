'use client';

import { useUnreadBadge } from '@/hooks/use-unread-badge';
import { NotificationPermissionBanner } from '@/components/notifications/notification-permission-banner';
import { SidebarHeader } from './sidebar-header';
import { ChatList } from './chat-list';

export function Sidebar() {
  useUnreadBadge();

  return (
    <aside className="flex w-full max-w-xs shrink-0 flex-col border-r border-border bg-surface md:max-w-sm">
      <SidebarHeader />
      <NotificationPermissionBanner />
      <ChatList />
    </aside>
  );
}
