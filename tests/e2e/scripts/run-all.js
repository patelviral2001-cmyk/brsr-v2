#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Run every test file in tests/e2e/ in numerical order, collect results, and
 * emit a report.json + console summary.
 *
 * Flags:
 *   --suite=smoke   only run tests tagged with { smoke: true }
 *   --only=<glob>   only run files whose basename matches the substring
 *
 * Exit code: 1 if any test failed, 0 otherwise.
 */

const fs = require('fs');
const path = require('path');

const E2E_DIR = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const suite = (args.find(a => a.startsWith('--suite=')) || '').split('=')[1];
const only = (args.find(a => a.startsWith('--only=')) || '').split('=')[1];

const TEST_FILES = fs
  .readdirSync(E2E_DIR)
  .filter(f => /^\d{2}_.*\.test\.js$/.test(f))
  .sort();

async function main() {
  const expect = require(path.join(E2E_DIR, 'lib/expect.js'));
  const { getBaseUrl, request } = require(path.join(E2E_DIR, 'lib/client.js'));
  console.log(`\nBRSR v2 E2E harness`);
  console.log(`  base URL: ${getBaseUrl()}`);
  console.log(`  suite:    ${suite || 'all'}`);
  if (only) console.log(`  only:     ${only}`);

  // Preflight: API reachable?
  try {
    const r = await request({ method: 'GET', url: '/iam/me' });
    if (r.status === 0) {
      console.error(`\nPREFLIGHT FAIL: cannot reach ${getBaseUrl()} — ${r.error}\n`);
      process.exit(2);
    }
    console.log(`  preflight GET /iam/me (no auth) → HTTP ${r.status} (expected 401)\n`);
  } catch (e) {
    console.error(`PREFLIGHT FAIL: ${e.message}`);
    process.exit(2);
  }

  const report = {
    baseUrl: getBaseUrl(),
    startedAt: new Date().toISOString(),
    suites: [],
    totals: { tests: 0, passed: 0, failed: 0, ms: 0 },
  };

  const overallStart = Date.now();

  for (const file of TEST_FILES) {
    if (only && !file.includes(only)) continue;
    console.log(`────────────  ${file}  ────────────`);

    expect.reset();
    // Require the file (it registers tests via expect.test()).
    try {
      // Clear cache so we re-load if the runner is invoked twice in one node process.
      delete require.cache[require.resolve(path.join(E2E_DIR, file))];
      require(path.join(E2E_DIR, file));
    } catch (e) {
      console.error(`  ERROR  failed to load ${file}: ${e.message}`);
      report.suites.push({ file, error: e.message, results: [] });
      report.totals.failed++;
      continue;
    }

    let registered = expect.getRegistry();
    if (suite === 'smoke') registered = registered.filter(t => t.smoke);
    if (registered.length === 0) {
      console.log(`  (no tests in this suite)\n`);
      report.suites.push({ file, results: [] });
      continue;
    }

    const results = await expect.run();
    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const ms = results.reduce((a, r) => a + (r.ms || 0), 0);
    report.suites.push({ file, results, passed, failed, ms });
    report.totals.tests += results.length;
    report.totals.passed += passed;
    report.totals.failed += failed;
    report.totals.ms += ms;

    console.log(`  → ${passed}/${results.length} passed (${ms}ms)\n`);
  }

  report.finishedAt = new Date().toISOString();
  report.totals.wallMs = Date.now() - overallStart;

  const outPath = path.join(E2E_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // Summary
  console.log('═══════════════════════════════════════════');
  console.log(`  TOTAL: ${report.totals.tests} tests, ${report.totals.passed} passed, ${report.totals.failed} failed`);
  console.log(`  WALL:  ${report.totals.wallMs}ms`);
  console.log(`  REPORT: ${outPath}`);
  console.log('═══════════════════════════════════════════\n');

  // Failures detail
  const failures = [];
  for (const s of report.suites) {
    for (const r of s.results || []) {
      if (!r.passed) failures.push({ file: s.file, ...r });
    }
  }
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) {
      console.log(`  ${f.file} :: ${f.name}`);
      console.log(`    error:    ${f.error}`);
      if (f.expected !== undefined) console.log(`    expected: ${JSON.stringify(f.expected)}`);
      if (f.actual !== undefined) console.log(`    actual:   ${JSON.stringify(f.actual)}`);
      if (f.body) console.log(`    body:     ${f.body}`);
    }
    console.log('');
  }

  process.exit(report.totals.failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Unhandled error in run-all:', e);
  process.exit(2);
});
