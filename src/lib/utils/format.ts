const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fullDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const startOfA = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const startOfB = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((startOfB.getTime() - startOfA.getTime()) / msPerDay);
}

/** For message bubbles: always just the time, e.g. "2:34 PM". */
export function formatMessageTime(timestampMs: number): string {
  return timeFormatter.format(new Date(timestampMs));
}

/**
 * For the chat-list row: time for today, weekday name for the last week,
 * short date otherwise — the standard chat-app convention.
 */
export function formatChatListTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs);
  const now = new Date();
  const diffDays = daysBetween(date, now);

  if (isSameDay(date, now)) return timeFormatter.format(date);
  if (diffDays >= 1 && diffDays < 7) return weekdayFormatter.format(date);
  return dateFormatter.format(date);
}

/** For a full-context label like a date separator between messages. */
export function formatDateSeparator(timestampMs: number): string {
  const date = new Date(timestampMs);
  const now = new Date();
  const diffDays = daysBetween(date, now);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return weekdayFormatter.format(date);
  return fullDateFormatter.format(date);
}

/** For "last seen" text, e.g. "last seen 5 minutes ago". */
export function formatLastSeen(timestampMs: number | null): string {
  if (timestampMs === null) return 'offline';
  const diffMs = Date.now() - timestampMs;
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'last seen just now';
  if (diffMinutes < 60) return `last seen ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `last seen ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'last seen yesterday';
  if (diffDays < 7) return `last seen ${diffDays}d ago`;
  return `last seen ${fullDateFormatter.format(new Date(timestampMs))}`;
}

/** Truncates long filenames in the middle, keeping the extension visible. */
export function truncateFileName(fileName: string, maxLength = 24): string {
  if (fileName.length <= maxLength) return fileName;
  const dotIndex = fileName.lastIndexOf('.');
  const ext = dotIndex > 0 ? fileName.slice(dotIndex) : '';
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const keep = Math.max(4, maxLength - ext.length - 1);
  return `${base.slice(0, keep)}…${ext}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}
