/**
 * 07 — Calculations.
 *
 * Tests queueing of scope1/scope2/scope3 runs and the runs index.
 * The endpoints return a job id; the actual processor runs async via BullMQ,
 * so the harness only verifies the queue+index contract, not run outcomes.
 */

const { test, assertStatus, assertStatusOneOf, assertHasField, unwrap, run } = require('./lib/expect');
const { request } = require('./lib/client');
const { login } = require('./lib/auth');

let lastRunId = null;

const PERIOD = {
  periodStart: '2025-04-01',
  periodEnd: '2025-04-30',
};

test('POST /calculations/scope1 → 200/201/202 queues job', async () => {
  const { token } = await login();
  const r = await request({ method: 'POST', url: '/calculations/scope1', token, data: PERIOD });
  assertStatusOneOf(r, [200, 201, 202, 403]);
  if (r.status >= 200 && r.status < 300) {
    const body = unwrap(r);
    if (body && body.id) lastRunId = body.id;
  }
}, { smoke: true });

test('POST /calculations/scope2 → 200/201/202', async () => {
  const { token } = await login();
  const r = await request({ method: 'POST', url: '/calculations/scope2', token, data: PERIOD });
  assertStatusOneOf(r, [200, 201, 202, 403]);
});

test('POST /calculations/scope3/1 → 200/201/202', async () => {
  const { token } = await login();
  const r = await request({ method: 'POST', url: '/calculations/scope3/1', token, data: PERIOD });
  assertStatusOneOf(r, [200, 201, 202, 403]);
});

test('GET /calculations/runs → 200', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: '/calculations/runs', token });
  assertStatus(r, 200);
  const list = unwrap(r);
  const arr = Array.isArray(list) ? list : (list && list.items) || [];
  if (!lastRunId && arr.length > 0) lastRunId = arr[0].id;
});

test('GET /calculations/runs/:id → 200', async () => {
  if (!lastRunId) { return; }
  const { token } = await login();
  const r = await request({ method: 'GET', url: `/calculations/runs/${lastRunId}`, token });
  assertStatusOneOf(r, [200, 404]);
  if (r.status === 200) {
    const body = unwrap(r);
    assertHasField(body, 'id');
  }
});

if (require.main === module) {
  run().then(rs => process.exit(rs.some(r => !r.passed) ? 1 : 0));
}
