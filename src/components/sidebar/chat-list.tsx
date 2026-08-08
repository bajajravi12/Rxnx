'use client';

import { useParams } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { useChatsContext } from '@/components/providers/chats-provider';
import { ChatListItemSkeleton } from '@/components/ui/skeleton';
import { ChatListItem } from './chat-list-item';

export function ChatList() {
  const { chats, loading, error } = useChatsContext();
  const params = useParams<{ chatId?: string }>();
  const activeChatId = params?.chatId;

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto py-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <ChatListItemSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="px-4 py-6 text-center text-sm text-danger">{error}</div>;
  }

  if (!chats || chats.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <MessageCircle size={28} className="text-foreground-subtle" />
        <p className="text-sm text-foreground-muted">No conversations yet. Search for someone to start chatting.</p>
      </div>
    );
  }

  return (
    <div className="nova-scroll flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
      {chats.map((chat) => (
        <ChatListItem key={chat.chatId} chat={chat} active={chat.chatId === activeChatId} />
      ))}
    </div>
  );
}
