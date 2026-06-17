import { describe, expect, it } from 'vitest';
import {
  all,
  combineResults,
  err,
  flatMapResult,
  isErr,
  isOk,
  mapErr,
  mapResult,
  ok,
  tryCatch,
  tryCatchAsync,
  unwrap,
  unwrapOr,
} from './result';

describe('Result basics', () => {
  it('ok / isOk', () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(r.ok && r.value).toBe(42);
  });

  it('err / isErr', () => {
    const r = err(new Error('boom'));
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
  });
});

describe('Result transforms', () => {
  it('mapResult only fires on Ok', () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual(ok(4));
    const e = err(new Error('x'));
    expect(mapResult(e, (n: number) => n * 2)).toBe(e);
  });

  it('flatMapResult chains', () => {
    const parse = (s: string) =>
      s === 'bad' ? err(new Error('parse')) : ok(Number(s));
    const double = (n: number) => ok(n * 2);
    expect(flatMapResult(parse('3'), double)).toEqual(ok(6));
    expect(isErr(flatMapResult(parse('bad'), double))).toBe(true);
  });

  it('mapErr transforms only Err', () => {
    expect(mapErr(ok(1), (e: Error) => e.message)).toEqual(ok(1));
    const m = mapErr(err(new Error('boom')), (e) => e.message);
    expect(isErr(m) && m.error).toBe('boom');
  });
});

describe('Result unwrap & helpers', () => {
  it('unwrap returns value or throws', () => {
    expect(unwrap(ok(5))).toBe(5);
    expect(() => unwrap(err(new Error('boom')))).toThrow('boom');
  });

  it('unwrapOr returns fallback on Err', () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
    expect(unwrapOr(err(new Error()), 0)).toBe(0);
  });

  it('tryCatch captures thrown errors', () => {
    const r = tryCatch(() => {
      throw new Error('boom');
    });
    expect(isErr(r) && r.error.message).toBe('boom');
  });

  it('tryCatchAsync captures rejections', async () => {
    const r = await tryCatchAsync(async () => {
      throw new Error('async boom');
    });
    expect(isErr(r) && r.error.message).toBe('async boom');
  });

  it('combineResults short-circuits on first Err', () => {
    expect(combineResults([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]));
    expect(isErr(combineResults([ok(1), err(new Error('x')), ok(3)]))).toBe(
      true,
    );
  });

  it('all preserves tuple types', () => {
    const r = all([ok(1), ok('two'), ok(true)] as const);
    if (r.ok) {
      // Tuple shape preserved at type level.
      const [a, b, c] = r.value;
      expect([a, b, c]).toEqual([1, 'two', true]);
    } else {
      throw new Error('expected Ok');
    }
  });
});
