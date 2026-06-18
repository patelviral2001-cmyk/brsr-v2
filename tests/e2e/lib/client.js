/**
 * Thin axios wrapper around the BRSR v2 API.
 *
 * Base URL defaults to https://srv1763596.hstgr.cloud/api/v1/v1
 * (the doubled /v1 is intentional: setGlobalPrefix('api/v1') + URI versioning v1 in NestJS).
 *
 * Use:
 *   const { request, withToken } = require('./client');
 *   const r = await request({ method: 'GET', url: '/iam/me', token });
 *   // r is { status, data, error, headers, ok }
 *
 * Never throws on non-2xx — tests should make explicit assertions on .status.
 */

const axios = require('axios');
const https = require('https');

const BASE_URL =
  process.env.E2E_API_BASE_URL ||
  'https://srv1763596.hstgr.cloud/api/v1/v1';

// Some VPS deployments use self-signed or intermediate cert chains.
// Default keep verification on; allow opt-out via E2E_INSECURE=1.
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.E2E_INSECURE !== '1',
  keepAlive: true,
});

const instance = axios.create({
  baseURL: BASE_URL,
  timeout: Number(process.env.E2E_TIMEOUT_MS || 30000),
  httpsAgent,
  validateStatus: () => true, // never throw — tests inspect status
  maxRedirects: 0,
});

/**
 * @param {object} opts
 * @param {string} opts.method
 * @param {string} opts.url               relative to BASE_URL
 * @param {object} [opts.headers]
 * @param {any}    [opts.data]
 * @param {object} [opts.params]
 * @param {string} [opts.token]           bearer token (helper)
 * @param {string} [opts.responseType]    'arraybuffer' for binary
 */
async function request(opts) {
  const headers = { ...(opts.headers || {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (!headers['Content-Type'] && opts.data && !(opts.data instanceof Buffer) && typeof opts.data === 'object' && !opts.data.getHeaders) {
    headers['Content-Type'] = 'application/json';
  }
  if (opts.data && opts.data.getHeaders) {
    Object.assign(headers, opts.data.getHeaders()); // form-data
  }

  const started = Date.now();
  let res;
  try {
    res = await instance.request({
      method: opts.method,
      url: opts.url,
      headers,
      data: opts.data,
      params: opts.params,
      responseType: opts.responseType,
    });
  } catch (err) {
    // network error
    return {
      status: 0,
      data: null,
      error: err.message,
      headers: {},
      ok: false,
      ms: Date.now() - started,
    };
  }

  return {
    status: res.status,
    data: res.data,
    headers: res.headers,
    ok: res.status >= 200 && res.status < 300,
    ms: Date.now() - started,
  };
}

function getBaseUrl() {
  return BASE_URL;
}

module.exports = { request, getBaseUrl };
