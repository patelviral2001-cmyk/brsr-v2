/**
 * Canonical list of backend endpoints. Path values are passed straight
 * to the axios client which is mounted at NEXT_PUBLIC_API_URL (already
 * includes `/api/v1` in prod) — we therefore avoid hard-coding the
 * version prefix in this map. The `apiClient` strips a leading `/api/v1`
 * if the caller still uses the legacy form, so callers can mix and match
 * during the migration.
 */
export const ENDPOINTS = {
  // ---- IAM / Auth ----
  authLogin: "/iam/auth/login",
  authExchange: "/iam/auth/exchange",
  authRefresh: "/iam/auth/refresh",
  authLogout: "/iam/auth/logout",
  me: "/iam/me",
  users: "/iam/users",
  user: (id: string) => `/iam/users/${id}`,
  roles: "/iam/roles",

  // ---- Tenants ----
  tenantMe: "/tenants/me",
  tenantSettings: "/tenants/me/settings",

  // ---- Hierarchy ----
  hierarchy: "/hierarchy/tree",
  hierarchyNodes: "/hierarchy/nodes",
  hierarchyNode: (id: string) => `/hierarchy/nodes/${id}`,
  hierarchyChildren: (id: string) => `/hierarchy/nodes/${id}/children`,
  hierarchyBulkImport: "/hierarchy/bulk-import",
  hierarchyRollup: (id: string) => `/hierarchy/rollup/${id}`,

  // ---- Materiality ----
  materiality: "/materiality",
  materialityTopics: "/materiality/topics",
  materialitySurveys: "/materiality/surveys",
  materialityAssessments: "/materiality/assessments",

  // ---- Files ----
  files: "/files",
  file: (id: string) => `/files/${id}`,
  fileUpload: "/files/upload",
  fileReprocess: (id: string) => `/files/${id}/reprocess`,
  fileExtraction: (id: string) => `/files/${id}/extractions`,
  fileSignedUrl: (id: string) => `/files/${id}/signed-url`,

  // ---- Extraction ----
  extractionQueue: "/extraction/queue",
  extractionStats: "/extraction/stats",
  extractionField: (id: string) => `/extraction/fields/${id}`,
  extractionFieldApprove: (id: string) => `/extraction/fields/${id}/approve`,
  extractionFieldReject: (id: string) => `/extraction/fields/${id}/reject`,
  // Legacy aliases retained so older code paths keep compiling.
  extractedFields: "/extraction/queue",
  extractionReview: "/extraction/queue",

  // ---- Metrics ----
  metrics: "/metrics/registry",
  metricRegistry: "/metrics/registry",
  metricEvents: "/metrics/events",
  metricEvent: (id: string) => `/metrics/events/${id}`,
  metricEventSubmit: (id: string) => `/metrics/events/${id}/submit`,
  metricEventApprove: (id: string) => `/metrics/events/${id}/approve`,

  // ---- Calculations ----
  calculations: "/calculations/runs",
  calculationRun: (id: string) => `/calculations/runs/${id}`,
  calculationsRun: "/calculations/run",
  formulas: "/calculations/formulas",

  // ---- BRSR / Frameworks ----
  brsrMappings: "/brsr/mappings",
  brsrResolve: "/brsr/resolve",
  brsrPreview: "/brsr/preview",
  brsrGenerate: "/brsr/generate",
  // Keep old aliases so the existing /frameworks pages don't break.
  frameworks: "/brsr/mappings",
  framework: (id: string) => `/brsr/mappings/${id}`,
  brsrSections: "/brsr/preview",
  mappings: "/brsr/mappings",

  // ---- Carbon ----
  emissions: "/carbon/emissions",
  emissionsOverview: "/carbon/emissions",
  scope1: "/carbon/emissions?scope=1",
  scope2: "/carbon/emissions?scope=2",
  scope3: "/carbon/emissions?scope=3",
  scope3Run: "/carbon/scope3/run",
  netZero: "/carbon/net-zero",
  macc: "/carbon/macc",

  // ---- Reports ----
  reports: "/reports",
  report: (id: string) => `/reports/${id}`,
  reportPdf: (id: string) => `/reports/${id}/pdf`,
  reportXlsx: (id: string) => `/reports/${id}/xlsx`,
  reportGenerate: "/reports",

  // ---- Suppliers ----
  suppliers: "/suppliers",
  supplier: (id: string) => `/suppliers/${id}`,
  supplierInvite: (id: string) => `/suppliers/${id}/invite`,
  supplierScorecard: "/suppliers/scorecard",
  supplierQuestionnaires: "/suppliers/questionnaires",

  // ---- Assurance ----
  snapshots: "/assurance/snapshots",
  snapshot: (id: string) => `/assurance/snapshots/${id}`,
  walkthrough: (snapshotId: string) =>
    `/assurance/snapshots/${snapshotId}/walkthrough`,
  exceptions: "/assurance/exceptions",

  // ---- Audit ----
  auditLog: "/audit/logs",

  // ---- Copilot ----
  copilotConversations: "/copilot/conversations",
  copilotConversation: (id: string) => `/copilot/conversations/${id}`,
  copilotMessages: (id: string) => `/copilot/conversations/${id}/messages`,
  copilotStream: "/copilot/stream",

  // ---- Dashboard ----
  dashboardKpis: "/dashboard/kpis",
  dashboardActivity: "/dashboard/activity",
  dashboardAnomalies: "/dashboard/anomalies",
} as const;
