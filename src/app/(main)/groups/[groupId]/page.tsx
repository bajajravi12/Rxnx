'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Crown, MoreVertical, Shield, UserPlus } from 'lucide-react';
import { useSession } from '@/components/providers/session-provider';
import { useToast } from '@/components/providers/toast-provider';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { IconButton } from '@/components/ui/icon-button';
import { AddMembersDialog } from '@/components/group/add-members-dialog';
import { api, ApiClientError } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import type { GroupMemberWithUser, GroupRole, GroupRow } from '@/lib/db/groups';

export default function GroupInfoPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const router = useRouter();
  const { user } = useSession();
  const { toast } = useToast();

  const [group, setGroup] = useState<GroupRow | null>(null);
  const [members, setMembers] = useState<GroupMemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ group: GroupRow; members: GroupMemberWithUser[] }>(`/api/groups/${groupId}`);
      setGroup(result.group);
      setMembers(result.members);
      setName(result.group.name);
      setDescription(result.group.description);
    } catch (err) {
      toast({
        title: 'Could not load group',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [groupId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const myRole = members.find((m) => m.userId === user.id)?.role ?? null;
  const canManage = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';

  async function handleSaveInfo() {
    try {
      const result = await api.patch<{ group: GroupRow }>(`/api/groups/${groupId}`, { name, description });
      setGroup(result.group);
      setEditing(false);
      toast({ title: 'Group updated', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Could not update group',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    }
  }

  async function handleRoleChange(targetUserId: string, role: 'admin' | 'member') {
    setOpenMenuUserId(null);
    try {
      await api.patch(`/api/groups/${groupId}/members/${targetUserId}`, { role });
      setMembers((prev) => prev.map((m) => (m.userId === targetUserId ? { ...m, role } : m)));
    } catch (err) {
      toast({
        title: 'Could not update role',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    }
  }

  async function handleRemoveMember(targetUserId: string) {
    setOpenMenuUserId(null);
    try {
      await api.delete(`/api/groups/${groupId}/members/${targetUserId}`);
      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
    } catch (err) {
      toast({
        title: 'Could not remove member',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    }
  }

  async function handleLeave() {
    if (!confirm('Leave this group?')) return;
    try {
      await api.delete(`/api/groups/${groupId}/members/${user.id}`);
      toast({ title: 'You left the group', variant: 'success' });
      router.push('/chats');
    } catch (err) {
      toast({
        title: 'Could not leave group',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this group for everyone? This cannot be undone.')) return;
    try {
      await api.delete(`/api/groups/${groupId}`);
      toast({ title: 'Group deleted', variant: 'success' });
      router.push('/chats');
    } catch (err) {
      toast({
        title: 'Could not delete group',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    }
  }

  if (loading || !group) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="nova-scroll flex-1 overflow-y-auto">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <IconButton aria-label="Back" onClick={() => router.push(`/chats/${group.chat_id}`)}>
          <ArrowLeft size={18} />
        </IconButton>
        <p className="text-sm font-semibold text-foreground">Group info</p>
      </div>

      <div className="mx-auto max-w-lg space-y-6 px-6 py-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Avatar src={group.avatar_url} name={group.name} size="xl" />
          {editing ? (
            <div className="w-full space-y-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
                className="min-h-16 rounded-lg border border-border bg-surface px-3 py-2 text-left"
              />
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveInfo}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-lg font-semibold text-foreground">{group.name}</h1>
                {group.description && <p className="mt-1 text-sm text-foreground-muted">{group.description}</p>}
                <p className="mt-1 text-xs text-foreground-subtle">{members.length} members</p>
              </div>
              {canManage && (
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  Edit info
                </Button>
              )}
            </>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Members</p>
            {canManage && (
              <IconButton aria-label="Add members" onClick={() => setAddMembersOpen(true)}>
                <UserPlus size={16} />
              </IconButton>
            )}
          </div>

          <div className="space-y-0.5">
            {members.map((member) => (
              <div key={member.userId} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-sunken">
                <Avatar src={member.user.avatarUrl} name={member.user.displayName} size="sm" online={member.user.isOnline} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{member.user.displayName}</p>
                  <p className="truncate text-xs text-foreground-muted">@{member.user.username}</p>
                </div>
                <RoleBadge role={member.role} />

                {canManage && member.userId !== user.id && member.role !== 'owner' && (
                  <div className="relative">
                    <IconButton
                      aria-label="Member actions"
                      onClick={() => setOpenMenuUserId((v) => (v === member.userId ? null : member.userId))}
                      className="h-7 w-7"
                    >
                      <MoreVertical size={14} />
                    </IconButton>
                    {openMenuUserId === member.userId && (
                      <div className="absolute right-0 top-8 z-10 w-44 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-panel dark:shadow-panel-dark">
                        {isOwner && member.role === 'member' && (
                          <MenuButton onClick={() => handleRoleChange(member.userId, 'admin')}>Make admin</MenuButton>
                        )}
                        {isOwner && member.role === 'admin' && (
                          <MenuButton onClick={() => handleRoleChange(member.userId, 'member')}>Remove admin</MenuButton>
                        )}
                        <MenuButton danger onClick={() => handleRemoveMember(member.userId)}>
                          Remove from group
                        </MenuButton>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          {!isOwner && (
            <Button variant="secondary" className="w-full text-danger" onClick={handleLeave}>
              Leave group
            </Button>
          )}
          {isOwner && (
            <Button variant="danger" className="w-full" onClick={handleDelete}>
              Delete group
            </Button>
          )}
        </div>
      </div>

      <AddMembersDialog
        open={addMembersOpen}
        onClose={() => setAddMembersOpen(false)}
        groupId={groupId}
        existingMemberIds={members.map((m) => m.userId)}
        onAdded={(newMembers) => setMembers(newMembers)}
      />
    </div>
  );
}

function RoleBadge({ role }: { role: GroupRole }) {
  if (role === 'owner') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-nova-100 px-2 py-0.5 text-[11px] font-medium text-nova-700 dark:bg-nova-900 dark:text-nova-200">
        <Crown size={11} /> Owner
      </span>
    );
  }
  if (role === 'admin') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-foreground-muted">
        <Shield size={11} /> Admin
      </span>
    );
  }
  return null;
}

function MenuButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'nova-focus-ring w-full px-3 py-1.5 text-left text-sm hover:bg-surface-sunken',
        danger ? 'text-danger' : 'text-foreground',
      )}
    >
      {children}
    </button>
  );
}
