// Namespaced re-exports for domain modules — keeps tree-shaking predictable
// and avoids name collisions (e.g. `units.convert` vs a future `gwp.convert`).
export * as units from './units';
export * as gwp from './gwp';
export * as dates from './dates';
export * as confidence from './confidence';
export * as ltree from './ltree';

// Errors and Result are flat — they are part of the cross-cutting vocabulary
// every consumer touches, so the extra namespace would just be noise.
export * from './errors';
export * from './result';
