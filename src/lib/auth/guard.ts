import { cookies } from 'next/headers';
import { getEnv } from '@/lib/cloudflare';
import { ApiError } from '@/lib/utils/api-error';
import { validateSessionToken, type ValidatedSession } from './session';

/**
 * Returns the validated session for the current request, or null if there
 * is no session cookie or it doesn't validate. Safe to call from anywhere
 * that already has Cloudflare bindings available (i.e. an edge route or a
 * Server Component rendered under the edge runtime).
 */
export async function getCurrentSession(): Promise<ValidatedSession | null> {
  const env = getEnv();
  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSessionToken(env, token);
}

/** Sugar over getCurrentSession() for callers that only need the user. */
export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

/** Throws ApiError.unauthorized() if there is no valid session — for use at the top of protected route handlers. */
export async function requireSession(): Promise<ValidatedSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw ApiError.unauthorized();
  }
  return session;
}

/** Sugar over requireSession() for callers that only need the user. */
export async function requireUser() {
  const session = await requireSession();
  return session.user;
}
