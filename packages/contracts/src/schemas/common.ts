import { z } from 'zod';

export const cuidSchema = z.string().cuid();

export const iso8601Schema = z.string().datetime({ offset: true });

// Wire-safe decimal: stringified to avoid IEEE-754 loss across the JSON boundary.
// Accepts optional leading minus and optional fractional part.
const decimalRegex = /^-?\d+(\.\d+)?$/;
export const decimalSchema = z
  .string()
  .regex(decimalRegex, 'Must be a decimal string like "123" or "-1.5"');

export const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Must be a lowercase hex sha256 (64 chars)');

export const emailSchema = z.string().email();

// Convenience for Postgres ltree paths (e.g. "root.in.mh.mumbai_plant").
export const ltreePathSchema = z
  .string()
  .regex(
    /^[a-z0-9_]+(\.[a-z0-9_]+)*$/,
    'Must be a dot-separated lowercase ltree path',
  );

// JSON-like values, used wherever the wire shape is "any JSON value".
export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);
