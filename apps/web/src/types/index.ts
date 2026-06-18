// Mirror of @brsr/contracts shared types

export type ID = string;
export type ISODate = string;

export type NodeType = "GROUP" | "LEGAL_ENTITY" | "BUSINESS_UNIT" | "SITE" | "DEPARTMENT";

export interface HierarchyNode {
  id: ID;
  parentId: ID | null;
  type: NodeType;
  name: string;
  code: string;
  cin?: string;
  address?: string;
  country: string;
  state?: string;
  city?: string;
  industryCode?: string;
  employeeCount?: number;
  revenueINR?: number;
  ownershipPct?: number;
  consolidationBasis?: "FINANCIAL" | "OPERATIONAL" | "EQUITY";
  createdAt: ISODate;
  updatedAt: ISODate;
  children?: HierarchyNode[];
  metadata?: Record<string, unknown>;
}

// Mirrors backend DocStatus enum (services/api/prisma/schema.prisma).
// REVIEW_NEEDED is the canonical post-extraction triage state; NEEDS_REVIEW
// is retained for backwards compatibility with older records.
// PROCESSING / FAILED are legacy UI aliases for CLASSIFIED / REJECTED.
export type FileStatus =
  | "PENDING"
  | "UPLOADED"
  | "CLASSIFIED"
  | "PROCESSING"
  | "EXTRACTED"
  | "EXTRACTION_FAILED"
  | "PARTIAL"
  | "REVIEW_NEEDED"
  | "NEEDS_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "FAILED";

export type DocType =
  | "INVOICE"
  | "UTILITY_BILL"
  | "FUEL_RECEIPT"
  | "PAYROLL"
  | "HR_REGISTER"
  | "POLICY"
  | "AUDIT_REPORT"
  | "SUSTAINABILITY_REPORT"
  | "ENERGY_AUDIT"
  | "EFFLUENT_TEST"
  | "EHS_INCIDENT"
  | "CSR_REPORT"
  | "TRAINING_LOG"
  | "PR_CERT"
  | "OTHER";

export interface FileObject {
  id: ID;
  scopeNodeId: ID;
  scopeNodeName: string;
  filename: string;
  docType: DocType;
  mimeType: string;
  sizeBytes: number;
  status: FileStatus;
  source: "UPLOAD" | "ERP" | "EMAIL" | "API";
  uploadedBy: string;
  uploadedAt: ISODate;
  extractedFieldCount: number;
  avgConfidence: number;
  thumbnailUrl?: string;
  pageCount?: number;
  hash: string;
  tags?: string[];
}

export interface ConfidenceBreakdown {
  ocrQuality: number;
  llmCertainty: number;
  schemaMatch: number;
  historicalAgreement: number;
  crossReference: number;
}

export interface ExtractedField {
  id: ID;
  fileId: ID;
  fileName: string;
  fieldKey: string;
  fieldLabel: string;
  value: string | number;
  unit?: string;
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdown;
  bbox?: { page: number; x: number; y: number; w: number; h: number };
  status: "PENDING" | "APPROVED" | "REJECTED" | "EDITED";
  rawText?: string;
  pageNumber?: number;
  notes?: string;
  metricKey?: string;
}

export interface MetricDefinition {
  id: ID;
  canonicalKey: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  dimensions: string[];
  frameworks: { id: string; ref: string }[];
  dataType: "NUMERIC" | "TEXT" | "BOOLEAN" | "DATE";
  computeKind: "MANUAL" | "DERIVED" | "EXTRACTED";
  formula?: string;
  tags: string[];
}

export interface MetricEvent {
  id: ID;
  metricKey: string;
  metricName: string;
  scopeNodeId: ID;
  scopeNodeName: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  fy: string;
  value: number;
  unit: string;
  status: "DRAFT" | "EXTRACTED" | "APPROVED" | "ASSURED";
  source: "EXTRACTED" | "MANUAL" | "DERIVED" | "INTEGRATION";
  sourceFileId?: ID;
  confidence?: number;
  createdAt: ISODate;
  updatedAt: ISODate;
  dimensions?: Record<string, string>;
}

export interface Framework {
  id: string;
  name: string;
  fullName: string;
  completionPct: number;
  answered: number;
  total: number;
  deadline?: ISODate;
  status: "ON_TRACK" | "AT_RISK" | "BEHIND";
  lastUpdated: ISODate;
}

export interface BRSRSection {
  id: string;
  principle: string;
  title: string;
  total: number;
  answered: number;
  questions: BRSRQuestion[];
}

export interface BRSRQuestion {
  id: string;
  ref: string;
  text: string;
  answerType: "TEXT" | "NUMERIC" | "TABLE" | "YES_NO";
  answer?: string | number;
  metricKey?: string;
  evidence?: ID[];
  status: "UNANSWERED" | "DRAFT" | "ANSWERED" | "ASSURED";
}

export interface CalculationRun {
  id: ID;
  formulaKey: string;
  formulaName: string;
  scopeNodeId: ID;
  scopeNodeName: string;
  fy: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  result?: number;
  unit?: string;
  inputs: { key: string; value: number; unit?: string }[];
  formula: string;
  startedAt: ISODate;
  completedAt?: ISODate;
  durationMs?: number;
}

