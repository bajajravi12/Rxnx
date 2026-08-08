/**
 * Extracts the real client IP on Cloudflare's network. `CF-Connecting-IP`
 * is set by Cloudflare's edge and cannot be spoofed by the client (Cloudflare
 * overwrites it), unlike `X-Forwarded-For` which is kept only as a fallback
 * for local development where that header isn't present.
 */
export function getClientIp(request: Request): string | null {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  );
}

export function getUserAgent(request: Request): string | null {
  return request.headers.get('user-agent');
}
