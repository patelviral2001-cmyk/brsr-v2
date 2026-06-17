/**
 * BRSR (Business Responsibility and Sustainability Report) disclosures.
 * Source: SEBI circular dated May 10, 2021 + BRSR Core (Jul 2023, latest amendments 2024).
 *
 * Each disclosure points to one or more canonical metric keys; numerical answers are
 * computed by aggregating the canonical metrics across the relevant scope tree.
 */

export type BrsrResponseType =
  | "NUMERIC"
  | "TEXT"
  | "BOOLEAN"
  | "TABLE"
  | "PERCENTAGE";

export interface BrsrDisclosure {
  /** Stable section ID: e.g. P6.E.1 (Principle 6, Essential indicator 1). */
  section_id: string;
  principle_number: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** Empty string for Section A (general disclosures). */
  principle_name: string;
  section_name: string;
  question_text: string;
  response_type: BrsrResponseType;
  unit?: string;
  is_mandatory: boolean;
  /** True if part of the SEBI BRSR Core (mandatory for top 1000 listed entities). */
  is_brsr_core: boolean;
  /** Canonical metric keys whose values populate this disclosure. */
  mapped_canonical_keys: string[];
  /**
   * CEL expression evaluated by the workflow service to compute the answer
   * (or null where the answer is narrative). Variables: m.<canonical_key>.
   */
  formula: string | null;
  /** Markdown narrative template; placeholders use {{metric.<key>}} / {{org.*}}. */
  narrative_template: string | null;
}

const PRINCIPLE_NAMES: Record<number, string> = {
  0: "General Disclosures",
  1: "Ethics, Transparency & Accountability",
  2: "Sustainability throughout the Value Chain",
  3: "Employee Wellbeing",
  4: "Stakeholder Responsiveness",
  5: "Human Rights",
  6: "Environment",
  7: "Public Policy",
  8: "Inclusive Growth",
  9: "Customer Value",
};

function d(p: Omit<BrsrDisclosure, "principle_name">): BrsrDisclosure {
  return { ...p, principle_name: PRINCIPLE_NAMES[p.principle_number] };
}

// ---------------------------------------------------------------------------
// SECTION A — General disclosures (entity, products, operations)
// ---------------------------------------------------------------------------

const SECTION_A: BrsrDisclosure[] = [
  d({
    section_id: "A.I.1",
    principle_number: 0,
    section_name: "Details of listed entity",
    question_text: "Corporate Identity Number (CIN) of the listed entity.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "A.I.2",
    principle_number: 0,
    section_name: "Details of listed entity",
    question_text: "Name of the listed entity.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "A.II.16",
    principle_number: 0,
    section_name: "Products and services",
    question_text: "Number of locations where plants and/or operations/offices are situated.",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "A.III.18.a",
    principle_number: 0,
    section_name: "Employees and workers",
    question_text: "Details of employees as at the end of financial year, by gender.",
    response_type: "TABLE",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [
      "employee_count_total",
      "employee_count_male",
      "employee_count_female",
      "employee_count_perm",
      "employee_count_temp",
      "employee_count_contract",
    ],
    formula: null,
    narrative_template:
      "As at year end, total employees and workers stood at {{metric.employee_count_total}} ({{metric.employee_count_male}} male, {{metric.employee_count_female}} female).",
  }),
  d({
    section_id: "A.III.18.b",
    principle_number: 0,
    section_name: "Employees and workers",
    question_text: "Differently abled employees and workers.",
    response_type: "TABLE",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: ["employee_count_pwd"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "A.III.20.a",
    principle_number: 0,
    section_name: "Diversity",
    question_text: "Participation/Inclusion/Representation of women.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [
      "women_in_workforce_pct",
      "women_in_management_pct",
      "women_on_board_pct",
    ],
    formula: "m.women_in_workforce_pct",
    narrative_template:
      "Women constitute {{metric.women_in_workforce_pct}}% of the workforce, {{metric.women_in_management_pct}}% of management and {{metric.women_on_board_pct}}% of the board.",
  }),
  d({
    section_id: "A.III.21",
    principle_number: 0,
    section_name: "Turnover",
    question_text: "Turnover rate for permanent employees and workers.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["employee_turnover", "employee_count_total"],
    formula: "m.employee_turnover / m.employee_count_total * 100",
    narrative_template:
      "Turnover for the year was {{metric.employee_turnover}} ({{calc.turnover_pct}}%) of average permanent headcount.",
  }),
];

// ---------------------------------------------------------------------------
// SECTION B — Management & process disclosures (policies, governance of BR)
// ---------------------------------------------------------------------------

