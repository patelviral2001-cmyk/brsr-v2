/**
 * Minimal seed: creates 1 tenant + 1 demo user with credentials login.
 * Run via: docker compose -f docker-compose.prod.yml exec api \
 *   npx ts-node --transpile-only prisma/seed-minimal.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding minimal demo tenant + user...');

  // 1. Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'imagine-powertree' },
    update: {},
    create: {
      name: 'Imagine Powertree Group',
      slug: 'imagine-powertree',
      plan: 'GROUP',
      isolationTier: 'POOL',
      dataResidency: 'IN',
      brandColor: '#059669',
    },
  });
  console.log(`  ✓ Tenant: ${tenant.name} [${tenant.id}]`);

  // 2. Demo user with bcrypt password
  const passwordHash = await bcrypt.hash('Demo@1234', 10);
  const user = await (prisma as any).user.upsert({
    where: { idpSubject: 'demo:imagine-powertree' },
    update: {
      passwordHash,
      isActive: true,
    },
    create: {
      tenantId: tenant.id,
      idpSubject: 'demo:imagine-powertree',
      email: 'demo@imaginepowertree.com',
      firstName: 'Demo',
      lastName: 'User',
      passwordHash,
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      isActive: true,
    },
  });
  console.log(`  ✓ User: ${user.email} [${user.id}] (password: Demo@1234)`);

  // 3. A root entity node so the user has scope
  try {
    const root = await prisma.entityNode.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: 'GRP' } },
      update: {},
      create: {
        tenantId: tenant.id,
        type: 'GROUP',
        name: 'Imagine Powertree Group',
        code: 'GRP',
        ltreePath: 'grp',
        consolidationMethod: 'FULL',
        controlType: 'OPERATIONAL',
        operationalBoundary: 'OPERATIONAL_CONTROL',
        country: 'IN',
      } as any,
    });
    console.log(`  ✓ Root entity: ${root.name}`);
  } catch (e) {
    console.log(`  ⚠ Entity create skipped: ${e}`);
  }

  console.log('\nDone! Login at https://srv1763596.hstgr.cloud/login');
  console.log('  Email:    demo@imaginepowertree.com');
  console.log('  Password: Demo@1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
