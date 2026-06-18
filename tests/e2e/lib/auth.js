/**
 * Auth helper for the e2e harness.
 *
 * login(email, password) -> { token, refreshToken, user }
 *
 * The token is cached in-memory by (email,password) so subsequent calls
 * within the same `npm test` run don't hammer the login endpoint.
 *
 * The API envelope wraps payloads as { data, meta, traceId, requestId },
 * so the actual login body is at response.data.data.
 */

const { request } = require('./client');

const cache = new Map();

const DEFAULT_EMAIL = process.env.E2E_DEMO_EMAIL || 'demo@imaginepowertree.com';
const DEFAULT_PASSWORD = process.env.E2E_DEMO_PASSWORD || 'Demo@1234';

async function login(email, password) {
  email = email || DEFAULT_EMAIL;
  password = password || DEFAULT_PASSWORD;
  const key = `${email}::${password}`;
  if (cache.has(key)) return cache.get(key);

  const r = await request({
    method: 'POST',
    url: '/iam/auth/login',
    data: { email, password },
  });

  if (r.status !== 200 && r.status !== 201) {
    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    throw new Error(`login failed: HTTP ${r.status} ${body}`);
  }

  // Envelope: { data: { token, refreshToken, user }, meta, traceId, requestId }
  const payload = r.data && typeof r.data === 'object' && 'data' in r.data ? r.data.data : r.data;
  if (!payload || !payload.token) {
    throw new Error(`login response missing token: ${JSON.stringify(r.data).slice(0, 300)}`);
  }
  const result = {
    token: payload.token,
    refreshToken: payload.refreshToken,
    user: payload.user,
  };
  cache.set(key, result);
  return result;
}

/**
 * Convenience to clear cached credentials (e.g. after a 401 from refresh).
 */
function clearCache() {
  cache.clear();
}

module.exports = { login, clearCache, DEFAULT_EMAIL, DEFAULT_PASSWORD };
