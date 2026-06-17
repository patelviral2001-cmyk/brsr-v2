/**
 * Unit conversion via canonical base units.
 *
 * Strategy: every unit belongs to a family with one base unit. Conversion goes
 * value -> base -> target. This collapses N*N pairwise edges into 2N functions
 * (TO_BASE / FROM_BASE), and adding a new unit costs exactly one entry.
 *
 * Money is intentionally excluded from numeric conversion: FX rates are
 * time-varying and belong in a dedicated FX service. Asking convert() to do
 * currency math is almost always a bug, so we throw.
 */

import { UnitConversionError } from './errors';

export const UnitFamily = {
  ENERGY: 'ENERGY',
  MASS: 'MASS',
  VOLUME: 'VOLUME',
  AREA: 'AREA',
  DISTANCE: 'DISTANCE',
  TIME: 'TIME',
  MONEY: 'MONEY',
  POWER: 'POWER',
  EMISSION: 'EMISSION',
} as const;

export type UnitFamily = (typeof UnitFamily)[keyof typeof UnitFamily];

export interface Unit {
  readonly symbol: string;
  readonly family: UnitFamily;
}

export const BASE_UNIT: Record<UnitFamily, string> = {
  ENERGY: 'j',
  MASS: 'kg',
  VOLUME: 'l',
  AREA: 'm2',
  DISTANCE: 'm',
  TIME: 's',
  MONEY: 'usd',
  POWER: 'w',
  EMISSION: 'kgco2e',
};

// Registry — mutable so registerUnit() can extend at runtime.
const UNITS: Record<string, Unit> = {};
const TO_BASE: Record<string, (v: number) => number> = {};
const FROM_BASE: Record<string, (v: number) => number> = {};

// Aliases map raw user input to canonical (lowercased) keys. Both keys and
// values are lowercased; lookup applies after lowercasing + trimming.
export const ALIASES: Record<string, string> = {
  // energy
  kwh: 'kwh',
  mwh: 'mwh',
  gwh: 'gwh',
  twh: 'twh',
  'kilowatt-hour': 'kwh',
  'kilowatt hour': 'kwh',
  'kilowatt hours': 'kwh',
  btu: 'btu',
  therms: 'therm',
  // mass
  tonne: 't',
  tonnes: 't',
  ton: 't',
  tons: 't',
  metric_ton: 't',
  'metric ton': 't',
  'metric tons': 't',
  metric_tons: 't',
  pound: 'lb',
  pounds: 'lb',
  lbs: 'lb',
  ounce: 'oz',
  ounces: 'oz',
  gram: 'g',
  grams: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  // volume
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  milliliter: 'ml',
  milliliters: 'ml',
  cubicmeter: 'm3',
  'cubic meter': 'm3',
  'cubic meters': 'm3',
  'm^3': 'm3',
  gallon: 'gal_us',
  gallons: 'gal_us',
  'us gallon': 'gal_us',
  'uk gallon': 'gal_uk',
  'imperial gallon': 'gal_uk',
  barrel: 'bbl',
  barrels: 'bbl',
  // area
  'm^2': 'm2',
  'sq m': 'm2',
  sqm: 'm2',
  hectares: 'ha',
  hectare: 'ha',
  acres: 'acre',
  // distance
  meter: 'm',
  meters: 'm',
  kilometer: 'km',
  kilometers: 'km',
  mile: 'mi',
  miles: 'mi',
  feet: 'ft',
  foot: 'ft',
  // time
  second: 's',
  seconds: 's',
  sec: 's',
  minute: 'min',
  minutes: 'min',
  mins: 'min',
  hour: 'h',
  hours: 'h',
  hr: 'h',
  hrs: 'h',
  day: 'd',
  days: 'd',
  // power
  watt: 'w',
  watts: 'w',
  kilowatt: 'kw',
  kilowatts: 'kw',
  megawatt: 'mw',
  megawatts: 'mw',
  horsepower: 'hp',
  // emission
  'kg co2e': 'kgco2e',
  'kgco2-e': 'kgco2e',
  'kg co2-e': 'kgco2e',
  'tco2-e': 'tco2e',
  't co2e': 'tco2e',
  'g co2e': 'gco2e',
};

