import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  GenerateReportDto,
  MappingFilterDto,
  PreviewBrsrDto,
  ResolveBrsrDto,
  ResolvedSectionDto,
} from './dto/brsr.dto';

// Allow-list of schema Framework enum values.
const FRAMEWORK_ENUM = new Set([
  'BRSR', 'BRSR_CORE', 'GRI', 'SASB', 'TCFD', 'IFRS_S1', 'IFRS_S2', 'CSRD_ESRS', 'CDP',
]);

@Injectable()
export class BrsrService {
  private readonly logger = new Logger(BrsrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue('brsr-report') private readonly reportQueue: Queue,
  ) {}

  // ---- Mappings ----

  async listMappings(filter: MappingFilterDto) {
    // Schema model is FrameworkMapping. Validate framework so a bad enum
    // becomes a 400 instead of a Prisma 500.
    if (filter.framework && !FRAMEWORK_ENUM.has(filter.framework)) {
      throw new BadRequestException(`Unknown framework: ${filter.framework}`);
    }
    return (this.prisma as any).frameworkMapping.findMany({
      where: {
        framework: filter.framework as any,
        version: filter.version,
      },
      orderBy: [{ framework: 'asc' }, { frameworkCode: 'asc' }],
    });
  }

  // ---- Resolve ----

