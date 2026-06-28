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
    // Schema fields: logoUrl, brandColor (single), name. There is no
    // primaryColor, secondaryColor, reportFooter or displayName column —
    // store the extras under tenantSetting so customers don't lose them.
    const data: Record<string, unknown> = {};
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.primaryColor !== undefined) data.brandColor = dto.primaryColor;
    if (dto.displayName !== undefined) data.name = dto.displayName;

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = Object.keys(data).length
        ? await (tx as any).tenant.update({ where: { id: tenantId }, data })
        : before;
      // Persist secondaryColor / reportFooter as tenant settings so the API
      // contract still works while the schema lacks the columns.
      const extras: Array<[string, unknown]> = [];
      if (dto.secondaryColor !== undefined) extras.push(['branding.secondaryColor', dto.secondaryColor]);
      if (dto.reportFooter !== undefined) extras.push(['branding.reportFooter', dto.reportFooter]);
      for (const [key, value] of extras) {
        await (tx as any).tenantSetting.upsert({
          where: { tenantId_key: { tenantId, key } },
          update: { value: value as never },
          create: { tenantId, key, value: value as never },
        });
      }
      return t;
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'Tenant',
      entityId: tenantId,
      action: 'UPDATE',
      before,
      after: updated,
      metadata: { branding: true },
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
