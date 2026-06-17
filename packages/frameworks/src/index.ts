/**
 * @brsr/frameworks barrel export.
 *
 * Public API surface for the canonical metric registry + framework crosswalks.
 */

// ---- Canonical metric registry
export {
  CANONICAL_METRICS,
  CANONICAL_KEYS,
  getCanonicalMetric,
  listMetricsByCategory,
  listMetricsBySubcategory,
} from "./canonical/metrics.js";
export type {
  CanonicalMetric,
  AggregationRule,
  MetricCategory,
  DataQualityTier,
  GwpBasis as CanonicalGwpBasis,
  GhgBoundaryTag,
  DimensionKey,
  ValueConstraints,
} from "./canonical/metrics.js";

// ---- Frameworks
export { BRSR_DISCLOSURES, BRSR_SECTION_IDS, getBrsrCoreDisclosures, getBrsrByPrinciple } from "./frameworks/brsr.js";
export type { BrsrDisclosure, BrsrResponseType } from "./frameworks/brsr.js";

export { GRI_DISCLOSURES, getGriByStandard } from "./frameworks/gri.js";
export type { GriDisclosure, GriResponseType } from "./frameworks/gri.js";

export { SASB_DISCLOSURES, getSasbBySector } from "./frameworks/sasb.js";
export type { SasbDisclosure } from "./frameworks/sasb.js";

export { TCFD_DISCLOSURES, getTcfdByPillar } from "./frameworks/tcfd.js";
export type { TcfdDisclosure, TcfdPillar } from "./frameworks/tcfd.js";

export { IFRS_S1_DISCLOSURES, IFRS_S2_DISCLOSURES } from "./frameworks/ifrs.js";
export type { IfrsDisclosure, IfrsStandard } from "./frameworks/ifrs.js";

export { ESRS_DISCLOSURES, getEsrsByStandard } from "./frameworks/csrd-esrs.js";
export type { EsrsDisclosure, EsrsCategory } from "./frameworks/csrd-esrs.js";

export {
  CDP_DISCLOSURES,
  CDP_CLIMATE_DISCLOSURES,
  CDP_WATER_DISCLOSURES,
  CDP_FORESTS_DISCLOSURES,
  getCdpByModule,
} from "./frameworks/cdp.js";
export type { CdpDisclosure, CdpModule } from "./frameworks/cdp.js";

// ---- Crosswalks
export {
  CROSSWALKS,
  getCrosswalk,
  getFrameworksContainingMetric,
  getDisclosuresAnsweredByMetric,
  getCanonicalKeysForDisclosure,
} from "./crosswalks/index.js";
export type { CrosswalkMap, FrameworkCode } from "./crosswalks/index.js";

// ---- Factors
export {
  CEA_GRID_FACTORS_2024,
  CEA_REGIONAL_FACTORS_2024,
  CEA_ALL_INDIA_HISTORY,
  getCeaFactor,
  getCeaFactorByRegion,
} from "./factors/cea-india.js";
export type { GridRegion, GridFactor } from "./factors/cea-india.js";

export {
  DEFRA_FUEL_FACTORS_2024,
  getFuelFactor,
  calcCombustionEmissions,
  calcWttEmissions,
} from "./factors/defra.js";
export type { FuelFactor } from "./factors/defra.js";

export {
  GWP_AR4,
  GWP_AR5,
  GWP_AR6_100Y,
  GWP_AR6_20Y,
  getGwp,
  toCO2e,
} from "./factors/ipcc-gwp.js";
export type { Gas, GwpBasis } from "./factors/ipcc-gwp.js";

// ---- Cross-framework helpers
import { BRSR_DISCLOSURES, type BrsrDisclosure } from "./frameworks/brsr.js";
import { GRI_DISCLOSURES, type GriDisclosure } from "./frameworks/gri.js";
import { SASB_DISCLOSURES, type SasbDisclosure } from "./frameworks/sasb.js";
import { TCFD_DISCLOSURES, type TcfdDisclosure } from "./frameworks/tcfd.js";
import { IFRS_S1_DISCLOSURES, IFRS_S2_DISCLOSURES, type IfrsDisclosure } from "./frameworks/ifrs.js";
import { ESRS_DISCLOSURES, type EsrsDisclosure } from "./frameworks/csrd-esrs.js";
import { CDP_DISCLOSURES, type CdpDisclosure } from "./frameworks/cdp.js";
import type { FrameworkCode } from "./crosswalks/index.js";

export type AnyDisclosure =
  | BrsrDisclosure
  | GriDisclosure
  | SasbDisclosure
  | TcfdDisclosure
  | IfrsDisclosure
  | EsrsDisclosure
  | CdpDisclosure;

export function getDisclosuresByFramework(framework: FrameworkCode): AnyDisclosure[] {
  switch (framework) {
    case "BRSR":
      return BRSR_DISCLOSURES;
    case "GRI":
      return GRI_DISCLOSURES;
    case "SASB":
      return SASB_DISCLOSURES;
    case "TCFD":
      return TCFD_DISCLOSURES;
    case "IFRS_S1":
      return IFRS_S1_DISCLOSURES;
    case "IFRS_S2":
      return IFRS_S2_DISCLOSURES;
    case "CSRD_ESRS":
      return ESRS_DISCLOSURES;
    case "CDP":
      return CDP_DISCLOSURES;
    default: {
      const _exhaustive: never = framework;
      throw new Error(`Unknown framework code: ${String(_exhaustive)}`);
    }
  }
}

/**
 * The complete list of supported frameworks.
 */
export const ALL_FRAMEWORKS: readonly FrameworkCode[] = [
  "BRSR",
  "GRI",
  "SASB",
  "TCFD",
  "IFRS_S1",
  "IFRS_S2",
  "CSRD_ESRS",
  "CDP",
];
