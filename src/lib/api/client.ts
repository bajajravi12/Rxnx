export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fields?: Record<string, string[]>;

  constructor(message: string, status: number, code?: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface ApiSuccessBody<T> {
  ok: true;
  data: T;
}

interface ApiErrorBody {
  ok: false;
  error: { message: string; code?: string; fields?: Record<string, string[]> };
}

type ApiBody<T> = ApiSuccessBody<T> | ApiErrorBody;

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/**
 * Fetches a same-origin API route and unwraps the {ok, data}/{ok, error}
 * envelope every route handler returns (see src/lib/utils/api-response.ts
 * on the server side). Throws ApiClientError on any non-2xx response or a
 * malformed body, so callers can just `await apiFetch<T>(...)` and catch.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let parsed: ApiBody<T> | null = null;
  try {
    parsed = await response.json();
  } catch {
    // Non-JSON response (e.g. a network-level 502 HTML page) — fall through
    // to the generic error below.
  }

  if (!response.ok || !parsed || parsed.ok === false) {
    const errorBody = parsed && parsed.ok === false ? parsed.error : undefined;
    throw new ApiClientError(
      errorBody?.message ?? `Request failed with status ${response.status}`,
      response.status,
      errorBody?.code,
      errorBody?.fields,
    );
  }

  return parsed.data;
}

/**
 * Like apiFetch, but for a raw binary body (e.g. uploading a file
 * directly) rather than a JSON payload — apiFetch always JSON.stringifies
 * `body`, which would corrupt binary data. Still parses the same
 * {ok, data}/{ok, error} envelope every route returns.
 */
export async function apiFetchRaw<T>(
  path: string,
  options: { method: string; body: BodyInit; headers?: Record<string, string> },
): Promise<T> {
  const response = await fetch(path, {
    method: options.method,
    headers: options.headers,
    body: options.body,
  });

  let parsed: ApiBody<T> | null = null;
  try {
    parsed = await response.json();
  } catch {
    // fall through to the generic error below
  }

  if (!response.ok || !parsed || parsed.ok === false) {
    const errorBody = parsed && parsed.ok === false ? parsed.error : undefined;
    throw new ApiClientError(
      errorBody?.message ?? `Request failed with status ${response.status}`,
      response.status,
      errorBody?.code,
      errorBody?.fields,
    );
  }

  return parsed.data;
}

export const api = {
  get: <T>(path: string, options?: ApiFetchOptions) => apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: ApiFetchOptions) => apiFetch<T>(path, { ...options, method: 'DELETE' }),
};
