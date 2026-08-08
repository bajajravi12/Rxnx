'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api/client';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { PublicUser } from '@/lib/db/users';
import type { ChatRow } from '@/lib/db/chats';

export function NewChatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { user } = await api.get<{ user: PublicUser }>(`/api/users/${encodeURIComponent(username.trim())}`);
      const { chat } = await api.post<{ chat: ChatRow }>('/api/chats', { userId: user.id });
      onClose();
      setUsername('');
      router.push(`/chats/${chat.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New chat">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="new-chat-username" className="text-sm font-medium text-foreground">
            Username
          </label>
          <Input
            id="new-chat-username"
            autoFocus
            required
            placeholder="e.g. alice"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={Boolean(error)}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <Button type="submit" className="w-full" loading={submitting}>
          Start chat
        </Button>
      </form>
    </Dialog>
  );
}
