'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import type { PublicUser } from '@/lib/db/users';

interface SessionContextValue {
  user: PublicUser;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<PublicUser>) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Wraps the authenticated app shell. Takes the server-fetched user as a
 * prop (see (main)/layout.tsx, a Server Component that already called
 * requireUser() to protect the route) so there's no client-side loading
 * flash for "who am I" on first paint.
 */
export function SessionProvider({ initialUser, children }: { initialUser: PublicUser; children: ReactNode }) {
  const [user, setUser] = useState(initialUser);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const result = await api.get<{ user: PublicUser | null }>('/api/auth/session');
    if (result.user) {
      setUser(result.user);
    } else {
      router.push('/login');
    }
  }, [router]);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    router.push('/login');
    router.refresh();
  }, [router]);

  const updateUser = useCallback((patch: Partial<PublicUser>) => {
    setUser((prev) => ({ ...prev, ...patch }));
  }, []);

  return <SessionContext.Provider value={{ user, refresh, logout, updateUser }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
