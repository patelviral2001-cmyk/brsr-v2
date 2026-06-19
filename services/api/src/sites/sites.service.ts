import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditTrailService } from '../audit-trail/audit-trail.service';
import { CreateSiteDto, UpdateSiteDto } from './dto/sites.dto';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditTrailService,
  ) {}

  async list(tenantId: string, params: { status?: string; take?: number; skip?: number } = {}) {
    const take = Math.min(Math.max(1, params.take ?? 100), 500);
    return this.prisma.site.findMany({
      where: { tenantId, status: params.status ?? 'ACTIVE' },
      orderBy: { name: 'asc' },
      take,
      skip: params.skip ?? 0,
    });
  }

  async findOne(tenantId: string, id: string) {
    const site = await this.prisma.site.findFirst({ where: { id, tenantId } });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  async create(tenantId: string, dto: CreateSiteDto, actorId: string) {
    if (dto.externalCode) {
      const dupe = await this.prisma.site.findUnique({
        where: { tenantId_externalCode: { tenantId, externalCode: dto.externalCode } },
      });
      if (dupe) throw new ConflictException(`Site with code ${dto.externalCode} already exists`);
    }
    const site = await this.prisma.site.create({
      data: {
        tenantId,
        name: dto.name,
        externalCode: dto.externalCode,
        siteType: dto.siteType,
        reportingEntityId: dto.reportingEntityId,
        addressLine1: dto.addressLine1,
        city: dto.city,
        district: dto.district,
        state: dto.state,
        pincode: dto.pincode,
        country: dto.country ?? 'IN',
        latitude: dto.latitude,
        longitude: dto.longitude,
        areaSqm: dto.areaSqm,
      },
    });
    await this.audit.log({ tenantId, userId: actorId, entity: 'Site', entityId: site.id, action: 'CREATE', after: site });
    return site;
  }

  async update(tenantId: string, id: string, dto: UpdateSiteDto, actorId: string) {
    const before = await this.findOne(tenantId, id);
    const updated = await this.prisma.site.update({ where: { id }, data: { ...dto } });
    await this.audit.log({ tenantId, userId: actorId, entity: 'Site', entityId: id, action: 'UPDATE', before, after: updated });
    return updated;
  }

  async deactivate(tenantId: string, id: string, actorId: string) {
    const before = await this.findOne(tenantId, id);
    const updated = await this.prisma.site.update({ where: { id }, data: { status: 'INACTIVE' } });
    await this.audit.log({ tenantId, userId: actorId, entity: 'Site', entityId: id, action: 'DELETE', before, after: updated });
    return updated;
  }
}
