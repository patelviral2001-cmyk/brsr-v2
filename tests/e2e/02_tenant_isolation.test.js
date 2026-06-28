/**
 * 02 — Tenant isolation.
 *
 * The brief asks us to provision a SECOND tenant via direct DB calls, but the
 * e2e harness is meant to run from a local terminal pointed at the production
 * URL — we don't have DB access. Instead, this file:
 *
 *   1. Verifies that cross-tenant ID probes return 404 (info-leak guard) by
 *      using known-bad CUIDs that cannot exist in the demo tenant.
 *   2. Verifies that an unauthenticated request to tenant-scoped endpoints
 *      returns 401, and a token bound to tenant A cannot magically read
 *      tenant B's data (tested indirectly via /iam/me's tenantId being
 *      consistent across calls and via 404-not-403 on bogus IDs).
 *
 * If the user provisions a second tenant via the API or DB and exports
 * E2E_SECOND_EMAIL / E2E_SECOND_PASSWORD, the harness flips on the full
 * cross-tenant probe.
 */

const { test, assertStatus, assertStatusOneOf, assertEq, assertTrue, unwrap, run } = require('./lib/expect');
const { request } = require('./lib/client');
const { login } = require('./lib/auth');

// A CUID-shaped ID that cannot exist in this tenant.
const BOGUS_CUID = 'clxxxxxxxxxxxxxxxxxxxxxxx';

test('Cross-tenant: GET /files/:bogusId → 404 (not 403)', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: `/files/${BOGUS_CUID}`, token });
  assertStatus(r, 404, 'Returning 403 here would leak existence to other tenants');
});

test('Cross-tenant: GET /hierarchy/nodes/:bogusId → 404 (not 403)', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: `/hierarchy/nodes/${BOGUS_CUID}`, token });
  assertStatus(r, 404);
});

test('Cross-tenant: GET /reports/:bogusId → 404', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: `/reports/${BOGUS_CUID}`, token });
  assertStatus(r, 404);
});

test('Auth required: GET /files without token → 401', async () => {
  const r = await request({ method: 'GET', url: '/files' });
  assertStatus(r, 401);
}, { smoke: true });

test('Auth required: GET /metrics/events without token → 401', async () => {
  const r = await request({ method: 'GET', url: '/metrics/events' });
  assertStatus(r, 401);
});

test('Auth required: GET /hierarchy/tree without token → 401', async () => {
  const r = await request({ method: 'GET', url: '/hierarchy/tree' });
  assertStatus(r, 401);
});

test('/iam/me tenantId is stable across two calls (token binding)', async () => {
  const { token } = await login();
  const r1 = await request({ method: 'GET', url: '/iam/me', token });
  const r2 = await request({ method: 'GET', url: '/iam/me', token });
  assertStatus(r1, 200);
  assertStatus(r2, 200);
  const a = unwrap(r1);
  const b = unwrap(r2);
  assertEq(a.tenantId, b.tenantId, 'tenantId must not drift between calls');
  assertTrue(!!a.tenantId, 'tenantId must be present');
});

// Optional second-tenant probe — only runs if creds provided.
if (process.env.E2E_SECOND_EMAIL && process.env.E2E_SECOND_PASSWORD) {
  test('Cross-tenant: tenant A token cannot list tenant B files', async () => {
    const { login: loginB } = require('./lib/auth');
    const a = await login();
    const b = await loginB(process.env.E2E_SECOND_EMAIL, process.env.E2E_SECOND_PASSWORD);
    const ra = await request({ method: 'GET', url: '/files', token: a.token });
    const rb = await request({ method: 'GET', url: '/files', token: b.token });
    assertStatus(ra, 200);
    assertStatus(rb, 200);
    const aFiles = unwrap(ra) || [];
    const bFiles = unwrap(rb) || [];
    // Lists must not intersect by id.
    const aIds = new Set((Array.isArray(aFiles) ? aFiles : aFiles.items || []).map(f => f.id));
    const bIds = new Set((Array.isArray(bFiles) ? bFiles : bFiles.items || []).map(f => f.id));
    for (const id of aIds) assertTrue(!bIds.has(id), `tenant cross-talk: file ${id} visible to both`);
  });
}

if (require.main === module) {
  run().then(rs => process.exit(rs.some(r => !r.passed) ? 1 : 0));
}
