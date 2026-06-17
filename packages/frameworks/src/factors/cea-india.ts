/**
 * CEA Indian grid emission factors.
 *
 * Source: Central Electricity Authority, "CO2 Baseline Database for the Indian Power Sector"
 * (latest user guide v18, published 2024 for FY24). Units: kgCO2/kWh delivered.
 *
 * The figures are point estimates. The CEA actually publishes:
 *   - Combined Margin (CM)        — used for project additionality
 *   - Build Margin (BM)
 *   - Operating Margin (OM)       — used here, as it is the right one for
 *                                   consumption-based corporate accounting
 *
 * Where state-specific data is unavailable, the regional grid factor applies.
 */

export type GridRegion =
  | "Northern"
  | "Western"
  | "Southern"
  | "Eastern"
  | "NorthEastern"
  | "AllIndia";

export interface GridFactor {
  state: string;
  region: GridRegion;
  /** kgCO2 per kWh delivered (operating margin). */
  factor_kgco2_per_kwh: number;
  /** CEA publication year this factor was sourced from. */
  source_year: number;
  /** Optional notes (e.g. "based on regional average — no state-specific data"). */
  note?: string;
}

/**
 * State-level factors for FY 2024 (CEA v18).
 * Each state inherits the regional value if no state-specific factor is published.
 */
export const CEA_GRID_FACTORS_2024: GridFactor[] = [
  // ---- Northern region (regional OM: 0.78)
  { state: "Punjab",            region: "Northern",     factor_kgco2_per_kwh: 0.78, source_year: 2024 },
  { state: "Haryana",           region: "Northern",     factor_kgco2_per_kwh: 0.81, source_year: 2024 },
  { state: "Delhi",             region: "Northern",     factor_kgco2_per_kwh: 0.74, source_year: 2024 },
  { state: "Rajasthan",         region: "Northern",     factor_kgco2_per_kwh: 0.79, source_year: 2024 },
  { state: "Uttar Pradesh",     region: "Northern",     factor_kgco2_per_kwh: 0.83, source_year: 2024 },
  { state: "Uttarakhand",       region: "Northern",     factor_kgco2_per_kwh: 0.50, source_year: 2024, note: "Significant hydro share." },
  { state: "Himachal Pradesh",  region: "Northern",     factor_kgco2_per_kwh: 0.30, source_year: 2024, note: "Predominantly hydro." },
  { state: "Jammu and Kashmir", region: "Northern",     factor_kgco2_per_kwh: 0.55, source_year: 2024 },
  { state: "Ladakh",            region: "Northern",     factor_kgco2_per_kwh: 0.55, source_year: 2024 },
  { state: "Chandigarh",        region: "Northern",     factor_kgco2_per_kwh: 0.78, source_year: 2024 },

  // ---- Western region (regional OM: 0.85)
  { state: "Maharashtra",       region: "Western",      factor_kgco2_per_kwh: 0.85, source_year: 2024 },
  { state: "Gujarat",           region: "Western",      factor_kgco2_per_kwh: 0.82, source_year: 2024 },
  { state: "Madhya Pradesh",    region: "Western",      factor_kgco2_per_kwh: 0.91, source_year: 2024 },
  { state: "Chhattisgarh",      region: "Western",      factor_kgco2_per_kwh: 0.94, source_year: 2024, note: "Coal-heavy generation mix." },
  { state: "Goa",               region: "Western",      factor_kgco2_per_kwh: 0.83, source_year: 2024 },
  { state: "Dadra and Nagar Haveli", region: "Western", factor_kgco2_per_kwh: 0.83, source_year: 2024 },
  { state: "Daman and Diu",     region: "Western",      factor_kgco2_per_kwh: 0.83, source_year: 2024 },

  // ---- Southern region (regional OM: 0.65)
  { state: "Karnataka",         region: "Southern",     factor_kgco2_per_kwh: 0.72, source_year: 2024 },
  { state: "Tamil Nadu",        region: "Southern",     factor_kgco2_per_kwh: 0.65, source_year: 2024 },
  { state: "Kerala",            region: "Southern",     factor_kgco2_per_kwh: 0.45, source_year: 2024, note: "High hydro and renewables share." },
  { state: "Andhra Pradesh",    region: "Southern",     factor_kgco2_per_kwh: 0.75, source_year: 2024 },
  { state: "Telangana",         region: "Southern",     factor_kgco2_per_kwh: 0.78, source_year: 2024 },
  { state: "Puducherry",        region: "Southern",     factor_kgco2_per_kwh: 0.65, source_year: 2024 },
  { state: "Lakshadweep",       region: "Southern",     factor_kgco2_per_kwh: 0.85, source_year: 2024, note: "Diesel-dependent." },
  { state: "Andaman and Nicobar Islands", region: "Southern", factor_kgco2_per_kwh: 0.85, source_year: 2024, note: "Diesel-dependent." },

  // ---- Eastern region (regional OM: 0.93)
  { state: "West Bengal",       region: "Eastern",      factor_kgco2_per_kwh: 0.92, source_year: 2024 },
  { state: "Bihar",             region: "Eastern",      factor_kgco2_per_kwh: 0.95, source_year: 2024 },
  { state: "Jharkhand",         region: "Eastern",      factor_kgco2_per_kwh: 0.97, source_year: 2024, note: "Coal-belt state." },
  { state: "Odisha",            region: "Eastern",      factor_kgco2_per_kwh: 0.93, source_year: 2024 },
  { state: "Sikkim",            region: "Eastern",      factor_kgco2_per_kwh: 0.25, source_year: 2024, note: "Almost entirely hydro." },

  // ---- North-Eastern region (regional OM: 0.50)
  { state: "Assam",             region: "NorthEastern", factor_kgco2_per_kwh: 0.55, source_year: 2024 },
  { state: "Arunachal Pradesh", region: "NorthEastern", factor_kgco2_per_kwh: 0.30, source_year: 2024 },
  { state: "Manipur",           region: "NorthEastern", factor_kgco2_per_kwh: 0.50, source_year: 2024 },
  { state: "Meghalaya",         region: "NorthEastern", factor_kgco2_per_kwh: 0.30, source_year: 2024 },
  { state: "Mizoram",           region: "NorthEastern", factor_kgco2_per_kwh: 0.40, source_year: 2024 },
  { state: "Nagaland",          region: "NorthEastern", factor_kgco2_per_kwh: 0.55, source_year: 2024 },
  { state: "Tripura",           region: "NorthEastern", factor_kgco2_per_kwh: 0.65, source_year: 2024, note: "Gas-based generation." },
];

