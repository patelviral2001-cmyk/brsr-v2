import { Decimal } from 'decimal.js';
import { CelEvaluator } from './cel-evaluator';

describe('CelEvaluator', () => {
  it('evaluates arithmetic with units', () => {
    const r = CelEvaluator.evaluate('kwh * ef_grid', {
      metrics: { kwh: { value: new Decimal(100), unit: 'kWh' } },
      factors: { ef_grid: { value: new Decimal(0.71), unit: 'kgCO2e/kWh' } },
    });
    expect((r.value as Decimal).toNumber()).toBeCloseTo(71);
  });

  it('throws on unit mismatch in subtraction', () => {
    expect(() =>
      CelEvaluator.evaluate('a - b', {
        metrics: { a: { value: new Decimal(1), unit: 'kg' }, b: { value: new Decimal(1), unit: 'm' } },
      }),
    ).toThrow();
  });

  it('supports conditional ternary', () => {
    const r = CelEvaluator.evaluate('x > 0 ? x : 0', {
      metrics: { x: { value: new Decimal(-3) } },
    });
    expect((r.value as Decimal).toNumber()).toBe(0);
  });

  it('rejects identifier injection', () => {
    expect(() =>
      CelEvaluator.evaluate('process.exit(1)', { metrics: {} }),
    ).toThrow();
  });

  it('sum() requires uniform units', () => {
    expect(() =>
      CelEvaluator.evaluate('sum(a, b)', {
        metrics: { a: { value: new Decimal(1), unit: 'kg' }, b: { value: new Decimal(1), unit: 'lb' } },
      }),
    ).toThrow();
  });
});
