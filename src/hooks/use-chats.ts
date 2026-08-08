'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '@/lib/api/client';
import { useRealtimeSocket } from './use-realtime-socket';
import { useRealtimeMode } from '@/components/providers/realtime-mode-provider';
import { useSession } from '@/components/providers/session-provider';
import { showChatMessageNotification } from '@/lib/notifications/browser-notifications';
import type { ChatListItem } from '@/lib/db/chats';
import type { PresenceServerEvent } from '@/lib/realtime/events';

export interface UseChatsResult {
  chats: ChatListItem[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<ChatListItem[] | null>;
}

const POLL_INTERVAL_MS = 5000;

export function useChats(): UseChatsResult {
  const mode = useRealtimeMode();
  const { user } = useSession();
  const [chats, setChats] = useState<ChatListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read inside stable callbacks (the presence-event handler, and the
  // polling loop's diff step) without needing to re-subscribe/re-schedule
  // every time the chat list itself changes.
  const chatsRef = useRef<ChatListItem[] | null>(null);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const refetch = useCallback(async () => {
    try {
      const result = await api.get<{ chats: ChatListItem[] }>('/api/chats');
      setChats(result.chats);
      setError(null);
      return result.chats;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load chats.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  function maybeNotify(chatId: string, chatTitle: string, senderDisplayName: string, preview: string, isMuted: boolean) {
    const isTabVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
    if (!isTabVisible && !isMuted) {
      showChatMessageNotification({ chatId, chatTitle, senderDisplayName, preview });
    }
  }

  const handlePresenceEvent = useCallback(
    (event: PresenceServerEvent) => {
      if (event.type === 'chat:new_message') {
        // A simple, correct approach: the push signal tells us *something*
        // changed, and we re-fetch the authoritative list rather than
        // trying to hand-merge a partial event into unread counts/ordering
        // client-side (which would drift from the server's logic over time).
        refetch();

        const chat = chatsRef.current?.find((c) => c.chatId === event.chatId);
        maybeNotify(event.chatId, chat?.title ?? event.senderDisplayName, event.senderDisplayName, event.preview, chat?.isMuted ?? false);
      }
    },
    [refetch],
  );

  // Keeping this socket open for the lifetime of the sidebar (which is
  // mounted for the whole authenticated session via the main layout) is
  // also what keeps this user's presence marked "online". Only opened in
  // "websocket" mode — in "polling" mode (free-tier deploys with no
  // Durable Objects available) this is skipped entirely.
  useRealtimeSocket<PresenceServerEvent>(mode === 'websocket' ? '/api/ws/presence' : null, handlePresenceEvent);

  // Polling fallback: no push channel exists, so a "new message arrived"
  // notification has to be *derived* by diffing successive polls — if a
  // chat's last-message pointer moved and the new sender isn't us, treat
  // it the same as a chat:new_message push would have been treated.
  useEffect(() => {
    if (mode !== 'polling') return;

    const interval = setInterval(async () => {
      const previous = chatsRef.current;
      const next = await refetch();
      if (!previous || !next) return;

      for (const chat of next) {
        const before = previous.find((c) => c.chatId === chat.chatId);
        const hasNewMessage =
          chat.lastMessageAt !== null &&
          chat.lastMessageSenderId !== null &&
          chat.lastMessageSenderId !== user.id &&
          (!before || before.lastMessageAt !== chat.lastMessageAt);

        if (hasNewMessage) {
          maybeNotify(
            chat.chatId,
            chat.title,
            chat.otherUser?.displayName ?? chat.title,
            chat.lastMessagePreview ?? '',
            chat.isMuted,
          );
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- maybeNotify is a plain function defined in-body, stable in effect; only `refetch`/`user.id`/`mode` should retrigger scheduling
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [mode, refetch, user.id]);

  return { chats, loading, error, refetch };
}