/** Regional averages. */
export const CEA_REGIONAL_FACTORS_2024: Record<GridRegion, number> = {
  Northern:     0.78,
  Western:      0.85,
  Southern:     0.65,
  Eastern:      0.93,
  NorthEastern: 0.50,
  AllIndia:     0.716,
};

/** Historical all-India operating margin factor (kgCO2/kWh). */
export const CEA_ALL_INDIA_HISTORY: Record<number, number> = {
  2018: 0.79,
  2019: 0.77,
  2020: 0.75,
  2021: 0.73,
  2022: 0.72,
  2023: 0.718,
  2024: 0.716,
};

const STATE_INDEX: Record<string, GridFactor> = (() => {
  const out: Record<string, GridFactor> = {};
  for (const f of CEA_GRID_FACTORS_2024) {
    out[f.state.toLowerCase()] = f;
  }
  return out;
})();

/**
 * Get the CEA factor for a given state and year.
 * Falls back to the regional or all-India factor if the state is unknown.
 */
export function getCeaFactor(state: string, year: number = 2024): number {
  const normalised = state.trim().toLowerCase();
  const exact = STATE_INDEX[normalised];
  if (exact) return exact.factor_kgco2_per_kwh;

  // Fall back to all-India by year
  const historical = CEA_ALL_INDIA_HISTORY[year];
  if (historical !== undefined) return historical;

  return CEA_REGIONAL_FACTORS_2024.AllIndia;
}

export function getCeaFactorByRegion(region: GridRegion): number {
  return CEA_REGIONAL_FACTORS_2024[region];
}
