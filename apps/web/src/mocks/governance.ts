import type { MaterialTopic, Stakeholder, AssuranceSnapshot, AssuranceException } from "@/types";

export const mockMaterialTopics: MaterialTopic[] = [
  { id: "mt_001", name: "GHG Emissions & Climate Strategy", category: "ENVIRONMENT", impactScore: 0.92, financialScore: 0.88, stakeholderWeight: 0.94, priority: "HIGH", frameworks: ["BRSR", "GRI", "TCFD", "IFRS_S2"], responses: 482 },
  { id: "mt_002", name: "Renewable Energy Transition", category: "ENVIRONMENT", impactScore: 0.90, financialScore: 0.86, stakeholderWeight: 0.91, priority: "HIGH", frameworks: ["BRSR", "GRI", "SASB"], responses: 482 },
  { id: "mt_003", name: "Water Stewardship", category: "ENVIRONMENT", impactScore: 0.78, financialScore: 0.62, stakeholderWeight: 0.74, priority: "HIGH", frameworks: ["BRSR", "GRI", "SASB"], responses: 482 },
  { id: "mt_004", name: "Biodiversity & Land Use", category: "ENVIRONMENT", impactScore: 0.72, financialScore: 0.48, stakeholderWeight: 0.62, priority: "MEDIUM", frameworks: ["GRI", "CSRD"], responses: 392 },
  { id: "mt_005", name: "Circular Economy & Waste", category: "ENVIRONMENT", impactScore: 0.64, financialScore: 0.52, stakeholderWeight: 0.58, priority: "MEDIUM", frameworks: ["GRI", "CSRD"], responses: 421 },
  { id: "mt_006", name: "Air Quality (NOx/SOx/PM)", category: "ENVIRONMENT", impactScore: 0.60, financialScore: 0.42, stakeholderWeight: 0.50, priority: "MEDIUM", frameworks: ["SASB"], responses: 312 },
  { id: "mt_007", name: "Occupational Health & Safety", category: "SOCIAL", impactScore: 0.88, financialScore: 0.74, stakeholderWeight: 0.86, priority: "HIGH", frameworks: ["BRSR", "GRI", "SASB"], responses: 482 },
  { id: "mt_008", name: "Diversity, Equity & Inclusion", category: "SOCIAL", impactScore: 0.74, financialScore: 0.68, stakeholderWeight: 0.78, priority: "HIGH", frameworks: ["BRSR", "GRI"], responses: 462 },
  { id: "mt_009", name: "Human Rights in Supply Chain", category: "SOCIAL", impactScore: 0.82, financialScore: 0.70, stakeholderWeight: 0.80, priority: "HIGH", frameworks: ["BRSR", "GRI", "CSRD"], responses: 442 },
  { id: "mt_010", name: "Community Engagement", category: "SOCIAL", impactScore: 0.76, financialScore: 0.58, stakeholderWeight: 0.72, priority: "HIGH", frameworks: ["BRSR", "GRI"], responses: 412 },
  { id: "mt_011", name: "Labour Practices", category: "SOCIAL", impactScore: 0.70, financialScore: 0.60, stakeholderWeight: 0.68, priority: "MEDIUM", frameworks: ["BRSR", "GRI"], responses: 402 },
  { id: "mt_012", name: "Training & Skill Development", category: "SOCIAL", impactScore: 0.62, financialScore: 0.56, stakeholderWeight: 0.60, priority: "MEDIUM", frameworks: ["BRSR", "GRI"], responses: 382 },
  { id: "mt_013", name: "Board Independence & Composition", category: "GOVERNANCE", impactScore: 0.66, financialScore: 0.82, stakeholderWeight: 0.74, priority: "HIGH", frameworks: ["BRSR", "GRI"], responses: 422 },
  { id: "mt_014", name: "Business Ethics & Anti-Corruption", category: "GOVERNANCE", impactScore: 0.78, financialScore: 0.88, stakeholderWeight: 0.84, priority: "HIGH", frameworks: ["BRSR", "GRI"], responses: 462 },
  { id: "mt_015", name: "Data Privacy & Cybersecurity", category: "GOVERNANCE", impactScore: 0.62, financialScore: 0.78, stakeholderWeight: 0.66, priority: "MEDIUM", frameworks: ["BRSR", "GRI"], responses: 372 },
  { id: "mt_016", name: "Innovation & Technology", category: "ECONOMIC", impactScore: 0.58, financialScore: 0.84, stakeholderWeight: 0.62, priority: "MEDIUM", frameworks: ["GRI"], responses: 342 },
  { id: "mt_017", name: "Energy Affordability for Customers", category: "ECONOMIC", impactScore: 0.68, financialScore: 0.72, stakeholderWeight: 0.74, priority: "HIGH", frameworks: ["SASB"], responses: 412 },
  { id: "mt_018", name: "Tax Transparency", category: "GOVERNANCE", impactScore: 0.42, financialScore: 0.64, stakeholderWeight: 0.40, priority: "LOW", frameworks: ["GRI"], responses: 218 },
];

