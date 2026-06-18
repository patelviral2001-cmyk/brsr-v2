import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { parse as csvParse } from 'csv-parse/sync';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BulkImportRowDto,
  CreateHierarchyNodeDto,
  HierarchyNodeType,
  MoveNodeDto,
  UpdateHierarchyNodeDto,
} from './dto/hierarchy.dto';

/**
 * Allowed parent → child relationships. Enforced server-side.
 *  GROUP -> COMPANY, BUSINESS_UNIT
 *  COMPANY -> BUSINESS_UNIT, FACILITY, REGION
 *  BUSINESS_UNIT -> FACILITY, REGION, PROCESS, PRODUCT_LINE
 *  REGION -> FACILITY
 *  FACILITY -> PROCESS, PRODUCT_LINE
 *  PROCESS -> (leaf)
 *  PRODUCT_LINE -> (leaf)
 */
const ALLOWED_PARENTS: Record<HierarchyNodeType, HierarchyNodeType[] | null> = {
  GROUP: [],
  COMPANY: [HierarchyNodeType.GROUP],
  BUSINESS_UNIT: [HierarchyNodeType.GROUP, HierarchyNodeType.COMPANY],
  REGION: [HierarchyNodeType.COMPANY, HierarchyNodeType.BUSINESS_UNIT],
  FACILITY: [HierarchyNodeType.COMPANY, HierarchyNodeType.BUSINESS_UNIT, HierarchyNodeType.REGION],
  PROCESS: [HierarchyNodeType.BUSINESS_UNIT, HierarchyNodeType.FACILITY],
  PRODUCT_LINE: [HierarchyNodeType.BUSINESS_UNIT, HierarchyNodeType.FACILITY],
};

/**
 * Maps the public-facing HierarchyNodeType taxonomy (GROUP/COMPANY/...) to
 * the EntityType enum stored on the schema (GROUP/LEGAL_ENTITY/DIVISION/
 * SITE/DEPARTMENT). The DTO layer is kept stable for the frontend; this
 * function is the single bridging point.
 */
function mapNodeTypeToEntityType(t: HierarchyNodeType): string {
  switch (t) {
    case HierarchyNodeType.GROUP:
      return 'GROUP';
    case HierarchyNodeType.COMPANY:
      return 'LEGAL_ENTITY';
    case HierarchyNodeType.BUSINESS_UNIT:
      return 'DIVISION';
    case HierarchyNodeType.REGION:
    case HierarchyNodeType.FACILITY:
      return 'SITE';
    case HierarchyNodeType.PROCESS:
    case HierarchyNodeType.PRODUCT_LINE:
      return 'DEPARTMENT';
    default:
      return 'GROUP';
  }
}

