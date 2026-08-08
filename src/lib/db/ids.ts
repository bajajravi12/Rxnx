import { nanoid } from 'nanoid';

/**
 * Generates a URL-safe unique id, optionally prefixed with a short table
 * tag (e.g. "usr", "msg", "chat") to make ids self-describing in logs and
 * debugging tools. 21 characters of nanoid's default alphabet gives a
 * collision probability low enough for this application's scale (see
 * https://zelark.github.io/nano-id-cc/).
 */
export function generateId(prefix?: string): string {
  const id = nanoid(21);
  return prefix ? `${prefix}_${id}` : id;
}

/** Current unix time in milliseconds — the timestamp unit used throughout the D1 schema. */
export function now(): number {
  return Date.now();
}
