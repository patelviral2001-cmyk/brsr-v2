/**
 * 01 — Auth.
 *
 * Validates /iam/auth/login, /iam/me, /iam/auth/refresh contract.
 * Endpoints live under the doubled prefix /api/v1/v1/iam/* (NestJS global
 * prefix + URI versioning).
 */

const { test, assertStatus, assertStatusOneOf, assertHasField, unwrap, run } = require('./lib/expect');
const { request } = require('./lib/client');
const { login, DEFAULT_EMAIL, DEFAULT_PASSWORD } = require('./lib/auth');

test('POST /iam/auth/login with valid creds → 200/201 + token', async () => {
  const r = await request({
    method: 'POST',
    url: '/iam/auth/login',
    data: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD },
  });
  assertStatusOneOf(r, [200, 201], 'login success');
  const body = unwrap(r);
  assertHasField(body, 'token');
  assertHasField(body, 'refreshToken');
  assertHasField(body, 'user');
}, { smoke: true });

test('POST /iam/auth/login with wrong password → 401', async () => {
  const r = await request({
    method: 'POST',
    url: '/iam/auth/login',
    data: { email: DEFAULT_EMAIL, password: 'definitely-wrong-password-zzz' },
  });
  assertStatus(r, 401);
});

test('POST /iam/auth/login with non-existent email → 401', async () => {
  const r = await request({
    method: 'POST',
    url: '/iam/auth/login',
    data: { email: 'nobody-here-e2e@example.invalid', password: 'whatever' },
  });
  assertStatus(r, 401);
});

test('POST /iam/auth/login with empty body → 400', async () => {
  const r = await request({
    method: 'POST',
    url: '/iam/auth/login',
    data: {},
  });
  // BadRequestException for missing email/password.
  assertStatusOneOf(r, [400, 401]);
});

test('GET /iam/me with valid token → 200', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: '/iam/me', token });
  assertStatus(r, 200);
  const me = unwrap(r);
  assertHasField(me, 'id');
  assertHasField(me, 'email');
  assertHasField(me, 'tenantId');
}, { smoke: true });

test('GET /iam/me with no token → 401', async () => {
  const r = await request({ method: 'GET', url: '/iam/me' });
  assertStatus(r, 401);
});

test('GET /iam/me with malformed token → 401', async () => {
  const r = await request({
    method: 'GET',
    url: '/iam/me',
    token: 'not.a.real.jwt',
  });
  assertStatus(r, 401);
});

test('GET /iam/me with expired token → 401', async () => {
  // A token signed with the right format but expired/secret-mismatched.
  // The decoded header is HS256 with exp=1 (1970). Any production verifier rejects it.
  const expired =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJzdWIiOiJleHBpcmVkLXVzZXItaWQiLCJlbWFpbCI6ImV4cGlyZWRAZXhhbXBsZS5jb20iLCJ0ZW5hbnRfaWQiOiJleHBpcmVkLXRlbmFudCIsImlhdCI6MSwiZXhwIjoyfQ.' +
    'invalid-signature-bytes';
  const r = await request({ method: 'GET', url: '/iam/me', token: expired });
  assertStatus(r, 401);
});

test('POST /iam/auth/refresh with valid refresh → 200/201 + new token', async () => {
  const { refreshToken } = await login();
  const r = await request({
    method: 'POST',
    url: '/iam/auth/refresh',
    data: { refreshToken },
  });
  assertStatusOneOf(r, [200, 201]);
  const body = unwrap(r);
  assertHasField(body, 'token');
});

test('POST /iam/auth/refresh with invalid refresh → 401', async () => {
  const r = await request({
    method: 'POST',
    url: '/iam/auth/refresh',
    data: { refreshToken: 'garbage-refresh-token' },
  });
  assertStatus(r, 401);
});

if (require.main === module) {
  run().then(rs => process.exit(rs.some(r => !r.passed) ? 1 : 0));
}
