/**
 * IPCC Global Warming Potential (GWP) tables.
 *
 * The choice of GWP table is a policy decision: most jurisdictions (and SBTi)
 * have migrated to AR6 100-year values; legacy filings may still use AR5 or AR4.
 * Always store the `gwp_basis` used so historical numbers stay reproducible.
 *
 * AR6_20Y is included because it is the relevant horizon for methane
 * (a short-lived climate pollutant) when running near-term physical-impact analyses.
 */

export type Gas =
  | "CO2"
  | "CH4"
  | "CH4_FOSSIL"
  | "CH4_NON_FOSSIL"
  | "N2O"
  | "HFC-23"
  | "HFC-32"
  | "HFC-125"
  | "HFC-134a"
  | "HFC-143a"
  | "HFC-152a"
  | "HFC-227ea"
  | "HFC-236fa"
  | "HFC-245fa"
  | "R-404A"
  | "R-407A"
  | "R-407C"
  | "R-410A"
  | "R-507A"
  | "SF6"
  | "NF3"
  | "PFC-14"
  | "PFC-116"
  | "PFC-218"
  | "PFC-318";

export const GWP_AR5: Record<Gas, number> = {
  CO2: 1,
  CH4: 28,
  CH4_FOSSIL: 30,
  CH4_NON_FOSSIL: 28,
  N2O: 265,
  "HFC-23": 12400,
  "HFC-32": 677,
  "HFC-125": 3170,
  "HFC-134a": 1300,
  "HFC-143a": 4800,
  "HFC-152a": 138,
  "HFC-227ea": 3350,
  "HFC-236fa": 8060,
  "HFC-245fa": 858,
  "R-404A": 3922,
  "R-407A": 2107,
  "R-407C": 1774,
  "R-410A": 2088,
  "R-507A": 3985,
  SF6: 23500,
  NF3: 16100,
  "PFC-14": 6630,
  "PFC-116": 11100,
  "PFC-218": 8900,
  "PFC-318": 9540,
};

export const GWP_AR6_100Y: Record<Gas, number> = {
  CO2: 1,
  CH4: 27.9, // generic — used when source unknown
  CH4_FOSSIL: 29.8,
  CH4_NON_FOSSIL: 27,
  N2O: 273,
  "HFC-23": 14600,
  "HFC-32": 771,
  "HFC-125": 3740,
  "HFC-134a": 1530,
  "HFC-143a": 5810,
  "HFC-152a": 164,
  "HFC-227ea": 3600,
  "HFC-236fa": 8690,
  "HFC-245fa": 962,
  "R-404A": 4728, // weighted from constituents
  "R-407A": 2262,
  "R-407C": 1908,
  "R-410A": 2256,
  "R-507A": 4282,
  SF6: 24300,
  NF3: 17400,
  "PFC-14": 7380,
  "PFC-116": 12400,
  "PFC-218": 9290,
  "PFC-318": 10000,
};

export const GWP_AR6_20Y: Record<Gas, number> = {
  CO2: 1,
  CH4: 81.2,
  CH4_FOSSIL: 82.5,
  CH4_NON_FOSSIL: 79.7,
  N2O: 273,
  "HFC-23": 15300,
  "HFC-32": 2690,
  "HFC-125": 6740,
  "HFC-134a": 4140,
  "HFC-143a": 7840,
  "HFC-152a": 591,
  "HFC-227ea": 5850,
  "HFC-236fa": 8240,
  "HFC-245fa": 3170,
  "R-404A": 6940,
  "R-407A": 4380,
  "R-407C": 4115,
  "R-410A": 4715,
  "R-507A": 7110,
  SF6: 18300,
  NF3: 13400,
  "PFC-14": 5300,
  "PFC-116": 8940,
  "PFC-218": 6770,
  "PFC-318": 7110,
};

/** Legacy AR4 — kept for restating older filings. */
export const GWP_AR4: Record<Gas, number> = {
  CO2: 1,
  CH4: 25,
  CH4_FOSSIL: 25,
  CH4_NON_FOSSIL: 25,
  N2O: 298,
  "HFC-23": 14800,
  "HFC-32": 675,
  "HFC-125": 3500,
  "HFC-134a": 1430,
  "HFC-143a": 4470,
  "HFC-152a": 124,
  "HFC-227ea": 3220,
  "HFC-236fa": 9810,
  "HFC-245fa": 1030,
  "R-404A": 3922,
  "R-407A": 2107,
  "R-407C": 1774,
  "R-410A": 2088,
  "R-507A": 3985,
  SF6: 22800,
  NF3: 17200,
  "PFC-14": 7390,
  "PFC-116": 12200,
  "PFC-218": 8830,
  "PFC-318": 10300,
};

export type GwpBasis = "AR4" | "AR5" | "AR6_100" | "AR6_20";

const TABLES: Record<GwpBasis, Record<Gas, number>> = {
  AR4: GWP_AR4,
  AR5: GWP_AR5,
  AR6_100: GWP_AR6_100Y,
  AR6_20: GWP_AR6_20Y,
};

/** Look up GWP. Throws if gas is unknown — corrupt input should not silently zero. */
export function getGwp(gas: Gas | string, basis: GwpBasis = "AR6_100"): number {
  const table = TABLES[basis];
  const value = table[gas as Gas];
  if (value === undefined) {
    throw new Error(
      `Unknown gas '${gas}' for GWP basis '${basis}'. Add it to factors/ipcc-gwp.ts.`
    );
  }
  return value;
}

/**
 * Convert a quantity of a gas (in tonnes or kg of the gas itself) to CO2e.
 * The unit of input == unit of output (tonnes-gas → tonnes-CO2e, kg → kg).
 */
export function toCO2e(
  gas: Gas | string,
  quantity: number,
  basis: GwpBasis = "AR6_100"
): number {
  return quantity * getGwp(gas, basis);
}
