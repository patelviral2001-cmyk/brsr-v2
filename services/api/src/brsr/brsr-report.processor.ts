import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { S3Storage } from '../common/utils/s3.client';
import { BrsrService } from './brsr.service';
import { hashObject } from '../common/utils/hash';

interface ReportJob {
  reportId: string;
  tenantId: string;
  format: 'pdf' | 'xlsx' | 'xbrl';
}

@Processor('brsr-report')
export class BrsrReportProcessor extends WorkerHost {
  private readonly logger = new Logger(BrsrReportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Storage,
    private readonly brsr: BrsrService,
  ) {
    super();
  }

  async process(job: Job<ReportJob>): Promise<void> {
    const { reportId, tenantId, format } = job.data;
    const report = await (this.prisma as any).report.findFirst({ where: { id: reportId, tenantId } });
    if (!report) {
      this.logger.warn(`Report ${reportId} not found`);
      return;
    }

    // Schema Report stores generation inputs inside reportData (json).
    const reportData = (report.reportData ?? {}) as {
      scopeNodeIds?: string[];
      requestedFormats?: string[];
      principles?: number[];
    };

    const resolved = await this.brsr.resolve(tenantId, {
      fy: report.fy,
      framework: report.framework,
      scopeNodeIds: reportData.scopeNodeIds ?? [],
    } as any);

    let buf: Buffer;
    let mime: string;
    // Schema has dedicated columns pdfS3, xlsxS3, xbrlS3, docxS3 (single S3 key
    // each, no separate bucket). Map format -> column.
    let column: 'pdfS3' | 'xlsxS3' | 'xbrlS3' | 'docxS3';
    let suffix: string;

    if (format === 'pdf') {
      buf = await this.buildPdf(report, resolved);
      mime = 'application/pdf';
      column = 'pdfS3';
      suffix = 'pdf';
    } else if (format === 'xlsx') {
      buf = await this.buildXlsx(report, resolved);
      mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      column = 'xlsxS3';
      suffix = 'xlsx';
    } else {
      // XBRL stub — real implementation lives in services/xbrl/ (Arelle).
      buf = Buffer.from(this.buildXbrlStub(report, resolved), 'utf8');
      mime = 'application/xml';
      column = 'xbrlS3';
      suffix = 'xbrl';
    }

    const bucket = this.s3.bucketReports();
    const key = `t/${tenantId}/reports/${report.id}.${suffix}`;
    await this.s3.put({ bucket, key, body: buf, contentType: mime });
    const hash = hashObject(resolved);

    const update: Record<string, unknown> = {
      [column]: key,
      hashAnchor: hash,
    };

    const updated = await (this.prisma as any).report.update({
      where: { id: report.id },
      data: update,
    });
    // Flip status to PUBLISHED when all requested formats are persisted.
    const requested = (reportData.requestedFormats ?? ['pdf', 'xlsx']) as string[];
    const allDone = requested.every((fmt) => !!updated[`${fmt}S3`]);
    if (allDone && updated.status === 'DRAFT') {
      await (this.prisma as any).report.update({
        where: { id: report.id },
        data: { status: 'IN_REVIEW' },
      });
    }
    this.logger.log(`Wrote ${format} report ${reportId} -> s3://${bucket}/${key}`);
  }

