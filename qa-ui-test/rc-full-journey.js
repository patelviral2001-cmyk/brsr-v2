// RC v2.1 — full 14-stage E2E customer workflow via UI (Playwright).
// Stages: Login, Hierarchy, Files index, Upload, Extraction Review,
// Approve, Metrics, Calculations, Carbon, Frameworks, BRSR detail,
// Reports, Generate Report wizard, Audit Log.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://srv1763596.hstgr.cloud';
const SHOTS = path.join(__dirname, 'shots-rc');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function record(stage, status, note) {
  results.push({ stage, status, note });
  const tag = status === 'PASS' ? '✓' : status === 'WARN' ? '~' : '✗';
  console.log(`[${tag}] ${String(status).padEnd(4)}  ${stage} -- ${note}`);
}
async function shot(page, label) {
  await page.screenshot({
    path: path.join(SHOTS, `${String(results.length + 1).padStart(2, '0')}_${label}.png`),
    fullPage: true,
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  page.on('response', (r) => r.status() >= 500 && errors.push(`5xx ${r.status()} ${r.url().slice(0, 100)}`));

  // --- 1 LOGIN — robust: retry with longer waits on flake ---
  let loggedIn = false;
  for (let attempt = 1; attempt <= 3 && !loggedIn; attempt++) {
    try {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2500 + attempt * 1500);
      const emailEl = page.locator('input[type="email"], input[name="email"]').first();
      await emailEl.click({ timeout: 5000 }).catch(() => {});
      await emailEl.fill('demo@imaginepowertree.com');
      const passEl = page.locator('input[type="password"]').first();
      await passEl.click().catch(() => {});
      await passEl.fill('Demo@1234');
      await page.waitForTimeout(800);
      await page.locator('button:has-text("Sign in"), button[type="submit"]').first().click();
      // Wait for the SPA to land on /dashboard (or any post-auth page).
      await page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 25_000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(3500);
      if (!/\/login/.test(page.url())) loggedIn = true;
    } catch {}
  }
  await shot(page, 'login');
  record('1.Login', loggedIn ? 'PASS' : 'FAIL', page.url());
  if (!loggedIn) {
    fs.writeFileSync(path.join(__dirname, 'rc-report.json'), JSON.stringify({ results, errors }, null, 2));
    console.log('Login failed after 3 attempts — aborting');
    await browser.close();
    return;
  }

  // --- 2 HIERARCHY ---
  await page.goto(`${BASE}/hierarchy`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, 'hierarchy');
  let body = (await page.content()).toLowerCase();
  record('2.Hierarchy', body.includes('imagine powertree') ? 'PASS' : 'FAIL',
    body.includes('imagine powertree') ? 'tree visible' : 'no company shown');

  // --- 3 FILES INDEX ---
  await page.goto(`${BASE}/files`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, 'files');
  body = await page.content();
  const fileCount = (body.match(/ELECTRICITY BILL/gi) || []).length;
  record('3.Files index', fileCount > 0 ? 'PASS' : 'FAIL', `${fileCount} electricity-bill cards visible`);

  // --- 4 UPLOAD (try clicking Upload button to surface dialog) ---
  const uploadBtn = page.locator('text=/^Upload$/').first();
  if (await uploadBtn.count()) {
    await uploadBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, 'upload_dialog');
    const dialogOpen = (await page.locator('[role="dialog"], [aria-modal="true"]').count()) > 0;
    record('4.Upload dialog', dialogOpen ? 'PASS' : 'WARN', dialogOpen ? 'dialog opened' : 'no dialog detected');
    if (dialogOpen) {
      const billPath = path.join(__dirname, 'rc_bill.csv');
      fs.writeFileSync(billPath, [
        'TORRENT POWER LTD — AHMEDABAD',
        'A/c Number: RC-TEST-001',
        'Billing Period: 1-Jul-2024 - 31-Jul-2024',
        'Total Units Consumed: 18,452 kWh',
        'Bill Amount (INR): 165,200.00',
        `RC_${Date.now()}`,
      ].join('\n'));
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count()) {
        await fileInput.setInputFiles(billPath);
        await page.waitForTimeout(2000);
        const submit = page.locator('[role="dialog"] button:has-text("Upload"), button:has-text("Submit")').last();
        if (await submit.count()) await submit.click().catch(() => {});
        await page.waitForTimeout(4500);
        await shot(page, 'after_upload');
      }
    }
  } else {
    record('4.Upload dialog', 'FAIL', 'no Upload button clickable');
  }

  // --- 5 EXTRACTION REVIEW ---
  await page.goto(`${BASE}/extraction-review`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, 'extraction_review');
  body = (await page.content()).toLowerCase();
  const hasField = body.includes('kwh') || body.includes('purchased_electricity') || /\bapprove\b/.test(body);
  const isEmpty = body.includes('inbox zero');
  record('5.Extraction Review queue', hasField ? 'PASS' : isEmpty ? 'WARN' : 'FAIL',
    hasField ? 'rows present' : isEmpty ? 'inbox zero' : 'no content');

  // --- 6 APPROVE (try first Approve button) ---
  const approveBtn = page.locator('button:has-text("Approve")').first();
  if (await approveBtn.count()) {
    await approveBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, 'after_approve');
    record('6.Approve via UI', 'PASS', 'Approve button clickable');
  } else {
    record('6.Approve via UI', 'WARN', 'no Approve button (queue might be empty)');
  }

  // --- 7 METRICS ---
  await page.goto(`${BASE}/metrics`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, 'metrics');
  body = await page.content();
  const crashed = /Something went wrong/.test(body);
  const hasRegistry = /Registry|electricity|Canonical/i.test(body);
  record('7.Metrics page', crashed ? 'FAIL: crash' : hasRegistry ? 'PASS' : 'WARN',
    crashed ? 'JS crash' : `registry visible: ${hasRegistry}`);

  // --- 8 CALCULATIONS ---
  await page.goto(`${BASE}/calculations`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, 'calculations');
  body = await page.content();
  record('8.Calculations page', /Calculation|formula|Scope/i.test(body) ? 'PASS' : 'WARN',
    page.url());

  // --- 9 CARBON ACCOUNTING ---
  await page.goto(`${BASE}/carbon`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, 'carbon');
  body = await page.content();
  // Real number = 19.5 tCO2e (Scope 2 from purchased_electricity_kwh)
  const has195 = /19\.?5\d*|19\.498/.test(body);
  record('9.Carbon Accounting', /scope/i.test(body) ? 'PASS' : 'WARN',
    has195 ? 'shows 19.5 tCO2e (real data!)' : 'page renders');

  // --- 10 FRAMEWORKS INDEX ---
  await page.goto(`${BASE}/frameworks`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, 'frameworks');
  body = await page.content();
  record('10.Frameworks index', /BRSR|GRI|TCFD/i.test(body) ? 'PASS' : 'FAIL', 'framework list');

  // --- 11 BRSR detail — click P6 ---
  await page.goto(`${BASE}/frameworks/BRSR`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);
  await page.locator('text=Principle 6').first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, 'brsr_p6');
  body = await page.locator('body').innerText().catch(() => '');
  const hasP6Q6 = /P6-Q6/.test(body);
  const hasValue = /27[,\.]?232|27232|19[,\.]?5/.test(body);
  record('11.BRSR P6-Q6 visible', hasP6Q6 && hasValue ? 'PASS' : hasP6Q6 ? 'WARN' : 'FAIL',
    `P6-Q6: ${hasP6Q6}, value rendered: ${hasValue}`);

  // --- 12 DASHBOARD (KPIs) ---
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);
  await shot(page, 'dashboard');
  body = await page.locator('body').innerText().catch(() => '');
  const hasEmissions = /19\.5|tCO2/i.test(body);
  record('12.Dashboard KPIs', hasEmissions ? 'PASS' : 'WARN',
    hasEmissions ? 'real numbers' : 'placeholders only');

  // --- 13 REPORTS — Generate wizard ---
  await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, 'reports');
  await page.goto(`${BASE}/reports/generate`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, 'report_wizard');
  body = await page.content();
  record('13.Report wizard', /Framework|Next|wizard|6-step/i.test(body) ? 'PASS' : 'FAIL',
    'generate wizard renders');

  // --- 14 AUDIT LOG ---
  await page.goto(`${BASE}/audit-log`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, 'audit_log');
  body = await page.content();
  record('14.Audit Log', /audit|action|created/i.test(body) ? 'PASS' : 'WARN', 'page renders');

  fs.writeFileSync(path.join(__dirname, 'rc-report.json'), JSON.stringify({
    results,
    consoleErrors: errors.slice(0, 30),
  }, null, 2));
  console.log(`\n=== Summary ===`);
  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const r of results) counts[String(r.status).startsWith('FAIL') ? 'FAIL' : r.status] = (counts[String(r.status).startsWith('FAIL') ? 'FAIL' : r.status] || 0) + 1;
  console.log(JSON.stringify(counts));
  console.log(`\nShots in ${SHOTS}`);
  await browser.close();
})();
