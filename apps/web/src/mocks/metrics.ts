import type { MetricDefinition, MetricEvent } from "@/types";

const defs: Omit<MetricDefinition, "id">[] = [
  // Energy
  { canonicalKey: "energy.consumption.mwh", name: "Energy Consumption (Total)", description: "Total energy consumed across all sources in MWh.", category: "Energy", unit: "MWh", dimensions: ["scope_node_id", "source"], frameworks: [{ id: "BRSR", ref: "P6 Q1" }, { id: "GRI", ref: "302-1" }, { id: "SASB", ref: "IF-EU-130a.1" }], dataType: "NUMERIC", computeKind: "DERIVED", formula: "sum(electricity.consumption.kwh / 1000 + diesel.energy.mwh + ng.energy.mwh)", tags: ["energy", "core"] },
  { canonicalKey: "electricity.consumption.kwh", name: "Grid Electricity Consumption", description: "Electricity drawn from the grid.", category: "Energy", unit: "kWh", dimensions: ["scope_node_id"], frameworks: [{ id: "BRSR", ref: "P6 Q1.a" }, { id: "GRI", ref: "302-1.c" }], dataType: "NUMERIC", computeKind: "EXTRACTED", tags: ["energy"] },
  { canonicalKey: "diesel.consumption.l", name: "Diesel Consumption", description: "Diesel used in DG sets, mobile sources.", category: "Energy", unit: "L", dimensions: ["scope_node_id", "asset"], frameworks: [{ id: "BRSR", ref: "P6 Q1.a" }, { id: "GRI", ref: "302-1.a" }], dataType: "NUMERIC", computeKind: "EXTRACTED", tags: ["energy", "scope-1"] },
  { canonicalKey: "energy.renewable.share", name: "Renewable Share of Energy", description: "Share of total energy from renewable sources.", category: "Energy", unit: "%", dimensions: ["scope_node_id"], frameworks: [{ id: "BRSR", ref: "P6 Q3" }, { id: "GRI", ref: "302-1.e" }, { id: "TCFD", ref: "Metrics b" }], dataType: "NUMERIC", computeKind: "DERIVED", formula: "energy.renewable.mwh / energy.consumption.mwh", tags: ["energy", "renewables"] },

  // Emissions
  { canonicalKey: "ghg.scope1.tco2e", name: "Scope 1 GHG Emissions", description: "Direct emissions from owned/controlled sources.", category: "GHG", unit: "tCO2e", dimensions: ["scope_node_id", "source"], frameworks: [{ id: "BRSR", ref: "P6 Q5" }, { id: "GRI", ref: "305-1" }, { id: "TCFD", ref: "Metrics a" }, { id: "IFRS_S2", ref: "29-30" }], dataType: "NUMERIC", computeKind: "DERIVED", formula: "sum(activity_data * emission_factor)", tags: ["ghg", "core"] },
  { canonicalKey: "ghg.scope2.location.tco2e", name: "Scope 2 (Location-based)", description: "Indirect emissions from purchased electricity using grid average factors.", category: "GHG", unit: "tCO2e", dimensions: ["scope_node_id"], frameworks: [{ id: "BRSR", ref: "P6 Q5" }, { id: "GRI", ref: "305-2.a" }], dataType: "NUMERIC", computeKind: "DERIVED", formula: "electricity.consumption.kwh * grid_factor_kg_co2e_per_kwh / 1000", tags: ["ghg"] },
  { canonicalKey: "ghg.scope2.market.tco2e", name: "Scope 2 (Market-based)", description: "Indirect emissions using contractual instruments (RECs, PPAs).", category: "GHG", unit: "tCO2e", dimensions: ["scope_node_id"], frameworks: [{ id: "GRI", ref: "305-2.b" }, { id: "IFRS_S2", ref: "29" }], dataType: "NUMERIC", computeKind: "DERIVED", tags: ["ghg"] },
  { canonicalKey: "ghg.scope3.tco2e", name: "Scope 3 GHG Emissions", description: "Value chain emissions across all 15 categories.", category: "GHG", unit: "tCO2e", dimensions: ["scope_node_id", "category"], frameworks: [{ id: "BRSR_CORE", ref: "K-1" }, { id: "GRI", ref: "305-3" }, { id: "IFRS_S2", ref: "29 (c)" }], dataType: "NUMERIC", computeKind: "DERIVED", tags: ["ghg", "value-chain"] },
  { canonicalKey: "ghg.intensity.per_revenue", name: "GHG Intensity (per Revenue)", description: "tCO2e per crore INR revenue.", category: "GHG", unit: "tCO2e/Cr INR", dimensions: ["scope_node_id"], frameworks: [{ id: "BRSR_CORE", ref: "K-2" }, { id: "GRI", ref: "305-4" }], dataType: "NUMERIC", computeKind: "DERIVED", tags: ["ghg", "intensity"] },

  // Water
  { canonicalKey: "water.withdrawal.kl", name: "Water Withdrawal", description: "Total water withdrawn (kL).", category: "Water", unit: "kL", dimensions: ["scope_node_id", "source"], frameworks: [{ id: "BRSR", ref: "P6 Q4" }, { id: "GRI", ref: "303-3" }, { id: "SASB", ref: "IF-EU-140a.1" }], dataType: "NUMERIC", computeKind: "EXTRACTED", tags: ["water"] },
  { canonicalKey: "water.discharge.kl", name: "Water Discharge", description: "Total water discharged.", category: "Water", unit: "kL", dimensions: ["scope_node_id"], frameworks: [{ id: "GRI", ref: "303-4" }], dataType: "NUMERIC", computeKind: "EXTRACTED", tags: ["water"] },
  { canonicalKey: "water.recycled.share", name: "Water Recycled (%)", description: "Share of water recycled/reused.", category: "Water", unit: "%", dimensions: ["scope_node_id"], frameworks: [{ id: "BRSR_CORE", ref: "K-4" }], dataType: "NUMERIC", computeKind: "DERIVED", tags: ["water", "circular"] },

  // Waste
  { canonicalKey: "waste.hazardous.t", name: "Hazardous Waste", description: "Hazardous waste generated.", category: "Waste", unit: "t", dimensions: ["scope_node_id"], frameworks: [{ id: "BRSR", ref: "P6 Q7" }, { id: "GRI", ref: "306-3" }], dataType: "NUMERIC", computeKind: "EXTRACTED", tags: ["waste"] },
  { canonicalKey: "waste.non_hazardous.t", name: "Non-Hazardous Waste", description: "Non-hazardous waste generated.", category: "Waste", unit: "t", dimensions: ["scope_node_id"], frameworks: [{ id: "GRI", ref: "306-3" }], dataType: "NUMERIC", computeKind: "EXTRACTED", tags: ["waste"] },

  // Social
  { canonicalKey: "people.fte.total", name: "Total Employees (FTE)", description: "Total full-time equivalent employees.", category: "People", unit: "FTE", dimensions: ["scope_node_id", "gender"], frameworks: [{ id: "BRSR", ref: "P3" }, { id: "GRI", ref: "2-7" }], dataType: "NUMERIC", computeKind: "EXTRACTED", tags: ["people"] },
  { canonicalKey: "people.diversity.female_share", name: "Female Workforce Share", description: "% female in workforce.", category: "People", unit: "%", dimensions: ["scope_node_id", "level"], frameworks: [{ id: "BRSR", ref: "P3 Q1.b" }, { id: "GRI", ref: "405-1.b" }, { id: "BRSR_CORE", ref: "K-5" }], dataType: "NUMERIC", computeKind: "DERIVED", tags: ["people", "diversity"] },
  { canonicalKey: "people.board.female_share", name: "Female Board Share", description: "% female board members.", category: "People", unit: "%", dimensions: [], frameworks: [{ id: "BRSR", ref: "P1 Q14" }, { id: "GRI", ref: "405-1.a" }], dataType: "NUMERIC", computeKind: "EXTRACTED", tags: ["governance", "diversity"] },
  { canonicalKey: "ehs.ltifr", name: "LTIFR", description: "Lost Time Injury Frequency Rate per 1M hours.", category: "Safety", unit: "per 1M hrs", dimensions: ["scope_node_id"], frameworks: [{ id: "BRSR", ref: "P3 Q11" }, { id: "GRI", ref: "403-9" }, { id: "BRSR_CORE", ref: "K-7" }], dataType: "NUMERIC", computeKind: "DERIVED", tags: ["safety"] },
  { canonicalKey: "ehs.fatalities", name: "Workforce Fatalities", description: "Number of work-related fatalities.", category: "Safety", unit: "count", dimensions: ["scope_node_id"], frameworks: [{ id: "BRSR", ref: "P3 Q11" }, { id: "GRI", ref: "403-9" }], dataType: "NUMERIC", computeKind: "EXTRACTED", tags: ["safety"] },
  { canonicalKey: "people.training.hours_per_fte", name: "Training Hours per FTE", description: "Average training hours per FTE per year.", category: "People", unit: "hrs", dimensions: ["scope_node_id"], frameworks: [{ id: "BRSR", ref: "P3 Q6" }, { id: "GRI", ref: "404-1" }, { id: "BRSR_CORE", ref: "K-6" }], dataType: "NUMERIC", computeKind: "DERIVED", tags: ["people"] },

  // Governance
  { canonicalKey: "gov.ethics.training_share", name: "Ethics Training Coverage", description: "% of employees who completed ethics training.", category: "Governance", unit: "%", dimensions: [], frameworks: [{ id: "BRSR", ref: "P1 Q1" }, { id: "GRI", ref: "205-2" }], dataType: "NUMERIC", computeKind: "DERIVED", tags: ["governance"] },
  { canonicalKey: "gov.bribery.cases", name: "Anti-bribery Cases", description: "Confirmed corruption incidents.", category: "Governance", unit: "count", dimensions: [], frameworks: [{ id: "BRSR", ref: "P1 Q5" }, { id: "GRI", ref: "205-3" }], dataType: "NUMERIC", computeKind: "EXTRACTED", tags: ["governance"] },
  { canonicalKey: "gov.csr.spend_inr", name: "CSR Spend", description: "Total CSR spend.", category: "Governance", unit: "INR", dimensions: [], frameworks: [{ id: "BRSR", ref: "P8 Q1" }], dataType: "NUMERIC", computeKind: "EXTRACTED", tags: ["csr"] },
];

