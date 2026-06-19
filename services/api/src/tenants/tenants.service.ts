import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditTrailService } from '../audit-trail/audit-trail.service';
import { UpdateTenantBrandingDto } from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditTrailService,
  ) {}

  async me(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t) throw new NotFoundException('Tenant not found');
    return t;
  }

  async updateBranding(tenantId: string, dto: UpdateTenantBrandingDto, actorId: string) {
    const before = await this.me(tenantId);
    const data: Record<string, unknown> = {};
    if (dto.primaryColor !== undefined) data.brandColor = dto.primaryColor;
    if (dto.displayName !== undefined) data.name = dto.displayName;
    const updated = Object.keys(data).length
      ? await this.prisma.tenant.update({ where: { id: tenantId }, data })
      : before;
    await this.audit.log({
      tenantId, userId: actorId, entity: 'Tenant', entityId: tenantId, action: 'UPDATE', before, after: updated,
    });
    return updated;
  }
}
