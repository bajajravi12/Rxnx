'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PublicUser } from '@/lib/db/users';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await api.post<{ user: PublicUser }>('/api/auth/login', { username, password, rememberMe });
      const next = searchParams.get('next');
      router.push(next && next.startsWith('/') ? next : '/chats');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
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
        <h1 className="text-lg font-semibold text-foreground">Welcome back</h1>
        <p className="mt-1 text-sm text-foreground-muted">Sign in to continue to Nova.</p>
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground-muted">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-nova-600"
        />
        Remember me
      </label>

      <Button type="submit" className="w-full" loading={submitting}>
        Sign in
      </Button>

      <p className="text-center text-sm text-foreground-muted">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-medium text-nova-600 hover:text-nova-700">
          Create one
        </Link>
      </p>
    </form>
  );
}