export const mockMetricDefs: MetricDefinition[] = defs.map((d, i) => ({
  id: `metric_${String(i + 1).padStart(3, "0")}`,
  ...d,
}));

// Generate a curated set of metric events across sites and recent FY periods
const sites = [
  { id: "node_site_blr_hq", name: "Bengaluru HQ" },
  { id: "node_site_tn_solar", name: "TN Solar 50MW" },
  { id: "node_site_ka_wind", name: "Karnataka Wind 80MW" },
  { id: "node_site_mh_solar", name: "Maharashtra Solar 100MW" },
  { id: "node_site_gj_wind", name: "Gujarat Wind 120MW" },
];

const fy = "FY24-25";
const periodStart = "2024-04-01";
const periodEnd = "2025-03-31";

const eventTemplates: { metricKey: string; baseValue: number; unit: string; varBy?: number }[] = [
  { metricKey: "electricity.consumption.kwh", baseValue: 4_120_000, unit: "kWh", varBy: 0.6 },
  { metricKey: "diesel.consumption.l", baseValue: 14_220, unit: "L", varBy: 0.5 },
  { metricKey: "energy.consumption.mwh", baseValue: 4_280, unit: "MWh", varBy: 0.6 },
  { metricKey: "energy.renewable.share", baseValue: 0.62, unit: "%" },
  { metricKey: "ghg.scope1.tco2e", baseValue: 412, unit: "tCO2e", varBy: 0.5 },
  { metricKey: "ghg.scope2.location.tco2e", baseValue: 3_380, unit: "tCO2e", varBy: 0.6 },
  { metricKey: "ghg.scope2.market.tco2e", baseValue: 2_240, unit: "tCO2e", varBy: 0.6 },
  { metricKey: "water.withdrawal.kl", baseValue: 18_440, unit: "kL", varBy: 0.4 },
  { metricKey: "water.recycled.share", baseValue: 0.41, unit: "%" },
  { metricKey: "waste.hazardous.t", baseValue: 18.4, unit: "t", varBy: 0.3 },
  { metricKey: "people.fte.total", baseValue: 412, unit: "FTE" },
  { metricKey: "people.diversity.female_share", baseValue: 0.36, unit: "%" },
  { metricKey: "ehs.ltifr", baseValue: 0.18, unit: "per 1M hrs" },
  { metricKey: "ehs.fatalities", baseValue: 0, unit: "count" },
  { metricKey: "people.training.hours_per_fte", baseValue: 22, unit: "hrs" },
];