@Injectable()
export class HierarchyService {
  private readonly logger = new Logger(HierarchyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------- CRUD -------------------

  async create(tenantId: string, dto: CreateHierarchyNodeDto, actorId: string) {
    let parent: { id: string; type: HierarchyNodeType; ltreePath: string; tenantId: string } | null = null;
    if (dto.parentId) {
      parent = await (this.prisma as any).entityNode.findFirst({
        where: { id: dto.parentId, tenantId },
      });
      if (!parent) throw new NotFoundException('Parent node not found');
    }
    this.validateParentChild(parent?.type, dto.type);

    const ltreePath = parent ? `${parent.ltreePath}.${dto.code}` : dto.code;

    const existing = await (this.prisma as any).entityNode.findFirst({
      where: { tenantId, ltreePath },
    });
    if (existing) throw new ConflictException(`Node with path ${ltreePath} already exists`);

    const node = await (this.prisma as any).entityNode.create({
      data: {
        tenantId,
        parentId: parent?.id ?? null,
        // schema EntityType: GROUP|LEGAL_ENTITY|DIVISION|SITE|DEPARTMENT
        type: mapNodeTypeToEntityType(dto.type),
        code: dto.code,
        name: dto.name,
        ltreePath,
        country: dto.country ?? 'IN',
        state: dto.region,
        // schema columns are lat / lng (Decimal). DTO carries latitude/longitude
        // for backward compatibility.
        lat: dto.latitude !== undefined ? new Decimal(dto.latitude) : undefined,
        lng: dto.longitude !== undefined ? new Decimal(dto.longitude) : undefined,
        // Required schema columns with reasonable defaults:
        consolidationMethod: 'FULL',
        controlType: 'OPERATIONAL',
        operationalBoundary: 'OPERATIONAL_CONTROL',
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        metadata: dto.metadata ?? {},
      },
    });

    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'HierarchyNode',
      entityId: node.id,
      action: 'create',
      after: node,
    });
    return node;
  }

  async list(
    tenantId: string,
    args: { type?: HierarchyNodeType; parentId?: string; scopeNodeId?: string },
  ) {
    let pathFilter: { startsWith: string } | undefined;
    if (args.scopeNodeId) {
      const scope = await (this.prisma as any).entityNode.findFirst({
        where: { id: args.scopeNodeId, tenantId },
      });
      if (scope) pathFilter = { startsWith: scope.ltreePath };
    }
    return (this.prisma as any).entityNode.findMany({
      where: {
        tenantId,
        type: args.type,
        parentId: args.parentId,
        ltreePath: pathFilter,
        
      },
      orderBy: { ltreePath: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const node = await (this.prisma as any).entityNode.findFirst({
      where: { id, tenantId },
      include: { children: true, parent: true },
    });
    if (!node) throw new NotFoundException('Node not found');
    return node;
  }

  async update(tenantId: string, id: string, dto: UpdateHierarchyNodeDto, actorId: string) {
    const before = await this.findOne(tenantId, id);
    const updated = await (this.prisma as any).entityNode.update({
      where: { id },
      data: {
        name: dto.name,
        country: dto.country,
        state: dto.region,
        lat: dto.latitude !== undefined ? new Decimal(dto.latitude) : undefined,
        lng: dto.longitude !== undefined ? new Decimal(dto.longitude) : undefined,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
        metadata: dto.metadata,
      },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'HierarchyNode',
      entityId: id,
      action: 'update',
      before,
      after: updated,
    });
    return updated;
  }

  /**
   * Re-parents a node. Recomputes ltreePath for the moved node AND every
   * descendant inside a transaction. Validates type hierarchy.
   */
  async move(tenantId: string, id: string, dto: MoveNodeDto, actorId: string) {
    const node = await this.findOne(tenantId, id);
    let newParent: { id: string; type: HierarchyNodeType; ltreePath: string } | null = null;
    if (dto.newParentId) {
      newParent = await (this.prisma as any).entityNode.findFirst({
        where: { id: dto.newParentId, tenantId },
      });
      if (!newParent) throw new NotFoundException('New parent not found');
      if (newParent.ltreePath.startsWith(node.ltreePath)) {
        throw new BadRequestException('Cannot move a node under one of its descendants');
      }
    }
    this.validateParentChild(newParent?.type, node.type);

    const oldPath: string = node.ltreePath;
    const newPath = newParent ? `${newParent.ltreePath}.${node.code}` : node.code;
    if (oldPath === newPath) return node;

    const descendants: { id: string; ltreePath: string }[] = await (this.prisma as any).entityNode.findMany({
      where: { tenantId, ltreePath: { startsWith: `${oldPath}.` } },
      select: { id: true, ltreePath: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).entityNode.update({
        where: { id: node.id },
        data: { parentId: newParent?.id ?? null, ltreePath: newPath },
      });
      for (const d of descendants) {
        const suffix = d.ltreePath.slice(oldPath.length); // e.g. ".bu_a.fac_1"
        await (tx as any).entityNode.update({
          where: { id: d.id },
          data: { ltreePath: newPath + suffix },
        });
      }
    });

    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'HierarchyNode',
      entityId: id,
      action: 'move',
      before: { ltreePath: oldPath, parentId: node.parentId },
      after: { ltreePath: newPath, parentId: newParent?.id ?? null },
    });
    return this.findOne(tenantId, id);
  }

  async softDelete(tenantId: string, id: string, actorId: string) {
    const node = await this.findOne(tenantId, id);
    // EntityNode has no `deletedAt` column. Use effectiveTo to time-bound the
    // node — queries that respect effectiveTo treat the node as inactive.
    await (this.prisma as any).entityNode.update({
      where: { id },
      data: { effectiveTo: new Date() },
    });
    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'EntityNode',
      entityId: id,
      action: 'DELETE',
      before: node,
    });
  }

  // ------------------- Tree -------------------

  async tree(tenantId: string) {
    const all = await (this.prisma as any).entityNode.findMany({
      where: { tenantId },
      orderBy: { ltreePath: 'asc' },
    });
    const byId = new Map<string, any>();
    const roots: any[] = [];
    for (const n of all) {
      byId.set(n.id, { ...n, children: [] });
    }
    for (const n of all) {
      const node = byId.get(n.id);
      if (n.parentId && byId.has(n.parentId)) {
        byId.get(n.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  // ------------------- Bulk import -------------------

  async bulkImport(tenantId: string, csv: Buffer, actorId: string) {
    const rows = csvParse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as BulkImportRowDto[];
    if (rows.length === 0) return { inserted: 0, errors: [] };
    if (rows.length > 10_000) {
      throw new BadRequestException('Bulk import exceeds 10,000-row limit');
    }

    // Validate types
    for (const r of rows) {
      if (!Object.values(HierarchyNodeType).includes(r.type)) {
        throw new BadRequestException(`Invalid type on row ${JSON.stringify(r)}`);
      }
    }

    const errors: string[] = [];

    const inserted = await this.prisma.$transaction(async (tx) => {
      const byCode = new Map<string, { id: string; ltreePath: string; type: HierarchyNodeType }>();
      // pre-load existing nodes so partial imports can attach
      const existing = await (tx as any).entityNode.findMany({
        where: { tenantId },
        select: { code: true, id: true, ltreePath: true, type: true },
      });
      for (const n of existing) byCode.set(n.code, n);

      let count = 0;
      // Process in a deterministic order — parents first (topological)
      const sorted = topoSort(rows);
      for (const row of sorted) {
        try {
          let parent: { id: string; ltreePath: string; type: HierarchyNodeType } | null = null;
          if (row.parentCode) {
            parent = byCode.get(row.parentCode) ?? null;
            if (!parent) {
              errors.push(`Row code=${row.code}: parentCode ${row.parentCode} not found`);
              continue;
            }
            this.validateParentChild(parent.type, row.type);
          }
          const ltreePath = parent ? `${parent.ltreePath}.${row.code}` : row.code;
          const node = await (tx as any).entityNode.create({
            data: {
              tenantId,
              parentId: parent?.id ?? null,
              type: mapNodeTypeToEntityType(row.type),
              code: row.code,
              name: row.name,
              ltreePath,
              country: row.country ?? 'IN',
              state: row.region,
              consolidationMethod: 'FULL',
              controlType: 'OPERATIONAL',
              operationalBoundary: 'OPERATIONAL_CONTROL',
              effectiveFrom: new Date(),
            },
          });
          byCode.set(row.code, node);
          count++;
        } catch (e) {
          errors.push(`Row code=${row.code}: ${(e as Error).message}`);
        }
      }
      return count;
    });

    await this.audit.log({
      tenantId,
      userId: actorId,
      entity: 'EntityNode',
      entityId: null,
      action: 'CREATE',
      metadata: { bulkImport: true, inserted, errors: errors.length },
    });
    return { inserted, errors };
  }

  // ------------------- Rollup -------------------

  /**
   * Recursive sum of headcount + revenue over a node and all descendants.
   *
   * Previously read a non-existent `nodeMetricsSnapshot` projection table.
   * The actual aggregate lives on EntityNode itself (employeeCount, revenue).
   * Walk the subtree via ltreePath and sum.
   */
  async rollup(tenantId: string, nodeId: string) {
    const root = await this.findOne(tenantId, nodeId);
    const rows: { employeeCount: number | null; revenue: Decimal | null }[] = await (this.prisma as any).entityNode.findMany({
      where: {
        tenantId,
        OR: [
          { id: nodeId },
          { ltreePath: { startsWith: `${root.ltreePath}.` } },
        ],
      },
      select: { employeeCount: true, revenue: true },
    });
    let employeeCount = 0;
    let revenue = new Decimal(0);
    for (const r of rows) {
      employeeCount += r.employeeCount ?? 0;
      revenue = revenue.plus(r.revenue ?? new Decimal(0));
    }
    return {
      nodeId,
      ltreePath: root.ltreePath,
      employeeCount,
      revenue: revenue.toString(),
      descendantsCount: rows.length,
    };
  }

  // ------------------- Helpers -------------------

  private validateParentChild(parentType: HierarchyNodeType | undefined, childType: HierarchyNodeType): void {
    const allowed = ALLOWED_PARENTS[childType];
    if (!parentType) {
      if (childType !== HierarchyNodeType.GROUP && childType !== HierarchyNodeType.COMPANY) {
        throw new BadRequestException(`Type ${childType} requires a parent`);
      }
      return;
    }
    if (!allowed?.includes(parentType)) {
      throw new BadRequestException(`${childType} cannot be a child of ${parentType}`);
    }
  }
}

/** Topologically sort rows so that parents precede children. */
function topoSort(rows: BulkImportRowDto[]): BulkImportRowDto[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const result: BulkImportRowDto[] = [];
  const inserted = new Set<string>();
  const visit = (r: BulkImportRowDto, stack: Set<string>): void => {
    if (inserted.has(r.code)) return;
    if (stack.has(r.code)) {
      throw new BadRequestException(`Cycle detected at code ${r.code}`);
    }
    stack.add(r.code);
    if (r.parentCode && byCode.has(r.parentCode)) {
      visit(byCode.get(r.parentCode) as BulkImportRowDto, stack);
    }
    stack.delete(r.code);
    inserted.add(r.code);
    result.push(r);
  };
  for (const r of rows) visit(r, new Set());
  return result;
}
