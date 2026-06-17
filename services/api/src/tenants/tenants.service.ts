import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateTenantBrandingDto, UpdateTenantSettingDto } from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async me(tenantId: string) {
    const t = await (this.prisma as any).tenant.findUnique({ where: { id: tenantId } });
    if (!t) throw new NotFoundException('Tenant not found');
    return t;
  }

  async updateBranding(tenantId: string, dto: UpdateTenantBrandingDto, actorId: string) {
    const before = await this.me(tenantId);
    const updated = await (this.prisma as any).tenant.update({
      where: { id: tenantId },
      data: {
        logoUrl: dto.logoUrl,
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor,
        reportFooter: dto.reportFooter,
        displayName: dto.displayName,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Tenant',
      entityId: tenantId,
      action: 'update_branding',
      before,
      after: updated,
    });
    return updated;
  }

  async listSettings(tenantId: string) {
    return (this.prisma as any).tenantSetting.findMany({
      where: { tenantId },
      orderBy: { key: 'asc' },
    });
  }

  async upsertSetting(tenantId: string, key: string, dto: UpdateTenantSettingDto, actorId: string) {
    const before = await (this.prisma as any).tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    const setting = await (this.prisma as any).tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: { value: dto.value as never },
      create: { tenantId, key, value: dto.value as never },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'TenantSetting',
      entityId: setting.id,
      action: 'upsert',
      before,
      after: setting,
      metadata: { key },
    });
    return setting;
  }
}
