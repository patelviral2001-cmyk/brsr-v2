/**
 * Helpers for Postgres ltree paths.
 *
 * ltree labels must match [A-Za-z0-9_]+. We aggressively lower-case + sanitize
 * because entity-tree paths are derived from human-entered names (sites,
 * cost centers) that frequently contain spaces, dashes, and unicode.
 */

import { InvalidLtreePathError } from './errors';

export const LTREE_SEGMENT_REGEX = /^[A-Za-z0-9_]+$/;

export function sanitizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function joinPath(...segments: string[]): string {
  return segments
    .map(sanitizeLabel)
    .filter((s) => s.length > 0)
    .join('.');
}

export function parentPath(path: string): string | null {
  const idx = path.lastIndexOf('.');
  if (idx < 0) return null;
  return path.slice(0, idx);
}

export function isAncestor(ancestor: string, descendant: string): boolean {
  if (ancestor === descendant) return true;
  return descendant.startsWith(`${ancestor}.`);
}

export function depth(path: string): number {
  if (path.length === 0) return 0;
  return path.split('.').length;
}

export function appendChild(path: string, label: string): string {
  const safe = sanitizeLabel(label);
  if (safe.length === 0) {
    throw new InvalidLtreePathError('Label sanitizes to empty string', {
      label,
    });
  }
  if (path.length === 0) return safe;
  return `${path}.${safe}`;
}

export function pathSegments(path: string): string[] {
  if (path.length === 0) return [];
  return path.split('.');
}

export function validatePath(path: string): void {
  if (path.length === 0) {
    throw new InvalidLtreePathError('Path is empty');
  }
  for (const seg of path.split('.')) {
    if (!LTREE_SEGMENT_REGEX.test(seg)) {
      throw new InvalidLtreePathError(`Invalid ltree segment: "${seg}"`, {
        path,
        segment: seg,
      });
    }
  }
}