  /**
   * Walks the FrameworkMapping rows for the requested framework, resolves
   * each section to the matching APPROVED/LOCKED MetricEvents in scope, and
   * aggregates per the mapping's aggregationOverride (default SUM).
   *
   * Schema fields used:
   *  FrameworkMapping: framework, frameworkCode, frameworkSection,
   *    canonicalKeys[], aggregationOverride, narrativeTemplate
   *  MetricEvent: scopeNodeId, canonicalKey, value, unit, periodEnd,
   *    sourceCalcRunId, sourceExtractionId
   */
  async resolve(tenantId: string, dto: ResolveBrsrDto): Promise<ResolvedSectionDto[]> {
    if (!FRAMEWORK_ENUM.has(dto.framework)) {
      throw new BadRequestException(`Unknown framework: ${dto.framework}`);
    }
    const { periodStart, periodEnd } = parseFy(dto.fy);
    const mappings: {
      id: string;
      frameworkCode: string;
      frameworkSection: string | null;
      canonicalKeys: string[];
      aggregationOverride: string | null;
      narrativeTemplate: string | null;
    }[] = await (this.prisma as any).frameworkMapping.findMany({
      where: {
        framework: dto.framework as any,
        ...(dto.section ? { frameworkCode: dto.section } : {}),
      },
      orderBy: { frameworkCode: 'asc' },
    });
    if (mappings.length === 0) return [];

    const wantedKeys = Array.from(new Set(mappings.flatMap((m) => m.canonicalKeys ?? [])));

    const events: {
      id: string;
      canonicalKey: string;
      value: Decimal;
      unit: string;
      periodEnd: Date;
      sourceCalcRunId: string | null;
      sourceExtractionId: string | null;
    }[] = await (this.prisma as any).metricEvent.findMany({
      where: {
        tenantId,
        scopeNodeId: { in: dto.scopeNodeIds },
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
        status: { in: ['APPROVED', 'LOCKED'] },
        canonicalKey: { in: wantedKeys },
      },
      select: {
        id: true,
        canonicalKey: true,
        value: true,
        unit: true,
        periodEnd: true,
        sourceCalcRunId: true,
        sourceExtractionId: true,
      },
      orderBy: { periodEnd: 'desc' },
    });

    // Look up the document ids that backed each extraction field (single
    // batched query rather than N+1).
    const extractionIds = Array.from(new Set(events.map((e) => e.sourceExtractionId).filter((x): x is string => !!x)));
    const extractionRows: { id: string; documentId: string }[] = extractionIds.length
      ? await (this.prisma as any).extractionField.findMany({
          where: { id: { in: extractionIds }, tenantId },
          select: { id: true, documentId: true },
        })
      : [];
    const docByExtraction = new Map(extractionRows.map((r) => [r.id, r.documentId]));

    const byKey = new Map<string, typeof events>();
    for (const e of events) {
      const arr = byKey.get(e.canonicalKey) ?? [];
      arr.push(e);
      byKey.set(e.canonicalKey, arr);
    }

    const out: ResolvedSectionDto[] = [];
    for (const m of mappings) {
      // Mapping may reference multiple canonical keys; sum across them for SUM/AVG.
      const candidates = (m.canonicalKeys ?? []).flatMap((k) => byKey.get(k) ?? []);
      let value: unknown = null;
      const sourceIds: string[] = candidates.map((c) => c.id);
      const fieldIds = candidates.map((c) => c.sourceExtractionId).filter((x): x is string => !!x);
      const docIds = fieldIds.map((id) => docByExtraction.get(id)).filter((x): x is string => !!x);
      let calcRunId: string | null = null;
      if (candidates.length > 0) {
        // Sort by periodEnd desc for LATEST/FIRST semantics.
        const sorted = candidates.slice().sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime());
        const aggregation = (m.aggregationOverride ?? 'SUM') as string;
        switch (aggregation) {
          case 'WEIGHTED_AVG':
          case 'SUM':
          case 'COUNT':
            value = sorted.reduce((a, c) => a.plus(c.value), new Decimal(0)).toString();
            break;
          case 'MIN':
            value = sorted.reduce((a, c) => (c.value.lt(a) ? c.value : a), sorted[0]!.value).toString();
            break;
          case 'MAX':
            value = sorted.reduce((a, c) => (c.value.gt(a) ? c.value : a), sorted[0]!.value).toString();
            break;
          case 'LATEST':
            value = sorted[0]!.value.toString();
            calcRunId = sorted[0]!.sourceCalcRunId;
            break;
          case 'FIRST':
            value = sorted[sorted.length - 1]!.value.toString();
            calcRunId = sorted[sorted.length - 1]!.sourceCalcRunId;
            break;
          default:
            value = sorted.reduce((a, c) => a.plus(c.value), new Decimal(0)).toString();
        }
      }
      out.push({
        sectionId: m.frameworkSection ?? m.frameworkCode,
        label: m.frameworkCode,
        value,
        unit: undefined,
        sourceMetricEventIds: sourceIds,
        calcRunId,
        evidence: { documentIds: Array.from(new Set(docIds)), extractionFieldIds: fieldIds },
      });
    }
    return out;
  }

  // ---- Sections (frontend-shaped) ----

  /**
   * Returns the BRSR section tree the Frameworks UI expects. Auto-defaults
   * scope to all root entity nodes for the tenant, calls `resolve`, then
   * groups by principle prefix (`P6-Q6` → principle `P6`) so the frontend's
   * BRSRSection[]/BRSRQuestion[] shape lights up without any joins on
   * its side.
   */
  async sections(
    tenantId: string,
    args: { fy: string; framework: BrsrFramework },
  ): Promise<
    Array<{
      id: string;
      principle: string;
      title: string;
      total: number;
      answered: number;
      questions: Array<{
        id: string;
        ref: string;
        text: string;
        answerType: 'NUMERIC' | 'TEXT';
        answer?: string | number;
        metricKey?: string;
        evidence?: string[];
      }>;
    }>
  > {
    const roots: { id: string }[] = await (this.prisma as any).entityNode.findMany({
      where: { tenantId },
      select: { id: true },
      take: 50,
    });
    const scopeNodeIds = roots.map((r) => r.id);
    if (scopeNodeIds.length === 0) return [];
    const resolved = await this.resolve(tenantId, {
      fy: args.fy,
      framework: args.framework,
      scopeNodeIds,
    } as ResolveBrsrDto);

    // Group by principle prefix (e.g. P6-Q6 → P6). Mapping rows that don't
    // follow the Principle-prefixed shape fall under a single "General"
    // bucket so they're still visible.
    const groups = new Map<
      string,
      { principle: string; title: string; questions: Array<any> }
    >();
    for (const r of resolved) {
      const label = r.label ?? '';
      const principle = /^P(\d+)/i.exec(label)?.[0]?.toUpperCase() ?? 'General';
      const groupId = principle;
      const existing = groups.get(groupId) ?? {
        principle,
        title: principle === 'General' ? 'General' : `Principle ${principle.slice(1)}`,
        questions: [],
      };
      existing.questions.push({
        id: r.label,
        ref: r.label,
        text: r.sectionId ?? r.label,
        answerType: typeof r.value === 'number' ? 'NUMERIC' : 'TEXT',
        answer: r.value as string | number | undefined,
        metricKey: undefined,
        evidence: r.evidence?.documentIds ?? [],
      });
      groups.set(groupId, existing);
    }
    return Array.from(groups.values()).map((g) => ({
      id: g.principle.toLowerCase(),
      principle: g.principle,
      title: g.title,
      total: g.questions.length,
      answered: g.questions.filter((q) => q.answer != null).length,
      questions: g.questions,
    }));
  }

  // ---- Preview ----

  async preview(tenantId: string, dto: PreviewBrsrDto): Promise<{ html: string }> {
    const resolved = await this.resolve(tenantId, dto);
    const rows = resolved
      .map(
        (r) =>
          `<tr><td>${escapeHtml(r.sectionId)}</td><td>${escapeHtml(r.label)}</td><td>${escapeHtml(String(r.value ?? '-'))}</td><td>${escapeHtml(r.unit ?? '')}</td></tr>`,
      )
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(dto.framework)} preview — ${escapeHtml(dto.fy)}</title>
      <style>
        body{font-family:-apple-system,sans-serif;color:#111;padding:24px;}
        table{border-collapse:collapse;width:100%;}
        th,td{border:1px solid #ddd;padding:6px 10px;font-size:13px;text-align:left;}
        th{background:#f6f6f6;}
      </style></head>
      <body>
      <h1>${escapeHtml(dto.framework)} — ${escapeHtml(dto.fy)} preview</h1>
      <p>Scope nodes: ${dto.scopeNodeIds.length}</p>
      <table><thead><tr><th>Section</th><th>Label</th><th>Value</th><th>Unit</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`;
    return { html };
  }

  // ---- Generate ----

  async generate(
    tenantId: string,
    dto: GenerateReportDto & { idempotencyKey?: string },
    actorId: string,
  ) {
    if (!FRAMEWORK_ENUM.has(dto.framework)) {
      throw new BadRequestException(`Unknown framework: ${dto.framework}`);
    }
    // Validate scope ownership.
    const owned = await (this.prisma as any).entityNode.count({
      where: { id: { in: dto.scopeNodeIds }, tenantId },
    });
    if (owned !== dto.scopeNodeIds.length) {
      throw new BadRequestException('One or more scopeNodeIds do not belong to this tenant');
    }
    // Schema Report fields: fy, framework, title, status, reportData (json),
    // narrativeOverrides, generatedBy. No 'GENERATING'/'createdBy'/'formats'
    // top-level columns — stash those in reportData / status flow.
    const report = await (this.prisma as any).report.create({
      data: {
        tenantId,
        fy: dto.fy,
        framework: dto.framework as any,
        title: `${dto.framework} ${dto.fy}`,
        status: 'DRAFT',
        reportData: {
          scopeNodeIds: dto.scopeNodeIds,
          principles: dto.principles ?? [],
          requestedFormats: dto.formats ?? ['pdf', 'xlsx'],
        },
        generatedBy: actorId,
      },
    });

    // Queue generation jobs with retry + idempotency.
    for (const fmt of dto.formats ?? ['pdf', 'xlsx']) {
      await this.reportQueue.add(
        fmt,
        { reportId: report.id, tenantId, format: fmt },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          jobId: dto.idempotencyKey
            ? `report-${tenantId}-${dto.idempotencyKey}-${fmt}`
            : undefined,
        },
      );
    }
    if ((dto.formats ?? []).includes('xbrl')) {
      await this.reportQueue.add(
        'xbrl',
        { reportId: report.id, tenantId, format: 'xbrl' },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          jobId: dto.idempotencyKey
            ? `report-${tenantId}-${dto.idempotencyKey}-xbrl`
            : undefined,
        },
      );
    }

    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Report',
      entityId: report.id,
      action: 'CREATE',
      after: report,
      metadata: { generate: true },
    });
    return report;
  }

  async findReport(tenantId: string, id: string) {
    const r = await (this.prisma as any).report.findFirst({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Report not found');
    return r;
  }
}

function parseFy(fy: string): { periodStart: Date; periodEnd: Date } {
  // Accept "FY24-25" or "2024-2025"
  const m = fy.match(/(\d{2,4})\D+(\d{2,4})/);
  if (!m) {
    const year = parseInt(fy, 10);
    if (!Number.isFinite(year) || year < 1990 || year > 2100) {
      // Fallback: current FY April-to-March in IST.
      const now = new Date();
      const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      return { periodStart: new Date(y, 3, 1), periodEnd: new Date(y + 1, 2, 31) };
    }
    return { periodStart: new Date(year, 3, 1), periodEnd: new Date(year + 1, 2, 31) };
  }
  let a = parseInt(m[1] as string, 10);
  let b = parseInt(m[2] as string, 10);
  if (a < 100) a += 2000;
  if (b < 100) b += 2000;
  return { periodStart: new Date(a, 3, 1), periodEnd: new Date(b, 2, 31) };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