function normalize(symbol: string): string {
  const key = symbol.trim().toLowerCase();
  return ALIASES[key] ?? key;
}

function factor(k: number): {
  toBase: (v: number) => number;
  fromBase: (v: number) => number;
} {
  return {
    toBase: (v: number) => v * k,
    fromBase: (v: number) => v / k,
  };
}

function register(
  symbol: string,
  family: UnitFamily,
  toBase: (v: number) => number,
  fromBase: (v: number) => number,
): void {
  const key = symbol.toLowerCase();
  UNITS[key] = { symbol, family };
  TO_BASE[key] = toBase;
  FROM_BASE[key] = fromBase;
}

// --- Energy (base: J) ---
register('J', 'ENERGY', (v) => v, (v) => v);
register('kJ', 'ENERGY', factor(1e3).toBase, factor(1e3).fromBase);
register('MJ', 'ENERGY', factor(1e6).toBase, factor(1e6).fromBase);
register('GJ', 'ENERGY', factor(1e9).toBase, factor(1e9).fromBase);
register('TJ', 'ENERGY', factor(1e12).toBase, factor(1e12).fromBase);
register('Wh', 'ENERGY', factor(3600).toBase, factor(3600).fromBase);
register('kWh', 'ENERGY', factor(3.6e6).toBase, factor(3.6e6).fromBase);
register('MWh', 'ENERGY', factor(3.6e9).toBase, factor(3.6e9).fromBase);
register('GWh', 'ENERGY', factor(3.6e12).toBase, factor(3.6e12).fromBase);
register('TWh', 'ENERGY', factor(3.6e15).toBase, factor(3.6e15).fromBase);
register('cal', 'ENERGY', factor(4.184).toBase, factor(4.184).fromBase);
register('kcal', 'ENERGY', factor(4184).toBase, factor(4184).fromBase);
register('BTU', 'ENERGY', factor(1055.06).toBase, factor(1055.06).fromBase);
register('therm', 'ENERGY', factor(1.05506e8).toBase, factor(1.05506e8).fromBase);

// --- Mass (base: kg) ---
register('kg', 'MASS', (v) => v, (v) => v);
register('g', 'MASS', factor(1e-3).toBase, factor(1e-3).fromBase);
register('mg', 'MASS', factor(1e-6).toBase, factor(1e-6).fromBase);
register('t', 'MASS', factor(1e3).toBase, factor(1e3).fromBase);
register('lb', 'MASS', factor(0.45359237).toBase, factor(0.45359237).fromBase);
register('oz', 'MASS', factor(0.0283495231).toBase, factor(0.0283495231).fromBase);

// --- Volume (base: L) ---
register('L', 'VOLUME', (v) => v, (v) => v);
register('mL', 'VOLUME', factor(1e-3).toBase, factor(1e-3).fromBase);
register('kL', 'VOLUME', factor(1e3).toBase, factor(1e3).fromBase);
register('m3', 'VOLUME', factor(1e3).toBase, factor(1e3).fromBase);
register('cm3', 'VOLUME', factor(1e-3).toBase, factor(1e-3).fromBase);
register('gal_us', 'VOLUME', factor(3.78541).toBase, factor(3.78541).fromBase);
register('gal_uk', 'VOLUME', factor(4.54609).toBase, factor(4.54609).fromBase);
register('bbl', 'VOLUME', factor(158.987).toBase, factor(158.987).fromBase);

// --- Area (base: m2) ---
register('m2', 'AREA', (v) => v, (v) => v);
register('cm2', 'AREA', factor(1e-4).toBase, factor(1e-4).fromBase);
register('km2', 'AREA', factor(1e6).toBase, factor(1e6).fromBase);
register('ha', 'AREA', factor(1e4).toBase, factor(1e4).fromBase);
register('hectare', 'AREA', factor(1e4).toBase, factor(1e4).fromBase);
register('acre', 'AREA', factor(4046.8564224).toBase, factor(4046.8564224).fromBase);