  // ---------------------------------------------------------------- PDF
  private async buildPdf(
    report: { fy: string; framework: string; scopeNodeIds: string[] },
    rows: { sectionId: string; label: string; value: unknown; unit?: string }[],
  ): Promise<Buffer> {
    // bufferPages: true lets us call switchToPage() after content has been
    // written so we can stamp a "Page N of M" footer on every page once we
    // know the total. Without it, PDFKit only buffers the current page and
    // switchToPage(0) throws `out of bounds, current buffer covers pages 1
    // to 1` — verified live in BullMQ's failed-job stacktrace before this fix.
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: `${report.framework} ${report.fy}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    // Cover
    doc.fontSize(28).text(`${report.framework} Report`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(18).text(report.fy, { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(10).fillColor('#666').text(`Generated ${new Date().toISOString()}`, { align: 'center' });
    doc.fillColor('#000');

    doc.addPage();
    // ToC (lightweight)
    doc.fontSize(16).text('Table of Contents', { underline: true });
    doc.moveDown();
    const principleSet = new Set<string>();
    for (const r of rows) {
      const p = (r.sectionId.match(/^P(\d+)/) ?? [])[1];
      if (p) principleSet.add(p);
    }
    const principles = Array.from(principleSet).sort();
    for (const p of principles) {
      doc.fontSize(12).text(`Principle ${p}`);
    }

    // Sections
    for (const p of principles) {
      doc.addPage();
      doc.fontSize(18).text(`Principle ${p}`, { underline: true });
      doc.moveDown();
      const subset = rows.filter((r) => r.sectionId.startsWith(`P${p}`));
      for (const r of subset) {
        doc.fontSize(11).text(`${r.sectionId}: ${r.label}`);
        doc.fontSize(10).fillColor('#444').text(`  ${r.value ?? '-'}${r.unit ? ' ' + r.unit : ''}`);
        doc.fillColor('#000').moveDown(0.5);
      }
    }

    // Footer on each page
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#888').text(`Page ${i + 1} of ${pages.count}`, 50, doc.page.height - 30, { align: 'center' });
    }
    doc.end();
    return done;
  }

  // ---------------------------------------------------------------- XLSX
  private async buildXlsx(
    report: { fy: string; framework: string },
    rows: { sectionId: string; label: string; value: unknown; unit?: string; sourceMetricEventIds: string[] }[],
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'BRSR AI Platform v2';
    wb.created = new Date();

    const principleSet = new Set<string>();
    for (const r of rows) {
      const m = r.sectionId.match(/^P(\d+)/);
      if (m) principleSet.add(m[1] as string);
    }
    const principles = Array.from(principleSet).sort();

    for (const p of principles) {
      const sheet = wb.addWorksheet(`Principle ${p}`);
      sheet.columns = [
        { header: 'Section', key: 'sectionId', width: 14 },
        { header: 'Label', key: 'label', width: 60 },
        { header: 'Value', key: 'value', width: 24 },
        { header: 'Unit', key: 'unit', width: 12 },
      ];
      sheet.getRow(1).font = { bold: true };
      for (const r of rows.filter((r) => r.sectionId.startsWith(`P${p}`))) {
        sheet.addRow({ sectionId: r.sectionId, label: r.label, value: r.value, unit: r.unit ?? '' });
      }
    }

    // Audit trail sheet
    const audit = wb.addWorksheet('Audit Trail');
    audit.columns = [
      { header: 'Section', key: 'sectionId', width: 14 },
      { header: 'Source MetricEvent IDs', key: 'ids', width: 70 },
    ];
    audit.getRow(1).font = { bold: true };
    for (const r of rows) {
      audit.addRow({ sectionId: r.sectionId, ids: (r.sourceMetricEventIds ?? []).join(', ') });
    }

    // Meta sheet
    const meta = wb.addWorksheet('Meta');
    meta.addRow(['Framework', report.framework]);
    meta.addRow(['FY', report.fy]);
    meta.addRow(['Generated', new Date().toISOString()]);

    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  }

  // ---------------------------------------------------------------- XBRL stub
  private buildXbrlStub(report: { framework: string; fy: string }, rows: { sectionId: string; value: unknown; unit?: string }[]): string {
    // TODO: real XBRL output is produced by services/xbrl/ using Arelle.
    // This envelope is just a sanity-check placeholder.
    const items = rows
      .map(
        (r) =>
          `<brsr:item sectionId="${escapeXml(r.sectionId)}" unit="${escapeXml(r.unit ?? '')}">${escapeXml(String(r.value ?? ''))}</brsr:item>`,
      )
      .join('\n  ');
    return `<?xml version="1.0" encoding="UTF-8"?>
<xbrl xmlns:brsr="urn:brsr:v2" framework="${escapeXml(report.framework)}" fy="${escapeXml(report.fy)}">
  <!-- STUB: Replace with Arelle-generated XBRL instance from services/xbrl/. -->
  ${items}
</xbrl>`;
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string));
}