export const mockStakeholders: Stakeholder[] = [
  { id: "stk_001", group: "Shareholders & Investors", influence: 0.92, interest: 0.88, engagementMode: ["AGM", "Quarterly Earnings", "ESG Roadshow"] },
  { id: "stk_002", group: "SEBI & Regulators", influence: 0.96, interest: 0.74, engagementMode: ["BRSR Filing", "Surveillance"] },
  { id: "stk_003", group: "Customers (DISCOMs)", influence: 0.82, interest: 0.68, engagementMode: ["PPAs", "Performance Reviews"] },
  { id: "stk_004", group: "Employees", influence: 0.74, interest: 0.92, engagementMode: ["Townhalls", "Pulse Surveys"] },
  { id: "stk_005", group: "Local Communities", influence: 0.62, interest: 0.84, engagementMode: ["Public Hearings", "CSR Programs"] },
  { id: "stk_006", group: "Suppliers (Tier 1)", influence: 0.58, interest: 0.66, engagementMode: ["Vendor Meets", "Questionnaires"] },
  { id: "stk_007", group: "Big-4 Assurance Providers", influence: 0.70, interest: 0.62, engagementMode: ["Annual Engagement", "Walkthroughs"] },
  { id: "stk_008", group: "Media & Civil Society", influence: 0.54, interest: 0.74, engagementMode: ["Press Releases", "NGO Roundtables"] },
  { id: "stk_009", group: "Lenders & Banks", influence: 0.84, interest: 0.62, engagementMode: ["Sustainability-linked Loans", "Compliance Reviews"] },
];

export const mockSnapshots: AssuranceSnapshot[] = [
  {
    id: "snap_001",
    fy: "FY24-25",
    framework: "BRSR Core",
    status: "ACTIVE",
    metricCount: 38,
    hashAnchor: "0x8f3e22a91b7d4cce9a4...c1d2",
    rootHash: "sha256:4a8f...e2d1",
    createdAt: "2026-04-22T10:00:00Z",
    createdBy: "Priya Iyer",
    assuranceProvider: "KPMG India",
    opinionStatus: "UNQUALIFIED",
    signedAt: "2026-05-28T15:00:00Z",
  },
  {
    id: "snap_002",
    fy: "FY23-24",
    framework: "BRSR Core",
    status: "SUPERSEDED",
    metricCount: 34,
    hashAnchor: "0x7c2d11e88a9b3fe4...b8a2",
    rootHash: "sha256:3b9e...d2c0",
    createdAt: "2025-04-12T10:00:00Z",
    createdBy: "Priya Iyer",
    assuranceProvider: "Deloitte Haskins & Sells",
    opinionStatus: "UNQUALIFIED",
    signedAt: "2025-05-22T13:00:00Z",
  },
];

export const mockExceptions: AssuranceException[] = [
  { id: "exc_001", snapshotId: "snap_001", metricKey: "ghg.scope3.tco2e", metricName: "Scope 3 Total", severity: "MEDIUM", description: "71% of Scope 3 Cat 1 is spend-based; uncertainty estimated at ±18%.", managementResponse: "Roll out supplier-specific PCFs to top-10 vendors by FY25-26 Q3.", status: "RESPONDED", createdAt: "2026-04-25T09:00:00Z" },
  { id: "exc_002", snapshotId: "snap_001", metricKey: "water.discharge.kl", metricName: "Water Discharge", severity: "LOW", description: "Discharge data for MH-SLR May 2025 missing; estimated via withdrawal-discharge ratio.", status: "RESOLVED", createdAt: "2026-04-26T11:00:00Z" },
  { id: "exc_003", snapshotId: "snap_001", metricKey: "ehs.fatalities", metricName: "Fatalities", severity: "INFO", description: "Zero workforce fatalities reported across all sites. Independent corroboration sourced.", status: "RESOLVED", createdAt: "2026-04-26T11:30:00Z" },
  { id: "exc_004", snapshotId: "snap_001", metricKey: "people.diversity.female_share", metricName: "Female Workforce Share", severity: "LOW", description: "Field staff data lag in MH-SLR (commissioned Dec 2025); used Mar 2026 headcount.", managementResponse: "Reconciled in Q1 FY25-26 close.", status: "RESPONDED", createdAt: "2026-04-27T14:00:00Z" },
  { id: "exc_005", snapshotId: "snap_001", metricKey: "gov.bribery.cases", metricName: "Corruption Incidents", severity: "INFO", description: "Whistleblower hotline logged 4 reports; all investigated, none substantiated.", status: "RESOLVED", createdAt: "2026-04-28T09:00:00Z" },
];
