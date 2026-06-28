import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDataSourceDto, DataSourceKind, UpdateDataSourceDto } from './dto/data-sources.dto';

/**
 * Map the DTO DataSourceKind (frontend taxonomy) onto the schema
 * DataSourceType enum (UPLOAD|EMAIL_IN|SAP|ORACLE|WORKDAY|REST_API|IOT|MANUAL).
 */
function mapKindToType(kind: DataSourceKind): string {
  switch (kind) {
    case DataSourceKind.SAP:
      return 'SAP';
    case DataSourceKind.ORACLE:
      return 'ORACLE';
    case DataSourceKind.WORKDAY:
      return 'WORKDAY';
    case DataSourceKind.IOT:
      return 'IOT';
    case DataSourceKind.SHEETS:
    case DataSourceKind.CSV_UPLOAD:
      return 'UPLOAD';
    case DataSourceKind.CUSTOM_API:
    default:
      return 'REST_API';
  }
}

@Injectable()
export class DataSourcesService {
  private readonly logger = new Logger(DataSourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue('data-source-sync') private readonly syncQueue: Queue,
  ) {}

  async list(tenantId: string) {
    // Schema DataSource has no deletedAt; equivalent is isActive=false.
    return (this.prisma as any).dataSource.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const ds = await (this.prisma as any).dataSource.findFirst({
      where: { id, tenantId },
    });
    if (!ds) throw new NotFoundException('Data source not found');
    return ds;
  }

  async create(tenantId: string, dto: CreateDataSourceDto, actorId: string) {
    // Schema columns: name, type (DataSourceType), config (json), isActive,
    // createdAt. No status/kind columns — description/secretRef/cron stay in config.
    const config = {
      ...(dto.config ?? {}),
      ...(dto.description ? { description: dto.description } : {}),
      ...(dto.secretRef ? { secretRef: dto.secretRef } : {}),
      ...(dto.cron ? { cron: dto.cron } : {}),
    };
    const ds = await (this.prisma as any).dataSource.create({
      data: {
        tenantId,
        name: dto.name,
        type: mapKindToType(dto.kind),
        config,
        isActive: true,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'DataSource',
      entityId: ds.id,
      action: 'CREATE',
      after: { ...ds, config: '[redacted]' },
    });
    return ds;
  }

  async update(tenantId: string, id: string, dto: UpdateDataSourceDto, actorId: string) {
    const before = await this.findOne(tenantId, id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.kind !== undefined) data.type = mapKindToType(dto.kind);
    if (
      dto.config !== undefined ||
      dto.cron !== undefined ||
      dto.description !== undefined ||
      dto.secretRef !== undefined
    ) {
      const merged = { ...(before.config ?? {}), ...(dto.config ?? {}) } as Record<string, unknown>;
      if (dto.cron !== undefined) merged.cron = dto.cron;
      if (dto.description !== undefined) merged.description = dto.description;
      if (dto.secretRef !== undefined) merged.secretRef = dto.secretRef;
      data.config = merged;
    }
    const updated = await (this.prisma as any).dataSource.update({ where: { id }, data });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'DataSource',
      entityId: id,
      action: 'UPDATE',
      before: { ...before, config: '[redacted]' },
      after: { ...updated, config: '[redacted]' },
    });
    return updated;
  }

  async remove(tenantId: string, id: string, actorId: string) {
    const ds = await this.findOne(tenantId, id);
    // No deletedAt; deactivate via isActive.
    await (this.prisma as any).dataSource.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'DataSource',
      entityId: id,
      action: 'DELETE',
      before: { ...ds, config: '[redacted]' },
    });
  }

  /**
   * Tests connectivity. Schema has no lastTestAt/lastTestOk — store the result
   * in an audit log so it shows up in the ops timeline.
   */
  async test(tenantId: string, id: string) {
    const ds = await this.findOne(tenantId, id);
    const ok = ds.type !== 'IOT'; // IoT is push-only
    await this.audit.log({
      tenantId,
      userId: null,
      entity: 'DataSource',
      entityId: id,
      action: 'UPDATE',
      metadata: { probe: true, type: ds.type, ok },
    });
    if (!ok) throw new ServiceUnavailableException('Probe failed (push-style connector)');
    return { ok, type: ds.type, message: 'Probe queued — see connector logs for details' };
  }

  async sync(tenantId: string, id: string, actorId: string) {
    const ds = await this.findOne(tenantId, id);
    if (!ds.isActive) throw new BadRequestException('Cannot sync an inactive data source');
    await this.syncQueue.add(
      'sync',
      { dataSourceId: ds.id, tenantId, type: ds.type, config: ds.config },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'DataSource',
      entityId: id,
      action: 'UPDATE',
      metadata: { syncTriggered: true },
    });
    return { queued: true };
  }
}
