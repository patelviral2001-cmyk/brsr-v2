// THE ESG — backend endpoint map. Paths are relative to NEXT_PUBLIC_API_URL.
export const ENDPOINTS = {
  // Auth
  authLogin:   "/iam/auth/login",
  authRefresh: "/iam/auth/refresh",
  authLogout:  "/iam/auth/logout",
  me:          "/iam/me",

  // Tenant
  tenantMe:    "/tenants/me",

  // Sites
  sites:       "/sites",
  site:        (id: string) => `/sites/${id}`,

  // Evidence
  evidence:           "/evidence",
  evidenceUpload:     "/evidence/upload",
  evidenceDetail:     (id: string) => `/evidence/${id}`,
  evidenceAttachSite: (id: string) => `/evidence/${id}/site`,

  // Extraction
  extractionConfirm:  (evidenceId: string) => `/extraction/${evidenceId}/confirm`,
  extractionHold:     (evidenceId: string) => `/extraction/${evidenceId}/hold`,
  extractionSuggest:  "/extraction/suggested-kpis",

  // Data Points
  dataPoints:          "/data-points",
  dataPointDetail:     (id: string) => `/data-points/${id}`,
  dataPointLineage:    (id: string) => `/data-points/${id}/lineage`,

  // Ontology
  topics:              "/ontology/topics",
  kpis:                "/ontology/kpis",
  kpiByCode:           (code: string) => `/ontology/kpis/code/${code}`,
  standards:           "/ontology/standards",
  standardDisclosures: (code: string) => `/ontology/standards/${code}/disclosures`,

  // Audit Trail
  auditTrail:          "/audit-trail",
};
