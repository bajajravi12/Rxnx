'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PublicUser } from '@/lib/db/users';

export function RegisterForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      await api.post<{ user: PublicUser }>('/api/auth/register', {
        username,
        password,
        displayName: displayName || undefined,
      });
      router.push('/chats');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFieldErrors(err.fields ?? {});
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Create your account</h1>
        <p className="mt-1 text-sm text-foreground-muted">Just a username and password — no email required.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="username" className="text-sm font-medium text-foreground">
          Username
        </label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoFocus
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={Boolean(fieldErrors.username)}
        />
        {fieldErrors.username?.map((msg) => (
          <p key={msg} className="text-xs text-danger">
            {msg}
          </p>
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="displayName" className="text-sm font-medium text-foreground">
          Display name <span className="text-foreground-subtle">(optional)</span>
        </label>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={Boolean(fieldErrors.password)}
        />
        {fieldErrors.password?.map((msg) => (
          <p key={msg} className="text-xs text-danger">
            {msg}
          </p>
        ))}
        {!fieldErrors.password && (
          <p className="text-xs text-foreground-subtle">At least 8 characters, with a letter and a number.</p>
        )}
      </div>

      <Button type="submit" className="w-full" loading={submitting}>
        Create account
      </Button>

      <p className="text-center text-sm text-foreground-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-nova-600 hover:text-nova-700">
          Sign in
        </Link>
      </p>
    </form>
  );
}
