'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, MessageSquare, Search as SearchIcon, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { api, ApiClientError } from '@/lib/api/client';
import { formatChatListTimestamp } from '@/lib/utils/format';
import type { PublicUser } from '@/lib/db/users';
import type { GroupSearchResult, MessageSearchResult } from '@/lib/db/search';
import type { ChatRow } from '@/lib/db/chats';

interface GlobalSearchResults {
  users: PublicUser[];
  groups: GroupSearchResult[];
  messages: MessageSearchResult[];
}

const DEBOUNCE_MS = 300;

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.get<GlobalSearchResults>(`/api/search/global?q=${encodeURIComponent(trimmed)}`);
        setResults(data);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Search failed.');
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function openUserChat(user: PublicUser) {
    try {
      const { chat } = await api.post<{ chat: ChatRow }>('/api/chats', { userId: user.id });
      router.push(`/chats/${chat.id}`);
    } catch {
      // apiFetch already surfaces network errors via thrown ApiClientError;
      // a failed chat-open just leaves the user on the search page.
    }
  }

  const hasAnyResults =
    results && (results.users.length > 0 || results.groups.length > 0 || results.messages.length > 0);

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-5 py-3">
        <div className="relative">
          <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-subtle" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, groups, and messages"
            className="pl-9"
          />
        </div>
      </div>

      <div className="nova-scroll flex-1 overflow-y-auto px-2 py-2">
        {loading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        {!loading && error && <p className="px-3 py-4 text-sm text-danger">{error}</p>}

        {!loading && !error && query.trim() && !hasAnyResults && (
          <p className="px-3 py-8 text-center text-sm text-foreground-muted">No results for &ldquo;{query}&rdquo;.</p>
        )}

        {!loading && !query.trim() && (
          <p className="px-3 py-8 text-center text-sm text-foreground-muted">
            Search for people by username, your groups by name, or message content.
          </p>
        )}

        {results && results.users.length > 0 && (
          <section className="mb-3">
            <SectionLabel icon={Users} label="People" />
            {results.users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => openUserChat(user)}
                className="nova-focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-sunken"
              >
                <Avatar src={user.avatarUrl} name={user.displayName} size="sm" online={user.isOnline} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{user.displayName}</p>
                  <p className="truncate text-xs text-foreground-muted">@{user.username}</p>
                </div>
              </button>
            ))}
          </section>
        )}

        {results && results.groups.length > 0 && (
          <section className="mb-3">
            <SectionLabel icon={Bookmark} label="Groups" />
            {results.groups.map((group) => (
              <button
                key={group.groupId}
                type="button"
                onClick={() => router.push(`/chats/${group.chatId}`)}
                className="nova-focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-sunken"
              >
                <Avatar src={group.avatarUrl} name={group.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{group.name}</p>
                  <p className="truncate text-xs text-foreground-muted">{group.memberCount} members</p>
                </div>
              </button>
            ))}
          </section>
        )}

        {results && results.messages.length > 0 && (
          <section className="mb-3">
            <SectionLabel icon={MessageSquare} label="Messages" />
            {results.messages.map((message) => (
              <button
                key={message.messageId}
                type="button"
                onClick={() => router.push(`/chats/${message.chatId}?highlight=${message.messageId}`)}
                className="nova-focus-ring flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-surface-sunken"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{message.chatTitle}</span>
                  <span className="shrink-0 text-xs text-foreground-subtle">
                    {formatChatListTimestamp(message.createdAt)}
                  </span>
                </div>
                <p className="truncate text-xs text-foreground-muted">
                  {message.snippetParts.map((part, i) =>
                    part.highlighted ? (
                      <mark key={i} className="bg-transparent font-semibold text-nova-600 dark:text-nova-300">
                        {part.text}
                      </mark>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </p>
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
      <Icon size={12} />
      {label}
    </div>
  );
}
