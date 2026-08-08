'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageBubbleSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { MessageBubble } from './message-bubble';
import { TypingIndicator } from './typing-indicator';
import { formatDateSeparator } from '@/lib/utils/format';
import type { PublicMessage } from '@/lib/db/messages';
import type { ReadPosition } from '@/hooks/use-chat-messages';

type Row =
  | { kind: 'separator'; id: string; label: string }
  | { kind: 'system'; id: string; text: string }
  | { kind: 'message'; id: string; message: PublicMessage; showSenderInfo: boolean };

interface MessageListProps {
  messages: PublicMessage[];
  currentUserId: string;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  typingUsers: Array<{ userId: string; displayName: string }>;
  readPositions: ReadPosition[];
  onReply: (message: PublicMessage) => void;
  onEdit: (message: PublicMessage) => void;
  onDelete: (messageId: string, forEveryone: boolean) => void;
  onForward: (message: PublicMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onLastMessageVisible: (messageId: string) => void;
  highlightedMessageId: string | null;
}

function buildRows(messages: PublicMessage[]): Row[] {
  const rows: Row[] = [];
  let lastDay: string | null = null;
  let lastSenderId: string | null = null;

  for (const message of messages) {
    const day = new Date(message.createdAt).toDateString();
    if (day !== lastDay) {
      rows.push({ kind: 'separator', id: `sep_${day}`, label: formatDateSeparator(message.createdAt) });
      lastDay = day;
      lastSenderId = null;
    }
    rows.push(
      message.contentType === 'system'
        ? { kind: 'system', id: message.id, text: message.content ?? '' }
        : {
            kind: 'message',
            id: message.id,
            message,
            showSenderInfo: message.senderId !== lastSenderId,
          },
    );
    lastSenderId = message.senderId;
  }
  return rows;
}

/** Read status is sent/read only — we track read *positions*, not a separate per-recipient delivery ack. */
function getReadStatus(message: PublicMessage, readPositions: ReadPosition[], currentUserId: string): 'sent' | 'read' | null {
  if (message.senderId !== currentUserId) return null;
  const readByOther = readPositions.some((p) => p.userId !== currentUserId && p.lastReadAt >= message.createdAt);
  return readByOther ? 'read' : 'sent';
}

export function MessageList({
  messages,
  currentUserId,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  typingUsers,
  readPositions,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onReact,
  onRemoveReaction,
  onLastMessageVisible,
  highlightedMessageId,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = buildRows(messages);
  const prevRowCountRef = useRef(0);
  const prevFirstRowIdRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 12,
  });

  // Track whether the user is near the bottom so incoming messages only
  // auto-scroll when they were already following the conversation.
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 150;

    if (el.scrollTop < 200 && hasMore && !loadingMore) {
      prevFirstRowIdRef.current = rows[0]?.id ?? null;
      onLoadMore();
    }

    const lastMessageRow = [...rows].reverse().find((r) => r.kind === 'message');
    if (lastMessageRow && distanceFromBottom < 80) {
      onLastMessageVisible(lastMessageRow.id);
    }
  }, [hasMore, loadingMore, onLoadMore, onLastMessageVisible, rows]);

  // Preserve scroll position when older messages are prepended, and
  // auto-stick to bottom when new messages arrive while already at bottom.
  useEffect(() => {
    if (rows.length === prevRowCountRef.current) return;

    const grewAtTop = prevFirstRowIdRef.current && rows.findIndex((r) => r.id === prevFirstRowIdRef.current) > 0;

    if (grewAtTop && prevFirstRowIdRef.current) {
      const newIndex = rows.findIndex((r) => r.id === prevFirstRowIdRef.current);
      if (newIndex >= 0) virtualizer.scrollToIndex(newIndex, { align: 'start' });
    } else if (stickToBottomRef.current) {
      virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    }

    prevRowCountRef.current = rows.length;
    prevFirstRowIdRef.current = null;
  }, [rows, virtualizer]);

  // Jumping to a search result replaces the whole message window and
  // wants to center on the target, overriding the generic
  // prepend/stick-to-bottom heuristics above.
  useEffect(() => {
    if (!highlightedMessageId) return;
    const index = rows.findIndex((r) => r.id === highlightedMessageId);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'center' });
    }
  }, [highlightedMessageId, rows, virtualizer]);

  if (loading) {
    return (
      <div className="flex-1 space-y-3 overflow-hidden px-4 py-6">
        <MessageBubbleSkeleton align="left" />
        <MessageBubbleSkeleton align="right" />
        <MessageBubbleSkeleton align="left" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={parentRef} onScroll={handleScroll} className="nova-scroll flex-1 overflow-y-auto">
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Spinner size={16} />
          </div>
        )}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            return (
              <div
                key={row.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                className="py-0.5"
              >
                {row.kind === 'separator' ? (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-medium text-foreground-muted">
                      {row.label}
                    </span>
                  </div>
                ) : row.kind === 'system' ? (
                  <div className="flex justify-center py-1">
                    <span className="rounded-full px-3 py-1 text-xs text-foreground-subtle">{row.text}</span>
                  </div>
                ) : (
                  <MessageBubble
                    message={row.message}
                    isOwn={row.message.senderId === currentUserId}
                    showSenderInfo={row.showSenderInfo}
                    readStatus={getReadStatus(row.message, readPositions, currentUserId)}
                    isHighlighted={row.message.id === highlightedMessageId}
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onForward={onForward}
                    onReact={onReact}
                    onRemoveReaction={onRemoveReaction}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <TypingIndicator users={typingUsers} />
    </div>
  );
}
