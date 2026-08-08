'use client';

import { useEffect } from 'react';
import { useChatsContext } from '@/components/providers/chats-provider';

const BASE_TITLE = 'Nova';

interface NavigatorWithBadging extends Navigator {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

/**
 * Mirrors total unread count (muted chats excluded, matching how their
 * rows are visually de-emphasized in the sidebar) onto the browser tab
 * title and, where the Badging API is available, the OS-level app badge.
 * Call once near the root of the authenticated app — it has no visual
 * output of its own.
 */
export function useUnreadBadge(): void {
  const { chats } = useChatsContext();

  useEffect(() => {
    const totalUnread = (chats ?? []).reduce((sum, chat) => sum + (chat.isMuted ? 0 : chat.unreadCount), 0);

    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? '99+' : totalUnread}) ${BASE_TITLE}` : BASE_TITLE;

    const nav = navigator as NavigatorWithBadging;
    if (typeof nav.setAppBadge === 'function' && typeof nav.clearAppBadge === 'function') {
      const promise = totalUnread > 0 ? nav.setAppBadge(totalUnread) : nav.clearAppBadge();
      promise.catch(() => {
        // Badging API can reject in contexts where it's technically
        // present but not actually usable (e.g. not installed as a PWA) —
        // never let that surface as an app error.
      });
    }
  }, [chats]);
}
