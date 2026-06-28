/**
 * Composite confidence scoring for ESG data extractions.
 *
 * Why geometric mean (not arithmetic): assurance is a chain-of-trust process —
 * a single broken link invalidates the whole. Arithmetic mean lets a strong
 * component mask a near-zero one (e.g. a high model logprob hiding a failed
 * schema check). The geometric mean is dominated by the smallest component, so
 * a near-zero subscore drags the composite toward zero. That matches the
 * assurance auditor's mental model: "any one critical failure is a dealbreaker."
 */

const EPSILON = 1e-6;

export interface ConfidenceComponents {
  /** Normalized model logprob, 0..1. */
  modelLogprob: number;
  /** Agreement with peer extractions, 0..1. */
  crossValidation: number;
  /** Inverse of z-score distance from peer distribution, 0..1. */
  peerZscore: number;
  /** Fraction of schema checks passed, 0..1. */
  schemaValidation: number;
  /** Corroborated by another source/document, 0..1. */
  crossSource: number;
}

export interface ConfidenceWeights {
  modelLogprob: number;
  crossValidation: number;
  peerZscore: number;
  schemaValidation: number;
  crossSource: number;
}

export const DEFAULT_WEIGHTS: ConfidenceWeights = {
  modelLogprob: 0.25,
  crossValidation: 0.2,
  peerZscore: 0.15,
  schemaValidation: 0.2,
  crossSource: 0.2,
};

function clamp01(x: number): number {
  if (Number.isNaN(x)) return EPSILON;
  if (x < EPSILON) return EPSILON;
  if (x > 1) return 1;
  return x;
}

export function compositeConfidence(
  c: ConfidenceComponents,
  weights: ConfidenceWeights = DEFAULT_WEIGHTS,
): number {
  // Weighted geometric mean: exp( sum(w_i * ln(x_i)) / sum(w_i) ).
  // Clamp to (epsilon, 1] so a zero component does not collapse to log(0).
  const entries: Array<[number, number]> = [
    [clamp01(c.modelLogprob), weights.modelLogprob],
    [clamp01(c.crossValidation), weights.crossValidation],
    [clamp01(c.peerZscore), weights.peerZscore],
    [clamp01(c.schemaValidation), weights.schemaValidation],
    [clamp01(c.crossSource), weights.crossSource],
  ];
  let weightSum = 0;
  let logSum = 0;
  for (const [value, weight] of entries) {
    if (weight <= 0) continue;
    weightSum += weight;
    logSum += weight * Math.log(value);
  }
  if (weightSum === 0) return 0;
  return Math.exp(logSum / weightSum);
}

export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERIFIED';

export function confidenceBand(score: number): ConfidenceBand {
  if (score < 0.5) return 'LOW';
  if (score < 0.75) return 'MEDIUM';
  if (score < 0.9) return 'HIGH';
  return 'VERIFIED';
}

/**
 * Weighted arithmetic mean. Kept as an alternative for callers that want a
 * forgiving aggregate (e.g. internal dashboards), but assurance reporting
 * should use the geometric mean above.
 */
export function weightedArithmeticConfidence(
  c: ConfidenceComponents,
  weights: ConfidenceWeights = DEFAULT_WEIGHTS,
): number {
  const entries: Array<[number, number]> = [
    [clamp01(c.modelLogprob), weights.modelLogprob],
    [clamp01(c.crossValidation), weights.crossValidation],
    [clamp01(c.peerZscore), weights.peerZscore],
    [clamp01(c.schemaValidation), weights.schemaValidation],
    [clamp01(c.crossSource), weights.crossSource],
  ];
  let weightSum = 0;
  let weighted = 0;
  for (const [value, weight] of entries) {
    if (weight <= 0) continue;
    weightSum += weight;
    weighted += weight * value;
  }
  if (weightSum === 0) return 0;
  return weighted / weightSum;
}

/**
 * Multiplicative combination for chained transformations.
 * Example: extraction confidence × formula-validity confidence.
 */
export function combineConfidences(a: number, b: number): number {
  return clamp01(a) * clamp01(b);
}
