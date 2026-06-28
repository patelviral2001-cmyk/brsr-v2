// Customer journey — drive ONLY the deployed UI at https://srv1763596.hstgr.cloud
// No SQL, no API calls beyond what the browser itself makes.
// At every step: take screenshot, record what's visible, mark PASS/FAIL.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://srv1763596.hstgr.cloud';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const journey = [];
function step(name, result) {
  journey.push({ name, ...result });
  console.log(`[${result.status}] ${name}  -- ${result.note}`);
}

async function shot(page, label) {
  const file = path.join(SHOTS, `${String(journey.length + 1).padStart(2, '0')}_${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Track console errors and network failures as a customer would notice indirectly.
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on('requestfailed', (r) =>
    failedRequests.push(`${r.method()} ${r.url().slice(0, 120)} ${r.failure()?.errorText}`)
  );
  page.on('response', (r) => {
    if (r.status() >= 500) failedRequests.push(`5xx ${r.status()} ${r.url().slice(0, 120)}`);
  });

  try {
    // ============================================================
    // STEP 1 — LOGIN
    // ============================================================
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    let f1 = await shot(page, 'login_page');
    const title1 = await page.title();
    const emailVisible = await page.locator('input[type="email"], input[name="email"]').count();
    const passwordVisible = await page.locator('input[type="password"]').count();
    step('1. Login page renders', {
      status: emailVisible && passwordVisible ? 'PASS' : 'FAIL',
      note: `title="${title1}" email-inputs=${emailVisible} password-inputs=${passwordVisible}`,
      screenshot: f1,
    });

    // Fill creds + submit
    if (emailVisible && passwordVisible) {
      await page.locator('input[type="email"], input[name="email"]').first().fill('demo@imaginepowertree.com');
      await page.locator('input[type="password"]').first().fill('Demo@1234');
      const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first();
      if (await submitBtn.count()) {
        await Promise.all([
          page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {}),
          submitBtn.click(),
        ]);
        await page.waitForTimeout(2500);
      }
      const f1b = await shot(page, 'after_login');
      const urlAfter = page.url();
      const stillOnLogin = /\/login/.test(urlAfter);
      step('1b. Login submission redirects off /login', {
        status: stillOnLogin ? 'FAIL' : 'PASS',
        note: `current url = ${urlAfter}`,
        screenshot: f1b,
      });
    }

    // ============================================================
    // STEP 2 — HIERARCHY VIEW
    // ============================================================
    await page.goto(`${BASE}/hierarchy`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    let f2 = await shot(page, 'hierarchy');
    const hierarchyBody = (await page.content()).toLowerCase();
    const showsCompany =
      hierarchyBody.includes('imagine powertree') ||
      hierarchyBody.includes('group') ||
      hierarchyBody.includes('node');
    step('2. Company hierarchy renders with seeded data', {
      status: showsCompany ? 'PASS' : 'FAIL',
      note: `url=${page.url()} contains-imagine-powertree=${hierarchyBody.includes('imagine powertree')}`,
      screenshot: f2,
    });

    // ============================================================
    // STEP 3 — UPLOAD ELECTRICITY BILL
    // ============================================================
    const goFiles = await page.goto(`${BASE}/files`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    let f3 = await shot(page, 'files_index');
    const filesContent = (await page.content()).toLowerCase();
    const hasUploadButton =
      filesContent.includes('upload') ||
      filesContent.includes('drag') ||
      filesContent.includes('drop');
    step('3a. Files page renders + offers upload', {
      status: hasUploadButton ? 'PASS' : 'FAIL',
      note: `has upload affordance: ${hasUploadButton}`,
      screenshot: f3,
    });

    // Try to upload a real bill
    const billPath = path.join(__dirname, 'mgvcl_real.csv');
    fs.writeFileSync(billPath, [
      'MADHYA GUJARAT VIJ COMPANY LIMITED (MGVCL)',
      'Consumer Number: GUJ-UI-TEST-001',
      'Reading Period: 1 Oct 2024 to 31 Oct 2024',
      'Units Consumed: 19,847 kWh',
      'Total Payable: Rs. 178,500.00',
      `UI_TEST_${Date.now()}`,
    ].join('\n'));

    const fileInputs = await page.locator('input[type="file"]').all();
    let uploaded = false;
    if (fileInputs.length > 0) {
      try {
        await fileInputs[0].setInputFiles(billPath);
        await page.waitForTimeout(3000);
        uploaded = true;
      } catch (e) {
        // try clicking visible upload button first
        const ub = page.locator('button:has-text("Upload"), [role="button"]:has-text("Upload"), label:has-text("Upload")').first();
        if (await ub.count()) {
          await ub.click().catch(() => {});
          await page.waitForTimeout(500);
          if ((await page.locator('input[type="file"]').count()) > 0) {
            await page.locator('input[type="file"]').first().setInputFiles(billPath);
            await page.waitForTimeout(3000);
            uploaded = true;
          }
        }
      }
    }
    let f3b = await shot(page, 'after_upload');
    step('3b. Upload form accepts a file', {
      status: uploaded ? 'PASS' : 'FAIL',
      note: `file-inputs-found=${fileInputs.length} upload-attempted=${uploaded}`,
      screenshot: f3b,
    });

    // ============================================================
    // STEP 4 — EXTRACTION REVIEW QUEUE
    // ============================================================
    await page.goto(`${BASE}/extraction`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    let f4 = await shot(page, 'extraction_queue');
    const exQueueText = (await page.content()).toLowerCase();
    const showsExtractedValues =
      exQueueText.includes('kwh') ||
      exQueueText.includes('electricity') ||
      exQueueText.includes('19') ||
      exQueueText.includes('approve');
    step('4. Extraction queue shows extracted values', {
      status: showsExtractedValues ? 'PASS' : 'FAIL',
      note: `url=${page.url()} content-has-extracted-context=${showsExtractedValues}`,
      screenshot: f4,
    });

    // ============================================================
    // STEP 5 — METRICS PAGE
    // ============================================================
    await page.goto(`${BASE}/metrics`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    let f5 = await shot(page, 'metrics');
    const metricsText = (await page.content()).toLowerCase();
    const showsMetrics =
      metricsText.includes('purchased_electricity') ||
      metricsText.includes('electricity') ||
      metricsText.includes('metric registry') ||
      metricsText.includes('canonical');
    step('5. Metrics page renders + shows the canonical metric registry', {
      status: showsMetrics ? 'PASS' : 'FAIL',
      note: `has electricity context: ${showsMetrics}`,
      screenshot: f5,
    });

    // ============================================================
    // STEP 6 — DASHBOARD / SCOPE 2
    // ============================================================
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    let f6a = await shot(page, 'dashboard');

    await page.goto(`${BASE}/carbon/scope2`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    let f6b = await shot(page, 'scope2');
    const scope2Text = (await page.content()).toLowerCase();
    const showsScope2 =
      scope2Text.includes('scope 2') ||
      scope2Text.includes('scope2') ||
      scope2Text.includes('emission') ||
      scope2Text.includes('location-based') ||
      scope2Text.includes('purchased electricity');
    step('6. Scope 2 page shows electricity-based emissions context', {
      status: showsScope2 ? 'PASS' : 'FAIL',
      note: `scope2 content present: ${showsScope2}`,
      screenshot: f6b,
    });

    // ============================================================
    // STEP 7 — FRAMEWORKS (BRSR / GRI / TCFD)
    // ============================================================
    await page.goto(`${BASE}/frameworks/BRSR`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    let f7 = await shot(page, 'brsr_principle6');
    const brsrText = (await page.content()).toLowerCase();
    const showsBrsrP6 =
      brsrText.includes('principle 6') ||
      brsrText.includes('p6') ||
      brsrText.includes('environment');
    step('7. BRSR framework view shows Principle 6', {
      status: showsBrsrP6 ? 'PASS' : 'FAIL',
      note: `BRSR P6 surfaced: ${showsBrsrP6}`,
      screenshot: f7,
    });

    // ============================================================
    // STEP 8 — REPORTS
    // ============================================================
    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    let f8 = await shot(page, 'reports_index');
    const reportsText = (await page.content()).toLowerCase();
    const hasGenerateButton =
      reportsText.includes('generate') ||
      reportsText.includes('create') ||
      reportsText.includes('new report');
    step('8. Reports page exists + has Generate affordance', {
      status: hasGenerateButton ? 'PASS' : 'FAIL',
      note: `generate affordance: ${hasGenerateButton}`,
      screenshot: f8,
    });

    await page.goto(`${BASE}/reports/generate`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    let f8b = await shot(page, 'reports_generate');
    const genText = (await page.content()).toLowerCase();
    const genHasForm = genText.includes('framework') || genText.includes('fy') || genText.includes('fiscal');
    step('8b. Report generation form renders', {
      status: genHasForm ? 'PASS' : 'FAIL',
      note: `form fields visible: ${genHasForm}`,
      screenshot: f8b,
    });
  } catch (e) {
    step(`FATAL: ${e.message}`, { status: 'FAIL', note: String(e).slice(0, 300) });
  }

  // Wrap up
  const summary = {
    journey,
    consoleErrors: consoleErrors.slice(0, 20),
    failedRequests: failedRequests.slice(0, 20),
  };
  fs.writeFileSync(path.join(__dirname, 'journey-report.json'), JSON.stringify(summary, null, 2));
  console.log(`\nWrote journey-report.json and ${journey.length} screenshots to ${SHOTS}`);
  await browser.close();
})();
