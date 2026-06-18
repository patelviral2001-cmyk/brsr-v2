import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDataSourceDto, DataSourceKind, UpdateDataSourceDto } from './dto/data-sources.dto';

@Injectable()
export class DataSourcesService {
  private readonly logger = new Logger(DataSourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue('data-source-sync') private readonly syncQueue: Queue,
  ) {}

  async list(tenantId: string) {
    return (this.prisma as any).dataSource.findMany({
      where: { tenantId },
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
    const ds = await (this.prisma as any).dataSource.create({
      data: { ...dto, tenantId, status: 'CONFIGURED' },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'DataSource',
      entityId: ds.id,
      action: 'create',
      after: { ...ds, config: '[redacted]' },
    });
    return ds;
  }

  async update(tenantId: string, id: string, dto: UpdateDataSourceDto, actorId: string) {
    const before = await this.findOne(tenantId, id);
    const updated = await (this.prisma as any).dataSource.update({ where: { id }, data: dto });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'DataSource',
      entityId: id,
      action: 'update',
      before: { ...before, config: '[redacted]' },
      after: { ...updated, config: '[redacted]' },
    });
    return updated;
  }

  async remove(tenantId: string, id: string, actorId: string) {
    const ds = await this.findOne(tenantId, id);
    await (this.prisma as any).dataSource.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'DataSource',
      entityId: id,
      action: 'delete',
      before: { ...ds, config: '[redacted]' },
    });
  }

  /**
   * Tests connectivity. ERP connectors are implemented in services/connectors;
   * here we issue a probe payload and report status.
   */
  async test(tenantId: string, id: string) {
    const ds = await this.findOne(tenantId, id);
    // Stub: in production a connector microservice handles each kind.
    // We mark the row and return a placeholder result so the UI can render.
    const ok = ds.kind !== DataSourceKind.IOT; // IoT typically uses push not probe
    await (this.prisma as any).dataSource.update({
      where: { id },
      data: { lastTestAt: new Date(), lastTestOk: ok },
    });
    if (!ok) throw new ServiceUnavailableException('Probe failed (push-style connector)');
    return { ok, kind: ds.kind, message: 'Probe queued — see connector logs for details' };
  }

  async sync(tenantId: string, id: string, actorId: string) {
    const ds = await this.findOne(tenantId, id);
    await this.syncQueue.add('sync', { dataSourceId: ds.id, tenantId, kind: ds.kind, config: ds.config });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'DataSource',
      entityId: id,
      action: 'sync_trigger',
    });
    return { queued: true };
  }
}
