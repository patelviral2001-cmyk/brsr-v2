import { describe, expect, it } from 'vitest';
import { co2eFromKgArray, co2eFromMass, gwp } from './gwp';
import { GwpError } from './errors';

describe('gwp', () => {
  it('returns AR6 100y CH4 fossil = 29.8', () => {
    expect(gwp('CH4_FOSSIL', 'AR6_100Y')).toBe(29.8);
  });

  it('distinguishes biogenic from fossil CH4', () => {
    expect(gwp('CH4_BIOGENIC', 'AR6_100Y')).toBe(27.0);
    expect(gwp('CH4_FOSSIL', 'AR6_100Y')).toBe(29.8);
  });

  it('AR6 20y N2O matches AR6 100y N2O (both 273)', () => {
    expect(gwp('N2O', 'AR6_20Y')).toBe(273);
    expect(gwp('N2O', 'AR6_100Y')).toBe(273);
  });

  it('throws on unknown species', () => {
    // @ts-expect-error — runtime guard test
    expect(() => gwp('UNOBTAINIUM', 'AR5')).toThrow(GwpError);
  });

  it('co2eFromMass: 10 kg CH4 fossil AR6 = 298 kg CO2e', () => {
    expect(co2eFromMass(10, 'CH4_FOSSIL', 'AR6_100Y')).toBeCloseTo(298, 6);
  });

  it('co2eFromKgArray sums across species', () => {
    const total = co2eFromKgArray(
      [
        { species: 'CO2', massKg: 100 },
        { species: 'CH4_FOSSIL', massKg: 1 },
      ],
      'AR6_100Y',
    );
    expect(total).toBeCloseTo(100 + 29.8, 6);
  });
});
