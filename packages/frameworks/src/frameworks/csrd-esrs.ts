/**
 * CSRD / ESRS — European Sustainability Reporting Standards (EFRAG, 2023).
 * 12 standards: ESRS 1, 2 (cross-cutting) + E1-E5 (environment) + S1-S4 (social) + G1 (governance).
 */

export type EsrsCategory = "CrossCutting" | "Environment" | "Social" | "Governance";

export interface EsrsDisclosure {
  section_id: string; // e.g. "ESRS E1-5"
  standard_code: string; // "ESRS E1"
  standard_name: string;
  category: EsrsCategory;
  disclosure_requirement: string; // e.g. "E1-5"
  question_text: string;
  response_type: "TEXT" | "TABLE" | "NUMERIC" | "PERCENTAGE";
  unit?: string;
  is_mandatory: boolean;
  mapped_canonical_keys: string[];
  narrative_template: string | null;
}

function e(p: EsrsDisclosure): EsrsDisclosure {
  return p;
}

const SCOPE3_KEYS = Array.from({ length: 15 }, (_, k) => `scope3_cat${k + 1}_tco2e`);

// ---- Cross-cutting (ESRS 1, 2)
const CROSS_CUTTING: EsrsDisclosure[] = [
  e({
    section_id: "ESRS 1-1",
    standard_code: "ESRS 1",
    standard_name: "General requirements",
    category: "CrossCutting",
    disclosure_requirement: "1-1",
    question_text: "Categories of ESRS Standards, sustainability statements: general requirements.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS 2-BP-1",
    standard_code: "ESRS 2",
    standard_name: "General disclosures",
    category: "CrossCutting",
    disclosure_requirement: "BP-1",
    question_text: "Basis for preparation: general basis for preparation of sustainability statements.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS 2-GOV-1",
    standard_code: "ESRS 2",
    standard_name: "General disclosures",
    category: "CrossCutting",
    disclosure_requirement: "GOV-1",
    question_text: "Role of administrative, management and supervisory bodies.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [
      "board_size",
      "independent_directors_count",
      "women_directors_count",
      "board_meetings_count",
      "board_attendance_pct",
    ],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS 2-SBM-1",
    standard_code: "ESRS 2",
    standard_name: "General disclosures",
    category: "CrossCutting",
    disclosure_requirement: "SBM-1",
    question_text:
      "Strategy, business model and value chain: market position, products, services, customer groups.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS 2-IRO-1",
    standard_code: "ESRS 2",
    standard_name: "General disclosures",
    category: "CrossCutting",
    disclosure_requirement: "IRO-1",
    question_text:
      "Description of the process to identify and assess material impacts, risks and opportunities.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["enterprise_risks_count"],
    narrative_template: null,
  }),
];

