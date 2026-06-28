/**
 * 12 — Health.
 *
 * /health is excluded from the global /api/v1 prefix (main.ts: setGlobalPrefix
 * with exclude: ['health', 'metrics-prom']). So we hit it at the ROOT host,
 * not the doubled /api/v1/v1 base.
 */

const { test, assertStatus, assertHasField, assertTrue, run } = require('./lib/expect');
const { request, getBaseUrl } = require('./lib/client');

test('GET /health → 200 with { status, checks }', async () => {
  // Construct a root-host URL by stripping the API prefix.
  const base = getBaseUrl();
  const rootBase = base.replace(/\/api\/v1\/v1\/?$/, '');
  const url = (rootBase || base) + '/health';

  const axios = require('axios');
  const https = require('https');
  const r = await axios
    .get(url, {
      timeout: 10000,
      httpsAgent: new https.Agent({ rejectUnauthorized: process.env.E2E_INSECURE !== '1' }),
      validateStatus: () => true,
    })
    .then(res => ({ status: res.status, data: res.data, headers: res.headers, ok: res.status < 300 }))
    .catch(err => ({ status: 0, data: null, error: err.message, ok: false }));

  assertStatus(r, 200);
  // Health is bare (not enveloped — it's excluded from versioning, but the
  // ResponseInterceptor is still global. Whichever shape, we assert minimal
  // fields exist somewhere.)
  const body = r.data && r.data.data ? r.data.data : r.data;
  assertHasField(body, 'status');
  assertHasField(body, 'checks');
  assertTrue(
    body.status === 'ok' || body.status === 'degraded',
    `unexpected health status: ${body.status}`,
  );
}, { smoke: true });

if (require.main === module) {
  run().then(rs => process.exit(rs.some(r => !r.passed) ? 1 : 0));
}
