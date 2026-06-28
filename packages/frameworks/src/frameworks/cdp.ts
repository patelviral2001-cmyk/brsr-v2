/**
 * CDP — Carbon Disclosure Project response modules (Climate, Water, Forests).
 *
 * CDP section IDs follow the questionnaire structure (e.g. C8.2a, W1.2b, F1.5).
 * We model the top reportable sections — each maps to one or more canonical metrics.
 */

export type CdpModule = "CLIMATE" | "WATER" | "FORESTS";

export interface CdpDisclosure {
  section_id: string;
  module: CdpModule;
  section_name: string;
  question_text: string;
  response_type: "TEXT" | "TABLE" | "NUMERIC" | "BOOLEAN";
  unit?: string;
  is_mandatory: boolean;
  mapped_canonical_keys: string[];
  narrative_template: string | null;
}

function c(p: CdpDisclosure): CdpDisclosure {
  return p;
}

const SCOPE3_KEYS = Array.from({ length: 15 }, (_, k) => `scope3_cat${k + 1}_tco2e`);

// ---------------------------------------------------------------------------
// CDP Climate Change questionnaire
// ---------------------------------------------------------------------------

export const CDP_CLIMATE_DISCLOSURES: CdpDisclosure[] = [
  c({
    section_id: "C1.1a",
    module: "CLIMATE",
    section_name: "Governance",
    question_text: "Identify the position(s) (do not include any names) of the individual(s) with the highest-level responsibility for climate-related issues.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["board_size", "independent_directors_count"],
    narrative_template: null,
  }),
  c({
    section_id: "C1.2",
    module: "CLIMATE",
    section_name: "Governance",
    question_text: "Provide the highest management-level position(s) or committee(s) with responsibility for climate-related issues.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  c({
    section_id: "C2.1a",
    module: "CLIMATE",
    section_name: "Risks and Opportunities",
    question_text:
      "Identify climate-related risks and opportunities with potential to have a substantive financial or strategic impact on your business.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["climate_risks_identified_count"],
    narrative_template: null,
  }),
  c({
    section_id: "C3.2",
    module: "CLIMATE",
    section_name: "Business Strategy",
    question_text: "Does your organisation use climate-related scenario analysis to inform its strategy?",
    response_type: "BOOLEAN",
    is_mandatory: true,
    mapped_canonical_keys: ["tcfd_scenarios_used"],
    narrative_template: null,
  }),
  c({
    section_id: "C4.1a",
    module: "CLIMATE",
    section_name: "Targets and Performance",
    question_text: "Provide details of your absolute emissions target(s) and progress against those targets.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["scope1_total_tco2e", "scope2_location_tco2e", "scope2_market_tco2e"],
    narrative_template: null,
  }),
  c({
    section_id: "C6.1",
    module: "CLIMATE",
    section_name: "Emissions Data",
    question_text: "What were your organisation's gross global Scope 1 emissions in metric tons of CO2e?",
    response_type: "NUMERIC",
    unit: "tco2e",
    is_mandatory: true,
    mapped_canonical_keys: [
      "scope1_total_tco2e",
      "scope1_stationary_tco2e",
      "scope1_mobile_tco2e",
      "scope1_process_tco2e",
      "scope1_fugitive_tco2e",
    ],
    narrative_template:
      "Gross global Scope 1 emissions: {{metric.scope1_total_tco2e}} tCO2e.",
  }),
  c({
    section_id: "C6.3",
    module: "CLIMATE",
    section_name: "Emissions Data",
    question_text:
      "What were your organisation's gross global Scope 2 emissions in metric tons of CO2e? (location-based and market-based).",
    response_type: "TABLE",
    unit: "tco2e",
    is_mandatory: true,
    mapped_canonical_keys: ["scope2_location_tco2e", "scope2_market_tco2e"],
    narrative_template: null,
  }),
  c({
    section_id: "C6.5",
    module: "CLIMATE",
    section_name: "Emissions Data",
    question_text:
      "Account for your organisation's gross global Scope 3 emissions, disclosing and explaining any exclusions.",
    response_type: "TABLE",
    unit: "tco2e",
    is_mandatory: true,
    mapped_canonical_keys: SCOPE3_KEYS,
    narrative_template: null,
  }),
  c({
    section_id: "C6.10",
    module: "CLIMATE",
    section_name: "Emissions Data",
    question_text: "Describe your gross global combined Scope 1 and 2 emissions for the reporting year in metric tons CO2e per unit currency total revenue.",
    response_type: "NUMERIC",
    unit: "tco2e_per_inr_crore",
    is_mandatory: true,
    mapped_canonical_keys: ["ghg_intensity_per_revenue"],
    narrative_template: null,
  }),
  c({
    section_id: "C8.2a",
    module: "CLIMATE",
    section_name: "Energy",
    question_text:
      "Report your organisation's energy consumption totals (excluding feedstocks) in MWh.",
    response_type: "TABLE",
    unit: "mwh",
    is_mandatory: true,
    mapped_canonical_keys: [
      "electricity_kwh",
      "electricity_from_grid_kwh",
      "electricity_from_renewable_kwh",
      "diesel_l",
      "petrol_l",
      "lpg_kg",
      "lng_kg",
      "png_scm",
      "coal_tonnes",
      "biomass_tonnes",
      "steam_purchased_gj",
      "total_energy_consumed_gj",
    ],
    narrative_template:
      "Total energy consumed in the reporting period: {{metric.total_energy_consumed_gj}} GJ, of which {{metric.electricity_from_renewable_kwh}} kWh was from renewable sources.",
  }),
  c({
    section_id: "C9.1",
    module: "CLIMATE",
    section_name: "Additional Metrics",
    question_text: "Provide any additional climate-related metrics relevant to your business.",
    response_type: "TABLE",
    is_mandatory: false,
    mapped_canonical_keys: ["ghg_intensity_per_unit_output", "energy_intensity_per_revenue"],
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// CDP Water Security
// ---------------------------------------------------------------------------

export const CDP_WATER_DISCLOSURES: CdpDisclosure[] = [
  c({
    section_id: "W1.1",
    module: "WATER",
    section_name: "Current State",
    question_text:
      "Rate the importance (current and future) of water quality and water quantity to the success of your business.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  c({
    section_id: "W1.2b",
    module: "WATER",
    section_name: "Current State",
    question_text:
      "What are the total volumes of water withdrawn, discharged, and consumed across all your operations, and how do these volumes compare to the previous reporting year?",
    response_type: "TABLE",
    unit: "kl",
    is_mandatory: true,
    mapped_canonical_keys: [
      "water_withdrawn_total_kl",
      "water_discharged_kl",
      "water_consumed_kl",
      "water_recycled_kl",
    ],
    narrative_template:
      "Total water withdrawn: {{metric.water_withdrawn_total_kl}} KL; discharged: {{metric.water_discharged_kl}} KL; consumed: {{metric.water_consumed_kl}} KL.",
  }),
  c({
    section_id: "W1.2h",
    module: "WATER",
    section_name: "Current State",
    question_text: "Provide total water withdrawal data by source.",
    response_type: "TABLE",
    unit: "kl",
    is_mandatory: true,
    mapped_canonical_keys: [
      "water_withdrawn_kl_groundwater",
      "water_withdrawn_kl_surface",
      "water_withdrawn_kl_third_party",
      "water_withdrawn_kl_seawater",
      "water_withdrawn_kl_produced",
    ],
    narrative_template: null,
  }),
  c({
    section_id: "W3.3",
    module: "WATER",
    section_name: "Procedures",
    question_text:
      "Have you identified any water-related inherent risks with the potential to have a substantive financial or strategic impact on your business?",
    response_type: "BOOLEAN",
    is_mandatory: true,
    mapped_canonical_keys: ["climate_risks_identified_count"],
    narrative_template: null,
  }),
  c({
    section_id: "W6.1",
    module: "WATER",
    section_name: "Governance",
    question_text:
      "Does your organisation have a water policy?",
    response_type: "BOOLEAN",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  c({
    section_id: "W7.1",
    module: "WATER",
    section_name: "Business Strategy",
    question_text:
      "Are water-related issues integrated into any aspects of your long-term strategic business plan, and if so how?",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// CDP Forests
// ---------------------------------------------------------------------------

export const CDP_FORESTS_DISCLOSURES: CdpDisclosure[] = [
  c({
    section_id: "F1.1",
    module: "FORESTS",
    section_name: "Current State",
    question_text:
      "How does your organisation produce, use or sell forest-risk commodities?",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["virgin_materials_tonnes", "renewable_materials_tonnes"],
    narrative_template: null,
  }),
  c({
    section_id: "F1.5",
    module: "FORESTS",
    section_name: "Current State",
    question_text:
      "Does your organisation collect production and / or consumption data for forest-risk commodities?",
    response_type: "BOOLEAN",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  c({
    section_id: "F4.5",
    module: "FORESTS",
    section_name: "Risks and Opportunities",
    question_text:
      "Describe the actions taken to identify, assess, and respond to forest-related risks and opportunities.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["protected_area_sqkm", "land_disturbed_ha", "land_restored_ha"],
    narrative_template: null,
  }),
  c({
    section_id: "F6.1",
    module: "FORESTS",
    section_name: "Governance",
    question_text:
      "Does your organisation have a policy that includes forests-related issues, and if so, what does it cover?",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
];

export const CDP_DISCLOSURES: CdpDisclosure[] = [
  ...CDP_CLIMATE_DISCLOSURES,
  ...CDP_WATER_DISCLOSURES,
  ...CDP_FORESTS_DISCLOSURES,
];

export function getCdpByModule(m: CdpModule): CdpDisclosure[] {
  return CDP_DISCLOSURES.filter((d) => d.module === m);
}
