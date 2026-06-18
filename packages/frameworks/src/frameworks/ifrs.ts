/**
 * IFRS Sustainability Disclosure Standards.
 *  - IFRS S1: General Requirements for Disclosure of Sustainability-related Financial Information
 *  - IFRS S2: Climate-related Disclosures (mandates Scope 1 + 2 + 3 and industry-based metrics)
 *
 * Section IDs follow the official paragraph numbers in the Standards.
 */

export type IfrsStandard = "S1" | "S2";

export interface IfrsDisclosure {
  section_id: string; // canonical paragraph reference, e.g. "S2.29(a)"
  standard: IfrsStandard;
  topic: string;
  paragraph: string;
  question_text: string;
  response_type: "TEXT" | "TABLE" | "NUMERIC";
  unit?: string;
  is_mandatory: boolean;
  mapped_canonical_keys: string[];
  narrative_template: string | null;
}

function i(p: IfrsDisclosure): IfrsDisclosure {
  return p;
}

const SCOPE3_KEYS = Array.from({ length: 15 }, (_, k) => `scope3_cat${k + 1}_tco2e`);

// ---------------------------------------------------------------------------
// IFRS S1 — General sustainability disclosures
// ---------------------------------------------------------------------------

export const IFRS_S1_DISCLOSURES: IfrsDisclosure[] = [
  i({
    section_id: "S1.27",
    standard: "S1",
    topic: "Governance",
    paragraph: "27",
    question_text:
      "Disclosure of governance processes, controls and procedures used to monitor, manage and oversee sustainability-related risks and opportunities.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  i({
    section_id: "S1.28",
    standard: "S1",
    topic: "Governance",
    paragraph: "28",
    question_text:
      "Identification of the body or individual within the entity with responsibility for oversight of sustainability-related risks and opportunities.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["board_size", "independent_directors_count"],
    narrative_template: null,
  }),
  i({
    section_id: "S1.30",
    standard: "S1",
    topic: "Strategy",
    paragraph: "30",
    question_text:
      "Disclosure of sustainability-related risks and opportunities reasonably expected to affect prospects.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["enterprise_risks_count"],
    narrative_template: null,
  }),
  i({
    section_id: "S1.33",
    standard: "S1",
    topic: "Strategy",
    paragraph: "33",
    question_text:
      "Disclosure of the current and anticipated effects of sustainability-related risks and opportunities on business model and value chain.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  i({
    section_id: "S1.34",
    standard: "S1",
    topic: "Strategy",
    paragraph: "34",
    question_text:
      "Disclosure of the entity's strategy for addressing each sustainability-related risk and opportunity.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  i({
    section_id: "S1.43",
    standard: "S1",
    topic: "Risk Management",
    paragraph: "43",
    question_text:
      "Disclosure of processes used to identify, assess, prioritise and monitor sustainability-related risks.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  i({
    section_id: "S1.46",
    standard: "S1",
    topic: "Metrics & Targets",
    paragraph: "46",
    question_text:
      "Disclosure of metrics used to measure and monitor sustainability-related risks and opportunities.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  i({
    section_id: "S1.51",
    standard: "S1",
    topic: "Metrics & Targets",
    paragraph: "51",
    question_text: "Disclosure of targets set and progress against them.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// IFRS S2 — Climate-related disclosures
// ---------------------------------------------------------------------------

export const IFRS_S2_DISCLOSURES: IfrsDisclosure[] = [
  i({
    section_id: "S2.6",
    standard: "S2",
    topic: "Governance",
    paragraph: "6",
    question_text:
      "Disclosure of governance processes, controls and procedures used to monitor, manage and oversee climate-related risks and opportunities.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  i({
    section_id: "S2.9",
    standard: "S2",
    topic: "Strategy",
    paragraph: "9",
    question_text:
      "Disclosure of climate-related risks and opportunities reasonably expected to affect prospects, including transition and physical risks.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["climate_risks_identified_count"],
    narrative_template: null,
  }),
  i({
    section_id: "S2.13",
    standard: "S2",
    topic: "Strategy - resilience",
    paragraph: "13",
    question_text:
      "Disclosure of the resilience of the entity's strategy and business model to climate-related changes, developments and uncertainties, including scenario analysis.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["tcfd_scenarios_used"],
    narrative_template: null,
  }),
  i({
    section_id: "S2.25",
    standard: "S2",
    topic: "Risk Management",
    paragraph: "25",
    question_text:
      "Disclosure of processes used to identify, assess, prioritise and monitor climate-related risks.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["climate_risks_identified_count"],
    narrative_template: null,
  }),
  i({
    section_id: "S2.29(a)",
    standard: "S2",
    topic: "Metrics - GHG emissions Scope 1",
    paragraph: "29(a)",
    question_text:
      "Disclosure of absolute gross Scope 1 GHG emissions for the reporting period in metric tonnes of CO2 equivalent.",
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
      "Absolute gross Scope 1 GHG emissions were {{metric.scope1_total_tco2e}} tCO2e for the period.",
  }),
  i({
    section_id: "S2.29(b)",
    standard: "S2",
    topic: "Metrics - GHG emissions Scope 2",
    paragraph: "29(b)",
    question_text:
      "Disclosure of absolute gross Scope 2 GHG emissions for the reporting period in metric tonnes of CO2 equivalent (location-based; market-based as alternative).",
    response_type: "TABLE",
    unit: "tco2e",
    is_mandatory: true,
    mapped_canonical_keys: ["scope2_location_tco2e", "scope2_market_tco2e"],
    narrative_template:
      "Scope 2 (location-based) emissions: {{metric.scope2_location_tco2e}} tCO2e. Scope 2 (market-based): {{metric.scope2_market_tco2e}} tCO2e.",
  }),
  i({
    section_id: "S2.29(c)",
    standard: "S2",
    topic: "Metrics - GHG emissions Scope 3",
    paragraph: "29(c)",
    question_text:
      "Disclosure of absolute gross Scope 3 GHG emissions for the reporting period in metric tonnes of CO2 equivalent, disaggregated by the 15 categories of the GHG Protocol Scope 3 Standard.",
    response_type: "TABLE",
    unit: "tco2e",
    is_mandatory: true,
    mapped_canonical_keys: SCOPE3_KEYS,
    narrative_template:
      "Scope 3 emissions across all 15 categories: {{calc.scope3_total}} tCO2e.",
  }),
  i({
    section_id: "S2.29(d)",
    standard: "S2",
    topic: "Metrics - Industry-based",
    paragraph: "29(d)",
    question_text:
      "Industry-based metrics associated with particular business models, activities or other common features that characterise participation in the industry.",
    response_type: "TABLE",
    is_mandatory: true,
    // S2.29(d) requires SASB-derived, industry-specific metrics. The
    // canonical layer cannot enumerate all of them generically — the
    // sector resolver (see SASB_DISCLOSURES) supplies the actual list
    // at runtime. We surface the most universal intensity metrics here
    // and rely on getSasbBySector() at report time.
    mapped_canonical_keys: [
      "ghg_intensity_per_unit_output",
      "ghg_intensity_per_revenue",
      "energy_intensity_per_revenue",
      "water_intensity_per_revenue",
    ],
    narrative_template: null,
  }),
  i({
    section_id: "S2.29(e)",
    standard: "S2",
    topic: "Metrics - Transition risks",
    paragraph: "29(e)",
    question_text:
      "Amount and percentage of assets or business activities vulnerable to climate-related transition risks.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  i({
    section_id: "S2.29(f)",
    standard: "S2",
    topic: "Metrics - Physical risks",
    paragraph: "29(f)",
    question_text:
      "Amount and percentage of assets or business activities vulnerable to climate-related physical risks.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  i({
    section_id: "S2.29(g)",
    standard: "S2",
    topic: "Metrics - Climate-related opportunities",
    paragraph: "29(g)",
    question_text:
      "Amount and percentage of assets or business activities aligned with climate-related opportunities.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["electricity_from_renewable_kwh"],
    narrative_template: null,
  }),
  i({
    section_id: "S2.29(h)",
    standard: "S2",
    topic: "Metrics - Capital deployment",
    paragraph: "29(h)",
    question_text:
      "Amount of capital expenditure, financing or investment deployed toward climate-related risks and opportunities.",
    response_type: "NUMERIC",
    unit: "inr",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  i({
    section_id: "S2.33",
    standard: "S2",
    topic: "Targets",
    paragraph: "33",
    question_text:
      "Disclosure of climate-related targets set, and progress made against them.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["scope1_total_tco2e", "scope2_location_tco2e", "electricity_from_renewable_kwh"],
    narrative_template: null,
  }),
];
