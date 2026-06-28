export const DocType = {
  UTILITY_BILL: 'UTILITY_BILL',
  FUEL_INVOICE: 'FUEL_INVOICE',
  ELECTRICITY_BILL: 'ELECTRICITY_BILL',
  WATER_BILL: 'WATER_BILL',
  WASTE_MANIFEST: 'WASTE_MANIFEST',
  HR_SHEET: 'HR_SHEET',
  PAYROLL: 'PAYROLL',
  SAFETY_INCIDENT: 'SAFETY_INCIDENT',
  AUDITED_FINANCIALS: 'AUDITED_FINANCIALS',
  GRI_INDEX: 'GRI_INDEX',
  BRSR_DRAFT: 'BRSR_DRAFT',
  POLICY_DOC: 'POLICY_DOC',
  BOARD_MINUTES: 'BOARD_MINUTES',
  CERTIFICATE: 'CERTIFICATE',
  SUPPLIER_RESPONSE: 'SUPPLIER_RESPONSE',
  EMISSIONS_INVENTORY: 'EMISSIONS_INVENTORY',
  OTHER: 'OTHER',
} as const;
export type DocType = (typeof DocType)[keyof typeof DocType];
export const docTypeValues = (): readonly DocType[] =>
  Object.values(DocType) as readonly DocType[];

export const DocStatus = {
  PENDING: 'PENDING',
  CLASSIFIED: 'CLASSIFIED',
  EXTRACTED: 'EXTRACTED',
  REVIEW_NEEDED: 'REVIEW_NEEDED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type DocStatus = (typeof DocStatus)[keyof typeof DocStatus];
export const docStatusValues = (): readonly DocStatus[] =>
  Object.values(DocStatus) as readonly DocStatus[];

export const ExtractionStatus = {
  DRAFT: 'DRAFT',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  OVERRIDDEN: 'OVERRIDDEN',
} as const;
export type ExtractionStatus =
  (typeof ExtractionStatus)[keyof typeof ExtractionStatus];
export const extractionStatusValues = (): readonly ExtractionStatus[] =>
  Object.values(ExtractionStatus) as readonly ExtractionStatus[];
