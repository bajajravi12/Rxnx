'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiClientError } from '@/lib/api/client';
import { useRealtimeSocket } from './use-realtime-socket';
import { useRealtimeMode } from '@/components/providers/realtime-mode-provider';
import type { PublicMessage } from '@/lib/db/messages';
import type { ChatServerEvent } from '@/lib/realtime/events';

export interface ReadPosition {
  userId: string;
  lastReadMessageId: string;
  lastReadAt: number;
}

export interface UseChatMessagesResult {
  messages: PublicMessage[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  typingUsers: Array<{ userId: string; displayName: string }>;
  readPositions: ReadPosition[];
  loadMore: () => Promise<void>;
  sendMessage: (input: { content?: string; replyToMessageId?: string; forwardMessageId?: string; attachmentIds?: string[] }) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string, forEveryone: boolean) => Promise<void>;
  setReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string) => Promise<void>;
  markRead: (messageId: string) => Promise<void>;
  notifyTyping: (isTyping: boolean) => void;
  jumpToMessage: (messageId: string) => Promise<void>;
  highlightedMessageId: string | null;
}

const POLL_INTERVAL_MS = 3000;

function generateClientId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Merges a freshly-fetched "latest page" of messages into existing state
 * for polling mode. Three things happen, in order: (1) any local
 * optimistic echo (id === its own clientId, not yet confirmed by the
 * server) gets swapped for its real counterpart once the poll sees it;
 * (2) every other already-known message gets replaced with its fetched
 * version, which is how edits/reactions/deletions surface without a push
 * event; (3) anything in the fetched page that wasn't already known gets
 * appended. Messages loaded further back via "load more" and not present
 * in this latest-page fetch are left untouched.
 */
function mergePolledMessages(prev: PublicMessage[], fetched: PublicMessage[]): PublicMessage[] {
  const fetchedByClientId = new Map(fetched.filter((m) => m.clientId).map((m) => [m.clientId as string, m]));
  const fetchedById = new Map(fetched.map((m) => [m.id, m]));

  const reconciled = prev.map((m) => {
    if (m.clientId && m.id === m.clientId) {
      const real = fetchedByClientId.get(m.clientId);
      if (real) return real;
    }
    return fetchedById.get(m.id) ?? m;
  });

  const knownIds = new Set(reconciled.map((m) => m.id));
  const newOnes = fetched.filter((m) => !knownIds.has(m.id));

  return [...reconciled, ...newOnes];
}

