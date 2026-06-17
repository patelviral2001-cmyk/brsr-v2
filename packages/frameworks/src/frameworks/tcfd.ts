/**
 * TCFD — Task Force on Climate-related Financial Disclosures.
 * 11 recommendations across 4 pillars: Governance, Strategy, Risk Management, Metrics & Targets.
 */

export type TcfdPillar = "Governance" | "Strategy" | "RiskManagement" | "MetricsTargets";

export interface TcfdDisclosure {
  section_id: string;
  pillar: TcfdPillar;
  recommendation_id: string; // e.g. "Governance-a"
  question_text: string;
  response_type: "TEXT" | "TABLE" | "NUMERIC";
  unit?: string;
  is_mandatory: boolean;
  mapped_canonical_keys: string[];
  narrative_template: string | null;
}

function t(p: TcfdDisclosure): TcfdDisclosure {
  return p;
}

const SCOPE3_KEYS = Array.from({ length: 15 }, (_, i) => `scope3_cat${i + 1}_tco2e`);

export const TCFD_DISCLOSURES: TcfdDisclosure[] = [
  // ---- Governance
  t({
    section_id: "TCFD-Gov-a",
    pillar: "Governance",
    recommendation_id: "Governance-a",
    question_text:
      "Describe the board's oversight of climate-related risks and opportunities.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["board_meetings_count"],
    narrative_template:
      "The Board reviewed climate-related risks {{calc.climate_review_count}} times during the period; {{metric.board_meetings_count}} board meetings were held in total.",
  }),
  t({
    section_id: "TCFD-Gov-b",
    pillar: "Governance",
    recommendation_id: "Governance-b",
    question_text:
      "Describe management's role in assessing and managing climate-related risks and opportunities.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),

  // ---- Strategy
  t({
    section_id: "TCFD-Strat-a",
    pillar: "Strategy",
    recommendation_id: "Strategy-a",
    question_text:
      "Describe the climate-related risks and opportunities identified over the short, medium and long term.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["climate_risks_identified_count"],
    narrative_template:
      "{{metric.climate_risks_identified_count}} distinct climate-related risks have been identified and prioritised across short, medium and long-term horizons.",
  }),
  t({
    section_id: "TCFD-Strat-b",
    pillar: "Strategy",
    recommendation_id: "Strategy-b",
    question_text:
      "Describe the impact of climate-related risks and opportunities on the organisation's businesses, strategy, and financial planning.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  t({
    section_id: "TCFD-Strat-c",
    pillar: "Strategy",
    recommendation_id: "Strategy-c",
    question_text:
      "Describe the resilience of the organisation's strategy, taking into consideration different climate-related scenarios, including a 2C or lower scenario.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["tcfd_scenarios_used"],
    narrative_template:
      "Strategy resilience was tested against {{metric.tcfd_scenarios_used}} climate scenarios including a 2C-aligned pathway.",
  }),

  // ---- Risk Management
  t({
    section_id: "TCFD-Risk-a",
    pillar: "RiskManagement",
    recommendation_id: "RiskManagement-a",
    question_text:
      "Describe the organisation's processes for identifying and assessing climate-related risks.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["enterprise_risks_count", "climate_risks_identified_count"],
    narrative_template: null,
  }),
  t({
    section_id: "TCFD-Risk-b",
    pillar: "RiskManagement",
    recommendation_id: "RiskManagement-b",
    question_text:
      "Describe the organisation's processes for managing climate-related risks.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: [],
    narrative_template: null,
  }),
  t({
    section_id: "TCFD-Risk-c",
    pillar: "RiskManagement",
    recommendation_id: "RiskManagement-c",
    question_text:
      "Describe how processes for identifying, assessing and managing climate-related risks are integrated into the organisation's overall risk management.",
    response_type: "TEXT",
    is_mandatory: true,
    mapped_canonical_keys: ["enterprise_risks_count"],
    narrative_template: null,
  }),

  // ---- Metrics & Targets
  t({
    section_id: "TCFD-Metr-a",
    pillar: "MetricsTargets",
    recommendation_id: "MetricsTargets-a",
    question_text:
      "Disclose the metrics used by the organisation to assess climate-related risks and opportunities in line with its strategy and risk management process.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: [
      "ghg_intensity_per_revenue",
      "ghg_intensity_per_unit_output",
      "energy_intensity_per_revenue",
      "electricity_from_renewable_kwh",
    ],
    narrative_template: null,
  }),
  t({
    section_id: "TCFD-Metr-b",
    pillar: "MetricsTargets",
    recommendation_id: "MetricsTargets-b",
    question_text:
      "Disclose Scope 1, Scope 2, and, if appropriate, Scope 3 greenhouse gas (GHG) emissions, and the related risks.",
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
      "Scope 1: {{metric.scope1_total_tco2e}} tCO2e; Scope 2 (location): {{metric.scope2_location_tco2e}} tCO2e; Scope 2 (market): {{metric.scope2_market_tco2e}} tCO2e; Scope 3 (all 15 categories): {{calc.scope3_total}} tCO2e.",
  }),
  t({
    section_id: "TCFD-Metr-c",
    pillar: "MetricsTargets",
    recommendation_id: "MetricsTargets-c",
    question_text:
      "Describe the targets used by the organisation to manage climate-related risks and opportunities and performance against targets.",
    response_type: "TABLE",
    is_mandatory: true,
    mapped_canonical_keys: ["scope1_total_tco2e", "scope2_location_tco2e", "electricity_from_renewable_kwh"],
    narrative_template: null,
  }),
];

export function getTcfdByPillar(p: TcfdPillar): TcfdDisclosure[] {
  return TCFD_DISCLOSURES.filter((d) => d.pillar === p);
}
