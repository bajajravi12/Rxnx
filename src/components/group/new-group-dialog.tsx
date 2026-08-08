'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { MemberPicker } from './member-picker';
import { api, ApiClientError } from '@/lib/api/client';
import type { PublicUser } from '@/lib/db/users';
import type { GroupRow } from '@/lib/db/groups';

export function NewGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName('');
    setDescription('');
    setMembers([]);
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (members.length === 0) {
      setError('Add at least one other member.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { chatId } = await api.post<{ group: GroupRow; chatId: string }>('/api/groups', {
        name,
        description,
        memberIds: members.map((m) => m.id),
      });
      reset();
      onClose();
      router.push(`/chats/${chatId}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New group"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="group-name" className="text-sm font-medium text-foreground">
            Group name
          </label>
          <Input id="group-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="group-description" className="text-sm font-medium text-foreground">
            Description <span className="text-foreground-subtle">(optional)</span>
          </label>
          <Textarea
            id="group-description"
            className="min-h-16 rounded-lg border border-border bg-surface px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Members</p>
          <MemberPicker selected={members} onChange={setMembers} />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <Button type="submit" className="w-full" loading={submitting}>
          Create group
        </Button>
      </form>
    </Dialog>
  );
}