// --- Distance (base: m) ---
register('m', 'DISTANCE', (v) => v, (v) => v);
register('km', 'DISTANCE', factor(1e3).toBase, factor(1e3).fromBase);
register('cm', 'DISTANCE', factor(1e-2).toBase, factor(1e-2).fromBase);
register('mi', 'DISTANCE', factor(1609.344).toBase, factor(1609.344).fromBase);
register('ft', 'DISTANCE', factor(0.3048).toBase, factor(0.3048).fromBase);

// --- Time (base: s) ---
register('s', 'TIME', (v) => v, (v) => v);
register('min', 'TIME', factor(60).toBase, factor(60).fromBase);
register('h', 'TIME', factor(3600).toBase, factor(3600).fromBase);
register('d', 'TIME', factor(86400).toBase, factor(86400).fromBase);

// --- Power (base: W) ---
register('W', 'POWER', (v) => v, (v) => v);
register('kW', 'POWER', factor(1e3).toBase, factor(1e3).fromBase);
register('MW', 'POWER', factor(1e6).toBase, factor(1e6).fromBase);
register('GW', 'POWER', factor(1e9).toBase, factor(1e9).fromBase);
register('hp', 'POWER', factor(745.6999).toBase, factor(745.6999).fromBase);

// --- Emission (base: kgCO2e) ---
register('kgCO2e', 'EMISSION', (v) => v, (v) => v);
register('tCO2e', 'EMISSION', factor(1e3).toBase, factor(1e3).fromBase);
register('gCO2e', 'EMISSION', factor(1e-3).toBase, factor(1e-3).fromBase);
register('MtCO2e', 'EMISSION', factor(1e9).toBase, factor(1e9).fromBase);

// --- Money (registered but conversion intentionally rejected) ---
register('USD', 'MONEY', (v) => v, (v) => v);

function lookup(symbol: string): Unit | undefined {
  return UNITS[normalize(symbol)];
}

export function convert(value: number, from: string, to: string): number {
  const fromUnit = lookup(from);
  const toUnit = lookup(to);
  if (!fromUnit) {
    throw new UnitConversionError(`Unknown unit: ${from}`, { unit: from });
  }
  if (!toUnit) {
    throw new UnitConversionError(`Unknown unit: ${to}`, { unit: to });
  }
  if (fromUnit.family !== toUnit.family) {
    throw new UnitConversionError(
      `Cannot convert ${from} (${fromUnit.family}) to ${to} (${toUnit.family})`,
      { from, to, fromFamily: fromUnit.family, toFamily: toUnit.family },
    );
  }
  if (fromUnit.family === 'MONEY') {
    throw new UnitConversionError(
      'Currency conversion is not supported here — use the FX service',
      { from, to },
    );
  }
  const fromKey = normalize(from);
  const toKey = normalize(to);
  const toBaseFn = TO_BASE[fromKey];
  const fromBaseFn = FROM_BASE[toKey];
  if (!toBaseFn || !fromBaseFn) {
    // Defensive: registry inconsistency. Should be unreachable.
    throw new UnitConversionError('Conversion function missing in registry', {
      from,
      to,
    });
  }
  return fromBaseFn(toBaseFn(value));
}

export function canConvert(from: string, to: string): boolean {
  const fromUnit = lookup(from);
  const toUnit = lookup(to);
  if (!fromUnit || !toUnit) return false;
  if (fromUnit.family !== toUnit.family) return false;
  if (fromUnit.family === 'MONEY') return false;
  return true;
}

export function unitsInFamily(family: UnitFamily): string[] {
  const out: string[] = [];
  for (const key of Object.keys(UNITS)) {
    const u = UNITS[key];
    if (u && u.family === family) out.push(u.symbol);
  }
  return out;
}

export function family(symbol: string): UnitFamily | null {
  const u = lookup(symbol);
  return u ? u.family : null;
}

export function registerUnit(
  symbol: string,
  family: UnitFamily,
  toBase: (v: number) => number,
  fromBase: (v: number) => number,
): void {
  register(symbol, family, toBase, fromBase);
}

export { UnitConversionError };
