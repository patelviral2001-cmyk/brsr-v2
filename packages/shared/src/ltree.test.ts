import { describe, expect, it } from 'vitest';
import {
  appendChild,
  depth,
  isAncestor,
  joinPath,
  parentPath,
  pathSegments,
  sanitizeLabel,
  validatePath,
} from './ltree';
import { InvalidLtreePathError } from './errors';

describe('ltree.sanitizeLabel', () => {
  it('lowercases, replaces, collapses, trims', () => {
    expect(sanitizeLabel('Hello World!')).toBe('hello_world');
    expect(sanitizeLabel('  Plant--A  ')).toBe('plant_a');
    expect(sanitizeLabel('___foo___')).toBe('foo');
  });
});

describe('ltree path ops', () => {
  it('joinPath sanitizes each segment', () => {
    expect(joinPath('Acme Corp', 'North Region', 'Plant 1')).toBe(
      'acme_corp.north_region.plant_1',
    );
  });

  it('parentPath returns null at root', () => {
    expect(parentPath('acme')).toBeNull();
    expect(parentPath('acme.region')).toBe('acme');
  });

  it('isAncestor handles equal and prefix cases', () => {
    expect(isAncestor('acme', 'acme.region.plant')).toBe(true);
    expect(isAncestor('acme', 'acme')).toBe(true);
    expect(isAncestor('acme', 'acmecorp')).toBe(false);
  });

  it('depth + segments', () => {
    expect(depth('a.b.c')).toBe(3);
    expect(pathSegments('a.b.c')).toEqual(['a', 'b', 'c']);
  });

  it('appendChild sanitizes', () => {
    expect(appendChild('acme.region', 'Plant #1')).toBe(
      'acme.region.plant_1',
    );
  });

  it('validatePath throws on bad segment', () => {
    expect(() => validatePath('acme.bad-segment')).toThrow(
      InvalidLtreePathError,
    );
    expect(() => validatePath('acme.good_segment')).not.toThrow();
  });
});
