import type { ZodSchema } from 'zod';
import { ApiError } from './api-error';
import { flattenZodError } from './api-response';

/**
 * Parses a request body as JSON and validates it against `schema`. Throws
 * a well-formed ApiError on either malformed JSON or a failed validation,
 * so callers can just `await parseJsonBody(request, schema)` and let the
 * route's catch block (via handleRouteError) turn failures into responses.
 */
export async function parseJsonBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError('Request body must be valid JSON', 400, { code: 'INVALID_JSON' });
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError('Validation failed', 422, {
      code: 'VALIDATION_ERROR',
      fields: flattenZodError(result.error),
    });
  }

  return result.data;
}

/** Same as parseJsonBody but for URL search params (GET requests with query filters). */
export function parseSearchParams<T>(searchParams: URLSearchParams, schema: ZodSchema<T>): T {
  const asObject = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(asObject);
  if (!result.success) {
    throw new ApiError('Invalid query parameters', 422, {
      code: 'VALIDATION_ERROR',
      fields: flattenZodError(result.error),
    });
  }
  return result.data;
}
