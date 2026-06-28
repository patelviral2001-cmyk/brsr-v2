/**
 * Rust-style Result<T, E>. Hand-rolled (no neverthrow) to honor the zero
 * runtime-deps rule for this package.
 *
 * Naming note: helpers are prefixed (`mapResult`, `flatMapResult`) rather than
 * exposed as methods because Result here is a plain readonly object — keeping
 * it as data (not a class) means it survives `JSON.stringify`, structuredClone,
 * and crossing worker boundaries without losing fidelity.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = Error> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}

export function mapResult<T, U, E>(
  r: Result<T, E>,
  f: (t: T) => U,
): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

export function flatMapResult<T, U, E>(
  r: Result<T, E>,
  f: (t: T) => Result<U, E>,
): Result<U, E> {
  return r.ok ? f(r.value) : r;
}

export function mapErr<T, E, F>(
  r: Result<T, E>,
  f: (e: E) => F,
): Result<T, F> {
  return r.ok ? r : err(f(r.error));
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  // Preserve the original error if it is throwable; otherwise wrap.
  if (r.error instanceof Error) throw r.error;
  throw new Error(`unwrap called on Err: ${String(r.error)}`);
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function tryCatchAsync<T>(
  fn: () => Promise<T>,
): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export function combineResults<T, E>(rs: Result<T, E>[]): Result<T[], E> {
  const out: T[] = [];
  for (const r of rs) {
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}

/**
 * Tuple-preserving combinator. Given a tuple of Results, returns either an Ok
 * carrying the tuple of unwrapped values, or the first Err encountered.
 */
export function all<T extends readonly Result<unknown, unknown>[]>(
  rs: T,
): Result<
  { [K in keyof T]: T[K] extends Result<infer U, unknown> ? U : never },
  unknown
> {
  const out: unknown[] = [];
  for (const r of rs) {
    if (!r.ok) {
      return r as Result<
        { [K in keyof T]: T[K] extends Result<infer U, unknown> ? U : never },
        unknown
      >;
    }
    out.push(r.value);
  }
  return ok(out) as Result<
    { [K in keyof T]: T[K] extends Result<infer U, unknown> ? U : never },
    unknown
  >;
}