const metricNameByKey = new Map(mockMetricDefs.map((d) => [d.canonicalKey, d.name]));

const events: MetricEvent[] = [];
let evCounter = 0;
for (const site of sites) {
  for (const tpl of eventTemplates) {
    const variance = tpl.varBy ?? 0;
    const value =
      tpl.baseValue *
      (1 + (Math.random() - 0.5) * variance * (site.id === "node_site_blr_hq" ? 0.4 : 1));
    events.push({
      id: `mev_${String(evCounter + 1).padStart(4, "0")}`,
      metricKey: tpl.metricKey,
      metricName: metricNameByKey.get(tpl.metricKey) ?? tpl.metricKey,
      scopeNodeId: site.id,
      scopeNodeName: site.name,
      periodStart,
      periodEnd,
      fy,
      value: Math.round(value * 100) / 100,
      unit: tpl.unit,
      status: Math.random() > 0.15 ? "APPROVED" : "EXTRACTED",
      source: tpl.metricKey.includes("kwh") || tpl.metricKey.includes("diesel") ? "EXTRACTED" : "DERIVED",
      sourceFileId: tpl.metricKey.includes("kwh") ? "file_001" : undefined,
      confidence: 0.85 + Math.random() * 0.14,
      createdAt: "2025-05-12T10:23:00Z",
      updatedAt: "2026-04-18T14:22:00Z",
    });
    evCounter++;
  }
}

export const mockMetricEvents: MetricEvent[] = events;
