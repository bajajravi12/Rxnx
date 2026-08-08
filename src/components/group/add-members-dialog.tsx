'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MemberPicker } from './member-picker';
import { api, ApiClientError } from '@/lib/api/client';
import type { PublicUser } from '@/lib/db/users';
import type { GroupMemberWithUser } from '@/lib/db/groups';

export function AddMembersDialog({
  open,
  onClose,
  groupId,
  existingMemberIds,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  existingMemberIds: string[];
  onAdded: (members: GroupMemberWithUser[]) => void;
}) {
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    setMembers([]);
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    if (members.length === 0) {
      setError('Add at least one person.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{ members: GroupMemberWithUser[] }>(`/api/groups/${groupId}/members`, {
        userIds: members.map((m) => m.id),
      });
      onAdded(result.members);
      handleClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Add members">
      <div className="space-y-3">
        <MemberPicker selected={members} onChange={setMembers} excludeUserIds={existingMemberIds} />
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button className="w-full" loading={submitting} onClick={handleSubmit}>
          Add to group
        </Button>
      </div>
    </Dialog>
  );
}
