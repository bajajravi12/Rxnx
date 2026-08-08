'use client';

import { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiClientError } from '@/lib/api/client';
import type { PublicUser } from '@/lib/db/users';

export function PrivacySection() {
  const { toast } = useToast();
  const [blocked, setBlocked] = useState<PublicUser[] | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ users: PublicUser[] }>('/api/blocked')
      .then((result) => setBlocked(result.users))
      .catch(() => setBlocked([]));
  }, []);

  async function handleUnblock(userId: string) {
    setUnblockingId(userId);
    try {
      await api.delete(`/api/blocked/${userId}`);
      setBlocked((prev) => (prev ? prev.filter((u) => u.id !== userId) : prev));
    } catch (err) {
      toast({
        title: 'Could not unblock user',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setUnblockingId(null);
    }
  }

  if (blocked === null) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size={16} />
      </div>
    );
  }

  if (blocked.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <UserX size={22} className="text-foreground-subtle" />
        <p className="text-sm text-foreground-muted">You haven&apos;t blocked anyone.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {blocked.map((user) => (
        <div key={user.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
          <Avatar src={user.avatarUrl} name={user.displayName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user.displayName}</p>
            <p className="truncate text-xs text-foreground-muted">@{user.username}</p>
          </div>
          <button
            type="button"
            onClick={() => handleUnblock(user.id)}
            disabled={unblockingId === user.id}
            className="nova-focus-ring rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted hover:bg-surface-sunken disabled:opacity-50"
          >
            {unblockingId === user.id ? 'Unblocking…' : 'Unblock'}
          </button>
        </div>
      ))}
    </div>
  );
}