// ---- E1: Climate change
const E1: EsrsDisclosure[] = [
  e({
    section_id: "ESRS E1-1",
    standard_code: "ESRS E1",
    standard_name: "Climate change",
    category: "Environment",
    disclosure_requirement: "E1-1",
    question_text: "Transition plan for climate change mitigation.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS E1-4",
    standard_code: "ESRS E1",
    standard_name: "Climate change",
    category: "Environment",
    disclosure_requirement: "E1-4",
    question_text: "Targets related to climate change mitigation and adaptation.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["scope1_total_tco2e", "scope2_location_tco2e"],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS E1-5",
    standard_code: "ESRS E1",
    standard_name: "Climate change",
    category: "Environment",
    disclosure_requirement: "E1-5",
    question_text: "Energy consumption and mix.",
    response_type: "TABLE",
    unit: "gj",
    is_mandatory: true,
    mapped_canonical_keys: [
      "electricity_kwh",
      "electricity_from_renewable_kwh",
      "electricity_from_grid_kwh",
      "diesel_l",
      "petrol_l",
      "lpg_kg",
      "lng_kg",
      "png_scm",
      "coal_tonnes",
      "biomass_tonnes",
      "total_energy_consumed_gj",
    ],
    narrative_template:
      "Total energy consumed during the period: {{metric.total_energy_consumed_gj}} GJ; renewable share by source disclosed in the data table.",
  }),
  e({
    section_id: "ESRS E1-6",
    standard_code: "ESRS E1",
    standard_name: "Climate change",
    category: "Environment",
    disclosure_requirement: "E1-6",
    question_text: "Gross Scopes 1, 2, 3 and Total GHG emissions.",
    response_type: "TABLE",
    unit: "tco2e",
    is_mandatory: true,
    mapped_canonical_keys: [
      "scope1_total_tco2e",
      "scope2_location_tco2e",
      "scope2_market_tco2e",
      ...SCOPE3_KEYS,
    ],
    narrative_template:
      "Scope 1: {{metric.scope1_total_tco2e}} tCO2e; Scope 2 (location-based): {{metric.scope2_location_tco2e}} tCO2e; Scope 2 (market-based): {{metric.scope2_market_tco2e}} tCO2e; Scope 3: {{calc.scope3_total}} tCO2e.",
  }),
  e({
    section_id: "ESRS E1-7",
    standard_code: "ESRS E1",
    standard_name: "Climate change",
    category: "Environment",
    disclosure_requirement: "E1-7",
    question_text: "GHG removals and storage projects.",
    response_type: "TABLE",
    unit: "tco2e",
    is_mandatory: false,
    mapped_canonical_keys: ["land_restored_ha"],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS E1-8",
    standard_code: "ESRS E1",
    standard_name: "Climate change",
    category: "Environment",
    disclosure_requirement: "E1-8",
    question_text: "Internal carbon pricing.",
    response_type: "TEXT",
    is_mandatory: false,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
];

// ---- E2: Pollution
const E2: EsrsDisclosure[] = [
  e({
    section_id: "ESRS E2-4",
    standard_code: "ESRS E2",
    standard_name: "Pollution",
    category: "Environment",
    disclosure_requirement: "E2-4",
    question_text: "Pollution of air, water and soil.",
    response_type: "TABLE",
    unit: "kg",
    is_mandatory: true,
    mapped_canonical_keys: ["nox_kg", "sox_kg", "pm_kg", "voc_kg", "ods_kg"],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS E2-5",
    standard_code: "ESRS E2",
    standard_name: "Pollution",
    category: "Environment",
    disclosure_requirement: "E2-5",
    question_text: "Substances of concern and substances of very high concern.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
];

// ---- E3: Water and marine
const E3: EsrsDisclosure[] = [
  e({
    section_id: "ESRS E3-4",
    standard_code: "ESRS E3",
    standard_name: "Water and marine resources",
    category: "Environment",
    disclosure_requirement: "E3-4",
    question_text: "Water consumption.",
    response_type: "TABLE",
    unit: "kl",
    is_mandatory: true,
    mapped_canonical_keys: [
      "water_withdrawn_total_kl",
      "water_consumed_kl",
      "water_discharged_kl",
      "water_recycled_kl",
    ],
    narrative_template:
      "Water withdrawn: {{metric.water_withdrawn_total_kl}} KL; consumed: {{metric.water_consumed_kl}} KL; recycled: {{metric.water_recycled_kl}} KL.",
  }),
];

// ---- E4: Biodiversity
const E4: EsrsDisclosure[] = [
  e({
    section_id: "ESRS E4-5",
    standard_code: "ESRS E4",
    standard_name: "Biodiversity and ecosystems",
    category: "Environment",
    disclosure_requirement: "E4-5",
    question_text: "Impact metrics related to biodiversity and ecosystem change.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["protected_area_sqkm", "land_disturbed_ha", "land_restored_ha"],
    narrative_template: null,
  }),
];

// ---- E5: Resource use and circular economy
const E5: EsrsDisclosure[] = [
  e({
    section_id: "ESRS E5-4",
    standard_code: "ESRS E5",
    standard_name: "Resource use and circular economy",
    category: "Environment",
    disclosure_requirement: "E5-4",
    question_text: "Resource inflows.",
    response_type: "TABLE",
    unit: "tonnes",
    is_mandatory: true,
    mapped_canonical_keys: ["virgin_materials_tonnes", "recycled_materials_tonnes", "renewable_materials_tonnes"],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS E5-5",
    standard_code: "ESRS E5",
    standard_name: "Resource use and circular economy",
    category: "Environment",
    disclosure_requirement: "E5-5",
    question_text: "Resource outflows including waste.",
    response_type: "TABLE",
    unit: "kg",
    is_mandatory: true,
    mapped_canonical_keys: [
      "waste_hazardous_kg",
      "waste_non_hazardous_kg",
      "waste_recycled_kg",
      "waste_to_landfill_kg",
      "waste_to_incineration_kg",
      "e_waste_kg",
      "plastic_waste_kg",
    ],
    narrative_template: null,
  }),
];

// ---- S1: Own workforce
const S1: EsrsDisclosure[] = [
  e({
    section_id: "ESRS S1-6",
    standard_code: "ESRS S1",
    standard_name: "Own workforce",
    category: "Social",
    disclosure_requirement: "S1-6",
    question_text: "Characteristics of the undertaking's employees.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [
      "employee_count_total",
      "employee_count_male",
      "employee_count_female",
      "employee_count_perm",
      "employee_count_temp",
    ],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS S1-7",
    standard_code: "ESRS S1",
    standard_name: "Own workforce",
    category: "Social",
    disclosure_requirement: "S1-7",
    question_text: "Characteristics of non-employees in the undertaking's own workforce.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["employee_count_contract"],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS S1-9",
    standard_code: "ESRS S1",
    standard_name: "Own workforce",
    category: "Social",
    disclosure_requirement: "S1-9",
    question_text: "Diversity metrics.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [
      "women_in_workforce_pct",
      "women_in_management_pct",
      "pwd_in_workforce_pct",
      "employee_count_by_age_bracket",
    ],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS S1-13",
    standard_code: "ESRS S1",
    standard_name: "Own workforce",
    category: "Social",
    disclosure_requirement: "S1-13",
    question_text: "Training and skills development metrics.",
    response_type: "TABLE",
    unit: "hours",
    is_mandatory: true,
    mapped_canonical_keys: ["training_hours_total", "training_hours_per_employee", "training_coverage_pct"],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS S1-14",
    standard_code: "ESRS S1",
    standard_name: "Own workforce",
    category: "Social",
    disclosure_requirement: "S1-14",
    question_text: "Health and safety metrics.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["ltifr", "trifr", "fatality_count_employees", "fatality_count_contractors", "occupational_disease_cases"],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS S1-16",
    standard_code: "ESRS S1",
    standard_name: "Own workforce",
    category: "Social",
    disclosure_requirement: "S1-16",
    question_text: "Remuneration metrics (pay gap and total remuneration).",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [
      "gender_pay_gap_pct",
      "ceo_to_worker_pay_ratio",
      "median_remuneration_male",
      "median_remuneration_female",
    ],
    narrative_template:
      "Gender pay gap: {{metric.gender_pay_gap_pct}}%. CEO to median worker pay ratio: {{metric.ceo_to_worker_pay_ratio}}.",
  }),
  e({
    section_id: "ESRS S1-17",
    standard_code: "ESRS S1",
    standard_name: "Own workforce",
    category: "Social",
    disclosure_requirement: "S1-17",
    question_text: "Incidents, complaints and severe human-rights impacts.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [
      "human_rights_complaints_received",
      "human_rights_complaints_resolved",
      "discrimination_complaints",
      "child_labour_incidents",
      "forced_labour_incidents",
    ],
    narrative_template: null,
  }),
];

// ---- S2: Workers in value chain
const S2: EsrsDisclosure[] = [
  e({
    section_id: "ESRS S2-1",
    standard_code: "ESRS S2",
    standard_name: "Workers in the value chain",
    category: "Social",
    disclosure_requirement: "S2-1",
    question_text: "Policies related to value-chain workers.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS S2-4",
    standard_code: "ESRS S2",
    standard_name: "Workers in the value chain",
    category: "Social",
    disclosure_requirement: "S2-4",
    question_text: "Taking action on material impacts on value-chain workers.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["child_labour_incidents", "forced_labour_incidents"],
    narrative_template: null,
  }),
];

// ---- S3: Affected communities
const S3: EsrsDisclosure[] = [
  e({
    section_id: "ESRS S3-1",
    standard_code: "ESRS S3",
    standard_name: "Affected communities",
    category: "Social",
    disclosure_requirement: "S3-1",
    question_text: "Policies related to affected communities.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS S3-4",
    standard_code: "ESRS S3",
    standard_name: "Affected communities",
    category: "Social",
    disclosure_requirement: "S3-4",
    question_text: "Taking action on material impacts on affected communities.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["csr_spend_inr", "csr_beneficiaries_count", "displacement_count", "local_communities_engaged"],
    narrative_template: null,
  }),
];

// ---- S4: Consumers and end-users
const S4: EsrsDisclosure[] = [
  e({
    section_id: "ESRS S4-1",
    standard_code: "ESRS S4",
    standard_name: "Consumers and end-users",
    category: "Social",
    disclosure_requirement: "S4-1",
    question_text: "Policies related to consumers and end-users.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS S4-4",
    standard_code: "ESRS S4",
    standard_name: "Consumers and end-users",
    category: "Social",
    disclosure_requirement: "S4-4",
    question_text: "Taking action on material impacts on consumers and end-users.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [
      "customer_complaints_received",
      "customer_complaints_resolved",
      "product_recall_count",
      "customer_satisfaction_score",
      "data_breach_count",
      "data_subjects_affected",
    ],
    narrative_template: null,
  }),
];

