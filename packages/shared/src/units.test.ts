import { describe, expect, it } from 'vitest';
import {
  canConvert,
  convert,
  family,
  registerUnit,
  unitsInFamily,
} from './units';
import { UnitConversionError } from './errors';

describe('units.convert', () => {
  it('round-trips kWh -> GJ -> kWh', () => {
    const gj = convert(1000, 'kWh', 'GJ');
    expect(gj).toBeCloseTo(3.6, 9);
    expect(convert(gj, 'GJ', 'kWh')).toBeCloseTo(1000, 6);
  });

  it('normalizes aliases (tonne, metric tons -> t)', () => {
    expect(convert(1, 'tonne', 'kg')).toBeCloseTo(1000, 9);
    expect(convert(2, 'metric tons', 'kg')).toBeCloseTo(2000, 9);
  });

  it('rejects cross-family conversion', () => {
    expect(() => convert(1, 'kg', 'L')).toThrow(UnitConversionError);
  });

  it('rejects unknown units', () => {
    expect(() => convert(1, 'foo', 'kg')).toThrow(UnitConversionError);
  });

  it('refuses currency conversion by design', () => {
    expect(() => convert(1, 'USD', 'USD')).toThrow(/FX service/);
  });

  it('canConvert returns false instead of throwing', () => {
    expect(canConvert('foo', 'kg')).toBe(false);
    expect(canConvert('kg', 'L')).toBe(false);
    expect(canConvert('kg', 't')).toBe(true);
  });

  it('registerUnit extends the registry', () => {
    registerUnit('stone', 'MASS', (v) => v * 6.35029318, (v) => v / 6.35029318);
    expect(convert(1, 'stone', 'kg')).toBeCloseTo(6.35029318, 9);
    expect(family('stone')).toBe('MASS');
    expect(unitsInFamily('MASS')).toContain('stone');
  });
});
