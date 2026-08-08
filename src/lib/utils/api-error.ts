/**
 * Thrown by validation/auth/db-layer code to signal an error that should be
 * turned directly into an HTTP response by a route handler's catch block.
 * Keeping this as a plain typed Error (rather than throwing raw strings or
 * NextResponses) lets lower-level modules (guards, validators, db queries)
 * stay framework-agnostic while still producing precise HTTP semantics.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly fields?: Record<string, string[]>;
  readonly code?: string;

  constructor(
    message: string,
    status = 400,
    options?: { fields?: Record<string, string[]>; code?: string },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = options?.fields;
    this.code = options?.code;
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(message, 401, { code: 'UNAUTHORIZED' });
  }

  static forbidden(message = 'You do not have permission to do this'): ApiError {
    return new ApiError(message, 403, { code: 'FORBIDDEN' });
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError(message, 404, { code: 'NOT_FOUND' });
  }

  static conflict(message: string): ApiError {
    return new ApiError(message, 409, { code: 'CONFLICT' });
  }

  static tooManyRequests(message: string, retryAfterSeconds?: number): ApiError {
    return new ApiError(message, 429, {
      code: 'RATE_LIMITED',
      fields: retryAfterSeconds !== undefined
        ? { retryAfterSeconds: [String(retryAfterSeconds)] }
        : undefined,
    });
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
