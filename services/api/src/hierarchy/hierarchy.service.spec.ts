import { Test } from '@nestjs/testing';
import { HierarchyService } from './hierarchy.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyNodeType } from './dto/hierarchy.dto';
import { BadRequestException } from '@nestjs/common';

describe('HierarchyService', () => {
  let svc: HierarchyService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      hierarchyNode: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'n1', ...data })),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prismaMock)),
    };
    const mod = await Test.createTestingModule({
      providers: [
        HierarchyService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    svc = mod.get(HierarchyService);
  });

  it('creates a root GROUP node with ltree path equal to code', async () => {
    prismaMock.hierarchyNode.findFirst.mockResolvedValueOnce(null);
    const n = await svc.create('t1', { type: HierarchyNodeType.GROUP, code: 'acme', name: 'Acme' } as any, 'u1');
    expect(n.ltreePath).toBe('acme');
  });

  it('rejects FACILITY without parent', async () => {
    await expect(
      svc.create('t1', { type: HierarchyNodeType.FACILITY, code: 'f1', name: 'F1' } as any, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
