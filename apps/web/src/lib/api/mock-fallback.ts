/**
 * Mock data resolver. ONLY runs when NEXT_PUBLIC_DEMO_MODE === "true".
 * In any other case the client lets backend errors propagate so they
 * surface in error UI instead of being silently masked by stale fixtures.
 *
 * The map handles both the new paths (e.g. `/tenants/me`) and the legacy
 * `/api/v1/*` ones, so older callers keep working during the migration.
 */
import { AxiosRequestConfig } from "axios";
import { DEMO_MODE } from "../constants";
import { mockTenant, mockUsers, mockRoles } from "@/mocks/tenant";
import { mockHierarchy, mockHierarchyFlat } from "@/mocks/hierarchy";
import { mockFiles, mockExtractedFields } from "@/mocks/files";
import { mockMetricDefs, mockMetricEvents } from "@/mocks/metrics";
import {
  mockCalculations,
  mockEmissions,
  mockScope3Categories,
  mockMacc,
  mockNetZero,
} from "@/mocks/calculations";
import { mockSuppliers } from "@/mocks/suppliers";
import { mockReports, mockFrameworks, mockBrsrSections } from "@/mocks/reports";
import { mockAuditEvents } from "@/mocks/audit";
import {
  mockMaterialTopics,
  mockStakeholders,
  mockSnapshots,
  mockExceptions,
} from "@/mocks/governance";
import { mockCopilotConvos } from "@/mocks/copilot";
import {
  mockDashboardKpis,
  mockDashboardActivity,
  mockDashboardAnomalies,
} from "@/mocks/dashboard";

function normalize(path: string): string {
  // Strip query string + collapse legacy version prefix so we can match
  // both `/tenants/me` and `/api/v1/tenants/me` against the same arm.
  const [clean] = path.split("?");
  return clean.replace(/^\/api\/v1/, "");
}

function lastSegment(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "";
}

function nthSegment(path: string, n: number): string | undefined {
  return path.split("/").filter(Boolean)[n];
}

