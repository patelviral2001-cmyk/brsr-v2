/**
 * Crosswalks: canonical metric -> which framework disclosures it satisfies.
 *
 * Two ways to build the crosswalk matrix:
 *   1) Hand-curate the most important ones (the "golden" mappings).
 *   2) Derive the rest at build time by inverting the mapped_canonical_keys arrays in each framework file.
 *
 * We do BOTH and merge: the hand-curated map takes precedence on conflicts.
 * This gives correctness on the high-value GHG/water/energy crosswalks while not letting
 * less-important crosswalks rot.
 */

import { BRSR_DISCLOSURES } from "../frameworks/brsr.js";
import { GRI_DISCLOSURES } from "../frameworks/gri.js";
import { SASB_DISCLOSURES } from "../frameworks/sasb.js";
import { TCFD_DISCLOSURES } from "../frameworks/tcfd.js";
import { IFRS_S1_DISCLOSURES, IFRS_S2_DISCLOSURES } from "../frameworks/ifrs.js";
import { ESRS_DISCLOSURES } from "../frameworks/csrd-esrs.js";
import { CDP_DISCLOSURES } from "../frameworks/cdp.js";
import { CANONICAL_KEYS } from "../canonical/metrics.js";

export type FrameworkCode =
  | "BRSR"
  | "GRI"
  | "SASB"
  | "TCFD"
  | "IFRS_S1"
  | "IFRS_S2"
  | "CSRD_ESRS"
  | "CDP";

export type CrosswalkMap = Partial<Record<FrameworkCode, string[]>>;

/** Hand-curated golden mappings. */
const GOLDEN_CROSSWALKS: Record<string, CrosswalkMap> = {
  electricity_kwh: {
    BRSR: ["P6.E.1"],
    GRI: ["GRI 302-1"],
    SASB: ["RR-SE-130a.1", "RT-EE-130a.1", "EM-CM-130a.1", "EM-IS-130a.1", "RT-IG-130a.1", "TC-IM-130a.1", "TC-SI-130a.1"],
    TCFD: ["TCFD-Metr-a"],
    IFRS_S2: ["S2.29(d)"],
    CSRD_ESRS: ["ESRS E1-5"],
    CDP: ["C8.2a"],
  },
  electricity_from_renewable_kwh: {
    BRSR: ["P6.E.1", "P6.L.4"],
    GRI: ["GRI 302-1"],
    SASB: ["RR-SE-130a.1", "TC-IM-130a.1", "TC-SI-130a.1"],
    TCFD: ["TCFD-Metr-a", "TCFD-Metr-c"],
    IFRS_S2: ["S2.29(g)"],
    CSRD_ESRS: ["ESRS E1-5"],
    CDP: ["C8.2a"],
  },
  scope1_total_tco2e: {
    BRSR: ["P6.E.8"],
    GRI: ["GRI 305-1"],
    SASB: ["EM-CM-110a.1", "EM-IS-110a.1"],
    TCFD: ["TCFD-Metr-b", "TCFD-Metr-c"],
    IFRS_S2: ["S2.29(a)"],
    CSRD_ESRS: ["ESRS E1-6"],
    CDP: ["C6.1"],
  },
  scope2_location_tco2e: {
    BRSR: ["P6.E.8"],
    GRI: ["GRI 305-2"],
    TCFD: ["TCFD-Metr-b"],
    IFRS_S2: ["S2.29(b)"],
    CSRD_ESRS: ["ESRS E1-6"],
    CDP: ["C6.3"],
  },
  scope2_market_tco2e: {
    BRSR: ["P6.E.8"],
    GRI: ["GRI 305-2"],
    TCFD: ["TCFD-Metr-b"],
    IFRS_S2: ["S2.29(b)"],
    CSRD_ESRS: ["ESRS E1-6"],
    CDP: ["C6.3"],
  },
  water_withdrawn_total_kl: {
    BRSR: ["P6.E.3", "P6.L.1"],
    GRI: ["GRI 303-3"],
    SASB: ["RR-SE-140a.1", "EM-CM-140a.1", "EM-IS-140a.1", "TC-IM-130a.2", "TC-SI-130a.2"],
    CSRD_ESRS: ["ESRS E3-4"],
    CDP: ["W1.2b"],
  },
  water_discharged_kl: {
    BRSR: ["P6.E.6"],
    GRI: ["GRI 303-4"],
    CSRD_ESRS: ["ESRS E3-4"],
    CDP: ["W1.2b"],
  },
  water_consumed_kl: {
    BRSR: ["P6.L.1"],
    GRI: ["GRI 303-5"],
    SASB: ["RR-SE-140a.1", "TC-IM-130a.2", "TC-SI-130a.2"],
    CSRD_ESRS: ["ESRS E3-4"],
    CDP: ["W1.2b"],
  },
  waste_hazardous_kg: {
    BRSR: ["P6.E.10"],
    GRI: ["GRI 306-3"],
    SASB: ["RR-SE-150a.1", "RT-EE-150a.1", "EM-CM-150a.1", "EM-IS-150a.1"],
    CSRD_ESRS: ["ESRS E5-5"],
  },
  ltifr: {
    BRSR: ["P3.E.11.a"],
    GRI: ["GRI 403-9"],
    SASB: ["EM-IS-320a.1", "RT-IG-320a.1"],
    CSRD_ESRS: ["ESRS S1-14"],
  },
  women_in_workforce_pct: {
    BRSR: ["A.III.20.a"],
    GRI: ["GRI 405-1"],
    SASB: ["TC-IM-330a.3", "TC-SI-330a.2"],
    CSRD_ESRS: ["ESRS S1-9"],
  },
  gender_pay_gap_pct: {
    BRSR: ["P5.E.3"],
    GRI: ["GRI 405-2"],
    CSRD_ESRS: ["ESRS S1-16"],
  },
  csr_spend_inr: {
    BRSR: ["P8.L.2"],
    CSRD_ESRS: ["ESRS S3-4"],
  },
  data_breach_count: {
    BRSR: ["P9.E.3", "P9.L.5"],
    SASB: ["TC-IM-230a.1", "TC-SI-230a.1"],
    CSRD_ESRS: ["ESRS S4-4"],
  },
};