// ---- G1: Business conduct
const G1: EsrsDisclosure[] = [
  e({
    section_id: "ESRS G1-1",
    standard_code: "ESRS G1",
    standard_name: "Business conduct",
    category: "Governance",
    disclosure_requirement: "G1-1",
    question_text: "Corporate culture and business conduct policies.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS G1-3",
    standard_code: "ESRS G1",
    standard_name: "Business conduct",
    category: "Governance",
    disclosure_requirement: "G1-3",
    question_text: "Prevention and detection of corruption and bribery.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["anticorruption_training_pct", "corruption_cases_disciplinary"],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS G1-4",
    standard_code: "ESRS G1",
    standard_name: "Business conduct",
    category: "Governance",
    disclosure_requirement: "G1-4",
    question_text: "Incidents of corruption or bribery.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["corruption_cases_disciplinary", "whistleblower_cases_count"],
    narrative_template: null,
  }),
  e({
    section_id: "ESRS G1-5",
    standard_code: "ESRS G1",
    standard_name: "Business conduct",
    category: "Governance",
    disclosure_requirement: "G1-5",
    question_text: "Political influence and lobbying activities.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["political_contributions_inr"],
    narrative_template: null,
  }),
];

export const ESRS_DISCLOSURES: EsrsDisclosure[] = [
  ...CROSS_CUTTING,
  ...E1,
  ...E2,
  ...E3,
  ...E4,
  ...E5,
  ...S1,
  ...S2,
  ...S3,
  ...S4,
  ...G1,
];

export function getEsrsByStandard(code: string): EsrsDisclosure[] {
  return ESRS_DISCLOSURES.filter((d) => d.standard_code === code);
}
