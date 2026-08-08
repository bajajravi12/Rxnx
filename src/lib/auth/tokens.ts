const SESSION_TOKEN_BYTES = 32;

/** Generates a cryptographically random, URL-safe session token (the raw value stored in the cookie). */
export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES));
  return base64UrlEncode(bytes);
}

/**
 * SHA-256 hashes a session token for storage. The raw token lives only in
 * the user's cookie and in-flight requests — the database and KV cache
 * only ever see this hash, so a leaked D1 export or KV read cannot be
 * replayed as a valid session.
 */
export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

/**
 * Builds the cookie attribute set for a session. `secure` is disabled only
 * in local development (plain http://localhost) since browsers reject
 * Secure cookies over non-HTTPS origins.
 */
export function getSessionCookieOptions(
  environment: CloudflareEnv['ENVIRONMENT'],
  ttlSeconds: number,
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: environment !== 'development',
    sameSite: 'lax',
    path: '/',
    maxAge: ttlSeconds,
  };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
