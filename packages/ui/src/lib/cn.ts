import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional + dedupe-aware Tailwind class joiner.
 * Combines `clsx` (conditional class composition) with `tailwind-merge`
 * (resolves conflicts like `p-2 p-4` to the last winner).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
