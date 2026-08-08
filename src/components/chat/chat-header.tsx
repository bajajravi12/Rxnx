import Link from 'next/link';
import { Bookmark, ChevronRight, Pin } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { formatLastSeen } from '@/lib/utils/format';
import type { ChatListItem } from '@/lib/db/chats';

export function ChatHeader({ chat, pinnedCount }: { chat: ChatListItem; pinnedCount: number }) {
  const subtitle = chat.isSelf
    ? 'Only visible to you'
    : chat.type === 'group'
      ? `${chat.group?.memberCount ?? 0} members`
      : chat.otherUser?.isOnline
        ? 'online'
        : formatLastSeen(chat.otherUser?.lastSeenAt ?? null);

  const identity = (
    <div className="flex items-center gap-3">
      {chat.isSelf ? (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nova-600 text-white">
          <Bookmark size={18} fill="currentColor" />
        </div>
      ) : (
        <Avatar src={chat.avatarUrl} name={chat.title} size="md" />
      )}
      <div>
        <p className="text-sm font-semibold text-foreground">{chat.title}</p>
        <p className="text-xs text-foreground-muted">{subtitle}</p>
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3">
      {chat.type === 'group' && chat.group ? (
        <Link
          href={`/groups/${chat.group.id}`}
          className="nova-focus-ring flex items-center gap-2 rounded-lg -m-1 p-1 hover:bg-surface-sunken"
        >
          {identity}
          <ChevronRight size={16} className="text-foreground-subtle" />
        </Link>
      ) : (
        identity
      )}

      {pinnedCount > 0 && (
        <div className="flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1 text-xs text-foreground-muted">
          <Pin size={12} />
          {pinnedCount} pinned
        </div>
      )}
    </div>
  );
}
