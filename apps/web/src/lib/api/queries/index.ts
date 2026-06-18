/**
 * TanStack Query hooks. Every hook funnels through `apiClient` so the
 * DEMO_MODE switch, auth header, retry / refresh, and trace headers all
 * apply uniformly. Hooks return typed `UseQueryResult` / `UseMutationResult`
 * so consumers get full inference without `as`-casts.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiUpload } from "../client";
import { ENDPOINTS } from "../endpoints";
import type {
  Tenant,
  User,
  Role,
  HierarchyNode,
  FileObject,
  ExtractedField,
  MetricDefinition,
  MetricEvent,
  CalculationRun,
  Framework,
  BRSRSection,
  Report,
  Supplier,
  MaterialTopic,
  AssuranceSnapshot,
  AssuranceException,
  AuditEvent,
  CopilotConversation,
  EmissionsBreakdown,
  Scope3Category,
  AbatementProject,
  NetZeroTarget,
  Stakeholder,
} from "@/types";

// ----- Shared types -----
export interface ExtractionStats {
  pending: number;
  approved: number;
  rejected: number;
  avgConfidence: number;
}

type EmissionsOverview = EmissionsBreakdown & {
  monthlyTrend: { month: string; scope1: number; scope2: number; scope3: number }[];
  energyMix: { source: string; mwh: number; renewable: boolean }[];
  intensityTrend: { fy: string; perRevenue: number; perFTE: number }[];
};

const DEFAULT_STALE_MS = 30_000;
const DEFAULT_RETRY = 2;

// ===========================================================
// Tenant / Users / Roles
// ===========================================================
export const useTenant = (): UseQueryResult<Tenant> =>
  useQuery({
    queryKey: ["tenant"],
    queryFn: () => apiGet<Tenant>(ENDPOINTS.tenantMe),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useTenantSettings = (): UseQueryResult<Record<string, unknown>> =>
  useQuery({
    queryKey: ["tenant", "settings"],
    queryFn: () => apiGet<Record<string, unknown>>(ENDPOINTS.tenantSettings),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export function useUpdateTenantSettings(): UseMutationResult<
  Record<string, unknown>,
  Error,
  Record<string, unknown>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch) => apiPatch<Record<string, unknown>>(ENDPOINTS.tenantSettings, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant"] });
      qc.invalidateQueries({ queryKey: ["tenant", "settings"] });
    },
  });
}

export const useUsers = (): UseQueryResult<User[]> =>
  useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<User[]>(ENDPOINTS.users),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useRoles = (): UseQueryResult<Role[]> =>
  useQuery({
    queryKey: ["roles"],
    queryFn: () => apiGet<Role[]>(ENDPOINTS.roles),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

// ===========================================================
// Hierarchy
// ===========================================================
export const useHierarchy = (): UseQueryResult<HierarchyNode> =>
  useQuery({
    queryKey: ["hierarchy"],
    queryFn: () => apiGet<HierarchyNode>(ENDPOINTS.hierarchy),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

// Alias matching the spec.
export const useHierarchyTree = useHierarchy;

export const useHierarchyNode = (id: string | null): UseQueryResult<HierarchyNode> =>
  useQuery({
    queryKey: ["hierarchy", id],
    queryFn: () => apiGet<HierarchyNode>(ENDPOINTS.hierarchyNode(id!)),
    enabled: !!id,
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export function useCreateNode(): UseMutationResult<
  HierarchyNode,
  Error,
  Partial<HierarchyNode> & { parentId: string | null; name: string; type: HierarchyNode["type"] }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => apiPost<HierarchyNode>(ENDPOINTS.hierarchyNodes, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hierarchy"] }),
  });
}

export function useUpdateNode(): UseMutationResult<
  HierarchyNode,
  Error,
  { id: string; patch: Partial<HierarchyNode> }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => apiPatch<HierarchyNode>(ENDPOINTS.hierarchyNode(id), patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hierarchy"] }),
  });
}

export function useDeleteNode(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiDelete<void>(ENDPOINTS.hierarchyNode(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hierarchy"] }),
  });
}

// ===========================================================
// Files
// ===========================================================
export const useFiles = (
  filters?: Record<string, unknown>,
): UseQueryResult<FileObject[]> =>
  useQuery({
    queryKey: ["files", filters],
    queryFn: () => apiGet<FileObject[]>(ENDPOINTS.files, filters),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export interface FileDetail extends FileObject {
  extractions?: ExtractedField[];
  signedUrl?: string;
}

export const useFile = (id: string | null): UseQueryResult<FileDetail> =>
  useQuery({
    queryKey: ["file", id],
    queryFn: () => apiGet<FileDetail>(ENDPOINTS.file(id!)),
    enabled: !!id,
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export interface UploadFileInput {
  file: File;
  scopeNodeId?: string;
  docType?: string;
  onProgress?: (pct: number) => void;
}

export function useUploadFile(): UseMutationResult<FileObject, Error, UploadFileInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, scopeNodeId, docType, onProgress }) =>
      apiUpload<FileObject>(
        ENDPOINTS.fileUpload,
        file,
        { scopeNodeId, docType },
        onProgress,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files"] }),
  });
}

export function useReprocessFile(): UseMutationResult<FileObject, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiPost<FileObject>(ENDPOINTS.fileReprocess(id)),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["file", id] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
  });
}

// ===========================================================
// Extraction (HITL queue)
// ===========================================================
export const useExtractionQueue = (
  filters?: Record<string, unknown>,
): UseQueryResult<ExtractedField[]> =>
  useQuery({
    queryKey: ["extraction-queue", filters],
    queryFn: () => apiGet<ExtractedField[]>(ENDPOINTS.extractionQueue, filters),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

// Back-compat alias.
export const useReviewQueue = useExtractionQueue;

export const useExtractionStats = (): UseQueryResult<ExtractionStats> =>
  useQuery({
    queryKey: ["extraction-stats"],
    queryFn: () => apiGet<ExtractionStats>(ENDPOINTS.extractionStats),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useExtractedFields = (fileId?: string): UseQueryResult<ExtractedField[]> =>
  useQuery({
    queryKey: ["extraction", fileId ?? "all"],
    queryFn: () =>
      fileId
        ? apiGet<ExtractedField[]>(ENDPOINTS.fileExtraction(fileId))
        : apiGet<ExtractedField[]>(ENDPOINTS.extractionQueue),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export function useApproveField(): UseMutationResult<
  ExtractedField,
  Error,
  { id: string; value?: string | number; notes?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiPost<ExtractedField>(ENDPOINTS.extractionFieldApprove(input.id), {
        value: input.value,
        notes: input.notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["extraction-queue"] });
      qc.invalidateQueries({ queryKey: ["extraction-stats"] });
    },
  });
}

export function useRejectField(): UseMutationResult<
  ExtractedField,
  Error,
  { id: string; reason: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiPost<ExtractedField>(ENDPOINTS.extractionFieldReject(input.id), {
        reason: input.reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["extraction-queue"] });
      qc.invalidateQueries({ queryKey: ["extraction-stats"] });
    },
  });
}

export function useEditField(): UseMutationResult<
  ExtractedField,
  Error,
  { id: string; value: string | number; notes?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiPatch<ExtractedField>(ENDPOINTS.extractionField(input.id), {
        value: input.value,
        notes: input.notes,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["extraction-queue"] }),
  });
}

// ===========================================================
// Metrics
// ===========================================================
export const useMetricRegistry = (): UseQueryResult<MetricDefinition[]> =>
  useQuery({
    queryKey: ["metric-registry"],
    queryFn: () => apiGet<MetricDefinition[]>(ENDPOINTS.metricRegistry),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useMetricEvents = (
  filters?: Record<string, unknown>,
): UseQueryResult<MetricEvent[]> =>
  useQuery({
    queryKey: ["metric-events", filters],
    queryFn: () => apiGet<MetricEvent[]>(ENDPOINTS.metricEvents, filters),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export function useSubmitMetric(): UseMutationResult<
  MetricEvent,
  Error,
  { id: string; payload?: Record<string, unknown> }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiPost<MetricEvent>(ENDPOINTS.metricEventSubmit(id), payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["metric-events"] }),
  });
}

export function useApproveMetric(): UseMutationResult<MetricEvent, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiPost<MetricEvent>(ENDPOINTS.metricEventApprove(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["metric-events"] }),
  });
}

// ===========================================================
// Calculations
// ===========================================================
export const useCalculations = (): UseQueryResult<CalculationRun[]> =>
  useQuery({
    queryKey: ["calculations"],
    queryFn: () => apiGet<CalculationRun[]>(ENDPOINTS.calculations),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useCalculation = (id: string | null): UseQueryResult<CalculationRun> =>
  useQuery({
    queryKey: ["calculation", id],
    queryFn: () => apiGet<CalculationRun>(ENDPOINTS.calculationRun(id!)),
    enabled: !!id,
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export function useRunCalculation(): UseMutationResult<
  CalculationRun,
  Error,
  Record<string, unknown>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => apiPost<CalculationRun>(ENDPOINTS.calculationsRun, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calculations"] }),
  });
}

// ===========================================================
// Frameworks / BRSR
// ===========================================================
export const useFrameworks = (): UseQueryResult<Framework[]> =>
  useQuery({
    queryKey: ["frameworks"],
    queryFn: () => apiGet<Framework[]>(ENDPOINTS.frameworks),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useBrsrSections = (): UseQueryResult<BRSRSection[]> =>
  useQuery({
    queryKey: ["brsr-sections"],
    queryFn: () => apiGet<BRSRSection[]>(ENDPOINTS.brsrSections),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

// ===========================================================
// Carbon
// ===========================================================
export const useEmissionsOverview = (): UseQueryResult<EmissionsOverview> =>
  useQuery({
    queryKey: ["emissions-overview"],
    queryFn: () => apiGet<EmissionsOverview>(ENDPOINTS.emissionsOverview),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useCarbonEmissions = useEmissionsOverview;

export const useScope3 = (): UseQueryResult<Scope3Category[]> =>
  useQuery({
    queryKey: ["scope3"],
    queryFn: () => apiGet<Scope3Category[]>(ENDPOINTS.scope3),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useNetZero = (): UseQueryResult<
  NetZeroTarget & { pathway: { year: number; target: number; actual?: number; bau?: number }[] }
> =>
  useQuery({
    queryKey: ["net-zero"],
    queryFn: () =>
      apiGet<
        NetZeroTarget & {
          pathway: { year: number; target: number; actual?: number; bau?: number }[];
        }
      >(ENDPOINTS.netZero),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useMacc = (): UseQueryResult<AbatementProject[]> =>
  useQuery({
    queryKey: ["macc"],
    queryFn: () => apiGet<AbatementProject[]>(ENDPOINTS.macc),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

// ===========================================================
// Reports
// ===========================================================
export const useReports = (): UseQueryResult<Report[]> =>
  useQuery({
    queryKey: ["reports"],
    queryFn: () => apiGet<Report[]>(ENDPOINTS.reports),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useReport = (id: string | null): UseQueryResult<Report> =>
  useQuery({
    queryKey: ["report", id],
    queryFn: () => apiGet<Report>(ENDPOINTS.report(id!)),
    enabled: !!id,
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export function useGenerateReport(): UseMutationResult<
  { id: string; status: string },
  Error,
  { frameworks: string[]; fy: string; scopeNodeId: string; formats: string[] }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiPost<{ id: string; status: string }>(ENDPOINTS.reportGenerate, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });
}

// ===========================================================
// Suppliers
// ===========================================================
export const useSuppliers = (): UseQueryResult<Supplier[]> =>
  useQuery({
    queryKey: ["suppliers"],
    queryFn: () => apiGet<Supplier[]>(ENDPOINTS.suppliers),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useSupplier = (id: string | null): UseQueryResult<Supplier> =>
  useQuery({
    queryKey: ["supplier", id],
    queryFn: () => apiGet<Supplier>(ENDPOINTS.supplier(id!)),
    enabled: !!id,
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export function useInviteSupplier(): UseMutationResult<
  Supplier,
  Error,
  { id: string; email?: string; message?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...rest }) => apiPost<Supplier>(ENDPOINTS.supplierInvite(id), rest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

// ===========================================================
// Materiality
// ===========================================================
export const useMaterialTopics = (): UseQueryResult<MaterialTopic[]> =>
  useQuery({
    queryKey: ["materiality-topics"],
    queryFn: () => apiGet<MaterialTopic[]>(ENDPOINTS.materialityTopics),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useMateriality = (): UseQueryResult<{
  topics: MaterialTopic[];
  stakeholders: Stakeholder[];
}> =>
  useQuery({
    queryKey: ["materiality"],
    queryFn: () =>
      apiGet<{ topics: MaterialTopic[]; stakeholders: Stakeholder[] }>(ENDPOINTS.materiality),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

// ===========================================================
// Assurance
// ===========================================================
export const useSnapshots = (): UseQueryResult<AssuranceSnapshot[]> =>
  useQuery({
    queryKey: ["snapshots"],
    queryFn: () => apiGet<AssuranceSnapshot[]>(ENDPOINTS.snapshots),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useExceptions = (): UseQueryResult<AssuranceException[]> =>
  useQuery({
    queryKey: ["exceptions"],
    queryFn: () => apiGet<AssuranceException[]>(ENDPOINTS.exceptions),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

// ===========================================================
// Audit
// ===========================================================
export const useAuditLog = (
  filters?: Record<string, unknown>,
): UseQueryResult<AuditEvent[]> =>
  useQuery({
    queryKey: ["audit-log", filters],
    queryFn: () => apiGet<AuditEvent[]>(ENDPOINTS.auditLog, filters),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

// ===========================================================
// Copilot
// ===========================================================
export const useCopilotConversations = (): UseQueryResult<CopilotConversation[]> =>
  useQuery({
    queryKey: ["copilot-conversations"],
    queryFn: () => apiGet<CopilotConversation[]>(ENDPOINTS.copilotConversations),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export function useAskCopilot(): UseMutationResult<
  { conversationId: string; messageId: string },
  Error,
  { conversationId?: string; prompt: string; mode?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, ...body }) =>
      apiPost<{ conversationId: string; messageId: string }>(
        conversationId
          ? ENDPOINTS.copilotMessages(conversationId)
          : ENDPOINTS.copilotConversations,
        body,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copilot-conversations"] }),
  });
}

// ===========================================================
// Dashboard
// ===========================================================
export interface DashboardKpis {
  emissions: { value: number; deltaPct?: number };
  intensity: { value: number; deltaPct?: number };
  brsrCompletion: number;
  griCompletion: number;
  evidenceLineage: number;
  [key: string]: unknown;
}

export const useDashboardKpis = (): UseQueryResult<DashboardKpis> =>
  useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: () => apiGet<DashboardKpis>(ENDPOINTS.dashboardKpis),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useDashboardActivity = (): UseQueryResult<unknown> =>
  useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: () => apiGet<unknown>(ENDPOINTS.dashboardActivity),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

export const useDashboardAnomalies = (): UseQueryResult<unknown> =>
  useQuery({
    queryKey: ["dashboard-anomalies"],
    queryFn: () => apiGet<unknown>(ENDPOINTS.dashboardAnomalies),
    staleTime: DEFAULT_STALE_MS,
    retry: DEFAULT_RETRY,
  });

// Re-export for callers that import them from the queries module.
export { apiGet, apiPost, apiPatch, apiPut, apiDelete, apiUpload } from "../client";
export { ENDPOINTS } from "../endpoints";
