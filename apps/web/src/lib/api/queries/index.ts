"use client";

import { useMutation, useQuery, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, apiPostFormData } from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types (small, just what the UI needs) ─────────────────────────────

export interface Site {
  id: string;
  tenantId: string;
  name: string;
  externalCode?: string;
  siteType: string;
  state?: string;
  district?: string;
  city?: string;
  status: string;
  createdAt: string;
}

export interface Evidence {
  id: string;
  tenantId: string;
  siteId?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  docType: string;
  status: string;
  classifierConfidence?: number;
  uploadedAt: string;
  uploadedBy: string;
  hintPeriodStart?: string;
  hintPeriodEnd?: string;
  signedUrl?: string;
  site?: { id: string; name: string };
  extractions?: ExtractionResult[];
  _count?: { extractions: number };
}

export interface ExtractionResult {
  id: string;
  evidenceId: string;
  schemaCode: string;
  payload: Record<string, unknown>;
  confidence: number;
  status: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface Kpi {
  id: string;
  code: string;
  title: string;
  description?: string;
  payloadKind: string;       // QUANTITATIVE | PROPORTION | DIMENSIONAL | NARRATIVE | EVENT_LIST
  unit?: string;
  materializationKind: string;
  topic: { code: string; title: string; pillar: "E" | "S" | "G" };
}

export interface DataPoint {
  id: string;
  tenantId: string;
  kpiId: string;
  siteId?: string;
  periodStart: string;
  periodEnd: string;
  fy: string;
  payload: Record<string, unknown>;
  source: string;
  status: string;
  evidenceId?: string;
  confidenceScore?: number;
  submittedAt: string;
  submittedBy: string;
  kpi?: Kpi;
  site?: Site;
  evidence?: Pick<Evidence, "id" | "originalName" | "status">;
}

export interface AuditTrailEntry {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorUserId?: string;
  createdAt: string;
  diff?: { before?: unknown; after?: unknown; metadata?: Record<string, unknown> };
}

// ─── Sites ─────────────────────────────────────────────────────────────

export const useSites = (): UseQueryResult<Site[]> =>
  useQuery({ queryKey: ["sites"], queryFn: () => apiGet<Site[]>(ENDPOINTS.sites) });

export const useSite = (id: string | null): UseQueryResult<Site> =>
  useQuery({
    queryKey: ["site", id],
    queryFn: () => apiGet<Site>(ENDPOINTS.site(id!)),
    enabled: !!id,
  });

export const useCreateSite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: Partial<Site> & { name: string; siteType: string }) =>
      apiPost<Site>(ENDPOINTS.sites, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
};

export const useUpdateSite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: Partial<Site> & { id: string }) =>
      apiPatch<Site>(ENDPOINTS.site(id), dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
};

export const useDeactivateSite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(ENDPOINTS.site(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
};

// ─── Evidence ──────────────────────────────────────────────────────────

export const useEvidenceList = (params?: { status?: string; siteId?: string }): UseQueryResult<Evidence[]> =>
  useQuery({
    queryKey: ["evidence", params],
    queryFn: () => apiGet<Evidence[]>(ENDPOINTS.evidence, { params }),
    refetchInterval: 4000, // pipeline state can advance asynchronously
  });

export const useEvidence = (id: string | null): UseQueryResult<Evidence> =>
  useQuery({
    queryKey: ["evidence", id],
    queryFn: () => apiGet<Evidence>(ENDPOINTS.evidenceDetail(id!)),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      // Poll while pipeline is in flight; stop once it's a terminal state.
      if (!s) return 3000;
      return ["PENDING", "CLASSIFIED"].includes(s) ? 2500 : false;
    },
  });

export const useUploadEvidence = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      file: File;
      siteId?: string;
      docTypeHint?: string;
      hintPeriodStart?: string;
      hintPeriodEnd?: string;
    }) => {
      const fd = new FormData();
      fd.append("file", params.file);
      if (params.siteId) fd.append("siteId", params.siteId);
      if (params.docTypeHint) fd.append("docTypeHint", params.docTypeHint);
      if (params.hintPeriodStart) fd.append("hintPeriodStart", params.hintPeriodStart);
      if (params.hintPeriodEnd) fd.append("hintPeriodEnd", params.hintPeriodEnd);
      return apiPostFormData<Evidence>(ENDPOINTS.evidenceUpload, fd);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evidence"] }),
  });
};

export const useAttachSite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, siteId }: { id: string; siteId: string }) =>
      apiPatch<Evidence>(ENDPOINTS.evidenceAttachSite(id), { siteId }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["evidence"] });
      qc.invalidateQueries({ queryKey: ["evidence", v.id] });
    },
  });
};

// ─── Extraction promotion (Confirm & Save) ─────────────────────────────

export const useSuggestedKpis = (schemaCode: string | null) =>
  useQuery<{ schemaCode: string; kpiCodes: string[] }>({
    queryKey: ["extraction-suggested-kpis", schemaCode],
    queryFn: () => apiGet(ENDPOINTS.extractionSuggest, { params: { schema: schemaCode } }),
    enabled: !!schemaCode,
  });

export interface ConfirmDataPointPayload {
  kpiCode: string;
  payload: unknown;
  confidence?: number;
}

export const useConfirmExtraction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      evidenceId: string;
      siteId: string;
      periodStart: string;
      periodEnd: string;
      dataPoints: ConfirmDataPointPayload[];
    }) =>
      apiPost(ENDPOINTS.extractionConfirm(params.evidenceId), {
        siteId: params.siteId,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        dataPoints: params.dataPoints,
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["evidence"] });
      qc.invalidateQueries({ queryKey: ["evidence", v.evidenceId] });
      qc.invalidateQueries({ queryKey: ["data-points"] });
    },
  });
};

export const useHoldEvidence = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiPost(ENDPOINTS.extractionHold(id), { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evidence"] }),
  });
};

// ─── Data Points ───────────────────────────────────────────────────────

export const useDataPoints = (params?: { siteId?: string; topic?: string; kpi?: string; fy?: string }) =>
  useQuery<DataPoint[]>({
    queryKey: ["data-points", params],
    queryFn: () => apiGet(ENDPOINTS.dataPoints, { params }),
  });

export const useDataPoint = (id: string | null) =>
  useQuery<DataPoint>({
    queryKey: ["data-point", id],
    queryFn: () => apiGet(ENDPOINTS.dataPointDetail(id!)),
    enabled: !!id,
  });

export interface Lineage {
  dataPoint: DataPoint;
  evidence: Evidence | null;
  extraction: ExtractionResult | null;
  auditTrail: AuditTrailEntry[];
}

export const useDataPointLineage = (id: string | null) =>
  useQuery<Lineage>({
    queryKey: ["data-point-lineage", id],
    queryFn: () => apiGet(ENDPOINTS.dataPointLineage(id!)),
    enabled: !!id,
  });

// ─── Ontology ──────────────────────────────────────────────────────────

export const useTopics = () =>
  useQuery({ queryKey: ["topics"], queryFn: () => apiGet<Array<{ id: string; code: string; title: string; pillar: "E" | "S" | "G"; sortKey: number }>>(ENDPOINTS.topics) });

export const useKpis = (topicCode?: string) =>
  useQuery<Kpi[]>({
    queryKey: ["kpis", topicCode],
    queryFn: () => apiGet(ENDPOINTS.kpis, { params: { topic: topicCode } }),
  });

export const useKpiByCode = (code: string | null) =>
  useQuery<Kpi>({
    queryKey: ["kpi-code", code],
    queryFn: () => apiGet(ENDPOINTS.kpiByCode(code!)),
    enabled: !!code,
  });
