import type { AuditEvent } from "@/types";

const actors = [
  { id: "user_priya", name: "Priya Iyer", email: "priya.iyer@imaginepowertree.com" },
  { id: "user_arjun", name: "Arjun Menon", email: "arjun.menon@imaginepowertree.com" },
  { id: "user_kavita", name: "Kavita Rao", email: "kavita.rao@imaginepowertree.com" },
  { id: "user_rohan", name: "Rohan Sharma", email: "rohan.sharma@imaginepowertree.com" },
  { id: "user_audit_kpmg", name: "Vikram Singh (KPMG)", email: "esg.assurance@kpmg.in" },
];

const eventSpecs: { action: string; entityType: string; entityName: string; diff?: { before: Record<string, unknown>; after: Record<string, unknown> } }[] = [
  { action: "report.assured", entityType: "Report", entityName: "BRSR FY24-25", diff: { before: { status: "READY" }, after: { status: "ASSURED" } } },
  { action: "report.filed", entityType: "Report", entityName: "BRSR FY24-25" },
  { action: "extraction.approved", entityType: "ExtractedField", entityName: "electricity.units_kwh @ BLR HQ April" },
  { action: "metric.updated", entityType: "MetricEvent", entityName: "ghg.scope2.market.tco2e (FY24-25)", diff: { before: { value: 10_220 }, after: { value: 9_810 } } },
  { action: "file.uploaded", entityType: "File", entityName: "BESCOM_April2025_BLR-HQ.pdf" },
  { action: "calculation.executed", entityType: "CalculationRun", entityName: "ghg.scope3.cat1 — FY24-25" },
  { action: "user.role.changed", entityType: "User", entityName: "Dhruv Bhat", diff: { before: { roles: ["VIEWER"] }, after: { roles: ["SUSTAINABILITY_ANALYST"] } } },
  { action: "hierarchy.node.created", entityType: "HierarchyNode", entityName: "Maharashtra Solar 100MW" },
  { action: "hierarchy.node.updated", entityType: "HierarchyNode", entityName: "Bengaluru HQ", diff: { before: { employeeCount: 408 }, after: { employeeCount: 412 } } },
  { action: "snapshot.created", entityType: "AssuranceSnapshot", entityName: "SNAP-FY24-25-001" },
  { action: "snapshot.signed", entityType: "AssuranceSnapshot", entityName: "SNAP-FY24-25-001" },
  { action: "exception.raised", entityType: "AssuranceException", entityName: "Scope 3 Cat 1 estimation uncertainty" },
  { action: "supplier.invited", entityType: "Supplier", entityName: "Resolve Energy Solutions" },
  { action: "materiality.topic.prioritized", entityType: "MaterialTopic", entityName: "Climate adaptation" },
  { action: "copilot.session.started", entityType: "CopilotConversation", entityName: "Why is energy up 18% this Q?" },
];

const actions = [
  "report.generated", "report.assured", "report.filed",
  "file.uploaded", "file.deleted",
  "extraction.approved", "extraction.rejected",
  "metric.updated", "metric.created",
  "calculation.executed",
  "user.invited", "user.role.changed", "user.deleted",
  "hierarchy.node.created", "hierarchy.node.updated", "hierarchy.node.archived",
  "snapshot.created", "snapshot.signed",
  "exception.raised", "exception.resolved",
  "supplier.invited", "supplier.scorecard.updated",
  "materiality.topic.prioritized",
  "copilot.session.started",
  "settings.updated",
  "integration.connected", "integration.disconnected",
];

const entityTypes = ["Report", "File", "ExtractedField", "MetricEvent", "CalculationRun", "User", "HierarchyNode", "AssuranceSnapshot", "Supplier", "MaterialTopic"];

const events: AuditEvent[] = [];
for (let i = 0; i < 50; i++) {
  const spec = eventSpecs[i % eventSpecs.length];
  const actor = actors[i % actors.length];
  const dt = new Date(2026, 5, 16);
  dt.setHours(dt.getHours() - i * 5 - Math.floor(Math.random() * 4));
  events.push({
    id: `aud_${String(i + 1).padStart(4, "0")}`,
    actorId: actor.id,
    actorName: actor.name,
    actorEmail: actor.email,
    action: spec?.action ?? actions[i % actions.length],
    entityType: spec?.entityType ?? entityTypes[i % entityTypes.length],
    entityId: `ent_${i}`,
    entityName: spec?.entityName,
    diff: spec?.diff,
    ip: `203.0.113.${10 + (i % 240)}`,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0",
    at: dt.toISOString(),
  });
}

export const mockAuditEvents: AuditEvent[] = events;
