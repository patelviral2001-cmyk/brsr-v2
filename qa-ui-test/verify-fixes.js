// Verify the P0 fixes are visible in the UI.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://srv1763596.hstgr.cloud';
const SHOTS = path.join(__dirname, 'shots3');
fs.mkdirSync(SHOTS, { recursive: true });
const journey = [];
function step(name, result) {
  journey.push({ name, ...result });
  const tag = result.status === 'PASS' ? '✓' : result.status === 'WARN' ? '~' : '✗';
  console.log(`[${tag}] ${result.status.padEnd(4)}  ${name}  -- ${result.note || ''}`);
}
async function shot(page, label) {
  const file = path.join(SHOTS, `${String(journey.length + 1).padStart(2, '0')}_${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)));

  try {
    // Login
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.locator('input[type="email"]').first().fill('demo@imaginepowertree.com');
    await page.locator('input[type="password"]').first().fill('Demo@1234');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await shot(page, 'after_login');
    step('Login + Dashboard reached', { status: page.url().includes('/dashboard') ? 'PASS' : 'FAIL', note: page.url() });

    // === Test 1: /metrics no longer crashes ===
    await page.goto(`${BASE}/metrics`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, 'metrics');
    const mText = (await page.content()).toLowerCase();
    const mCrashed = mText.includes('something went wrong');
    const mHasRegistry = mText.includes('registry') || mText.includes('electricity') || mText.includes('canonical');
    step('/metrics page renders without crash', {
      status: mCrashed ? 'FAIL' : mHasRegistry ? 'PASS' : 'WARN',
      note: `crashed=${mCrashed} has-content=${mHasRegistry}`,
    });

    // === Test 2: /frameworks/BRSR now shows sections ===
    await page.goto(`${BASE}/frameworks/BRSR`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await shot(page, 'brsr_with_sections');
    const fText = (await page.content()).toLowerCase();
    const fHasPrinciples = fText.includes('principle');
    const fHasP6Q6 = fText.includes('p6-q6') || fText.includes('purchased_electricity') || fText.includes('27232') || fText.includes('27,232');
    step('/frameworks/BRSR shows Principles', {
      status: fHasPrinciples ? 'PASS' : 'FAIL',
      note: `principles visible=${fHasPrinciples} P6-Q6/value visible=${fHasP6Q6}`,
    });

    // === Test 3: Sidebar no longer shows hardcoded badge of 12 ===
    const sidebarText = await page.locator('aside').first().innerText().catch(() => '');
    const stillHas12 = /Extraction Review[\s\S]*?12/.test(sidebarText);
    step('Sidebar no longer shows hardcoded "12" on Extraction Review', {
      status: stillHas12 ? 'FAIL' : 'PASS',
      note: `sidebar excerpt: ${sidebarText.replace(/\s+/g, ' ').slice(0, 200)}`,
    });

    // === Test 4: Extraction Review queue now shows DRAFT rows ===
    await page.goto(`${BASE}/extraction-review`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, 'extraction_review');
    const eText = (await page.content()).toLowerCase();
    const eHasContent = eText.includes('approve') || eText.includes('kwh') || eText.includes('electricity') || eText.includes('confidence');
    const eIsEmpty = eText.includes('inbox zero') && !eText.includes('approve');
    step('Extraction Review now lists pending fields', {
      status: eHasContent ? 'PASS' : eIsEmpty ? 'WARN' : 'FAIL',
      note: `has fields=${eHasContent} empty=${eIsEmpty}`,
    });
  } catch (e) {
    step(`FATAL: ${e.message}`, { status: 'FAIL', note: e.message.slice(0, 150) });
  }

  fs.writeFileSync(path.join(__dirname, 'verify-report.json'), JSON.stringify({
    journey,
    consoleErrors: consoleErrors.slice(0, 30),
  }, null, 2));
  await browser.close();
  console.log(`\n${journey.length} checks, screenshots in ${SHOTS}`);
})();
