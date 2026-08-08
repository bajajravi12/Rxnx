interface CounterState {
  count: number;
  windowStart: number;
}

/**
 * A simple fixed-window counter backed by KV. This is best-effort: KV has
 * no atomic increment, so two requests racing within the same millisecond
 * could both read the same count before either writes it back, undercounting
 * by a small margin under heavy concurrency. That's an acceptable tradeoff
 * here — this limiter is a defense-in-depth throttle for spam/abuse
 * prevention on non-auth endpoints (registration, message bursts, upload
 * bursts), not the primary defense for anything security-critical. Login
 * brute-force protection uses the stricter D1-authoritative check in
 * `login-rate-limit.ts` instead.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds?: number }> {
  const nowMs = Date.now();
  const windowMs = windowSeconds * 1000;
  const raw = await kv.get(key);
  const state: CounterState = raw ? JSON.parse(raw) : { count: 0, windowStart: nowMs };

  const windowExpired = nowMs - state.windowStart > windowMs;
  const currentCount = windowExpired ? 0 : state.count;

  if (currentCount >= limit) {
    const retryAfterSeconds = Math.ceil((state.windowStart + windowMs - nowMs) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  const nextState: CounterState = windowExpired
    ? { count: 1, windowStart: nowMs }
    : { count: state.count + 1, windowStart: state.windowStart };

  await kv.put(key, JSON.stringify(nextState), { expirationTtl: windowSeconds });

  return { allowed: true, remaining: Math.max(0, limit - nextState.count) };
}
