#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Run a single test file (called from npm scripts).
 * Usage: node scripts/run-one.js 01_auth.test.js
 */

const path = require('path');
const E2E_DIR = path.resolve(__dirname, '..');

(async () => {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: run-one.js <NN_*.test.js>');
    process.exit(2);
  }
  const expect = require(path.join(E2E_DIR, 'lib/expect.js'));
  expect.reset();
  delete require.cache[require.resolve(path.join(E2E_DIR, file))];
  require(path.join(E2E_DIR, file));
  const results = await expect.run();
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n  ${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
