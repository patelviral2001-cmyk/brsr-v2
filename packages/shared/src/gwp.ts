/**
 * Global Warming Potentials (GWP).
 *
 * Sources:
 *  - AR5: IPCC AR5 WG1 Chapter 8, Table 8.7 (GWP-100)
 *  - AR6: IPCC AR6 WG1 Chapter 7, Table 7.SM.7 (GWP-100 and GWP-20)
 *
 * Why fossil vs biogenic CH4 are distinct: AR6 separates them because the
 * carbon-cycle response differs. BRSR / GHG Protocol reporting requires the
 * distinction for Scope 1 stationary combustion vs. wastewater.
 */

import { GwpError } from './errors';

export type GwpBasis = 'AR5' | 'AR6_100Y' | 'AR6_20Y';

export type GhgSpecies =
  | 'CO2'
  | 'CH4_FOSSIL'
  | 'CH4_BIOGENIC'
  | 'N2O'
  | 'SF6'
  | 'NF3'
  | 'HFC_134a'
  | 'HFC_152a'
  | 'HFC_32'
  | 'HFC_125'
  | 'HFC_143a'
  | 'HFC_23'
  | 'PFC_CF4'
  | 'PFC_C2F6';

export const GWP: Record<GwpBasis, Record<GhgSpecies, number>> = {
  AR5: {
    CO2: 1,
    CH4_FOSSIL: 30,
    CH4_BIOGENIC: 28,
    N2O: 265,
    SF6: 23500,
    NF3: 16100,
    HFC_134a: 1300,
    HFC_152a: 138,
    HFC_32: 677,
    HFC_125: 3170,
    HFC_143a: 4800,
    HFC_23: 12400,
    PFC_CF4: 6630,
    PFC_C2F6: 11100,
  },
  AR6_100Y: {
    CO2: 1,
    CH4_FOSSIL: 29.8,
    CH4_BIOGENIC: 27.0,
    N2O: 273,
    SF6: 25200,
    NF3: 17400,
    HFC_134a: 1530,
    HFC_152a: 164,
    HFC_32: 771,
    HFC_125: 3740,
    HFC_143a: 5810,
    HFC_23: 14600,
    PFC_CF4: 7380,
    PFC_C2F6: 12400,
  },
  AR6_20Y: {
    CO2: 1,
    CH4_FOSSIL: 82.5,
    CH4_BIOGENIC: 79.7,
    N2O: 273,
    SF6: 18300,
    NF3: 13400,
    HFC_134a: 4140,
    HFC_152a: 591,
    HFC_32: 2690,
    HFC_125: 6740,
    HFC_143a: 7840,
    HFC_23: 12700,
    PFC_CF4: 5300,
    PFC_C2F6: 8940,
  },
};

export function gwp(species: GhgSpecies, basis: GwpBasis): number {
  const table = GWP[basis];
  if (!table) {
    throw new GwpError(`Unknown GWP basis: ${basis}`, { basis });
  }
  const v = table[species];
  if (v === undefined) {
    throw new GwpError(`Unknown species ${species} for basis ${basis}`, {
      species,
      basis,
    });
  }
  return v;
}

export function co2eFromMass(
  massKg: number,
  species: GhgSpecies,
  basis: GwpBasis,
): number {
  return massKg * gwp(species, basis);
}

export function co2eFromKgArray(
  items: Array<{ species: GhgSpecies; massKg: number; basis?: GwpBasis }>,
  defaultBasis: GwpBasis,
): number {
  let total = 0;
  for (const item of items) {
    total += co2eFromMass(item.massKg, item.species, item.basis ?? defaultBasis);
  }
  return total;
}
