import { NextResponse, type NextRequest } from 'next/server';
import { getCloudflareContext } from '@/lib/cloudflare/context';

const DEFAULT_SESSION_COOKIE_NAME = 'nova_session';
const AUTH_ROUTES = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const cookieName = getSessionCookieName();
  const hasSessionCookie = request.cookies.has(cookieName);
  const { pathname } = request.nextUrl;
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (!hasSessionCookie && !isAuthRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSessionCookie && isAuthRoute) {
    return NextResponse.redirect(new URL('/chats', request.url));
  }

  return NextResponse.next();
}

function getSessionCookieName(): string {
  try {
    return getCloudflareContext().env.SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME;
  } catch {
    // Cloudflare bindings aren't available in every environment middleware
    // might run under (e.g. certain local dev configurations) — fall back
    // to the well-known default rather than failing every request. This
    // only affects which cookie name is checked for *presence*; actual
    // session validity is always re-checked server-side.
    return DEFAULT_SESSION_COOKIE_NAME;
  }
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api routes (they enforce their own auth via requireSession())
     * - _next/static, _next/image (Next.js internals)
     * - static assets (icons, fonts, favicon, etc.)
     */
    '/((?!api|_next/static|_next/image|icons|fonts|favicon.ico).*)',
  ],
};
