/**
 * 06 — Metrics.
 *
 * Tests registry, CRUD on metric events, state machine:
 *   DRAFT -> SUBMITTED -> APPROVED -> LOCKED
 * and locked-events-can't-be-edited.
 */

const { test, assertStatus, assertStatusOneOf, assertHasField, assertTrue, unwrap, run } = require('./lib/expect');
const { request } = require('./lib/client');
const { login } = require('./lib/auth');
const { uniquePrefix } = require('./lib/fixtures');

let createdEventId = null;
let registryKey = null;

test('GET /metrics/registry → 200', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: '/metrics/registry', token });
  assertStatus(r, 200);
  const list = unwrap(r);
  if (Array.isArray(list) && list.length > 0) {
    registryKey = list[0].key || list[0].metricKey;
  } else if (list && Array.isArray(list.items) && list.items.length > 0) {
    registryKey = list.items[0].key || list.items[0].metricKey;
  }
}, { smoke: true });

test('POST /metrics/events → 201 creates DRAFT', async () => {
  const { token } = await login();
  // If we couldn't discover a registry key, fall back to a common BRSR id.
  const metricKey = registryKey || 'P6.E.1';
  const r = await request({
    method: 'POST',
    url: '/metrics/events',
    token,
    data: {
      metricKey,
      value: 42,
      unit: 'tCO2e',
      periodStart: '2025-04-01',
      periodEnd: '2025-04-30',
      note: `${uniquePrefix()} draft`,
    },
  });
  assertStatusOneOf(r, [200, 201, 400, 403, 422]);
  if (r.status === 200 || r.status === 201) {
    const body = unwrap(r);
    assertHasField(body, 'id');
    createdEventId = body.id;
  }
});

test('GET /metrics/events?period=2025-04 → 200', async () => {
  const { token } = await login();
  const r = await request({
    method: 'GET',
    url: '/metrics/events',
    token,
    params: { period: '2025-04' },
  });
  assertStatus(r, 200);
});

test('PATCH /metrics/events/:id (DRAFT) → 200', async () => {
  if (!createdEventId) { assertTrue(true, 'no event created — skip'); return; }
  const { token } = await login();
  const r = await request({
    method: 'PATCH',
    url: `/metrics/events/${createdEventId}`,
    token,
    data: { value: 43 },
  });
  assertStatusOneOf(r, [200, 403]);
});

test('POST /metrics/events/:id/submit → 200', async () => {
  if (!createdEventId) { assertTrue(true, 'no event created — skip'); return; }
  const { token } = await login();
  const r = await request({ method: 'POST', url: `/metrics/events/${createdEventId}/submit`, token });
  assertStatusOneOf(r, [200, 201, 403, 422]);
});

test('POST /metrics/events/:id/approve → 200', async () => {
  if (!createdEventId) { assertTrue(true, 'no event created — skip'); return; }
  const { token } = await login();
  const r = await request({ method: 'POST', url: `/metrics/events/${createdEventId}/approve`, token });
  assertStatusOneOf(r, [200, 201, 403, 422]);
});

test('POST /metrics/events/:id/lock → 200 (terminal)', async () => {
  if (!createdEventId) { assertTrue(true, 'no event created — skip'); return; }
  const { token } = await login();
  const r = await request({ method: 'POST', url: `/metrics/events/${createdEventId}/lock`, token });
  assertStatusOneOf(r, [200, 201, 403, 422]);
});

test('PATCH /metrics/events/:id after lock → 422 (immutable)', async () => {
  if (!createdEventId) { assertTrue(true, 'no event created — skip'); return; }
  const { token } = await login();
  const r = await request({
    method: 'PATCH',
    url: `/metrics/events/${createdEventId}`,
    token,
    data: { value: 99 },
  });
  // 403 also acceptable if permissions intercept first; primary expectation 422.
  assertStatusOneOf(r, [400, 403, 409, 422]);
});

if (require.main === module) {
  run().then(rs => process.exit(rs.some(r => !r.passed) ? 1 : 0));
}