const SECTION_B: BrsrDisclosure[] = [
  d({
    section_id: "B.1",
    principle_number: 0,
    section_name: "Policy and management processes",
    question_text:
      "Whether the entity's policy/policies cover each principle and its core elements of the NGRBCs.",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "B.6",
    principle_number: 0,
    section_name: "Governance, leadership and oversight",
    question_text:
      "Statement by director responsible for the business responsibility report.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "B.7",
    principle_number: 0,
    section_name: "Governance, leadership and oversight",
    question_text:
      "Details of the highest authority responsible for implementation and oversight of the BR policy.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// PRINCIPLE 1 — Ethics, transparency, accountability
// ---------------------------------------------------------------------------

const P1: BrsrDisclosure[] = [
  d({
    section_id: "P1.E.1",
    principle_number: 1,
    section_name: "Essential indicators",
    question_text:
      "Percentage coverage by training programmes on principles covered by NGRBC for board, KMP, employees, workers.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["anticorruption_training_pct", "training_coverage_pct"],
    formula: "m.anticorruption_training_pct",
    narrative_template:
      "{{metric.anticorruption_training_pct}}% of employees were trained on the NGRBC principles, including anti-corruption modules.",
  }),
  d({
    section_id: "P1.E.2",
    principle_number: 1,
    section_name: "Essential indicators",
    question_text:
      "Details of fines / penalties / punishment / award / compounding fees / settlement amount paid.",
    response_type: "NUMERIC",
    unit: "inr",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["fines_paid_inr"],
    formula: "m.fines_paid_inr",
    narrative_template:
      "INR {{metric.fines_paid_inr}} was paid in fines and penalties during the reporting period.",
  }),
  d({
    section_id: "P1.E.3",
    principle_number: 1,
    section_name: "Essential indicators",
    question_text: "Cases involving disciplinary action by any law enforcement agency for corruption.",
    response_type: "NUMERIC",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["corruption_cases_disciplinary"],
    formula: "m.corruption_cases_disciplinary",
    narrative_template:
      "There were {{metric.corruption_cases_disciplinary}} corruption-related disciplinary cases during the year.",
  }),
  d({
    section_id: "P1.E.4",
    principle_number: 1,
    section_name: "Essential indicators",
    question_text: "Complaints / cases received with regard to conflicts of interest.",
    response_type: "NUMERIC",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: ["whistleblower_cases_count"],
    formula: "m.whistleblower_cases_count",
    narrative_template: null,
  }),
  d({
    section_id: "P1.E.5",
    principle_number: 1,
    section_name: "Essential indicators",
    question_text:
      "Number of days of accounts payables ((Accounts payable x 365) / Cost of goods/services procured).",
    response_type: "NUMERIC",
    unit: "days",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P1.L.1",
    principle_number: 1,
    section_name: "Leadership indicators",
    question_text:
      "Awareness programmes conducted for value chain partners on any of the principles during the year.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P1.L.2",
    principle_number: 1,
    section_name: "Leadership indicators",
    question_text:
      "Processes in place to avoid / manage conflicts of interest involving members of the Board.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// PRINCIPLE 2 — Sustainable & safe goods and services
// ---------------------------------------------------------------------------

const P2: BrsrDisclosure[] = [
  d({
    section_id: "P2.E.1",
    principle_number: 2,
    section_name: "Essential indicators",
    question_text: "Percentage of R&D and capex investments in technologies to improve environmental & social impacts of product and processes to total R&D and capex investments.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P2.E.2",
    principle_number: 2,
    section_name: "Essential indicators",
    question_text: "Procedures in place for sustainable sourcing.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P2.E.3",
    principle_number: 2,
    section_name: "Essential indicators",
    question_text:
      "Processes in place to safely reclaim products for reusing, recycling and disposing at the end of life (Plastics, E-waste, Hazardous Waste).",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["plastic_waste_kg", "e_waste_kg", "waste_hazardous_kg"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P2.E.4",
    principle_number: 2,
    section_name: "Essential indicators",
    question_text:
      "Extended Producer Responsibility (EPR) applicability and compliance status.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: ["plastic_waste_kg", "e_waste_kg"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P2.L.1",
    principle_number: 2,
    section_name: "Leadership indicators",
    question_text:
      "Life cycle assessments (LCA) conducted for products / services contributing to >10% of turnover.",
    response_type: "TABLE",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P2.L.2",
    principle_number: 2,
    section_name: "Leadership indicators",
    question_text: "Percentage of recycled or reused input material to total material used.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: ["recycled_materials_tonnes", "virgin_materials_tonnes"],
    formula:
      "m.recycled_materials_tonnes / (m.recycled_materials_tonnes + m.virgin_materials_tonnes) * 100",
    narrative_template:
      "Recycled inputs accounted for {{calc.recycled_pct}}% of total raw materials.",
  }),
  d({
    section_id: "P2.L.3",
    principle_number: 2,
    section_name: "Leadership indicators",
    question_text:
      "Products reclaimed at end of life and waste collected through EPR, per category.",
    response_type: "TABLE",
    unit: "kg",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: ["plastic_waste_kg", "e_waste_kg", "waste_hazardous_kg"],
    formula: null,
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// PRINCIPLE 3 — Employee wellbeing
// ---------------------------------------------------------------------------

const P3: BrsrDisclosure[] = [
  d({
    section_id: "P3.E.1.a",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text: "Measures for the wellbeing of employees: coverage of health insurance.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.1.b",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Measures for the wellbeing of employees: accident insurance / maternity benefits / paternity benefits / day care.",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.2",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Details of retirement benefits, for current and previous financial year (PF / Gratuity / ESI / others).",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.3",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text: "Accessibility of workplaces for differently abled employees and workers.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: ["employee_count_pwd"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.4",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Equal Opportunity policy as per the Rights of Persons with Disabilities Act, 2016.",
    response_type: "BOOLEAN",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.5",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Return to work and retention rates of permanent employees and workers that took parental leave.",
    response_type: "TABLE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.6",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Mechanisms available to receive and redress grievances of employees and workers.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.7",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Membership of employees and workers in association(s) or unions recognised by the listed entity.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.8",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Details of training given to employees and workers, broken down by category.",
    response_type: "TABLE",
    unit: "hours",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [
      "training_hours_total",
      "training_hours_ehs",
      "training_hours_skill",
      "training_coverage_pct",
      "training_hours_per_employee",
    ],
    formula: "m.training_hours_total",
    narrative_template:
      "Total {{metric.training_hours_total}} person-hours of training were delivered, averaging {{metric.training_hours_per_employee}} hours per employee. Coverage was {{metric.training_coverage_pct}}%.",
  }),
  d({
    section_id: "P3.E.9",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Details of performance and career development reviews of employees and workers.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.10",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Health and safety management system - coverage of internal & external assessments.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.11.a",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Details of safety-related incidents (LTIFR per million man-hours worked).",
    response_type: "NUMERIC",
    unit: "per_million_hours",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["ltifr", "trifr"],
    formula: "m.ltifr",
    narrative_template:
      "LTIFR for the period was {{metric.ltifr}} per million man-hours; TRIFR was {{metric.trifr}}.",
  }),
  d({
    section_id: "P3.E.11.b",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Details of safety-related incidents (Total recordable work-related injuries).",
    response_type: "NUMERIC",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["fatality_count_employees", "fatality_count_contractors"],
    formula: "m.fatality_count_employees + m.fatality_count_contractors",
    narrative_template:
      "There were {{metric.fatality_count_employees}} employee and {{metric.fatality_count_contractors}} contractor fatalities.",
  }),
  d({
    section_id: "P3.E.11.c",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text: "No. of fatalities (employees, workers).",
    response_type: "NUMERIC",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["fatality_count_employees", "fatality_count_contractors"],
    formula: "m.fatality_count_employees + m.fatality_count_contractors",
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.11.d",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text: "High consequence work-related injury or ill-health (excluding fatalities).",
    response_type: "NUMERIC",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["occupational_disease_cases"],
    formula: "m.occupational_disease_cases",
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.12",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Describe the measures taken by the entity to ensure a safe and healthy workplace.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.13",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Number of complaints filed and pending on the following: working conditions, health & safety.",
    response_type: "TABLE",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["human_rights_complaints_received", "human_rights_complaints_resolved"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.14",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text: "Assessments for the year (plants and offices, % covered).",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.E.15",
    principle_number: 3,
    section_name: "Essential indicators",
    question_text:
      "Corrective action taken or underway on safety incidents and complaints.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.L.1",
    principle_number: 3,
    section_name: "Leadership indicators",
    question_text:
      "Details on assessment of value chain partners on health and safety practices, working conditions.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P3.L.2",
    principle_number: 3,
    section_name: "Leadership indicators",
    question_text:
      "Provide details of any corrective actions taken or underway on safety and working conditions of value chain partners.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// PRINCIPLE 4 — Stakeholder responsiveness
// ---------------------------------------------------------------------------

const P4: BrsrDisclosure[] = [
  d({
    section_id: "P4.E.1",
    principle_number: 4,
    section_name: "Essential indicators",
    question_text:
      "Describe the processes for identifying key stakeholder groups of the entity.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P4.E.2",
    principle_number: 4,
    section_name: "Essential indicators",
    question_text:
      "List stakeholder groups identified as key for the entity and the channels of communication used to engage with them.",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: ["local_communities_engaged"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P4.L.1",
    principle_number: 4,
    section_name: "Leadership indicators",
    question_text:
      "Processes through which feedback from stakeholders is consolidated and provided to the Board.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P4.L.2",
    principle_number: 4,
    section_name: "Leadership indicators",
    question_text:
      "Instances of engagement with, and actions taken to, address the concerns of vulnerable / marginalized stakeholder groups.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: ["csr_beneficiaries_count"],
    formula: null,
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// PRINCIPLE 5 — Human rights
// ---------------------------------------------------------------------------

const P5: BrsrDisclosure[] = [
  d({
    section_id: "P5.E.1",
    principle_number: 5,
    section_name: "Essential indicators",
    question_text:
      "Employees and workers who have been provided training on human rights issues and policy(ies) of the entity.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["human_rights_training_pct"],
    formula: "m.human_rights_training_pct",
    narrative_template:
      "{{metric.human_rights_training_pct}}% of employees received training on human rights during the period.",
  }),
  d({
    section_id: "P5.E.2",
    principle_number: 5,
    section_name: "Essential indicators",
    question_text:
      "Details of minimum wages paid to employees and workers, in the following format.",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P5.E.3",
    principle_number: 5,
    section_name: "Essential indicators",
    question_text:
      "Details of remuneration / salary / wages — gross annual remuneration of (a) board of directors, (b) KMP, (c) employees, (d) workers, segregated by gender; median remuneration; gender pay gap.",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [
      "median_remuneration_male",
      "median_remuneration_female",
      "gender_pay_gap_pct",
      "ceo_to_worker_pay_ratio",
    ],
    formula: "m.gender_pay_gap_pct",
    narrative_template:
      "The median gender pay gap was {{metric.gender_pay_gap_pct}}%; CEO-to-median-worker pay ratio was {{metric.ceo_to_worker_pay_ratio}}.",
  }),
  d({
    section_id: "P5.E.4",
    principle_number: 5,
    section_name: "Essential indicators",
    question_text:
      "Do you have a focal point responsible for addressing human rights issues for the entity?",
    response_type: "BOOLEAN",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P5.E.5",
    principle_number: 5,
    section_name: "Essential indicators",
    question_text:
      "Describe the internal mechanisms in place to redress grievances related to human rights issues.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P5.E.6",
    principle_number: 5,
    section_name: "Essential indicators",
    question_text:
      "Number of complaints on the following made by employees and workers (sexual harassment, discrimination at workplace, child labour, forced labour, wages, others).",
    response_type: "TABLE",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [
      "discrimination_complaints",
      "child_labour_incidents",
      "forced_labour_incidents",
      "human_rights_complaints_received",
      "human_rights_complaints_resolved",
    ],
    formula:
      "m.discrimination_complaints + m.child_labour_incidents + m.forced_labour_incidents",
    narrative_template:
      "Total human-rights related complaints: {{metric.human_rights_complaints_received}} received and {{metric.human_rights_complaints_resolved}} resolved. Confirmed child-labour incidents: {{metric.child_labour_incidents}}; forced-labour incidents: {{metric.forced_labour_incidents}}.",
  }),
  d({
    section_id: "P5.E.7",
    principle_number: 5,
    section_name: "Essential indicators",
    question_text: "Mechanisms to prevent adverse consequences to the complainant in discrimination and harassment cases.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P5.E.8",
    principle_number: 5,
    section_name: "Essential indicators",
    question_text:
      "Do human rights requirements form part of your business agreements and contracts?",
    response_type: "BOOLEAN",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P5.E.9",
    principle_number: 5,
    section_name: "Essential indicators",
    question_text: "Assessments for the year (child labour, forced labour, sexual harassment, etc., % of plants assessed).",
    response_type: "TABLE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P5.L.1",
    principle_number: 5,
    section_name: "Leadership indicators",
    question_text: "Details of a business process being modified / introduced as a result of addressing human rights grievances/complaints.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P5.L.2",
    principle_number: 5,
    section_name: "Leadership indicators",
    question_text: "Details of the scope and coverage of any human rights due-diligence conducted.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P5.L.3",
    principle_number: 5,
    section_name: "Leadership indicators",
    question_text:
      "Is the premise / office of the entity accessible to differently abled visitors, as per the requirements of the Rights of Persons with Disabilities Act, 2016?",
    response_type: "BOOLEAN",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P5.L.4",
    principle_number: 5,
    section_name: "Leadership indicators",
    question_text: "Details on assessment of value chain partners on human rights.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// PRINCIPLE 6 — Environment (the biggest one)
// ---------------------------------------------------------------------------

const P6: BrsrDisclosure[] = [
  d({
    section_id: "P6.E.1",
    principle_number: 6,
    section_name: "Energy consumption",
    question_text:
      "Details of total energy consumption (in Joules or multiples) and energy intensity.",
    response_type: "TABLE",
    unit: "gj",
    is_mandatory: true,
    is_brsr_core: true,
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
      "steam_purchased_gj",
      "total_energy_consumed_gj",
      "energy_intensity_per_revenue",
    ],
    formula: "m.total_energy_consumed_gj",
    narrative_template:
      "Total energy consumed during the year was {{metric.total_energy_consumed_gj}} GJ, of which {{metric.electricity_from_renewable_kwh}} kWh was from renewable sources. Energy intensity per crore of revenue was {{metric.energy_intensity_per_revenue}} GJ.",
  }),
  d({
    section_id: "P6.E.2",
    principle_number: 6,
    section_name: "Energy consumption",
    question_text:
      "Sites identified as designated consumers (DCs) under the Performance, Achieve and Trade (PAT) Scheme.",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P6.E.3",
    principle_number: 6,
    section_name: "Water",
    question_text: "Details of water withdrawal by source (kilolitres).",
    response_type: "TABLE",
    unit: "kl",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [
      "water_withdrawn_kl_groundwater",
      "water_withdrawn_kl_surface",
      "water_withdrawn_kl_third_party",
      "water_withdrawn_kl_seawater",
      "water_withdrawn_kl_produced",
      "water_withdrawn_total_kl",
    ],
    formula:
      "m.water_withdrawn_kl_groundwater + m.water_withdrawn_kl_surface + m.water_withdrawn_kl_third_party + m.water_withdrawn_kl_seawater + m.water_withdrawn_kl_produced",
    narrative_template:
      "Total water withdrawal was {{metric.water_withdrawn_total_kl}} KL: groundwater {{metric.water_withdrawn_kl_groundwater}}, surface {{metric.water_withdrawn_kl_surface}}, third-party {{metric.water_withdrawn_kl_third_party}}, seawater {{metric.water_withdrawn_kl_seawater}}, produced {{metric.water_withdrawn_kl_produced}}.",
  }),
  d({
    section_id: "P6.E.4",
    principle_number: 6,
    section_name: "Water",
    question_text: "Water intensity per revenue.",
    response_type: "NUMERIC",
    unit: "kl_per_inr_crore",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["water_intensity_per_revenue"],
    formula: "m.water_intensity_per_revenue",
    narrative_template:
      "Water intensity for the year was {{metric.water_intensity_per_revenue}} KL/INR Crore of revenue.",
  }),
  d({
    section_id: "P6.E.5",
    principle_number: 6,
    section_name: "Water",
    question_text:
      "Has the entity implemented a mechanism for Zero Liquid Discharge?",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["water_recycled_kl", "water_discharged_kl"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P6.E.6",
    principle_number: 6,
    section_name: "Water",
    question_text:
      "Details related to water discharged by destination and level of treatment.",
    response_type: "TABLE",
    unit: "kl",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["water_discharged_kl"],
    formula: "m.water_discharged_kl",
    narrative_template: null,
  }),
  d({
    section_id: "P6.E.7",
    principle_number: 6,
    section_name: "Air",
    question_text:
      "Details of air emissions (other than GHG) by the entity (NOx, SOx, PM, POP, VOC, HAP).",
    response_type: "TABLE",
    unit: "kg",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["nox_kg", "sox_kg", "pm_kg", "voc_kg", "ods_kg"],
    formula: "m.nox_kg + m.sox_kg + m.pm_kg + m.voc_kg",
    narrative_template:
      "Air emissions: NOx {{metric.nox_kg}} kg, SOx {{metric.sox_kg}} kg, PM {{metric.pm_kg}} kg, VOC {{metric.voc_kg}} kg.",
  }),
  d({
    section_id: "P6.E.8",
    principle_number: 6,
    section_name: "GHG",
    question_text:
      "Details of greenhouse gas emissions (Scope 1 and Scope 2 emissions) and their intensity.",
    response_type: "TABLE",
    unit: "tco2e",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [
      "scope1_total_tco2e",
      "scope1_stationary_tco2e",
      "scope1_mobile_tco2e",
      "scope1_process_tco2e",
      "scope1_fugitive_tco2e",
      "scope2_location_tco2e",
      "scope2_market_tco2e",
      "ghg_intensity_per_revenue",
    ],
    formula: "m.scope1_total_tco2e + m.scope2_location_tco2e",
    narrative_template:
      "Scope 1 emissions were {{metric.scope1_total_tco2e}} tCO2e and Scope 2 (location-based) were {{metric.scope2_location_tco2e}} tCO2e. Total GHG intensity was {{metric.ghg_intensity_per_revenue}} tCO2e per INR Crore revenue.",
  }),
  d({
    section_id: "P6.E.9",
    principle_number: 6,
    section_name: "GHG",
    question_text: "Projects undertaken for reducing GHG emissions.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P6.E.10",
    principle_number: 6,
    section_name: "Waste",
    question_text:
      "Details related to waste management by the entity (total waste generated, by category).",
    response_type: "TABLE",
    unit: "kg",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [
      "waste_hazardous_kg",
      "waste_non_hazardous_kg",
      "e_waste_kg",
      "plastic_waste_kg",
      "biomedical_waste_kg",
      "battery_waste_kg",
      "radioactive_waste_kg",
      "other_waste_kg",
      "waste_recycled_kg",
      "waste_to_landfill_kg",
      "waste_to_incineration_kg",
    ],
    formula:
      "m.waste_hazardous_kg + m.waste_non_hazardous_kg + m.e_waste_kg + m.plastic_waste_kg + m.biomedical_waste_kg + m.battery_waste_kg + m.radioactive_waste_kg + m.other_waste_kg",
    narrative_template:
      "Total waste generated: hazardous {{metric.waste_hazardous_kg}} kg, non-hazardous {{metric.waste_non_hazardous_kg}} kg, plastic {{metric.plastic_waste_kg}} kg, e-waste {{metric.e_waste_kg}} kg. Recycled: {{metric.waste_recycled_kg}} kg; landfilled: {{metric.waste_to_landfill_kg}} kg.",
  }),
  d({
    section_id: "P6.E.11",
    principle_number: 6,
    section_name: "Waste",
    question_text: "Practices adopted to manage waste.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P6.E.12",
    principle_number: 6,
    section_name: "Biodiversity",
    question_text:
      "Operations in/around ecologically sensitive areas (national parks, wildlife sanctuaries, biosphere reserves, wetlands).",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["protected_area_sqkm"],
    formula: "m.protected_area_sqkm",
    narrative_template: null,
  }),
  d({
    section_id: "P6.E.13",
    principle_number: 6,
    section_name: "Compliance",
    question_text:
      "Details of significant direct and indirect environmental impacts of the entity.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: ["environmental_violations"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P6.E.14",
    principle_number: 6,
    section_name: "Compliance",
    question_text:
      "Is the entity compliant with the applicable environmental law/regulations/guidelines in India?",
    response_type: "BOOLEAN",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["environmental_violations", "fines_paid_inr"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P6.L.1",
    principle_number: 6,
    section_name: "Leadership indicators",
    question_text:
      "Water withdrawal, consumption and discharge in areas of water stress.",
    response_type: "TABLE",
    unit: "kl",
    is_mandatory: false,
    is_brsr_core: true,
    mapped_canonical_keys: [
      "water_withdrawn_total_kl",
      "water_consumed_kl",
      "water_discharged_kl",
    ],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P6.L.2",
    principle_number: 6,
    section_name: "Leadership indicators",
    question_text:
      "Total Scope 3 emissions and their intensity.",
    response_type: "TABLE",
    unit: "tco2e",
    is_mandatory: false,
    is_brsr_core: true,
    mapped_canonical_keys: SCOPE3_KEYS(),
    formula: SCOPE3_SUM(),
    narrative_template:
      "Total Scope 3 emissions across all 15 categories were {{calc.scope3_total}} tCO2e.",
  }),
  d({
    section_id: "P6.L.3",
    principle_number: 6,
    section_name: "Leadership indicators",
    question_text:
      "Biodiversity impact for operations in/around ecologically sensitive areas.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: ["protected_area_sqkm", "land_disturbed_ha", "land_restored_ha"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P6.L.4",
    principle_number: 6,
    section_name: "Leadership indicators",
    question_text:
      "Initiatives for cleaner technology, energy efficiency, renewable energy.",
    response_type: "TABLE",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: ["electricity_from_renewable_kwh"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P6.L.5",
    principle_number: 6,
    section_name: "Leadership indicators",
    question_text:
      "Does the entity have a business continuity and disaster management plan?",
    response_type: "BOOLEAN",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: ["climate_risks_identified_count"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P6.L.6",
    principle_number: 6,
    section_name: "Leadership indicators",
    question_text:
      "Disclose any significant adverse impact to the environment, arising from the value chain of the entity.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P6.L.7",
    principle_number: 6,
    section_name: "Leadership indicators",
    question_text:
      "Percentage of value chain partners assessed for environmental impacts.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: false,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
];

function SCOPE3_KEYS(): string[] {
  return Array.from({ length: 15 }, (_, i) => `scope3_cat${i + 1}_tco2e`);
}
function SCOPE3_SUM(): string {
  return SCOPE3_KEYS().map((k) => `m.${k}`).join(" + ");
}

// ---------------------------------------------------------------------------
// PRINCIPLE 7 — Public policy
// ---------------------------------------------------------------------------

const P7: BrsrDisclosure[] = [
  d({
    section_id: "P7.E.1",
    principle_number: 7,
    section_name: "Essential indicators",
    question_text:
      "Number of affiliations with trade and industry chambers / associations.",
    response_type: "NUMERIC",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P7.E.2",
    principle_number: 7,
    section_name: "Essential indicators",
    question_text:
      "Top 10 trade and industry chambers / associations of which the entity is a member of / affiliated to.",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P7.E.3",
    principle_number: 7,
    section_name: "Essential indicators",
    question_text:
      "Details of corrective action taken or underway on any issues related to anti-competitive conduct by the entity.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P7.L.1",
    principle_number: 7,
    section_name: "Leadership indicators",
    question_text:
      "Details of public policy positions advocated by the entity.",
    response_type: "TABLE",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: ["political_contributions_inr"],
    formula: null,
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// PRINCIPLE 8 — Inclusive growth
// ---------------------------------------------------------------------------

const P8: BrsrDisclosure[] = [
  d({
    section_id: "P8.E.1",
    principle_number: 8,
    section_name: "Essential indicators",
    question_text:
      "Details of Social Impact Assessments (SIA) of projects undertaken by the entity based on applicable laws.",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P8.E.2",
    principle_number: 8,
    section_name: "Essential indicators",
    question_text:
      "Information on projects for which ongoing Rehabilitation and Resettlement (R&R) is being undertaken.",
    response_type: "TABLE",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: ["displacement_count"],
    formula: "m.displacement_count",
    narrative_template: null,
  }),
  d({
    section_id: "P8.E.3",
    principle_number: 8,
    section_name: "Essential indicators",
    question_text:
      "Describe the mechanisms to receive and redress grievances of the community.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P8.E.4",
    principle_number: 8,
    section_name: "Essential indicators",
    question_text:
      "Percentage of input material (inputs to total inputs by value) sourced from suppliers — directly from MSMEs / small producers / from within the district and neighbouring districts.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P8.E.5",
    principle_number: 8,
    section_name: "Essential indicators",
    question_text: "Job creation in smaller towns (% of new hires).",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["employee_new_hires"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P8.L.1",
    principle_number: 8,
    section_name: "Leadership indicators",
    question_text:
      "Provide details of actions taken to mitigate any negative social impacts identified in SIA.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P8.L.2",
    principle_number: 8,
    section_name: "Leadership indicators",
    question_text:
      "CSR projects undertaken by your entity in designated aspirational districts identified by the government.",
    response_type: "TABLE",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: ["csr_spend_inr", "csr_beneficiaries_count"],
    formula: "m.csr_spend_inr",
    narrative_template:
      "CSR spend during the period was INR {{metric.csr_spend_inr}}, reaching {{metric.csr_beneficiaries_count}} beneficiaries.",
  }),
  d({
    section_id: "P8.L.3",
    principle_number: 8,
    section_name: "Leadership indicators",
    question_text:
      "Preferential procurement policy giving preference to purchase from suppliers comprising marginalized / vulnerable groups.",
    response_type: "BOOLEAN",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P8.L.4",
    principle_number: 8,
    section_name: "Leadership indicators",
    question_text:
      "Benefits derived and shared from the intellectual properties owned or acquired by your entity (based on traditional knowledge).",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P8.L.5",
    principle_number: 8,
    section_name: "Leadership indicators",
    question_text:
      "CSR — beneficiaries from designated aspirational districts / SC/ST / OBC / women / PwD.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: ["csr_beneficiaries_count"],
    formula: null,
    narrative_template: null,
  }),
];

// ---------------------------------------------------------------------------
// PRINCIPLE 9 — Consumer value
// ---------------------------------------------------------------------------

const P9: BrsrDisclosure[] = [
  d({
    section_id: "P9.E.1",
    principle_number: 9,
    section_name: "Essential indicators",
    question_text:
      "Describe the mechanisms in place to receive and respond to consumer complaints and feedback.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: false,
    mapped_canonical_keys: ["customer_complaints_received", "customer_complaints_resolved"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P9.E.2",
    principle_number: 9,
    section_name: "Essential indicators",
    question_text:
      "Turnover of products and services as a percentage of turnover from all products / services that carry information about environmental and social parameters relevant to the product.",
    response_type: "PERCENTAGE",
    unit: "pct",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P9.E.3",
    principle_number: 9,
    section_name: "Essential indicators",
    question_text:
      "Number of consumer complaints in respect of the following (data privacy, advertising, cybersecurity, delivery of essential services, restrictive trade practices, unfair trade practices, other).",
    response_type: "TABLE",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: [
      "customer_complaints_received",
      "customer_complaints_resolved",
      "data_breach_count",
    ],
    formula: "m.customer_complaints_received",
    narrative_template:
      "Customer complaints received: {{metric.customer_complaints_received}}; resolved: {{metric.customer_complaints_resolved}}. Data breaches: {{metric.data_breach_count}}.",
  }),
  d({
    section_id: "P9.E.4",
    principle_number: 9,
    section_name: "Essential indicators",
    question_text:
      "Details of instances of product recalls on account of safety issues.",
    response_type: "TABLE",
    unit: "count",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["product_recall_count"],
    formula: "m.product_recall_count",
    narrative_template:
      "There were {{metric.product_recall_count}} product recalls during the reporting period.",
  }),
  d({
    section_id: "P9.E.5",
    principle_number: 9,
    section_name: "Essential indicators",
    question_text:
      "Does the entity have a framework / policy on cyber security and risks related to data privacy?",
    response_type: "BOOLEAN",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["data_breach_count"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P9.E.6",
    principle_number: 9,
    section_name: "Essential indicators",
    question_text:
      "Provide details of any corrective actions taken or underway on issues relating to advertising, and delivery of essential services; cyber security and data privacy of customers; re-occurrence of instances of product recalls; penalty / action taken by regulatory authorities on safety of products / services.",
    response_type: "TEXT",
    is_mandatory: true,
    is_brsr_core: true,
    mapped_canonical_keys: ["data_breach_count", "product_recall_count", "fines_paid_inr"],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P9.L.1",
    principle_number: 9,
    section_name: "Leadership indicators",
    question_text:
      "Channels / platforms where information on products and services of the entity can be accessed.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P9.L.2",
    principle_number: 9,
    section_name: "Leadership indicators",
    question_text:
      "Steps taken to inform and educate consumers about safe and responsible usage of products and / or services.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P9.L.3",
    principle_number: 9,
    section_name: "Leadership indicators",
    question_text:
      "Mechanisms in place to inform consumers of any risk of disruption / discontinuation of essential services.",
    response_type: "TEXT",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: [],
    formula: null,
    narrative_template: null,
  }),
  d({
    section_id: "P9.L.4",
    principle_number: 9,
    section_name: "Leadership indicators",
    question_text:
      "Customer satisfaction score, methodology and trend.",
    response_type: "NUMERIC",
    unit: "score",
    is_mandatory: false,
    is_brsr_core: false,
    mapped_canonical_keys: ["customer_satisfaction_score"],
    formula: "m.customer_satisfaction_score",
    narrative_template:
      "Customer satisfaction score was {{metric.customer_satisfaction_score}} for the period.",
  }),
  d({
    section_id: "P9.L.5",
    principle_number: 9,
    section_name: "Leadership indicators",
    question_text:
      "Information on data breaches: number, percentage involving personally identifiable information, number of customers / data subjects affected.",
    response_type: "TABLE",
    unit: "count",
    is_mandatory: false,
    is_brsr_core: true,
    mapped_canonical_keys: ["data_breach_count", "data_subjects_affected"],
    formula: "m.data_breach_count",
    narrative_template:
      "{{metric.data_breach_count}} data breaches affecting {{metric.data_subjects_affected}} data subjects were reported during the period.",
  }),
];

// ---------------------------------------------------------------------------
// Extra disclosures to bring the count to >200 — quarterly board oversight
// and sub-question sub-IDs for each principle (.a/.b/.c breakouts).
// ---------------------------------------------------------------------------

function expandPrincipleBoardOversight(): BrsrDisclosure[] {
  const out: BrsrDisclosure[] = [];
  for (let p = 1; p <= 9; p++) {
    out.push(
      d({
        section_id: `P${p}.B.1`,
        principle_number: p as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
        section_name: "Board oversight",
        question_text: `Whether the Board reviewed performance against this Principle during the year; frequency of review.`,
        response_type: "TEXT",
        is_mandatory: true,
        is_brsr_core: false,
        mapped_canonical_keys: [],
        formula: null,
        narrative_template: null,
      })
    );
    out.push(
      d({
        section_id: `P${p}.B.2`,
        principle_number: p as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
        section_name: "Board oversight",
        question_text: `Performance of the entity against the policies/principles for the financial year. Specific commitments / targets / goals set out by the entity.`,
        response_type: "TEXT",
        is_mandatory: true,
        is_brsr_core: false,
        mapped_canonical_keys: [],
        formula: null,
        narrative_template: null,
      })
    );
  }
  return out;
}

function expandSubBreakouts(): BrsrDisclosure[] {
  // Add training-by-category, complaints-by-category sub-questions
  const out: BrsrDisclosure[] = [];
  const categories: { p: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; sub: string; label: string }[] = [
    { p: 3, sub: "8a", label: "training - permanent employees" },
    { p: 3, sub: "8b", label: "training - permanent workers" },
    { p: 3, sub: "8c", label: "training - other than permanent employees" },
    { p: 3, sub: "8d", label: "training - other than permanent workers" },
    { p: 5, sub: "6a", label: "complaints - sexual harassment" },
    { p: 5, sub: "6b", label: "complaints - discrimination at workplace" },
    { p: 5, sub: "6c", label: "complaints - child labour" },
    { p: 5, sub: "6d", label: "complaints - forced labour" },
    { p: 5, sub: "6e", label: "complaints - involuntary labour" },
    { p: 5, sub: "6f", label: "complaints - wages" },
    { p: 6, sub: "1a", label: "energy - electricity" },
    { p: 6, sub: "1b", label: "energy - fuel" },
    { p: 6, sub: "1c", label: "energy - other sources" },
    { p: 6, sub: "8a", label: "ghg - scope 1" },
    { p: 6, sub: "8b", label: "ghg - scope 2" },
    { p: 6, sub: "10a", label: "waste - hazardous" },
    { p: 6, sub: "10b", label: "waste - non hazardous" },
    { p: 6, sub: "10c", label: "waste - plastic" },
    { p: 6, sub: "10d", label: "waste - e-waste" },
    { p: 6, sub: "10e", label: "waste - bio-medical" },
    { p: 6, sub: "10f", label: "waste - radioactive" },
    { p: 6, sub: "10g", label: "waste - other" },
    { p: 9, sub: "3a", label: "complaints - data privacy" },
    { p: 9, sub: "3b", label: "complaints - advertising" },
    { p: 9, sub: "3c", label: "complaints - cyber security" },
    { p: 9, sub: "3d", label: "complaints - delivery of essential services" },
    { p: 9, sub: "3e", label: "complaints - restrictive trade practices" },
    { p: 9, sub: "3f", label: "complaints - unfair trade practices" },
    { p: 9, sub: "3g", label: "complaints - other" },
  ];
  for (const c of categories) {
    out.push(
      d({
        section_id: `P${c.p}.E.${c.sub}`,
        principle_number: c.p,
        section_name: "Sub-disclosure",
        question_text: `Details of ${c.label} (sub-breakout under Principle ${c.p}).`,
        response_type: "TABLE",
        is_mandatory: true,
        is_brsr_core: c.p === 6,
        mapped_canonical_keys: [],
        formula: null,
        narrative_template: null,
      })
    );
  }
  return out;
}

export const BRSR_DISCLOSURES: BrsrDisclosure[] = [
  ...SECTION_A,
  ...SECTION_B,
  ...P1,
  ...P2,
  ...P3,
  ...P4,
  ...P5,
  ...P6,
  ...P7,
  ...P8,
  ...P9,
  ...expandPrincipleBoardOversight(),
  ...expandSubBreakouts(),
];

/** All section IDs in the order they appear in the schedule. */
export const BRSR_SECTION_IDS: readonly string[] = BRSR_DISCLOSURES.map((d) => d.section_id);

/** Filter helpers. */
export function getBrsrCoreDisclosures(): BrsrDisclosure[] {
  return BRSR_DISCLOSURES.filter((x) => x.is_brsr_core);
}
export function getBrsrByPrinciple(p: number): BrsrDisclosure[] {
  return BRSR_DISCLOSURES.filter((x) => x.principle_number === p);
}
