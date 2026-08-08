import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines conditional class names via `clsx` and then resolves conflicting
 * Tailwind utility classes via `tailwind-merge` (e.g. `cn('p-2', 'p-4')`
 * correctly resolves to `'p-4'` instead of emitting both).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
