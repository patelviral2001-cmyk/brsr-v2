export const FactorSource = {
  DEFRA_2024: 'DEFRA_2024',
  CEA_V18: 'CEA_V18',
  IPCC_AR6: 'IPCC_AR6',
  EXIOBASE: 'EXIOBASE',
  WIO: 'WIO',
  SECTOR_SPECIFIC: 'SECTOR_SPECIFIC',
  CUSTOM_TENANT: 'CUSTOM_TENANT',
} as const;
export type FactorSource = (typeof FactorSource)[keyof typeof FactorSource];
export const factorSourceValues = (): readonly FactorSource[] =>
  Object.values(FactorSource) as readonly FactorSource[];

export const Gas = {
  CO2: 'CO2',
  CH4: 'CH4',
  N2O: 'N2O',
  HFC: 'HFC',
  PFC: 'PFC',
  SF6: 'SF6',
  NF3: 'NF3',
  MIXED: 'MIXED',
} as const;
export type Gas = (typeof Gas)[keyof typeof Gas];
export const gasValues = (): readonly Gas[] =>
  Object.values(Gas) as readonly Gas[];
