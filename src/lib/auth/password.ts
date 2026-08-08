const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const DERIVED_KEY_BITS = 256;

export interface PasswordHashResult {
  hash: string;
  salt: string;
  iterations: number;
}

/**
 * Hashes a plaintext password using PBKDF2-HMAC-SHA256 via the Web Crypto
 * API (`SubtleCrypto`), which is available in the Cloudflare Workers
 * runtime — unlike Node's `crypto` module (bcrypt/argon2 native bindings
 * are not available at all on Workers).
 */
export async function hashPassword(password: string): Promise<PasswordHashResult> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derivedBits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return {
    hash: bufferToHex(derivedBits),
    salt: bufferToHex(salt.buffer),
    iterations: PBKDF2_ITERATIONS,
  };
}

/**
 * Verifies a plaintext password against a stored hash/salt/iterations
 * triple. Uses a constant-time comparison on the resulting hex digests to
 * avoid leaking information about how many leading bytes matched via
 * response-timing side channels.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
  iterations: number,
): Promise<boolean> {
  const salt = hexToBuffer(storedSalt);
  const derivedBits = await deriveBits(password, new Uint8Array(salt), iterations);
  return timingSafeEqualHex(bufferToHex(derivedBits), storedHash);
}

/**
 * A fixed, valid-shaped (but unusable) hash/salt pair used to perform a
 * "dummy" verification when a login is attempted against a username that
 * doesn't exist. This keeps the login endpoint's response time roughly
 * consistent whether or not the account exists, mitigating username
 * enumeration via timing analysis.
 */
export const DUMMY_PASSWORD_HASH: PasswordHashResult = {
  hash: 'a'.repeat(64),
  salt: 'b'.repeat(32),
  iterations: PBKDF2_ITERATIONS,
};

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    DERIVED_KEY_BITS,
  );
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still walk a full comparison of `a` against itself so this branch
    // doesn't return measurably faster than the equal-length case.
    let dummy = 0;
    for (let i = 0; i < a.length; i++) dummy |= a.charCodeAt(i) ^ a.charCodeAt(i);
    return dummy === 1; // always false, but not via an early return
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
