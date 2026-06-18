import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BrsrFramework,
  GenerateReportDto,
  MappingFilterDto,
  PreviewBrsrDto,
  ResolveBrsrDto,
  ResolvedSectionDto,
} from './dto/brsr.dto';

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
    return (this.prisma as any).frameworkMapping.findMany({
      where: { framework: filter.framework, version: filter.version },
      orderBy: [{ framework: 'asc' }, { sectionId: 'asc' }],
    });
  }

  // ---- Resolve ----

  /**
   * Walks the mapping for the requested framework, resolves each sectionId to
   * (a) approved MetricEvents in scope, summed/aggregated per the mapping's
   * aggregation rule, and (b) tracks source ids for the assurance walkthrough.
   */
  async resolve(tenantId: string, dto: ResolveBrsrDto): Promise<ResolvedSectionDto[]> {
    const { periodStart, periodEnd } = parseFy(dto.fy);
    const mappings: {
      sectionId: string;
      label: string;
      canonicalKey: string;
      unit: string | null;
      aggregation: 'SUM' | 'AVG' | 'LATEST' | 'FIRST';
    }[] = await (this.prisma as any).frameworkMapping.findMany({
      where: { framework: dto.framework, sectionId: dto.section ?? undefined },
      orderBy: { sectionId: 'asc' },
    });
    if (mappings.length === 0) return [];

    const events: {
      id: string;
      canonicalKey: string;
      value: Decimal;
      unit: string;
      periodEnd: Date;
      calcRunId: string | null;
      documentId: string | null;
      extractionFieldId: string | null;
    }[] = await (this.prisma as any).metricEvent.findMany({
      where: {
        tenantId,
        scopeNodeId: { in: dto.scopeNodeIds },
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
        status: { in: ['APPROVED', 'LOCKED'] },
        
        canonicalKey: { in: mappings.map((m) => m.canonicalKey) },
      },
      orderBy: { periodEnd: 'desc' },
    });

    const byKey = new Map<string, typeof events>();
    for (const e of events) {
      const arr = byKey.get(e.canonicalKey) ?? [];
      arr.push(e);
      byKey.set(e.canonicalKey, arr);
    }

    const out: ResolvedSectionDto[] = [];
    for (const m of mappings) {
      const candidates = byKey.get(m.canonicalKey) ?? [];
      let value: unknown = null;
      const sourceIds: string[] = candidates.map((c) => c.id);
      const docIds = candidates.map((c) => c.documentId).filter((x): x is string => !!x);
      const fieldIds = candidates.map((c) => c.extractionFieldId).filter((x): x is string => !!x);
      let calcRunId: string | null = null;
      if (candidates.length > 0) {
        switch (m.aggregation) {
          case 'SUM':
            value = candidates.reduce((a, c) => a.plus(c.value), new Decimal(0)).toString();
            break;
          case 'AVG':
            value = candidates
              .reduce((a, c) => a.plus(c.value), new Decimal(0))
              .div(candidates.length)
              .toString();
            break;
          case 'LATEST':
            value = (candidates[0] as { value: Decimal }).value.toString();
            calcRunId = (candidates[0] as { calcRunId: string | null }).calcRunId;
            break;
          case 'FIRST':
            value = (candidates[candidates.length - 1] as { value: Decimal }).value.toString();
            calcRunId = (candidates[candidates.length - 1] as { calcRunId: string | null }).calcRunId;
            break;
        }
      }
      out.push({
        sectionId: m.sectionId,
        label: m.label,
        value,
        unit: m.unit ?? undefined,
        sourceMetricEventIds: sourceIds,
        calcRunId,
        evidence: { documentIds: docIds, extractionFieldIds: fieldIds },
      });
    }
    return out;
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
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${dto.framework} preview — ${dto.fy}</title>
      <style>
        body{font-family:-apple-system,sans-serif;color:#111;padding:24px;}
        table{border-collapse:collapse;width:100%;}
        th,td{border:1px solid #ddd;padding:6px 10px;font-size:13px;text-align:left;}
        th{background:#f6f6f6;}
      </style></head>
      <body>
      <h1>${dto.framework} — ${escapeHtml(dto.fy)} preview</h1>
      <p>Scope nodes: ${dto.scopeNodeIds.length}</p>
      <table><thead><tr><th>Section</th><th>Label</th><th>Value</th><th>Unit</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`;
    return { html };
  }

  // ---- Generate ----

  async generate(tenantId: string, dto: GenerateReportDto, actorId: string) {
    const { periodStart, periodEnd } = parseFy(dto.fy);
    const report = await (this.prisma as any).report.create({
      data: {
        tenantId,
        fy: dto.fy,
        framework: dto.framework,
        periodStart,
        periodEnd,
        scopeNodeIds: dto.scopeNodeIds,
        principles: dto.principles ?? [],
        status: 'GENERATING',
        formats: dto.formats ?? ['pdf', 'xlsx'],
        createdBy: actorId,
      },
    });

    for (const fmt of dto.formats ?? ['pdf', 'xlsx']) {
      await this.reportQueue.add(fmt, { reportId: report.id, tenantId, format: fmt });
    }
    if ((dto.formats ?? []).includes('xbrl')) {
      await this.reportQueue.add('xbrl', { reportId: report.id, tenantId, format: 'xbrl' });
    }

    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Report',
      entityId: report.id,
      action: 'generate',
      after: report,
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
