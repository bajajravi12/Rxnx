'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Laptop, Smartphone } from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';
import { useSession } from '@/components/providers/session-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiClientError } from '@/lib/api/client';

interface SessionInfo {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: number;
  expiresAt: number;
  isCurrent: boolean;
}

function describeUserAgent(ua: string | null): { label: string; isMobile: boolean } {
  if (!ua) return { label: 'Unknown device', isMobile: false };
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  if (/iPhone|iPad/i.test(ua)) return { label: 'iPhone/iPad · Safari', isMobile };
  if (/Android/i.test(ua)) return { label: 'Android device', isMobile };
  if (/Chrome/i.test(ua)) return { label: 'Chrome', isMobile };
  if (/Firefox/i.test(ua)) return { label: 'Firefox', isMobile };
  if (/Safari/i.test(ua)) return { label: 'Safari', isMobile };
  return { label: 'Browser', isMobile };
}

export function SecuritySection() {
  const { toast } = useToast();
  const { logout } = useSession();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ sessions: SessionInfo[] }>('/api/auth/sessions')
      .then((result) => setSessions(result.sessions))
      .catch(() => setSessions([]));
  }, []);

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setChangingPassword(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      toast({
        title: 'Password changed',
        description: 'You were kept signed in here; other devices were signed out.',
        variant: 'success',
      });
      const result = await api.get<{ sessions: SessionInfo[] }>('/api/auth/sessions');
      setSessions(result.sessions);
    } catch (err) {
      setPasswordError(err instanceof ApiClientError ? err.message : 'Could not change password.');
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleRevokeSession(sessionId: string) {
    setRevokingId(sessionId);
    try {
      const result = await api.delete<{ revoked: boolean; wasCurrentSession: boolean }>(
        `/api/auth/sessions/${sessionId}`,
      );
      if (result.wasCurrentSession) {
        await logout();
        return;
      }
      setSessions((prev) => (prev ? prev.filter((s) => s.id !== sessionId) : prev));
    } catch (err) {
      toast({
        title: 'Could not sign out that device',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeOthers() {
    try {
      await api.post('/api/auth/sessions/revoke-others');
      setSessions((prev) => (prev ? prev.filter((s) => s.isCurrent) : prev));
      toast({ title: 'Other devices signed out', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Could not sign out other devices',
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: 'error',
      });
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleChangePassword} className="space-y-3">
        <p className="text-sm font-semibold text-foreground">Change password</p>
        {passwordError && <p className="text-xs text-danger">{passwordError}</p>}
        <div className="space-y-1.5">
          <label htmlFor="current-password" className="text-xs font-medium text-foreground-muted">
            Current password
          </label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="new-password" className="text-xs font-medium text-foreground-muted">
            New password
          </label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" loading={changingPassword}>
          Update password
        </Button>
      </form>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Active sessions</p>
          {sessions && sessions.length > 1 && (
            <button
              type="button"
              onClick={handleRevokeOthers}
              className="nova-focus-ring text-xs font-medium text-danger hover:underline"
            >
              Sign out other devices
            </button>
          )}
        </div>

        {sessions === null ? (
          <div className="flex justify-center py-4">
            <Spinner size={16} />
          </div>
        ) : (
          <div className="space-y-0.5">
            {sessions.map((s) => {
              const { label, isMobile } = describeUserAgent(s.userAgent);
              const Icon = isMobile ? Smartphone : Laptop;
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                    <Icon size={15} className="text-foreground-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {label}
                      {s.isCurrent && <span className="ml-1.5 text-xs text-online">· This device</span>}
                    </p>
                    <p className="truncate text-xs text-foreground-subtle">
                      {s.ipAddress ?? 'Unknown location'} · {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {!s.isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.id)}
                      disabled={revokingId === s.id}
                      className="nova-focus-ring rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted hover:bg-surface-sunken disabled:opacity-50"
                    >
                      Sign out
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
