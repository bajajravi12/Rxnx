import { getRequestContext } from '@cloudflare/next-on-pages';

/**
 * Returns the typed Cloudflare execution context (env bindings, `cf`
 * request properties, and the `ctx` object for `waitUntil`) for the
 * current request.
 *
 * Must only be called from inside a Route Handler or Server Component
 * that has opted into the edge runtime via `export const runtime = "edge"`.
 * Calling it anywhere else (e.g. during static generation, or from a
 * component that hasn't declared the edge runtime) throws — the error
 * message is deliberately explicit so a misconfigured route fails loudly
 * at request time instead of silently returning undefined bindings.
 */
export function getCloudflareContext() {
  try {
    return getRequestContext<CloudflareEnv>();
  } catch (error) {
    throw new Error(
      'Cloudflare bindings are unavailable. This usually means the current ' +
        'route is missing `export const runtime = "edge"`, or the app is ' +
        'running under plain `next dev`/`next start` instead of ' +
        '`next dev` with setupDevPlatform (see next.config.mjs) or a ' +
        'Pages-deployed build. Original error: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

/** Convenience accessor for just the typed env bindings. */
export function getEnv(): CloudflareEnv {
  return getCloudflareContext().env;
}

/**
 * Schedules work to continue after the response has been sent, without
 * delaying the response itself (e.g. writing an analytics/audit row,
 * pruning expired sessions). Mirrors the standard Workers `ctx.waitUntil`.
 */
export function waitUntil(promise: Promise<unknown>): void {
  getCloudflareContext().ctx.waitUntil(promise);
}