export async function resolveMock<T>(
  path: string,
  config: AxiosRequestConfig,
): Promise<T | undefined> {
  // Hard gate: only run in DEMO_MODE.
  if (!DEMO_MODE) return undefined;

  const p = normalize(path);
  const method = (config.method ?? "GET").toUpperCase();

  // ---- Auth / IAM ----
  if (p === "/iam/me") {
    return {
      id: "user_demo",
      email: "demo@imaginepowertree.com",
      firstName: "Priya",
      lastName: "Iyer",
      tenantId: "tnt_imaginepowertree",
      roles: ["GROUP_HEAD_SUSTAINABILITY"],
    } as T;
  }
  if (p === "/iam/users") return mockUsers as T;
  if (p === "/iam/roles") return mockRoles as T;
  if (p === "/iam/auth/login" && method === "POST") {
    return {
      token: "demo.access.token",
      refreshToken: "demo.refresh.token",
      user: {
        id: "user_demo",
        email: "demo@imaginepowertree.com",
        firstName: "Priya",
        lastName: "Iyer",
        tenantId: "tnt_imaginepowertree",
        roles: ["GROUP_HEAD_SUSTAINABILITY"],
      },
    } as T;
  }

  // ---- Tenants ----
  if (p === "/tenants/me") return mockTenant as T;
  if (p === "/tenants/me/settings") return ({ ...mockTenant, settings: {} } as unknown) as T;

  // ---- Hierarchy ----
  if (p === "/hierarchy/tree") return mockHierarchy as T;
  if (p === "/hierarchy/nodes") return mockHierarchyFlat as T;
  if (p.startsWith("/hierarchy/nodes/")) {
    const id = lastSegment(p);
    return mockHierarchyFlat.find((n) => n.id === id) as T;
  }
  if (p.startsWith("/hierarchy/rollup/")) {
    return { nodeId: lastSegment(p), kpis: mockDashboardKpis } as unknown as T;
  }

  // ---- Files ----
  if (p === "/files") return mockFiles as T;
  if (p === "/files/upload" && method === "POST") {
    return ({
      id: `file_${Date.now()}`,
      status: "PROCESSING",
      uploadedAt: new Date().toISOString(),
    } as unknown) as T;
  }
  if (p.startsWith("/files/")) {
    const fileId = nthSegment(p, 1)!;
    if (p.endsWith("/extractions") || p.endsWith("/extraction")) {
      return (mockExtractedFields.filter((f) => f.fileId === fileId) as unknown) as T;
    }
    if (p.endsWith("/signed-url")) {
      const f = mockFiles.find((x) => x.id === fileId);
      return ({ url: f?.thumbnailUrl ?? "", expiresAt: new Date(Date.now() + 3600_000).toISOString() } as unknown) as T;
    }
    if (p.endsWith("/reprocess") && method === "POST") {
      return ({ id: fileId, status: "PROCESSING" } as unknown) as T;
    }
    return mockFiles.find((f) => f.id === fileId) as T;
  }

  // ---- Extraction ----
  if (p === "/extraction/queue") {
    return mockExtractedFields.filter((f) => f.status === "PENDING") as T;
  }
  if (p === "/extraction/stats") {
    return ({
      pending: mockExtractedFields.filter((f) => f.status === "PENDING").length,
      approved: mockExtractedFields.filter((f) => f.status === "APPROVED").length,
      rejected: mockExtractedFields.filter((f) => f.status === "REJECTED").length,
      avgConfidence: 0.86,
    } as unknown) as T;
  }
  if (p.startsWith("/extraction/fields/")) {
    const id = nthSegment(p, 2)!;
    if (p.endsWith("/approve") && method === "POST") {
      return ({ id, status: "APPROVED" } as unknown) as T;
    }
    if (p.endsWith("/reject") && method === "POST") {
      return ({ id, status: "REJECTED" } as unknown) as T;
    }
    return mockExtractedFields.find((f) => f.id === id) as T;
  }

  // ---- Metrics ----
  if (p === "/metrics/registry") return mockMetricDefs as T;
  if (p === "/metrics/events") return mockMetricEvents as T;
  if (p.startsWith("/metrics/events/")) {
    const id = nthSegment(p, 2)!;
    if (p.endsWith("/submit") && method === "POST")
      return ({ id, status: "SUBMITTED" } as unknown) as T;
    if (p.endsWith("/approve") && method === "POST")
      return ({ id, status: "APPROVED" } as unknown) as T;
    return mockMetricEvents.find((e) => e.id === id) as T;
  }

  // ---- Calculations ----
  if (p === "/calculations/runs" || p === "/calculations/formulas")
    return mockCalculations as T;
  if (p === "/calculations/run" && method === "POST") {
    return ({ id: `run_${Date.now()}`, status: "QUEUED" } as unknown) as T;
  }
  if (p.startsWith("/calculations/runs/")) {
    return mockCalculations.find((c) => c.id === lastSegment(p)) as T;
  }

  // ---- BRSR / Frameworks ----
  if (p === "/brsr/mappings") return mockFrameworks as T;
  if (p === "/brsr/preview") return mockBrsrSections as T;
  if (p === "/brsr/resolve" && method === "POST") {
    return ({ resolved: mockBrsrSections.length, gaps: 0 } as unknown) as T;
  }
  if (p === "/brsr/generate" && method === "POST") {
    return ({ id: `rpt_${Date.now()}`, status: "GENERATING" } as unknown) as T;
  }

  // ---- Carbon ----
  if (p === "/carbon/emissions") return mockEmissions as T;
  if (p.startsWith("/carbon/emissions")) return mockEmissions as T;
  if (p === "/carbon/scope3/run" && method === "POST")
    return ({ id: `run_${Date.now()}`, status: "QUEUED" } as unknown) as T;
  if (p === "/carbon/net-zero") return mockNetZero as T;
  if (p === "/carbon/macc") return mockMacc as T;
  if (p === "/carbon/scope3-categories" || p === "/carbon/scope3")
    return mockScope3Categories as T;

  // ---- Reports ----
  if (p === "/reports") {
    if (method === "POST")
      return ({ id: `rpt_${Date.now()}`, status: "GENERATING" } as unknown) as T;
    return mockReports as T;
  }
  if (p.startsWith("/reports/")) {
    const id = lastSegment(p);
    if (p.endsWith("/pdf") || p.endsWith("/xlsx"))
      return ({ url: `https://example.com/reports/${id}.pdf` } as unknown) as T;
    return mockReports.find((r) => r.id === id) as T;
  }

  // ---- Suppliers ----
  if (p === "/suppliers") return mockSuppliers as T;
  if (p === "/suppliers/scorecard") {
    return ({
      total: mockSuppliers.length,
      assessed: mockSuppliers.length,
      avgScore: 72,
    } as unknown) as T;
  }
  if (p.startsWith("/suppliers/")) {
    const id = nthSegment(p, 1)!;
    if (p.endsWith("/invite") && method === "POST")
      return ({ id, status: "INVITED" } as unknown) as T;
    return mockSuppliers.find((s) => s.id === id) as T;
  }

  // ---- Materiality ----
  if (p === "/materiality/topics") return mockMaterialTopics as T;
  if (p === "/materiality" || p === "/materiality/surveys" || p === "/materiality/assessments") {
    return ({ topics: mockMaterialTopics, stakeholders: mockStakeholders } as unknown) as T;
  }

  // ---- Assurance ----
  if (p === "/assurance/snapshots") return mockSnapshots as T;
  if (p === "/assurance/exceptions") return mockExceptions as T;
  if (p.startsWith("/assurance/snapshots/")) {
    const id = nthSegment(p, 2)!;
    if (p.endsWith("/walkthrough"))
      return ({ snapshotId: id, steps: [] } as unknown) as T;
    return mockSnapshots.find((s) => s.id === id) as T;
  }

  // ---- Audit ----
  if (p === "/audit/logs" || p === "/audit/log") return mockAuditEvents as T;

  // ---- Copilot ----
  if (p === "/copilot/conversations") return mockCopilotConvos as T;
  if (p.startsWith("/copilot/conversations/")) {
    const id = nthSegment(p, 2)!;
    const c = mockCopilotConvos.find((c) => c.id === id);
    if (p.endsWith("/messages")) return (c?.messages ?? []) as T;
    return c as T;
  }

  // ---- Dashboard ----
  if (p === "/dashboard/kpis") return mockDashboardKpis as T;
  if (p === "/dashboard/activity") return mockDashboardActivity as T;
  if (p === "/dashboard/anomalies") return mockDashboardAnomalies as T;

  return undefined;
}
