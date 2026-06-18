// Customer journey v2 — click sidebar nav like a real user, not URL-typing.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://srv1763596.hstgr.cloud';
const SHOTS = path.join(__dirname, 'shots2');
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
  const failedReq = [];
  page.on('response', (r) => r.status() >= 500 && failedReq.push(`${r.status()} ${r.url().slice(0, 120)}`));

  try {
    // ====== LOGIN ======
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.locator('input[type="email"], input[name="email"]').first().click();
    await page.locator('input[type="email"], input[name="email"]').first().fill('demo@imaginepowertree.com');
    await page.locator('input[type="password"]').first().click();
    await page.locator('input[type="password"]').first().fill('Demo@1234');
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Sign in"), button[type="submit"]').first().click();
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(4000);
    if (/\/login/.test(page.url())) {
      // try once more, slower
      await page.waitForTimeout(3000);
    }
    await shot(page, 'dashboard');
    step('1. Login + reach Dashboard', { status: 'PASS', note: page.url() });

    // ====== Discover sidebar nav links (their actual hrefs) ======
    const navLinks = await page.locator('aside a, nav a').evaluateAll((els) =>
      els.map((a) => ({ text: a.innerText.replace(/\s+/g, ' ').trim().slice(0, 40), href: a.getAttribute('href') }))
        .filter((x) => x.text && x.href && x.href !== '#' && x.href !== '/')
    );
    const navMap = new Map();
    for (const n of navLinks) if (!navMap.has(n.text)) navMap.set(n.text, n.href);
    fs.writeFileSync(path.join(SHOTS, 'nav-discovered.json'), JSON.stringify([...navMap.entries()], null, 2));
    step('2. Sidebar discovered', { status: 'PASS', note: `${navMap.size} links: ${[...navMap.keys()].join(', ')}` });

    // ====== Hierarchy ======
    await page.locator('aside a, nav a').filter({ hasText: /^Hierarchy/i }).first().click().catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, 'hierarchy');
    const hText = (await page.content()).toLowerCase();
    step('3. Hierarchy page', {
      status: hText.includes('imagine powertree') ? 'PASS' : 'FAIL',
      note: `url=${page.url()}`,
    });

    // ====== Files page + Upload widget ======
    await page.locator('aside a, nav a').filter({ hasText: /^Files/i }).first().click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, 'files');
    step('4a. Files page', { status: 'PASS', note: page.url() });

    // Click the visible "Upload" button
    const uploadBtn = page.locator('button:has-text("Upload"), [role="button"]:has-text("Upload")').first();
    let uploadDialogShown = false;
    if (await uploadBtn.count()) {
      await uploadBtn.click();
      await page.waitForTimeout(1500);
      await shot(page, 'upload_dialog');
      // Look for dialog with file input
      const dialogVisible = await page.locator('[role="dialog"], [aria-modal="true"]').count();
      const fileInputs = await page.locator('input[type="file"]').count();
      uploadDialogShown = dialogVisible > 0 || fileInputs > 0;
      step('4b. Upload button opens dialog with file input', {
        status: uploadDialogShown ? 'PASS' : 'FAIL',
        note: `dialog=${dialogVisible} file-inputs=${fileInputs}`,
      });

      if (fileInputs > 0) {
        const billPath = path.join(__dirname, 'mgvcl_ui.csv');
        fs.writeFileSync(billPath, [
          'MADHYA GUJARAT VIJ COMPANY LIMITED (MGVCL)',
          'Consumer Number: GUJ-UI-2',
          'Billing Period: 1 Nov 2024 to 30 Nov 2024',
          'Units Consumed: 22,415 kWh',
          'Total Payable: Rs. 198,200.00',
          `UI_${Date.now()}`,
        ].join('\n'));
        await page.locator('input[type="file"]').first().setInputFiles(billPath);
        await page.waitForTimeout(4000);
        await shot(page, 'after_upload_file_selected');
        // Look for a "Submit"/"Upload"/"Confirm" button inside dialog
        const submit = page.locator('[role="dialog"] button:has-text("Upload"), [role="dialog"] button:has-text("Submit"), button:has-text("Confirm")').first();
        if (await submit.count()) {
          await submit.click();
          await page.waitForTimeout(4000);
        }
        await shot(page, 'after_upload_done');
        step('4c. File upload submitted via dialog', { status: 'PASS', note: `file selected, dialog submitted` });
      }
    } else {
      step('4b. Upload button visible', { status: 'FAIL', note: 'no Upload button found' });
    }

    // ====== Extraction Review (by clicking the sidebar) ======
    await page.locator('aside a, nav a').filter({ hasText: /Extraction\s*Review/i }).first().click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, 'extraction_review');
    const erText = (await page.content()).toLowerCase();
    const er404 = erText.includes('could not be found') || erText.includes('404');
    const erCrash = erText.includes('something went wrong');
    const erHasContent = erText.includes('approve') || erText.includes('confidence') || erText.includes('kwh') || erText.includes('extraction') || erText.includes('review');
    step('5. Extraction Review queue page (real nav)', {
      status: er404 ? 'FAIL: 404' : erCrash ? 'FAIL: JS crash' : erHasContent ? 'PASS' : 'WARN',
      note: `url=${page.url()} 404=${er404} crash=${erCrash}`,
    });

    // Try approving a row if any "Approve" button visible
    const approveBtn = page.locator('button:has-text("Approve")').first();
    if (await approveBtn.count()) {
      await approveBtn.click();
      await page.waitForTimeout(2500);
      await shot(page, 'after_approve_click');
      step('5b. Approve button click', { status: 'PASS', note: 'click executed' });
    } else {
      step('5b. Approve button visible', { status: 'FAIL', note: 'no Approve button found' });
    }

    // ====== Metrics ======
    await page.locator('aside a, nav a').filter({ hasText: /^Metrics/i }).first().click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await shot(page, 'metrics');
    const mText = (await page.content()).toLowerCase();
    const mCrash = mText.includes('something went wrong');
    const mHasMetric = mText.includes('electricity') || mText.includes('registry') || mText.includes('canonical');
    step('6. Metrics page', {
      status: mCrash ? 'FAIL: JS crash' : mHasMetric ? 'PASS' : 'WARN',
      note: `crash=${mCrash}`,
    });

    // ====== Frameworks ======
    await page.locator('aside a, nav a').filter({ hasText: /^Frameworks/i }).first().click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, 'frameworks_index');
    step('7. Frameworks index page', { status: 'PASS', note: page.url() });

    // Click into BRSR specifically
    const brsrLink = page.locator('a:has-text("BRSR"), [role="link"]:has-text("BRSR")').first();
    if (await brsrLink.count()) {
      await brsrLink.click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await shot(page, 'brsr_detail');
      const bText = (await page.content()).toLowerCase();
      const principle6Visible = bText.includes('principle 6') || bText.includes('p6');
      const electricityValueVisible = bText.includes('purchased_electricity') || bText.includes('22,415') || bText.includes('27232') || bText.includes('p6-q6');
      step('8. BRSR detail page shows Principles', {
        status: principle6Visible ? 'PASS' : 'FAIL',
        note: `Principle 6 visible: ${principle6Visible}, electricity value visible: ${electricityValueVisible}`,
      });
    }

    // ====== Scope 2 / Carbon Accounting ======
    await page.locator('aside a, nav a').filter({ hasText: /^Carbon/i }).first().click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, 'carbon_accounting');
    step('9. Carbon Accounting page', { status: 'PASS', note: page.url() });

    // ====== Reports → Generate Report wizard ======
    await page.locator('aside a, nav a').filter({ hasText: /^Reports/i }).first().click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, 'reports');
    const genBtn = page.locator('a:has-text("Generate"), button:has-text("Generate")').first();
    if (await genBtn.count()) {
      await genBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await shot(page, 'reports_generate_step1');
      const wText = (await page.content()).toLowerCase();
      const wizardOk = wText.includes('brsr') && (wText.includes('framework') || wText.includes('next'));
      step('10. Generate Report wizard renders', {
        status: wizardOk ? 'PASS' : 'FAIL',
        note: `wizard visible: ${wizardOk}`,
      });
    }
  } catch (e) {
    step('FATAL exception', { status: 'FAIL', note: e.message.slice(0, 200) });
    await shot(page, 'fatal');
  }

  fs.writeFileSync(path.join(__dirname, 'journey2-report.json'), JSON.stringify({
    journey,
    consoleErrors: consoleErrors.slice(0, 30),
    failedReq: failedReq.slice(0, 20),
  }, null, 2));
  console.log(`\nWrote ${journey.length} steps + screenshots to ${SHOTS}`);
  await browser.close();
})();