export function useChatMessages(chatId: string | null): UseChatMessagesResult {
  const mode = useRealtimeMode();
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [readPositions, setReadPositions] = useState<ReadPosition[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);
  const typingTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setTypingUsers([]);
    setReadPositions([]);
    cursorRef.current = null;

    api
      .get<{ messages: PublicMessage[]; nextCursor: string | null }>(`/api/chats/${chatId}/messages`)
      .then((result) => {
        if (cancelled) return;
        setMessages(result.messages);
        cursorRef.current = result.nextCursor;
        setHasMore(result.nextCursor !== null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : 'Failed to load messages.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chatId]);

  const loadMore = useCallback(async () => {
    if (!chatId || !cursorRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api.get<{ messages: PublicMessage[]; nextCursor: string | null }>(
        `/api/chats/${chatId}/messages?cursor=${encodeURIComponent(cursorRef.current)}`,
      );
      setMessages((prev) => [...result.messages, ...prev]);
      cursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load more messages.');
    } finally {
      setLoadingMore(false);
    }
  }, [chatId, loadingMore]);

  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const jumpToMessage = useCallback(
    async (messageId: string) => {
      if (!chatId) return;
      setLoading(true);
      setError(null);
      try {
        const result = await api.get<{ messages: PublicMessage[]; nextCursor: string | null; targetMessageId: string }>(
          `/api/chats/${chatId}/messages/context/${messageId}`,
        );
        setMessages(result.messages);
        cursorRef.current = result.nextCursor;
        setHasMore(result.nextCursor !== null);

        setHighlightedMessageId(result.targetMessageId);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => setHighlightedMessageId(null), 2500);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Could not jump to that message.');
      } finally {
        setLoading(false);
      }
    },
    [chatId],
  );

  const handleEvent = useCallback((event: ChatServerEvent) => {
    switch (event.type) {
      case 'message:new': {
        const message = event.message as PublicMessage;
        setMessages((prev) => {
          const optimisticIndex = message.clientId
            ? prev.findIndex((m) => m.clientId === message.clientId && m.id !== message.id)
            : -1;
          if (optimisticIndex !== -1) {
            const next = [...prev];
            next[optimisticIndex] = message;
            return next;
          }
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        break;
      }
      case 'message:edit': {
        const message = event.message as PublicMessage;
        setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
        break;
      }
      case 'message:delete': {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId
              ? {
                  ...m,
                  deletedForEveryone: event.deletedForEveryone,
                  content: event.deletedForEveryone ? null : m.content,
                }
              : m,
          ),
        );
        break;
      }
      case 'reaction:update': {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId ? { ...m, reactions: event.reactions as PublicMessage['reactions'] } : m,
          ),
        );
        break;
      }
      case 'read:update': {
        setReadPositions((prev) => [
          ...prev.filter((p) => p.userId !== event.userId),
          { userId: event.userId, lastReadMessageId: event.lastReadMessageId, lastReadAt: event.lastReadAt },
        ]);
        break;
      }
      case 'typing:update': {
        setTypingUsers((prev) => {
          const withoutUser = prev.filter((u) => u.userId !== event.userId);
          return event.isTyping
            ? [...withoutUser, { userId: event.userId, displayName: event.displayName }]
            : withoutUser;
        });

        const timeouts = typingTimeoutsRef.current;
        const existing = timeouts.get(event.userId);
        if (existing) clearTimeout(existing);
        if (event.isTyping) {
          // Safety net in case a "typing:stop" is ever missed (e.g. a
          // dropped connection) — clears the indicator after 6s regardless.
          timeouts.set(
            event.userId,
            setTimeout(() => {
              setTypingUsers((prev) => prev.filter((u) => u.userId !== event.userId));
              timeouts.delete(event.userId);
            }, 6000),
          );
        }
        break;
      }
      default:
        break;
    }
  }, []);

  // Only opened in "websocket" mode. In "polling" mode this stays closed —
  // `send` below then degrades to a safe no-op automatically (see
  // useRealtimeSocket: a null ticketPath never creates a socket), so
  // notifyTyping doesn't need its own polling-mode branch. Typing
  // indicators simply don't exist in polling mode — there is no
  // reasonable way to poll for "is someone typing right now" without
  // spamming requests far more aggressively than the message poll itself,
  // so `typingUsers` just stays permanently empty here.
  const { send } = useRealtimeSocket<ChatServerEvent>(
    mode === 'websocket' && chatId ? `/api/ws/${chatId}` : null,
    handleEvent,
  );

  useEffect(() => {
    const timeouts = typingTimeoutsRef.current;
    return () => {
      for (const timeout of timeouts.values()) clearTimeout(timeout);
      timeouts.clear();
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [chatId]);

  // Polling fallback for everything the WebSocket would normally push:
  // new messages, edits, deletions, reaction changes (all via re-fetching
  // the latest page and merging), and read receipts (via the dedicated
  // lightweight endpoint, since read state isn't part of the message
  // payload itself).
  useEffect(() => {
    if (mode !== 'polling' || !chatId) return;

    const interval = setInterval(async () => {
      try {
        const [messagesResult, readResult] = await Promise.all([
          api.get<{ messages: PublicMessage[]; nextCursor: string | null }>(`/api/chats/${chatId}/messages`),
          api.get<{ positions: Array<{ userId: string; lastReadMessageId: string | null; lastReadAt: number | null }> }>(
            `/api/chats/${chatId}/read-positions`,
          ),
        ]);

        setMessages((prev) => mergePolledMessages(prev, messagesResult.messages));

        setReadPositions(
          readResult.positions
            .filter((p): p is { userId: string; lastReadMessageId: string; lastReadAt: number } =>
              Boolean(p.lastReadMessageId && p.lastReadAt),
            )
            .map((p) => ({ userId: p.userId, lastReadMessageId: p.lastReadMessageId, lastReadAt: p.lastReadAt })),
        );
      } catch {
        // A single missed poll cycle isn't worth surfacing as an error —
        // the next interval tick will just try again.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [mode, chatId]);

  const sendMessage = useCallback(
    async (input: { content?: string; replyToMessageId?: string; forwardMessageId?: string; attachmentIds?: string[] }) => {
      if (!chatId) return;
      const clientId = generateClientId();

      // Optimistic echo only applies to plain text sends — attachment
      // messages already went through the staging upload UI (which shows
      // its own progress), and the real message arrives via broadcast
      // fast enough after that one DB write that a fabricated preview
      // isn't worth the complexity of faking attachment metadata locally.
      if (input.content && !input.attachmentIds?.length && !input.forwardMessageId) {
        const optimistic: PublicMessage = {
          id: clientId,
          chatId,
          senderId: 'me',
          sender: null,
          clientId,
          contentType: 'text',
          content: input.content,
          isEdited: false,
          editedAt: null,
          deletedForEveryone: false,
          createdAt: Date.now(),
          replyTo: null,
          forwardedFrom: null,
          reactions: [],
          attachments: [],
        };
        setMessages((prev) => [...prev, optimistic]);
      }

      try {
        await api.post(`/api/chats/${chatId}/messages`, { ...input, clientId });
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
        setError(err instanceof ApiClientError ? err.message : 'Failed to send message.');
      }
    },
    [chatId],
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!chatId) return;
      const result = await api.patch<{ message: PublicMessage }>(`/api/chats/${chatId}/messages/${messageId}`, { content });
      // In polling mode there's no message:edit push to rely on — apply
      // the server's response locally so the edit shows up immediately
      // rather than waiting up to POLL_INTERVAL_MS for the next tick.
      if (mode === 'polling') {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? result.message : m)));
      }
    },
    [chatId, mode],
  );

  const deleteMessage = useCallback(
    async (messageId: string, forEveryone: boolean) => {
      if (!chatId) return;
      await api.delete(`/api/chats/${chatId}/messages/${messageId}?forEveryone=${forEveryone}`);
      if (!forEveryone) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } else if (mode === 'polling') {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, deletedForEveryone: true, content: null } : m)),
        );
      }
    },
    [chatId, mode],
  );

  const setReactionAction = useCallback(
    async (messageId: string, emoji: string) => {
      const result = await api.post<{ reactions: PublicMessage['reactions'] }>(`/api/reactions/${messageId}`, { emoji });
      if (mode === 'polling') {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: result.reactions } : m)));
      }
    },
    [mode],
  );

  const removeReactionAction = useCallback(
    async (messageId: string) => {
      const result = await api.delete<{ reactions: PublicMessage['reactions'] }>(`/api/reactions/${messageId}`);
      if (mode === 'polling') {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: result.reactions } : m)));
      }
    },
    [mode],
  );

  const markRead = useCallback(
    async (messageId: string) => {
      if (!chatId) return;
      await api.post(`/api/chats/${chatId}/read`, { messageId });
    },
    [chatId],
  );

  const notifyTyping = useCallback(
    (isTyping: boolean) => {
      send({ type: isTyping ? 'typing:start' : 'typing:stop' });
    },
    [send],
  );

  const visibleTypingUsers = useMemo(() => typingUsers, [typingUsers]);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    typingUsers: visibleTypingUsers,
    readPositions,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    setReaction: setReactionAction,
    removeReaction: removeReactionAction,
    markRead,
    notifyTyping,
    jumpToMessage,
    highlightedMessageId,
  };
}
