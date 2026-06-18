/**
 * 05 — Extraction.
 *
 * Human-in-the-loop queue + the AI-engine HMAC callback.
 *
 * The HMAC secret isn't known to the e2e harness, so we only assert that:
 *   - missing/wrong HMAC → 401
 *   - the queue + stats endpoints respond
 *   - approve/reject on a known-bad ID returns 404, not 500
 */

const { test, assertStatus, assertStatusOneOf, assertTrue, run } = require('./lib/expect');
const { request } = require('./lib/client');
const { login } = require('./lib/auth');

const BOGUS = 'clbogusfield00000000000000';

test('GET /extraction/queue → 200', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: '/extraction/queue', token });
  assertStatus(r, 200);
});

test('GET /extraction/stats → 200', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: '/extraction/stats', token });
  assertStatus(r, 200);
});

test('POST /files/extraction-callback with no HMAC → 401', async () => {
  const r = await request({
    method: 'POST',
    url: '/files/extraction-callback',
    data: { documentId: BOGUS, fields: [] },
  });
  assertStatusOneOf(r, [401, 403], 'HMAC missing should reject');
});

test('POST /files/extraction-callback with bogus HMAC → 401', async () => {
  const r = await request({
    method: 'POST',
    url: '/files/extraction-callback',
    headers: { 'x-internal-signature': 'sha256=deadbeef' },
    data: { documentId: BOGUS, fields: [] },
  });
  assertStatusOneOf(r, [401, 403]);
});

test('POST /extraction/fields/:bogusId/approve → 404', async () => {
  const { token } = await login();
  const r = await request({ method: 'POST', url: `/extraction/fields/${BOGUS}/approve`, token });
  assertStatusOneOf(r, [403, 404]);
});

test('POST /extraction/fields/:bogusId/reject with reason → 404', async () => {
  const { token } = await login();
  const r = await request({
    method: 'POST',
    url: `/extraction/fields/${BOGUS}/reject`,
    token,
    data: { reason: 'e2e test rejection' },
  });
  assertStatusOneOf(r, [403, 404]);
});

test('PATCH /extraction/fields/:bogusId → 404', async () => {
  const { token } = await login();
  const r = await request({
    method: 'PATCH',
    url: `/extraction/fields/${BOGUS}`,
    token,
    data: { value: 'overridden by e2e' },
  });
  assertStatusOneOf(r, [403, 404]);
});

if (require.main === module) {
  run().then(rs => process.exit(rs.some(r => !r.passed) ? 1 : 0));
}