interface DisclosureLike {
  section_id: string;
  mapped_canonical_keys: string[];
}

function inverteForFramework(
  list: DisclosureLike[],
  framework: FrameworkCode,
  acc: Map<string, CrosswalkMap>
): void {
  for (const disc of list) {
    for (const key of disc.mapped_canonical_keys) {
      let entry = acc.get(key);
      if (!entry) {
        entry = {};
        acc.set(key, entry);
      }
      const existing = entry[framework] ?? [];
      if (!existing.includes(disc.section_id)) {
        existing.push(disc.section_id);
      }
      entry[framework] = existing;
    }
  }
}

function buildCrosswalks(): Record<string, CrosswalkMap> {
  const acc = new Map<string, CrosswalkMap>();
  inverteForFramework(BRSR_DISCLOSURES, "BRSR", acc);
  inverteForFramework(GRI_DISCLOSURES, "GRI", acc);
  inverteForFramework(SASB_DISCLOSURES, "SASB", acc);
  inverteForFramework(TCFD_DISCLOSURES, "TCFD", acc);
  inverteForFramework(IFRS_S1_DISCLOSURES, "IFRS_S1", acc);
  inverteForFramework(IFRS_S2_DISCLOSURES, "IFRS_S2", acc);
  inverteForFramework(ESRS_DISCLOSURES, "CSRD_ESRS", acc);
  inverteForFramework(CDP_DISCLOSURES, "CDP", acc);

  // Initialise empty crosswalks for any canonical key without inversions yet,
  // so downstream consumers can rely on the key being present.
  for (const key of CANONICAL_KEYS) {
    if (!acc.has(key)) acc.set(key, {});
  }

  // Merge in golden mappings; golden wins (de-duped per framework).
  for (const [key, golden] of Object.entries(GOLDEN_CROSSWALKS)) {
    const entry = acc.get(key) ?? {};
    for (const [fwRaw, ids] of Object.entries(golden)) {
      const fw = fwRaw as FrameworkCode;
      const merged = new Set<string>([...(entry[fw] ?? []), ...ids]);
      entry[fw] = Array.from(merged);
    }
    acc.set(key, entry);
  }

  return Object.fromEntries(acc);
}

export const CROSSWALKS: Record<string, CrosswalkMap> = buildCrosswalks();

export function getCrosswalk(canonicalKey: string): CrosswalkMap {
  return CROSSWALKS[canonicalKey] ?? {};
}

export function getFrameworksContainingMetric(canonicalKey: string): FrameworkCode[] {
  const xw = CROSSWALKS[canonicalKey];
  if (!xw) return [];
  const out: FrameworkCode[] = [];
  for (const [fw, ids] of Object.entries(xw)) {
    if (ids && ids.length > 0) out.push(fw as FrameworkCode);
  }
  return out;
}

export function getDisclosuresAnsweredByMetric(canonicalKey: string): string[] {
  const xw = CROSSWALKS[canonicalKey];
  if (!xw) return [];
  return Object.values(xw).flatMap((ids) => ids ?? []);
}

/** Reverse lookup: which canonical metrics feed a given disclosure ID? */
export function getCanonicalKeysForDisclosure(
  framework: FrameworkCode,
  sectionId: string
): string[] {
  const out: string[] = [];
  for (const [key, xw] of Object.entries(CROSSWALKS)) {
    const ids = xw[framework] ?? [];
    if (ids.includes(sectionId)) out.push(key);
  }
  return out;
}
