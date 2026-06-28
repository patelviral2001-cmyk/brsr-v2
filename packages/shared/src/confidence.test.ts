import { describe, expect, it } from 'vitest';
import {
  combineConfidences,
  compositeConfidence,
  confidenceBand,
  weightedArithmeticConfidence,
} from './confidence';

describe('compositeConfidence', () => {
  it('all-1.0 components score 1.0', () => {
    const s = compositeConfidence({
      modelLogprob: 1,
      crossValidation: 1,
      peerZscore: 1,
      schemaValidation: 1,
      crossSource: 1,
    });
    expect(s).toBeCloseTo(1, 9);
  });

  it('a near-zero component drags the geometric mean toward zero', () => {
    const s = compositeConfidence({
      modelLogprob: 0.99,
      crossValidation: 0.99,
      peerZscore: 0.99,
      schemaValidation: 0.001,
      crossSource: 0.99,
    });
    // Geometric mean punishes the weakest link.
    expect(s).toBeLessThan(0.5);
  });

  it('handles zero without producing NaN', () => {
    const s = compositeConfidence({
      modelLogprob: 0,
      crossValidation: 0.5,
      peerZscore: 0.5,
      schemaValidation: 0.5,
      crossSource: 0.5,
    });
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
  });
});

describe('confidenceBand', () => {
  it('band thresholds', () => {
    expect(confidenceBand(0.4)).toBe('LOW');
    expect(confidenceBand(0.6)).toBe('MEDIUM');
    expect(confidenceBand(0.8)).toBe('HIGH');
    expect(confidenceBand(0.95)).toBe('VERIFIED');
  });
});

describe('arithmetic & combine', () => {
  it('weightedArithmeticConfidence is more lenient than geometric', () => {
    const components = {
      modelLogprob: 0.99,
      crossValidation: 0.99,
      peerZscore: 0.99,
      schemaValidation: 0.001,
      crossSource: 0.99,
    };
    expect(weightedArithmeticConfidence(components)).toBeGreaterThan(
      compositeConfidence(components),
    );
  });

  it('combineConfidences multiplies chained transformations', () => {
    expect(combineConfidences(0.8, 0.5)).toBeCloseTo(0.4, 9);
  });
});
