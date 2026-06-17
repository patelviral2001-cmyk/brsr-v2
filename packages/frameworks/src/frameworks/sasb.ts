/**
 * SASB Industry Standards — top-10 material metrics per India-relevant sector.
 *
 * SASB codes follow the canonical format: <SECTOR>-<TOPIC>-<NUMBER>
 *   IF = Infrastructure (RR = Renewable Resources)
 *   RT = Resource Transformation
 *   EM = Extractives & Minerals
 *   TC = Technology & Communications
 */

export interface SasbDisclosure {
  section_id: string; // canonical SASB code
  sector_code: string; // e.g. "RR-SE"
  sector_name: string;
  topic: string;
  question_text: string;
  response_type: "NUMERIC" | "TEXT" | "TABLE" | "PERCENTAGE";
  unit?: string;
  is_mandatory: boolean;
  mapped_canonical_keys: string[];
  narrative_template: string | null;
}

function s(p: SasbDisclosure): SasbDisclosure {
  return p;
}

// ---------------------------------------------------------------------------
// Renewable Resources & Alternative Energy — Solar/Wind (RR-SE)
// ---------------------------------------------------------------------------

const RR_SE: SasbDisclosure[] = [
  s({
    section_id: "RR-SE-130a.1",
    sector_code: "RR-SE",
    sector_name: "Solar Technology & Project Developers",
    topic: "Energy Management",
    question_text: "Total energy consumed, % grid electricity, % renewable.",
    response_type: "TABLE",
    unit: "gj",
    is_mandatory: true,
    mapped_canonical_keys: ["total_energy_consumed_gj", "electricity_from_grid_kwh", "electricity_from_renewable_kwh"],
    narrative_template: null,
  }),
  s({
    section_id: "RR-SE-140a.1",
    sector_code: "RR-SE",
    sector_name: "Solar Technology & Project Developers",
    topic: "Water Management in Manufacturing",
    question_text: "Total water withdrawn / consumed, % in regions of High or Extremely High Baseline Water Stress.",
    response_type: "TABLE",
    unit: "kl",
    is_mandatory: true,
    mapped_canonical_keys: ["water_withdrawn_total_kl", "water_consumed_kl"],
    narrative_template: null,
  }),
  s({
    section_id: "RR-SE-150a.1",
    sector_code: "RR-SE",
    sector_name: "Solar Technology & Project Developers",
    topic: "Hazardous Waste Management",
    question_text: "Hazardous waste generated, % recycled.",
    response_type: "TABLE",
    unit: "kg",
    is_mandatory: true,
    mapped_canonical_keys: ["waste_hazardous_kg", "waste_recycled_kg"],
    narrative_template: null,
  }),
  s({
    section_id: "RR-SE-160a.1",
    sector_code: "RR-SE",
    sector_name: "Solar Technology & Project Developers",
    topic: "Ecological Impacts of Project Development",
    question_text: "Number and area of solar projects sited on land with significant biodiversity value.",
    response_type: "TABLE",
    unit: "ha",
    is_mandatory: true,
    mapped_canonical_keys: ["land_disturbed_ha", "protected_area_sqkm"],
    narrative_template: null,
  }),
  s({
    section_id: "RR-SE-410a.1",
    sector_code: "RR-SE",
    sector_name: "Solar Technology & Project Developers",
    topic: "Product End-of-Life Management",
    question_text: "Percentage of products sold that are recyclable or reusable.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    mapped_canonical_keys: ["recycled_materials_tonnes"],
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// Electrical & Electronic Equipment (RT-EE)
// ---------------------------------------------------------------------------

const RT_EE: SasbDisclosure[] = [
  s({
    section_id: "RT-EE-130a.1",
    sector_code: "RT-EE",
    sector_name: "Electrical & Electronic Equipment",
    topic: "Energy Management",
    question_text: "Total energy consumed, % grid electricity, % renewable.",
    response_type: "TABLE",
    unit: "gj",
    is_mandatory: true,
    mapped_canonical_keys: ["total_energy_consumed_gj", "electricity_from_grid_kwh", "electricity_from_renewable_kwh"],
    narrative_template: null,
  }),
  s({
    section_id: "RT-EE-150a.1",
    sector_code: "RT-EE",
    sector_name: "Electrical & Electronic Equipment",
    topic: "Hazardous Waste Management",
    question_text: "Amount of hazardous waste generated, % recycled.",
    response_type: "TABLE",
    unit: "kg",
    is_mandatory: true,
    mapped_canonical_keys: ["waste_hazardous_kg", "waste_recycled_kg", "e_waste_kg"],
    narrative_template: null,
  }),
  s({
    section_id: "RT-EE-410a.1",
    sector_code: "RT-EE",
    sector_name: "Electrical & Electronic Equipment",
    topic: "Product Lifecycle Management",
    question_text: "% of products by revenue containing IEC 62474 declarable substances.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  s({
    section_id: "RT-EE-410a.3",
    sector_code: "RT-EE",
    sector_name: "Electrical & Electronic Equipment",
    topic: "Product Lifecycle Management",
    question_text: "Revenue from renewable energy-related and energy efficiency-related products.",
    response_type: "NUMERIC",
    unit: "inr",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  s({
    section_id: "RT-EE-440a.1",
    sector_code: "RT-EE",
    sector_name: "Electrical & Electronic Equipment",
    topic: "Materials Sourcing",
    question_text: "Description of management of risks associated with use of critical materials.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["virgin_materials_tonnes", "recycled_materials_tonnes"],
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// Construction Materials (EM-CM)
// ---------------------------------------------------------------------------

const EM_CM: SasbDisclosure[] = [
  s({
    section_id: "EM-CM-110a.1",
    sector_code: "EM-CM",
    sector_name: "Construction Materials",
    topic: "GHG Emissions",
    question_text: "Gross global Scope 1 emissions, % covered under emissions-limiting regulations.",
    response_type: "TABLE",
    unit: "tco2e",
    is_mandatory: true,
    mapped_canonical_keys: ["scope1_total_tco2e", "scope1_process_tco2e", "scope1_stationary_tco2e"],
    narrative_template: null,
  }),
  s({
    section_id: "EM-CM-120a.1",
    sector_code: "EM-CM",
    sector_name: "Construction Materials",
    topic: "Air Quality",
    question_text: "Air emissions: NOx (excl. N2O), SOx, PM10, dioxins/furans, VOCs, PAHs, HAPs.",
    response_type: "TABLE",
    unit: "kg",
    is_mandatory: true,
    mapped_canonical_keys: ["nox_kg", "sox_kg", "pm_kg", "voc_kg"],
    narrative_template: null,
  }),
  s({
    section_id: "EM-CM-130a.1",
    sector_code: "EM-CM",
    sector_name: "Construction Materials",
    topic: "Energy Management",
    question_text: "Total energy consumed, % grid electricity, % alternative, % renewable.",
    response_type: "TABLE",
    unit: "gj",
    is_mandatory: true,
    mapped_canonical_keys: ["total_energy_consumed_gj", "electricity_from_renewable_kwh", "biomass_tonnes"],
    narrative_template: null,
  }),
  s({
    section_id: "EM-CM-140a.1",
    sector_code: "EM-CM",
    sector_name: "Construction Materials",
    topic: "Water Management",
    question_text: "Total fresh water withdrawn, % recycled, % in regions of High or Extremely High Baseline Water Stress.",
    response_type: "TABLE",
    unit: "kl",
    is_mandatory: true,
    mapped_canonical_keys: ["water_withdrawn_total_kl", "water_recycled_kl"],
    narrative_template: null,
  }),
  s({
    section_id: "EM-CM-150a.1",
    sector_code: "EM-CM",
    sector_name: "Construction Materials",
    topic: "Waste Management",
    question_text: "Amount of waste generated, % hazardous, % recycled.",
    response_type: "TABLE",
    unit: "kg",
    is_mandatory: true,
    mapped_canonical_keys: ["waste_hazardous_kg", "waste_non_hazardous_kg", "waste_recycled_kg"],
    narrative_template: null,
  }),
  s({
    section_id: "EM-CM-160a.1",
    sector_code: "EM-CM",
    sector_name: "Construction Materials",
    topic: "Biodiversity Impacts",
    question_text: "Description of environmental management policies and practices for active sites.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["protected_area_sqkm", "land_disturbed_ha", "land_restored_ha"],
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// Iron & Steel Producers (EM-IS)
// ---------------------------------------------------------------------------

const EM_IS: SasbDisclosure[] = [
  s({
    section_id: "EM-IS-110a.1",
    sector_code: "EM-IS",
    sector_name: "Iron & Steel Producers",
    topic: "GHG Emissions",
    question_text: "Gross global Scope 1 emissions, % covered under emissions-limiting regulations.",
    response_type: "TABLE",
    unit: "tco2e",
    is_mandatory: true,
    mapped_canonical_keys: ["scope1_total_tco2e", "scope1_process_tco2e"],
    narrative_template: null,
  }),
  s({
    section_id: "EM-IS-120a.1",
    sector_code: "EM-IS",
    sector_name: "Iron & Steel Producers",
    topic: "Air Quality",
    question_text: "Air emissions: CO, NOx (excl. N2O), SOx, PM10, manganese (MnO), lead (Pb), VOCs, PAHs.",
    response_type: "TABLE",
    unit: "kg",
    is_mandatory: true,
    mapped_canonical_keys: ["nox_kg", "sox_kg", "pm_kg", "voc_kg"],
    narrative_template: null,
  }),
  s({
    section_id: "EM-IS-130a.1",
    sector_code: "EM-IS",
    sector_name: "Iron & Steel Producers",
    topic: "Energy Management",
    question_text: "Total energy consumed, % grid electricity, % renewable. Total fuel consumed, % coal, % natural gas.",
    response_type: "TABLE",
    unit: "gj",
    is_mandatory: true,
    mapped_canonical_keys: ["total_energy_consumed_gj", "coal_tonnes", "lng_kg", "png_scm"],
    narrative_template: null,
  }),
  s({
    section_id: "EM-IS-140a.1",
    sector_code: "EM-IS",
    sector_name: "Iron & Steel Producers",
    topic: "Water Management",
    question_text: "Total fresh water withdrawn, % recycled, % in regions of High or Extremely High Baseline Water Stress.",
    response_type: "TABLE",
    unit: "kl",
    is_mandatory: true,
    mapped_canonical_keys: ["water_withdrawn_total_kl", "water_recycled_kl"],
    narrative_template: null,
  }),
  s({
    section_id: "EM-IS-150a.1",
    sector_code: "EM-IS",
    sector_name: "Iron & Steel Producers",
    topic: "Waste Management",
    question_text: "Amount of waste from manufacturing processes, % hazardous, % recycled.",
    response_type: "TABLE",
    unit: "kg",
    is_mandatory: true,
    mapped_canonical_keys: ["waste_hazardous_kg", "waste_recycled_kg"],
    narrative_template: null,
  }),
  s({
    section_id: "EM-IS-320a.1",
    sector_code: "EM-IS",
    sector_name: "Iron & Steel Producers",
    topic: "Workforce Health & Safety",
    question_text: "TRIR, fatality rate, near miss frequency rate for full-time and contract employees.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["trifr", "ltifr", "fatality_count_employees", "fatality_count_contractors", "near_miss_count"],
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// Industrial Machinery & Goods (RT-IG)
// ---------------------------------------------------------------------------

const RT_IG: SasbDisclosure[] = [
  s({
    section_id: "RT-IG-130a.1",
    sector_code: "RT-IG",
    sector_name: "Industrial Machinery & Goods",
    topic: "Energy Management",
    question_text: "Total energy consumed, % grid electricity, % renewable.",
    response_type: "TABLE",
    unit: "gj",
    is_mandatory: true,
    mapped_canonical_keys: ["total_energy_consumed_gj", "electricity_from_grid_kwh", "electricity_from_renewable_kwh"],
    narrative_template: null,
  }),
  s({
    section_id: "RT-IG-320a.1",
    sector_code: "RT-IG",
    sector_name: "Industrial Machinery & Goods",
    topic: "Employee Health & Safety",
    question_text: "TRIR, fatality rate, and near miss frequency rate.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["trifr", "ltifr", "fatality_count_employees"],
    narrative_template: null,
  }),
  s({
    section_id: "RT-IG-410a.1",
    sector_code: "RT-IG",
    sector_name: "Industrial Machinery & Goods",
    topic: "Fuel Economy & Emissions in Use-phase",
    question_text: "Sales-weighted fleet fuel efficiency for various equipment categories.",
    response_type: "NUMERIC",
    is_mandatory: true,
    mapped_canonical_keys: ["scope3_cat11_tco2e"],
    narrative_template: null,
  }),
  s({
    section_id: "RT-IG-440a.1",
    sector_code: "RT-IG",
    sector_name: "Industrial Machinery & Goods",
    topic: "Materials Sourcing",
    question_text: "Description of the management of risks associated with the use of critical materials.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["virgin_materials_tonnes", "recycled_materials_tonnes"],
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// Internet Media & Services (TC-IM)
// ---------------------------------------------------------------------------

const TC_IM: SasbDisclosure[] = [
  s({
    section_id: "TC-IM-130a.1",
    sector_code: "TC-IM",
    sector_name: "Internet Media & Services",
    topic: "Environmental Footprint of Hardware Infrastructure",
    question_text: "(1) Total energy consumed, (2) percentage grid electricity, (3) percentage renewable.",
    response_type: "TABLE",
    unit: "gj",
    is_mandatory: true,
    mapped_canonical_keys: ["total_energy_consumed_gj", "electricity_from_grid_kwh", "electricity_from_renewable_kwh"],
    narrative_template: null,
  }),
  s({
    section_id: "TC-IM-130a.2",
    sector_code: "TC-IM",
    sector_name: "Internet Media & Services",
    topic: "Environmental Footprint of Hardware Infrastructure",
    question_text: "Total water withdrawn / consumed, % in regions of High or Extremely High Baseline Water Stress.",
    response_type: "TABLE",
    unit: "kl",
    is_mandatory: true,
    mapped_canonical_keys: ["water_withdrawn_total_kl", "water_consumed_kl"],
    narrative_template: null,
  }),
  s({
    section_id: "TC-IM-220a.1",
    sector_code: "TC-IM",
    sector_name: "Internet Media & Services",
    topic: "Data Privacy, Advertising Standards & Freedom of Expression",
    question_text: "Description of policies and practices relating to behavioural advertising and user privacy.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["data_breach_count"],
    narrative_template: null,
  }),
  s({
    section_id: "TC-IM-230a.1",
    sector_code: "TC-IM",
    sector_name: "Internet Media & Services",
    topic: "Data Security",
    question_text: "(1) Number of data breaches, (2) % involving PII, (3) number of users affected.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["data_breach_count", "data_subjects_affected"],
    narrative_template: null,
  }),
  s({
    section_id: "TC-IM-330a.3",
    sector_code: "TC-IM",
    sector_name: "Internet Media & Services",
    topic: "Employee Recruitment, Inclusion & Performance",
    question_text: "Employee engagement as a percentage; representation of gender and ethnic groups across management, technical and all employees.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["women_in_workforce_pct", "women_in_management_pct"],
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// IT Services / Software & IT Services (TC-SI)
// ---------------------------------------------------------------------------

const TC_SI: SasbDisclosure[] = [
  s({
    section_id: "TC-SI-130a.1",
    sector_code: "TC-SI",
    sector_name: "Software & IT Services",
    topic: "Environmental Footprint of Hardware Infrastructure",
    question_text: "Total energy consumed, % grid electricity, % renewable.",
    response_type: "TABLE",
    unit: "gj",
    is_mandatory: true,
    mapped_canonical_keys: ["total_energy_consumed_gj", "electricity_from_grid_kwh", "electricity_from_renewable_kwh"],
    narrative_template: null,
  }),
  s({
    section_id: "TC-SI-130a.2",
    sector_code: "TC-SI",
    sector_name: "Software & IT Services",
    topic: "Environmental Footprint of Hardware Infrastructure",
    question_text: "Total water withdrawn / consumed, % in regions of High or Extremely High Baseline Water Stress.",
    response_type: "TABLE",
    unit: "kl",
    is_mandatory: true,
    mapped_canonical_keys: ["water_withdrawn_total_kl", "water_consumed_kl"],
    narrative_template: null,
  }),
  s({
    section_id: "TC-SI-220a.1",
    sector_code: "TC-SI",
    sector_name: "Software & IT Services",
    topic: "Data Privacy & Freedom of Expression",
    question_text: "Description of policies and practices relating to user privacy and freedom of expression.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  s({
    section_id: "TC-SI-230a.1",
    sector_code: "TC-SI",
    sector_name: "Software & IT Services",
    topic: "Data Security",
    question_text: "Number of data breaches, % involving personally identifiable information, number of users affected.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["data_breach_count", "data_subjects_affected"],
    narrative_template: null,
  }),
  s({
    section_id: "TC-SI-330a.2",
    sector_code: "TC-SI",
    sector_name: "Software & IT Services",
    topic: "Recruiting & Managing a Global, Diverse & Skilled Workforce",
    question_text: "Employee engagement as a percentage; representation of gender and racial/ethnic groups across employee categories.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["women_in_workforce_pct", "women_in_management_pct"],
    narrative_template: null,
  }),
];

export const SASB_DISCLOSURES: SasbDisclosure[] = [
  ...RR_SE,
  ...RT_EE,
  ...EM_CM,
  ...EM_IS,
  ...RT_IG,
  ...TC_IM,
  ...TC_SI,
];

export function getSasbBySector(sector_code: string): SasbDisclosure[] {
  return SASB_DISCLOSURES.filter((d) => d.sector_code === sector_code);
}
