/**
 * Smoke e2e: auth (mocked) → create hierarchy node → list nodes.
 *
 * Uses a partially-mocked module that swaps out Prisma + Keycloak + OPA with
 * in-memory implementations. We don't aim to test the wire format here — only
 * that the wiring (guards, interceptors, controllers) holds together.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OpaClient } from '../src/common/utils/opa-client';
import { KeycloakClient } from '../src/common/utils/keycloak-client';
import { HierarchyNodeType } from '../src/hierarchy/dto/hierarchy.dto';

class FakePrisma {
  private nodes: Array<Record<string, any>> = [];
  hierarchyNode = {
    findFirst: async (args: any) => this.nodes.find(matches(args.where)) ?? null,
    findMany: async (args: any) => this.nodes.filter(matches(args?.where ?? {})),
    create: async ({ data }: any) => {
      const n = { id: `n${this.nodes.length + 1}`, deletedAt: null, ...data };
      this.nodes.push(n);
      return n;
    },
    update: async ({ where, data }: any) => {
      const n = this.nodes.find((x) => x.id === where.id);
      Object.assign(n!, data);
      return n;
    },
  };
  auditLog = {
    create: async () => ({}),
  };
  user = { findUnique: async () => null, upsert: async () => null };
  $executeRawUnsafe = async () => 0;
  $queryRawUnsafe = async () => [{ ok: 1 }];
  $transaction = async (fn: any) => (typeof fn === 'function' ? fn(this) : Promise.all(fn));
  async setTenantContext() {}
  async onModuleInit() {}
  async onModuleDestroy() {}
}

function matches(where: Record<string, any>) {
  return (n: Record<string, any>) =>
    Object.entries(where ?? {}).every(([k, v]) => {
      if (k === 'deletedAt' && v === null) return n.deletedAt === null;
      return n[k] === v;
    });
}

describe('App (e2e smoke)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.KEYCLOAK_URL = 'http://kc';
    process.env.KEYCLOAK_REALM = 'brsr';
    process.env.KEYCLOAK_CLIENT_ID = 'brsr-api';
    process.env.AI_ENGINE_URL = 'http://ai';
    process.env.COPILOT_URL = 'http://copilot';
    process.env.OPA_URL = 'http://opa';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useClass(FakePrisma)
      .overrideProvider(OpaClient)
      .useValue({ allow: async () => ({ allow: true }) })
      .overrideProvider(KeycloakClient)
      .useValue({ provisionUser: async () => ({}), lookupByEmail: async () => null, listUsers: async () => [] })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: 'u1', sub: 'u1', email: 'u@x.com', tenantId: 't1', roles: ['ADMIN'], scopes: [], claims: {} };
          req.tenantId = 't1';
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/health → ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    // health might be degraded in test (no redis), but must respond
    expect([200, 503]).toContain(res.status);
  });

  it('POST /api/v1/hierarchy/nodes → creates a GROUP node', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/hierarchy/nodes')
      .send({ type: HierarchyNodeType.GROUP, code: 'acme', name: 'Acme' })
      .expect(201);
    expect(res.body.data.code).toBe('acme');
    expect(res.body.data.ltreePath).toBe('acme');
  });

  it('GET /api/v1/hierarchy/nodes → returns the created node', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/hierarchy/nodes').expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
