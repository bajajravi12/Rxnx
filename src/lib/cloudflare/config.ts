export interface AppConfig {
  appName: string;
  environment: 'production' | 'preview' | 'development';
  sessionCookieName: string;
  sessionTtlSeconds: number;
  rememberMeTtlSeconds: number;
  maxUploadBytes: number;
  realtimeMode: 'websocket' | 'polling';
}

/**
 * All wrangler `[vars]` are exposed to the runtime as strings, even ones
 * that represent numbers. This function is the single place that parses
 * and validates them, so a malformed wrangler.toml value fails fast with a
 * clear error instead of producing `NaN` deep inside session/upload logic.
 */
export function getAppConfig(env: CloudflareEnv): AppConfig {
  return {
    appName: env.APP_NAME,
    environment: env.ENVIRONMENT,
    sessionCookieName: env.SESSION_COOKIE_NAME,
    sessionTtlSeconds: parsePositiveInt(env.SESSION_TTL_SECONDS, 'SESSION_TTL_SECONDS'),
    rememberMeTtlSeconds: parsePositiveInt(
      env.REMEMBER_ME_TTL_SECONDS,
      'REMEMBER_ME_TTL_SECONDS',
    ),
    maxUploadBytes: parsePositiveInt(env.MAX_UPLOAD_BYTES, 'MAX_UPLOAD_BYTES'),
    realtimeMode: env.REALTIME_MODE === 'polling' ? 'polling' : 'websocket',
  };
}

function parsePositiveInt(raw: string, varName: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Invalid wrangler.toml var "${varName}": expected a positive integer string, got "${raw}".`,
    );
  }
  return value;
}