export interface EmissionsBreakdown {
  scope1: number;
  scope2Location: number;
  scope2Market: number;
  scope3: number;
  total: number;
  intensityPerRevenue: number;
  intensityPerFTE: number;
}

export interface Scope3Category {
  id: number;
  name: string;
  value: number;
  methodology: "SPEND_BASED" | "AVERAGE_DATA" | "HYBRID" | "SUPPLIER_SPECIFIC";
  status: "REPORTED" | "EXCLUDED" | "NA";
}

export interface NetZeroTarget {
  baseYear: number;
  baseEmissions: number;
  targetYear: number;
  targetReduction: number;
  sbti: boolean;
  ambition: "1.5C" | "WB_2C";
  scopes: ("SCOPE_1" | "SCOPE_2" | "SCOPE_3")[];
  validated: boolean;
  validatedAt?: ISODate;
}

export interface AbatementProject {
  id: ID;
  name: string;
  category: "ENERGY_EFFICIENCY" | "RENEWABLES" | "FUEL_SWITCH" | "PROCESS" | "OFFSETS";
  reductionTCO2e: number;
  marginalCostINRPerTCO2e: number;
  capexINR: number;
  paybackYears: number;
  status: "PROPOSED" | "APPROVED" | "IN_PROGRESS" | "COMPLETED";
}

export interface Report {
  id: ID;
  name: string;
  frameworks: string[];
  fy: string;
  scopeNodeId: ID;
  scopeNodeName: string;
  status: "DRAFT" | "GENERATING" | "READY" | "ASSURED" | "FILED";
  formats: ("PDF" | "XLSX" | "XBRL" | "DOCX" | "HTML")[];
  sizeBytes: number;
  generatedAt?: ISODate;
  generatedBy: string;
  assuredBy?: string;
  filedAt?: ISODate;
  thumbnailUrl?: string;
  downloadUrls?: Partial<Record<"PDF" | "XLSX" | "XBRL" | "DOCX" | "HTML", string>>;
}

export interface Supplier {
  id: ID;
  name: string;
  category: string;
  country: string;
  tier: 1 | 2 | 3;
  spendINR: number;
  scope3CategoryId: number;
  scope3ContributionTCO2e: number;
  esgScore: number;
  scorecard: {
    environment: number;
    social: number;
    governance: number;
    climate: number;
    waterWaste: number;
  };
  questionnaireStatus: "NOT_SENT" | "SENT" | "PARTIAL" | "COMPLETED" | "OVERDUE";
  lastResponseAt?: ISODate;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface MaterialTopic {
  id: ID;
  name: string;
  category: "ENVIRONMENT" | "SOCIAL" | "GOVERNANCE" | "ECONOMIC";
  impactScore: number;
  financialScore: number;
  stakeholderWeight: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  frameworks: string[];
  responses: number;
}

export interface Stakeholder {
  id: ID;
  group: string;
  influence: number;
  interest: number;
  engagementMode: string[];
}

export interface AssuranceSnapshot {
  id: ID;
  fy: string;
  framework: string;
  status: "ACTIVE" | "SUPERSEDED";
  metricCount: number;
  hashAnchor: string;
  rootHash: string;
  createdAt: ISODate;
  createdBy: string;
  assuranceProvider?: string;
  opinionStatus?: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE" | "DISCLAIMER";
  signedAt?: ISODate;
}

export interface AssuranceException {
  id: ID;
  snapshotId: ID;
  metricKey: string;
  metricName: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  managementResponse?: string;
  status: "OPEN" | "RESPONDED" | "RESOLVED";
  createdAt: ISODate;
}

export interface AuditEvent {
  id: ID;
  actorId: ID;
  actorName: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: ID;
  entityName?: string;
  diff?: { before: Record<string, unknown>; after: Record<string, unknown> };
  ip?: string;
  userAgent?: string;
  at: ISODate;
}

export interface CopilotMessage {
  id: ID;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: { id: ID; type: string; ref: string; label: string }[];
  createdAt: ISODate;
  mode?: "ANALYST" | "WRITER" | "EXPLAINER" | "BENCHMARKER";
}

export interface CopilotConversation {
  id: ID;
  title: string;
  messages: CopilotMessage[];
  mode: "ANALYST" | "WRITER" | "EXPLAINER" | "BENCHMARKER";
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Tenant {
  id: ID;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor: string;
  industries: string[];
  countries: string[];
  fiscalYearStart: string;
  reportingCurrency: "INR" | "USD" | "EUR";
  plan: "STARTER" | "GROWTH" | "ENTERPRISE";
  featureFlags: Record<string, boolean>;
}

export interface User {
  id: ID;
  email: string;
  name: string;
  avatarUrl?: string;
  roles: string[];
  scopeIds: ID[];
  lastLoginAt?: ISODate;
  mfaEnabled: boolean;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
}

export interface Role {
  id: ID;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  isSystem: boolean;
}
