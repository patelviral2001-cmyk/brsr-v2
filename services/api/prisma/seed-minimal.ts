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
        effectiveFrom: new Date('2024-04-01'),
      } as any,
    });
    console.log(`  ✓ Root entity: ${root.name}`);
  } catch (e) {
    console.log(`  ⚠ Entity create skipped: ${e}`);
  }

  // 4. Grant demo user a GROUP_ADMIN-style role with broad permissions so
  //    they can exercise the full UI for demo purposes.
  try {
    const role = await (prisma as any).role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'GROUP_ADMIN' } },
      update: {
        permissions: [
          'user.read', 'user.invite', 'user.update', 'user.deactivate',
          'role.read', 'role.create', 'role.assign',
          'tenant.read', 'tenant.update', 'tenant.setting.read', 'tenant.setting.update',
          'hierarchy.read', 'hierarchy.write',
          'materiality.read', 'materiality.write',
          'file.read', 'file.write', 'file.upload', 'file.reprocess',
          'metric.read', 'metric.write', 'metric.submit', 'metric.approve', 'metric.lock',
          'extraction.read', 'extraction.write',
          'calc.read', 'calc.run', 'calc.write',
          'brsr.read', 'brsr.resolve', 'brsr.generate',
          'report.read', 'report.write', 'report.approve', 'report.file',
          'supplier.read', 'supplier.write',
          'carbon.read', 'carbon.write',
          'assurance.read', 'assurance.write',
          'audit.read', 'audit.export',
          'copilot.use',
        ],
      },
      create: {
        tenantId: tenant.id,
        name: 'GROUP_ADMIN',
        description: 'Full administrative access for the demo tenant.',
        isSystem: true,
        permissions: [
          'user.read', 'user.invite', 'user.update', 'user.deactivate',
          'role.read', 'role.create', 'role.assign',
          'tenant.read', 'tenant.update', 'tenant.setting.read', 'tenant.setting.update',
          'hierarchy.read', 'hierarchy.write',
          'materiality.read', 'materiality.write',
          'file.read', 'file.write', 'file.upload', 'file.reprocess',
          'metric.read', 'metric.write', 'metric.submit', 'metric.approve', 'metric.lock',
          'extraction.read', 'extraction.write',
          'calc.read', 'calc.run', 'calc.write',
          'brsr.read', 'brsr.resolve', 'brsr.generate',
          'report.read', 'report.write', 'report.approve', 'report.file',
          'supplier.read', 'supplier.write',
          'carbon.read', 'carbon.write',
          'assurance.read', 'assurance.write',
          'audit.read', 'audit.export',
          'copilot.use',
        ],
      },
    });
    const existing = await (prisma as any).roleAssignment.findFirst({
      where: { userId: user.id, roleId: role.id },
    });
    if (!existing) {
      await (prisma as any).roleAssignment.create({
        data: { userId: user.id, roleId: role.id, grantedBy: user.id },
      });
    }
    console.log(`  ✓ Role: ${role.name} (${role.permissions.length} permissions) assigned`);
  } catch (e) {
    console.log(`  ⚠ Role create/assign skipped: ${e}`);
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
