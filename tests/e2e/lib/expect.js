/**
 * Tiny assertion + test-collection framework.
 *
 * Each test file does:
 *   const { test, run } = require('./lib/expect');
 *   test('description', async () => { ... assertEq(...) ... });
 *   if (require.main === module) run().then(...);
 *
 * The runner script (scripts/run-all.js) consumes the exported registry.
 */

const registry = [];

function test(name, fn, opts = {}) {
  registry.push({ name, fn, smoke: !!opts.smoke });
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new AssertionError(msg || 'assertEq', { expected, actual });
  }
}

function assertOneOf(actual, allowed, msg) {
  if (!allowed.includes(actual)) {
    throw new AssertionError(msg || 'assertOneOf', {
      expected: `one of [${allowed.join(',')}]`,
      actual,
    });
  }
}

function assertStatus(response, expected, msg) {
  if (response.status !== expected) {
    throw new AssertionError(msg || `expected HTTP ${expected}`, {
      expected,
      actual: response.status,
      body: safeBody(response.data),
    });
  }
}

function assertStatusOneOf(response, allowed, msg) {
  if (!allowed.includes(response.status)) {
    throw new AssertionError(msg || `expected HTTP in [${allowed.join(',')}]`, {
      expected: allowed,
      actual: response.status,
      body: safeBody(response.data),
    });
  }
}

function assertTrue(cond, msg) {
  if (!cond) throw new AssertionError(msg || 'assertTrue failed', { expected: true, actual: cond });
}

function assertHasField(obj, field, msg) {
  if (!obj || typeof obj !== 'object' || !(field in obj)) {
    throw new AssertionError(msg || `missing field "${field}"`, {
      expected: `object containing "${field}"`,
      actual: safeBody(obj),
    });
  }
}

function unwrap(response) {
  // Strip the {data, meta, ...} envelope if present.
  if (response && response.data && typeof response.data === 'object' && 'data' in response.data) {
    return response.data.data;
  }
  return response && response.data;
}

class AssertionError extends Error {
  constructor(msg, info) {
    super(msg);
    this.name = 'AssertionError';
    this.info = info;
  }
}

function safeBody(v) {
  try {
    if (Buffer.isBuffer(v)) return `<Buffer ${v.length}b>`;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s && s.length > 500 ? s.slice(0, 500) + '…' : s;
  } catch (e) {
    return String(v);
  }
}

/**
 * Direct-run mode (node lib/expect.js path/to/test.js).
 * Returns a per-test array: [{ name, passed, error, ms }].
 */
async function run() {
  const results = [];
  for (const t of registry) {
    const started = Date.now();
    try {
      await t.fn();
      results.push({ name: t.name, passed: true, ms: Date.now() - started });
      // eslint-disable-next-line no-console
      console.log(`  PASS  ${t.name}  (${Date.now() - started}ms)`);
    } catch (err) {
      const ms = Date.now() - started;
      const info = err.info || {};
      results.push({
        name: t.name,
        passed: false,
        ms,
        error: err.message,
        expected: info.expected,
        actual: info.actual,
        body: info.body,
      });
      // eslint-disable-next-line no-console
      console.log(`  FAIL  ${t.name}  (${ms}ms)`);
      // eslint-disable-next-line no-console
      console.log(`        ${err.message}`);
      if (info.expected !== undefined) console.log(`        expected: ${JSON.stringify(info.expected)}`);
      if (info.actual !== undefined) console.log(`        actual:   ${JSON.stringify(info.actual)}`);
      if (info.body) console.log(`        body:     ${info.body}`);
    }
  }
  return results;
}

function getRegistry() {
  return registry.slice();
}

function reset() {
  registry.length = 0;
}

module.exports = {
  test,
  run,
  reset,
  getRegistry,
  assertEq,
  assertOneOf,
  assertStatus,
  assertStatusOneOf,
  assertTrue,
  assertHasField,
  unwrap,
  AssertionError,
};
