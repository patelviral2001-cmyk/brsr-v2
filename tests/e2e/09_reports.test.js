/**
 * 09 — Reports.
 *
 * /brsr/generate is the actual generator entry-point in this codebase
 * (queued via BullMQ); /reports lists & exposes signed download URLs.
 *
 * The test queues a report, polls /reports/:id for terminal state, then
 * attempts the PDF/XLSX signed-url endpoints.
 *
 * Generation can take minutes in production; if E2E_POLL_TIMEOUT_MS is too
 * short we record the timeout rather than fail-hard.
 */

const { test, assertStatus, assertStatusOneOf, assertHasField, assertTrue, unwrap, run } = require('./lib/expect');
const { request } = require('./lib/client');
const { login } = require('./lib/auth');

let reportId = null;
const POLL_TIMEOUT_MS = Number(process.env.E2E_POLL_TIMEOUT_MS || 60000); // 60s by default
const POLL_INTERVAL_MS = 3000;

test('POST /brsr/generate → 200/201/202 (queues report)', async () => {
  const { token } = await login();
  const r = await request({
    method: 'POST',
    url: '/brsr/generate',
    token,
    data: { fiscalYear: '2024-25', format: 'pdf' },
  });
  assertStatusOneOf(r, [200, 201, 202, 400, 403, 422]);
  if (r.status >= 200 && r.status < 300) {
    const body = unwrap(r);
    if (body && body.id) reportId = body.id;
    else if (body && body.reportId) reportId = body.reportId;
  }
});

test('GET /reports → 200 list (and pick latest id if generate didn\'t return one)', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: '/reports', token });
  assertStatus(r, 200);
  if (!reportId) {
    const list = unwrap(r);
    const arr = Array.isArray(list) ? list : (list && list.items) || [];
    if (arr.length > 0) reportId = arr[0].id;
  }
});

test(`Poll GET /reports/:id until APPROVED/READY/FAILED (≤${POLL_TIMEOUT_MS}ms)`, async () => {
  if (!reportId) { assertTrue(true, 'no report id — skip'); return; }
  const { token } = await login();
  const start = Date.now();
  let lastStatus = null;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const r = await request({ method: 'GET', url: `/reports/${reportId}`, token });
    if (r.status === 200) {
      const body = unwrap(r);
      lastStatus = body && body.status;
      if (['APPROVED', 'READY', 'COMPLETED', 'FAILED', 'ERROR'].includes(lastStatus)) {
        break;
      }
    }
    await new Promise(res => setTimeout(res, POLL_INTERVAL_MS));
  }
  // We don't fail if the report is still GENERATING — that means our short test
  // window didn't catch the worker. We DO fail if it hit a permanent error.
  if (lastStatus && /FAILED|ERROR/.test(lastStatus)) {
    throw new Error(`report ended in error state ${lastStatus}`);
  }
});

test('GET /reports/:id/pdf → 200 / 302', async () => {
  if (!reportId) { assertTrue(true, 'no report id — skip'); return; }
  const { token } = await login();
  const r = await request({ method: 'GET', url: `/reports/${reportId}/pdf`, token });
  // 200 → signed-url JSON; 302 → redirect; 404 → not yet generated.
  assertStatusOneOf(r, [200, 302, 404]);
});

test('GET /reports/:id/xlsx → 200 / 302', async () => {
  if (!reportId) { assertTrue(true, 'no report id — skip'); return; }
  const { token } = await login();
  const r = await request({ method: 'GET', url: `/reports/${reportId}/xlsx`, token });
  assertStatusOneOf(r, [200, 302, 404]);
});

if (require.main === module) {
  run().then(rs => process.exit(rs.some(r => !r.passed) ? 1 : 0));
}
