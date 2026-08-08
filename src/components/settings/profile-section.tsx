'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useSession } from '@/components/providers/session-provider';
import { useToast } from '@/components/providers/toast-provider';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetchRaw, api, ApiClientError } from '@/lib/api/client';
import { accFor, resolveAttachmentKind } from '@/lib/utils/mime';
import type { PublicUser } from '@/lib/db/users';

export function ProfileSection() {
  const { user, updateUser } = useSession();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const dirty = displayName !== user.displayName || bio !== user.bio;

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const result = await api.patch<{ user: PublicUser }>('/api/users/me', { displayName, bio });
      updateUser(result.user);
      toast({ title: 'Profile updated', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Could not update profile',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (resolveAttachmentKind(file.type) !== 'image') {
      toast({ title: 'Please choose an image file', variant: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Image is too large', description: 'Maximum size is 5 MB.', variant: 'error' });
      return;
    }

    setUploadingAvatar(true);
    try {
      const result = await apiFetchRaw<{ user: PublicUser }>('/api/users/me/avatar', {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type },
      });
      updateUser(result.user);
      toast({ title: 'Avatar updated', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Could not upload avatar',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    setUploadingAvatar(true);
    try {
      const result = await api.delete<{ user: PublicUser }>('/api/users/me/avatar');
      updateUser(result.user);
    } catch (err) {
      toast({
        title: 'Could not remove avatar',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setUploadingAvatar(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar src={user.avatarUrl} name={user.displayName} size="xl" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            aria-label="Change avatar"
            className="nova-focus-ring absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-nova-600 text-white hover:bg-nova-700 disabled:opacity-60"
          >
            {uploadingAvatar ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={accFor('image')}
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{user.displayName}</p>
          <p className="text-xs text-foreground-muted">@{user.username}</p>
          {user.avatarUrl && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              disabled={uploadingAvatar}
              className="nova-focus-ring mt-1 text-xs text-danger hover:underline disabled:opacity-60"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="display-name" className="text-sm font-medium text-foreground">
          Display name
        </label>
        <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="bio" className="text-sm font-medium text-foreground">
          Bio
        </label>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={160}
          className="min-h-20 rounded-lg border border-border bg-surface px-3 py-2"
          placeholder="Add a short bio"
        />
      </div>

      {dirty && (
        <Button size="sm" loading={savingProfile} onClick={handleSaveProfile}>
          Save changes
        </Button>
      )}
    </div>
  );
}
