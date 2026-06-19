import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OntologyService {
  constructor(private readonly prisma: PrismaService) {}

  // ESG Topics ---------------------------------------------------
  listTopics() {
    return this.prisma.esgTopic.findMany({ orderBy: { sortKey: 'asc' } });
  }

  // KPIs ---------------------------------------------------------
  listKpis(topicCode?: string) {
    return this.prisma.kpi.findMany({
      where: topicCode ? { topic: { code: topicCode } } : undefined,
      include: { topic: true },
      orderBy: { title: 'asc' },
    });
  }

  async getKpiByCode(code: string) {
    const kpi = await this.prisma.kpi.findUnique({ where: { code }, include: { topic: true } });
    if (!kpi) throw new NotFoundException(`KPI not found: ${code}`);
    return kpi;
  }

  async getKpi(id: string) {
    const kpi = await this.prisma.kpi.findUnique({ where: { id }, include: { topic: true, disclosures: { include: { standard: true } } } });
    if (!kpi) throw new NotFoundException('KPI not found');
    return kpi;
  }

  // Standards + disclosures --------------------------------------
  listStandards() {
    return this.prisma.standard.findMany({ where: { active: true } });
  }

  listDisclosures(standardCode: string) {
    return this.prisma.disclosure.findMany({
      where: { standard: { code: standardCode } },
      include: { kpi: { include: { topic: true } } },
      orderBy: { code: 'asc' },
    });
  }
}
