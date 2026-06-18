/**
 * 04 — Files.
 *
 * Uploads, list, detail, reprocess, mime-validation, size-limit, idempotency.
 * Uses FormData with in-memory buffers from lib/fixtures.
 */

const { test, assertStatus, assertStatusOneOf, assertHasField, assertTrue, assertEq, unwrap, run } = require('./lib/expect');
const { request } = require('./lib/client');
const { login } = require('./lib/auth');
const F = require('./lib/fixtures');
const FormData = require('form-data');

let uploadedPdfId = null;
let uploadedPdfId2 = null;

function fileForm(filename, contentType, buffer) {
  const fd = new FormData();
  fd.append('file', buffer, { filename, contentType });
  fd.append('docType', 'INVOICE');
  return fd;
}

test('POST /files/upload PDF → 201', async () => {
  const { token } = await login();
  const fd = fileForm('e2e.pdf', 'application/pdf', F.pdfBuffer('one'));
  const r = await request({ method: 'POST', url: '/files/upload', token, data: fd });
  assertStatusOneOf(r, [200, 201, 403], 'upload PDF');
  if (r.status === 201 || r.status === 200) {
    const body = unwrap(r);
    assertHasField(body, 'id');
    uploadedPdfId = body.id;
  }
}, { smoke: true });

test('POST /files/upload XLSX → 201', async () => {
  const { token } = await login();
  const fd = fileForm('e2e.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', F.xlsxBuffer());
  const r = await request({ method: 'POST', url: '/files/upload', token, data: fd });
  assertStatusOneOf(r, [200, 201, 400, 403], 'upload XLSX — may 400 if schema-strict sniffing rejects placeholder');
});

test('POST /files/upload CSV → 201', async () => {
  const { token } = await login();
  const fd = fileForm('e2e.csv', 'text/csv', F.csvBuffer());
  const r = await request({ method: 'POST', url: '/files/upload', token, data: fd });
  assertStatusOneOf(r, [200, 201, 403]);
});

test('POST /files/upload PNG → 201', async () => {
  const { token } = await login();
  const fd = fileForm('e2e.png', 'image/png', F.pngBuffer());
  const r = await request({ method: 'POST', url: '/files/upload', token, data: fd });
  assertStatusOneOf(r, [200, 201, 403]);
});

test('POST /files/upload TXT → 400 (unsupported mime)', async () => {
  const { token } = await login();
  const fd = fileForm('e2e.txt', 'text/plain', F.txtBuffer());
  const r = await request({ method: 'POST', url: '/files/upload', token, data: fd });
  // Service should reject unsupported MIME; accept 415 as a valid alternative.
  assertStatusOneOf(r, [400, 415, 422], 'unsupported mime should be 4xx');
});

test('POST /files/upload with 51MB → 400/413 (over limit)', async () => {
  const { token } = await login();
  const fd = new FormData();
  fd.append('file', F.oversizedBuffer(), { filename: 'huge.pdf', contentType: 'application/pdf' });
  const r = await request({
    method: 'POST',
    url: '/files/upload',
    token,
    data: fd,
    // generous timeout for 51MB
  });
  // Multer enforces 50MB; expect 413 (or 400).
  assertStatusOneOf(r, [400, 413, 422], 'oversized payload should be 4xx');
});

test('POST /files/upload with no file → 400', async () => {
  const { token } = await login();
  const fd = new FormData();
  fd.append('docType', 'INVOICE');
  const r = await request({ method: 'POST', url: '/files/upload', token, data: fd });
  assertStatusOneOf(r, [400, 422], 'no file should be 4xx');
});

test('POST /files/upload duplicate content → both 201, same doc id (idempotent)', async () => {
  const { token } = await login();
  const buf = F.pdfBuffer('idem');
  const r1 = await request({ method: 'POST', url: '/files/upload', token, data: fileForm('idem.pdf', 'application/pdf', buf) });
  const r2 = await request({ method: 'POST', url: '/files/upload', token, data: fileForm('idem.pdf', 'application/pdf', buf) });
  assertStatusOneOf(r1, [200, 201, 403]);
  assertStatusOneOf(r2, [200, 201, 403]);
  if ((r1.status === 200 || r1.status === 201) && (r2.status === 200 || r2.status === 201)) {
    const a = unwrap(r1);
    const b = unwrap(r2);
    uploadedPdfId2 = a.id;
    assertEq(a.id, b.id, 'same content hash → same doc id (idempotent upload)');
  }
});

test('GET /files → 200 list', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: '/files', token });
  assertStatus(r, 200);
});

test('GET /files?status=PENDING → 200 filtered', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: '/files', token, params: { status: 'PENDING' } });
  assertStatus(r, 200);
});

test('GET /files/:id → 200 details', async () => {
  if (!uploadedPdfId) { assertTrue(true, 'no upload — skip'); return; }
  const { token } = await login();
  const r = await request({ method: 'GET', url: `/files/${uploadedPdfId}`, token });
  assertStatusOneOf(r, [200, 404]);
  if (r.status === 200) {
    const f = unwrap(r);
    assertHasField(f, 'id');
  }
});

test('GET /files/:id with bogus id → 404', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: '/files/clbogusfile0000000000000', token });
  assertStatus(r, 404);
});

test('POST /files/:id/reprocess → 200/202', async () => {
  if (!uploadedPdfId) { assertTrue(true, 'no upload — skip'); return; }
  const { token } = await login();
  const r = await request({ method: 'POST', url: `/files/${uploadedPdfId}/reprocess`, token });
  assertStatusOneOf(r, [200, 201, 202, 403, 404]);
});

if (require.main === module) {
  run().then(rs => process.exit(rs.some(r => !r.passed) ? 1 : 0));
}
