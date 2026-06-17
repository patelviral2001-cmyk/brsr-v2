/**
 * DEFRA / BEIS GHG conversion factors (2024 edition).
 *
 * Source: UK Government, "Greenhouse gas reporting: conversion factors 2024".
 * Used for fuel combustion (Scope 1) and well-to-tank / upstream (Scope 3 cat 3) emissions.
 *
 * Note: these include scope 1 (direct combustion CO2 + CH4 + N2O) only unless
 * `wtt_kgco2e_per_unit` is also populated (which captures the upstream component).
 */

export interface FuelFactor {
  fuel_id: string;
  display_name: string;
  unit: string;
  /** Scope 1 - direct combustion total in kgCO2e per `unit`. */
  combustion_kgco2e_per_unit: number;
  /** Scope 3 cat 3 - well-to-tank (upstream) kgCO2e per `unit`. */
  wtt_kgco2e_per_unit: number;
  category: "liquid_fuel" | "gaseous_fuel" | "solid_fuel" | "aviation" | "marine" | "biofuel";
  source: string;
}

export const DEFRA_FUEL_FACTORS_2024: FuelFactor[] = [
  // ---- Liquid fuels (per litre)
  {
    fuel_id: "diesel",
    display_name: "Diesel (average biofuel blend)",
    unit: "litre",
    combustion_kgco2e_per_unit: 2.68,
    wtt_kgco2e_per_unit: 0.61,
    category: "liquid_fuel",
    source: "DEFRA 2024 Table Fuels",
  },
  {
    fuel_id: "petrol",
    display_name: "Petrol / Gasoline (average biofuel blend)",
    unit: "litre",
    combustion_kgco2e_per_unit: 2.31,
    wtt_kgco2e_per_unit: 0.61,
    category: "liquid_fuel",
    source: "DEFRA 2024 Table Fuels",
  },
  {
    fuel_id: "fuel_oil",
    display_name: "Fuel oil",
    unit: "litre",
    combustion_kgco2e_per_unit: 3.16,
    wtt_kgco2e_per_unit: 0.66,
    category: "liquid_fuel",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "kerosene",
    display_name: "Burning oil / Kerosene",
    unit: "litre",
    combustion_kgco2e_per_unit: 2.54,
    wtt_kgco2e_per_unit: 0.55,
    category: "liquid_fuel",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "naphtha",
    display_name: "Naphtha",
    unit: "litre",
    combustion_kgco2e_per_unit: 2.12,
    wtt_kgco2e_per_unit: 0.51,
    category: "liquid_fuel",
    source: "DEFRA 2024",
  },

  // ---- Liquid fuels by mass (per kg)
  {
    fuel_id: "lpg",
    display_name: "LPG (liquefied petroleum gas)",
    unit: "kg",
    combustion_kgco2e_per_unit: 1.51,
    wtt_kgco2e_per_unit: 0.22,
    category: "gaseous_fuel",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "lng",
    display_name: "LNG (liquefied natural gas)",
    unit: "kg",
    combustion_kgco2e_per_unit: 2.55,
    wtt_kgco2e_per_unit: 0.71,
    category: "gaseous_fuel",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "cng",
    display_name: "CNG (compressed natural gas)",
    unit: "kg",
    combustion_kgco2e_per_unit: 2.55,
    wtt_kgco2e_per_unit: 0.42,
    category: "gaseous_fuel",
    source: "DEFRA 2024",
  },

  // ---- Gaseous fuels (per kWh net CV)
  {
    fuel_id: "natural_gas",
    display_name: "Natural gas (pipeline)",
    unit: "kwh",
    combustion_kgco2e_per_unit: 0.18,
    wtt_kgco2e_per_unit: 0.029,
    category: "gaseous_fuel",
    source: "DEFRA 2024",
  },

  // ---- Solid fuels (per tonne)
  {
    fuel_id: "coal_industrial",
    display_name: "Industrial coal",
    unit: "tonne",
    combustion_kgco2e_per_unit: 2403.0,
    wtt_kgco2e_per_unit: 220.0,
    category: "solid_fuel",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "coal_electricity_gen",
    display_name: "Coal (electricity generation)",
    unit: "tonne",
    combustion_kgco2e_per_unit: 2252.0,
    wtt_kgco2e_per_unit: 210.0,
    category: "solid_fuel",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "coking_coal",
    display_name: "Coking coal",
    unit: "tonne",
    combustion_kgco2e_per_unit: 3160.0,
    wtt_kgco2e_per_unit: 235.0,
    category: "solid_fuel",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "lignite",
    display_name: "Lignite",
    unit: "tonne",
    combustion_kgco2e_per_unit: 1281.0,
    wtt_kgco2e_per_unit: 95.0,
    category: "solid_fuel",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "petroleum_coke",
    display_name: "Petroleum coke",
    unit: "tonne",
    combustion_kgco2e_per_unit: 3386.0,
    wtt_kgco2e_per_unit: 312.0,
    category: "solid_fuel",
    source: "DEFRA 2024",
  },

  // ---- Aviation (per litre / per tonne where applicable)
  {
    fuel_id: "aviation_spirit",
    display_name: "Aviation spirit",
    unit: "litre",
    combustion_kgco2e_per_unit: 2.33,
    wtt_kgco2e_per_unit: 0.54,
    category: "aviation",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "aviation_turbine_fuel",
    display_name: "Aviation turbine fuel (Jet A1)",
    unit: "litre",
    combustion_kgco2e_per_unit: 2.55,
    wtt_kgco2e_per_unit: 0.55,
    category: "aviation",
    source: "DEFRA 2024",
  },

  // ---- Marine
  {
    fuel_id: "marine_gas_oil",
    display_name: "Marine gas oil",
    unit: "litre",
    combustion_kgco2e_per_unit: 2.78,
    wtt_kgco2e_per_unit: 0.62,
    category: "marine",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "marine_fuel_oil",
    display_name: "Marine fuel oil",
    unit: "litre",
    combustion_kgco2e_per_unit: 3.21,
    wtt_kgco2e_per_unit: 0.67,
    category: "marine",
    source: "DEFRA 2024",
  },

  // ---- Biofuels (biogenic CO2 is reported separately; combustion CH4/N2O still here)
  {
    fuel_id: "biodiesel",
    display_name: "Biodiesel (B100)",
    unit: "litre",
    combustion_kgco2e_per_unit: 0.17,
    wtt_kgco2e_per_unit: 0.55,
    category: "biofuel",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "bioethanol",
    display_name: "Bioethanol",
    unit: "litre",
    combustion_kgco2e_per_unit: 0.012,
    wtt_kgco2e_per_unit: 0.41,
    category: "biofuel",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "wood_pellets",
    display_name: "Wood pellets",
    unit: "tonne",
    combustion_kgco2e_per_unit: 39.5,
    wtt_kgco2e_per_unit: 92.0,
    category: "biofuel",
    source: "DEFRA 2024",
  },
  {
    fuel_id: "biomass_solid",
    display_name: "Biomass (solid, generic)",
    unit: "tonne",
    combustion_kgco2e_per_unit: 26.8,
    wtt_kgco2e_per_unit: 67.0,
    category: "biofuel",
    source: "DEFRA 2024",
  },
];

const FUEL_INDEX: Record<string, FuelFactor> = (() => {
  const out: Record<string, FuelFactor> = {};
  for (const f of DEFRA_FUEL_FACTORS_2024) {
    out[f.fuel_id] = f;
  }
  return out;
})();

export function getFuelFactor(fuelId: string): FuelFactor | undefined {
  return FUEL_INDEX[fuelId];
}

/**
 * Compute scope 1 emissions for a quantity of a known fuel.
 * Returns kgCO2e. Returns null if the fuel is unknown.
 */
export function calcCombustionEmissions(
  fuelId: string,
  quantity: number
): number | null {
  const f = FUEL_INDEX[fuelId];
  if (!f) return null;
  return quantity * f.combustion_kgco2e_per_unit;
}

/** Returns kgCO2e of well-to-tank (Scope 3 cat 3) for the same fuel quantity. */
export function calcWttEmissions(fuelId: string, quantity: number): number | null {
  const f = FUEL_INDEX[fuelId];
  if (!f) return null;
  return quantity * f.wtt_kgco2e_per_unit;
}
