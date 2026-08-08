'use client';

import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { useChatsContext } from '@/components/providers/chats-provider';
import { useToast } from '@/components/providers/toast-provider';
import { Dialog } from '@/components/ui/dialog';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiClientError } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import type { PublicMessage } from '@/lib/db/messages';

export function ForwardDialog({ message, onClose }: { message: PublicMessage | null; onClose: () => void }) {
  const { chats } = useChatsContext();
  const { toast } = useToast();
  const [sendingChatId, setSendingChatId] = useState<string | null>(null);

  async function handleForward(targetChatId: string) {
    if (!message) return;
    setSendingChatId(targetChatId);
    try {
      await api.post(`/api/chats/${targetChatId}/messages`, { forwardMessageId: message.id });
      toast({ title: 'Message forwarded', variant: 'success' });
      onClose();
    } catch (err) {
      toast({
        title: 'Could not forward message',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setSendingChatId(null);
    }
  }

  return (
    <Dialog open={message !== null} onClose={onClose} title="Forward message">
      <div className="nova-scroll max-h-80 space-y-1 overflow-y-auto">
        {!chats || chats.length === 0 ? (
          <p className="py-4 text-center text-sm text-foreground-muted">No conversations to forward to yet.</p>
        ) : (
          chats.map((chat) => (
            <button
              key={chat.chatId}
              type="button"
              onClick={() => handleForward(chat.chatId)}
              disabled={sendingChatId !== null}
              className={cn(
                'nova-focus-ring flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-sunken',
                sendingChatId && sendingChatId !== chat.chatId && 'opacity-50',
              )}
            >
              {chat.isSelf ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-nova-600 text-white">
                  <Bookmark size={16} fill="currentColor" />
                </div>
              ) : (
                <Avatar src={chat.avatarUrl} name={chat.title} size="sm" />
              )}
              <span className="flex-1 truncate text-sm font-medium text-foreground">{chat.title}</span>
              {sendingChatId === chat.chatId && <Spinner size={14} />}
            </button>
          ))
        )}
      </div>
    </Dialog>
  );
}
