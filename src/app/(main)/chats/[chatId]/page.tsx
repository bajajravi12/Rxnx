'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useSession } from '@/components/providers/session-provider';
import { useChatsContext } from '@/components/providers/chats-provider';
import { useToast } from '@/components/providers/toast-provider';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { ChatHeader } from '@/components/chat/chat-header';
import { MessageList } from '@/components/chat/message-list';
import { ForwardDialog } from '@/components/chat/forward-dialog';
import { Composer } from '@/components/composer/composer';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiClientError } from '@/lib/api/client';
import type { PublicMessage } from '@/lib/db/messages';

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}

function ChatPageContent() {
  const params = useParams<{ chatId: string }>();
  const chatId = params.chatId;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useSession();
  const { chats, loading: chatsLoading } = useChatsContext();
  const { toast } = useToast();

  const chat = chats?.find((c) => c.chatId === chatId) ?? null;

  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    typingUsers,
    readPositions,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    setReaction,
    removeReaction,
    markRead,
    notifyTyping,
    jumpToMessage,
    highlightedMessageId,
  } = useChatMessages(chatId);

  const [replyingTo, setReplyingTo] = useState<PublicMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<PublicMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<PublicMessage | null>(null);
  const [pinnedCount, setPinnedCount] = useState(0);

  useEffect(() => {
    setReplyingTo(null);
    setEditingMessage(null);
  }, [chatId]);

  // A search result links to /chats/[chatId]?highlight=[messageId] — jump
  // to that message once loaded, then strip the param so a later normal
  // reload of the chat doesn't keep re-jumping.
  useEffect(() => {
    const highlight = searchParams.get('highlight');
    if (highlight) {
      jumpToMessage(highlight);
      router.replace(`/chats/${chatId}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the chat itself or the highlight param changes, not on every jumpToMessage identity change
  }, [chatId, searchParams]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ messages: PublicMessage[] }>(`/api/pins/${chatId}`)
      .then((result) => {
        if (!cancelled) setPinnedCount(result.messages.length);
      })
      .catch(() => {
        // Non-critical UI detail — silently keep the previous count.
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  async function handleDelete(messageId: string, forEveryone: boolean) {
    try {
      await deleteMessage(messageId, forEveryone);
    } catch (err) {
      toast({
        title: 'Could not delete message',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    }
  }

  async function handleEditSubmit(messageId: string, content: string) {
    try {
      await editMessage(messageId, content);
      setEditingMessage(null);
    } catch (err) {
      toast({
        title: 'Could not save edit',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    }
  }

  async function handleSend(content: string, replyToMessageId?: string, attachmentIds?: string[]) {
    setReplyingTo(null);
    try {
      await sendMessage({ content: content || undefined, replyToMessageId, attachmentIds });
    } catch (err) {
      toast({
        title: 'Message not sent',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    }
  }

  async function handleReact(messageId: string, emoji: string) {
    try {
      await setReaction(messageId, emoji);
    } catch {
      toast({ title: 'Could not add reaction', variant: 'error' });
    }
  }

  async function handleRemoveReaction(messageId: string) {
    try {
      await removeReaction(messageId);
    } catch {
      toast({ title: 'Could not remove reaction', variant: 'error' });
    }
  }

  if (chatsLoading || !chat) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatHeader chat={chat} pinnedCount={pinnedCount} />

      <MessageList
        messages={messages}
        currentUserId={user.id}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={loadMore}
        typingUsers={typingUsers}
        readPositions={readPositions}
        onReply={setReplyingTo}
        onEdit={setEditingMessage}
        onDelete={handleDelete}
        onForward={setForwardingMessage}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        onLastMessageVisible={markRead}
        highlightedMessageId={highlightedMessageId}
      />

      <Composer
        chatId={chatId}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        onSend={handleSend}
        onSubmitEdit={handleEditSubmit}
        onTyping={notifyTyping}
      />

      <ForwardDialog message={forwardingMessage} onClose={() => setForwardingMessage(null)} />
    </div>
  );
}
