export type Branded<T, B> = T & { readonly __brand: B };

// CUID v2 identifier used across all primary keys.
export type CuidId = Branded<string, 'CuidId'>;

// ISO 8601 / RFC 3339 timestamp, e.g. "2026-06-15T12:00:00.000Z".
export type Iso8601 = Branded<string, 'Iso8601'>;

// Decimal values are serialized as strings on the wire to avoid IEEE-754 loss
// when round-tripping Prisma's Decimal type.
export type Decimal = Branded<string, 'Decimal'>;

// Lowercase hex sha-256 (64 chars).
export type Sha256 = Branded<string, 'Sha256'>;
