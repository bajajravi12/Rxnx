'use client';

import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { api, ApiClientError } from '@/lib/api/client';
import type { PublicUser } from '@/lib/db/users';

export interface MemberPickerProps {
  selected: PublicUser[];
  onChange: (users: PublicUser[]) => void;
  excludeUserIds?: string[];
}

export function MemberPicker({ selected, onChange, excludeUserIds = [] }: MemberPickerProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function addByUsername() {
    const trimmed = username.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    try {
      const { user } = await api.get<{ user: PublicUser }>(`/api/users/${encodeURIComponent(trimmed)}`);
      if (excludeUserIds.includes(user.id)) {
        setError('This person is already in the group.');
        return;
      }
      if (selected.some((u) => u.id === user.id)) {
        setError('Already added.');
        return;
      }
      onChange([...selected, user]);
      setUsername('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addByUsername();
    }
  }

  function remove(userId: string) {
    onChange(selected.filter((u) => u.id !== userId));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add by username"
          error={Boolean(error)}
        />
        <button
          type="button"
          onClick={addByUsername}
          disabled={loading || !username.trim()}
          className="nova-focus-ring shrink-0 rounded-lg bg-nova-600 px-3 text-sm font-medium text-white hover:bg-nova-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <span
              key={u.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface-sunken py-1 pl-1 pr-2 text-xs"
            >
              <Avatar src={u.avatarUrl} name={u.displayName} size="xs" />
              {u.displayName}
              <button
                type="button"
                onClick={() => remove(u.id)}
                aria-label={`Remove ${u.displayName}`}
                className="nova-focus-ring rounded-full text-foreground-subtle hover:text-foreground"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
