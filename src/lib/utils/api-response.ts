import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError } from './api-error';

export function apiSuccess<T>(data: T, init?: number | ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, typeof init === 'number' ? { status: init } : init);
}

export function apiErrorBody(
  message: string,
  extra?: { code?: string; fields?: Record<string, string[]> },
) {
  return {
    ok: false as const,
    error: {
      message,
      code: extra?.code,
      fields: extra?.fields,
    },
  };
}

/**
 * Converts any thrown error into a well-formed NextResponse. Route handlers
 * should wrap their body in try/catch and call this in the catch block —
 * it is the single place that decides how internal errors are shaped for
 * clients, so a route handler never accidentally leaks a stack trace or an
 * inconsistent error shape.
 */
export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    const headers: HeadersInit = {};
    if (error.code === 'RATE_LIMITED' && error.fields?.retryAfterSeconds?.[0]) {
      headers['Retry-After'] = error.fields.retryAfterSeconds[0];
    }
    return NextResponse.json(
      apiErrorBody(error.message, { code: error.code, fields: error.fields }),
      { status: error.status, headers },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      apiErrorBody('Validation failed', { code: 'VALIDATION_ERROR', fields: flattenZodError(error) }),
      { status: 422 },
    );
  }

  // Unknown/unexpected error — log server-side, return a generic message so
  // internals are never exposed to the client.
  console.error('[unhandled route error]', error);
  return NextResponse.json(
    apiErrorBody('Something went wrong. Please try again.', { code: 'INTERNAL_ERROR' }),
    { status: 500 },
  );
}

export function flattenZodError(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
