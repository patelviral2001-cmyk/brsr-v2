export const ReportFormat = {
  PDF: 'PDF',
  XLSX: 'XLSX',
  XBRL: 'XBRL',
  DOCX: 'DOCX',
  HTML: 'HTML',
  JSON: 'JSON',
} as const;
export type ReportFormat = (typeof ReportFormat)[keyof typeof ReportFormat];
export const reportFormatValues = (): readonly ReportFormat[] =>
  Object.values(ReportFormat) as readonly ReportFormat[];

export const ReportStatus = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  FILED: 'FILED',
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];
export const reportStatusValues = (): readonly ReportStatus[] =>
  Object.values(ReportStatus) as readonly ReportStatus[];

export const AssuranceStatus = {
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
} as const;
export type AssuranceStatus =
  (typeof AssuranceStatus)[keyof typeof AssuranceStatus];
export const assuranceStatusValues = (): readonly AssuranceStatus[] =>
  Object.values(AssuranceStatus) as readonly AssuranceStatus[];
