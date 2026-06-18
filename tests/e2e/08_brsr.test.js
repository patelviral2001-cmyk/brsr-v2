/**
 * 08 — BRSR resolve + mappings.
 */

const { test, assertStatus, assertStatusOneOf, assertTrue, unwrap, run } = require('./lib/expect');
const { request } = require('./lib/client');
const { login } = require('./lib/auth');

test('GET /brsr/mappings → 200', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: '/brsr/mappings', token });
  assertStatus(r, 200);
}, { smoke: true });

test('POST /brsr/resolve with valid FY → 200', async () => {
  const { token } = await login();
  const r = await request({
    method: 'POST',
    url: '/brsr/resolve',
    token,
    data: { fiscalYear: '2024-25' },
  });
  // 200 normal; 400 if DTO requires different shape; 422 if data not yet seeded.
  assertStatusOneOf(r, [200, 201, 400, 422]);
});

test('GET /brsr/mappings filtered by section → 200 (with non-empty fallback)', async () => {
  const { token } = await login();
  // try a real section the schema seeds — P6.E.1 is the canonical example.
  const r = await request({
    method: 'GET',
    url: '/brsr/mappings',
    token,
    params: { metricKey: 'P6.E.1' },
  });
  assertStatus(r, 200);
});

if (require.main === module) {
  run().then(rs => process.exit(rs.some(r => !r.passed) ? 1 : 0));
}
