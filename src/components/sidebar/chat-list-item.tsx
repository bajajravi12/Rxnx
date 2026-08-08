'use client';

import Link from 'next/link';
import { Bookmark, BellOff, Pin } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils/cn';
import { formatChatListTimestamp } from '@/lib/utils/format';
import type { ChatListItem as ChatListItemType } from '@/lib/db/chats';

export function ChatListItem({ chat, active }: { chat: ChatListItemType; active: boolean }) {
  return (
    <Link
      href={`/chats/${chat.chatId}`}
      className={cn(
        'nova-focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-100',
        active ? 'bg-nova-600 text-white' : 'hover:bg-surface-sunken',
      )}
    >
      {chat.isSelf ? (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-nova-600 text-white">
          <Bookmark size={20} fill="currentColor" />
        </div>
      ) : (
        <Avatar
          src={chat.avatarUrl}
          name={chat.title}
          size="lg"
          online={chat.type === 'direct' && !chat.isSelf ? (chat.otherUser?.isOnline ?? false) : undefined}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-sm font-semibold', active ? 'text-white' : 'text-foreground')}>
            {chat.title}
          </span>
          {chat.lastMessageAt && (
            <span
              className={cn('shrink-0 text-xs', active ? 'text-white/80' : 'text-foreground-subtle')}
            >
              {formatChatListTimestamp(chat.lastMessageAt)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn('truncate text-xs', active ? 'text-white/80' : 'text-foreground-muted')}>
            {chat.lastMessagePreview ?? 'No messages yet'}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {chat.isMuted && (
              <BellOff size={12} className={active ? 'text-white/70' : 'text-foreground-subtle'} />
            )}
            {chat.isPinned && !chat.unreadCount && (
              <Pin size={12} className={active ? 'text-white/70' : 'text-foreground-subtle'} />
            )}
            {chat.unreadCount > 0 && (
              <span
                className={cn(
                  'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                  active ? 'bg-white text-nova-700' : chat.isMuted ? 'bg-ink-400 text-white' : 'bg-nova-600 text-white',
                )}
              >
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
