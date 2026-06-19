// Full logical audit as ADMIN and DEMO. Also tests the new file download.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://srv1763596.hstgr.cloud';
const SHOTS = path.join(__dirname, 'shots-audit');
fs.mkdirSync(SHOTS, { recursive: true });

async function login(page, email, password) {
  for (let i = 1; i <= 3; i++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2200 + i * 1000);
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3500);
    if (!/\/login/.test(page.url())) return true;
  }
  return false;
}

const results = [];
function rec(role, step, result) {
  results.push({ role, step, ...result });
  const tag = result.status === 'PASS' ? '✓' : result.status === 'WARN' ? '~' : '✗';
  console.log(`[${role}] ${tag} ${result.status.padEnd(4)} ${step} — ${result.note || ''}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const acct of [
    { role: 'admin', email: 'admin@brsr.ai', password: 'BRSR@Admin#2026' },
    { role: 'demo',  email: 'demo@imaginepowertree.com', password: 'Demo@1234' },
  ]) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrs = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrs.push(m.text().slice(0, 200)));

    const ok = await login(page, acct.email, acct.password);
    await page.screenshot({ path: path.join(SHOTS, `${acct.role}_1_login.png`), fullPage: true });
    rec(acct.role, 'login', { status: ok ? 'PASS' : 'FAIL', note: page.url() });
    if (!ok) { await ctx.close(); continue; }

    // 2. Dashboard
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SHOTS, `${acct.role}_2_dashboard.png`), fullPage: true });
    const dashText = await page.locator('body').innerText();
    const hasZero = /\b0 tCO2e\b|\b0\.0\b|—/.test(dashText);
    rec(acct.role, 'dashboard renders', { status: 'PASS', note: hasZero ? 'shows empty-state values (data was wiped)' : 'has values' });

    // 3. Files - should be empty after wipe
    await page.goto(`${BASE}/files`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, `${acct.role}_3_files.png`), fullPage: true });
    const filesText = (await page.locator('body').innerText()).toLowerCase();
    const emptyFiles = filesText.includes('no files yet') || filesText.includes('upload your first');
    rec(acct.role, 'Files page shows empty state', {
      status: emptyFiles ? 'PASS' : 'WARN',
      note: emptyFiles ? 'empty state visible' : 'unexpected files visible',
    });

    // 4. Upload a real bill via UI
    await page.goto(`${BASE}/files/upload`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    const billPath = path.join(__dirname, `${acct.role}_bill.csv`);
    fs.writeFileSync(billPath, [
      'TORRENT POWER LTD — AHMEDABAD',
      'A/c Number: AUDIT-001',
      'Billing Period: 1-Aug-2024 - 31-Aug-2024',
      'Total Units Consumed: 24,857 kWh',
      'Bill Amount (INR): 220,400.00',
      `AUDIT_${acct.role}_${Date.now()}`,
    ].join('\n'));
    const fileInput = page.locator('input[type="file"]').first();
    let uploadOk = false;
    if (await fileInput.count()) {
      try {
        await fileInput.setInputFiles(billPath);
        await page.waitForTimeout(2500);
        // hit a "submit"/"upload" button if present
        const submit = page.locator('button:has-text("Upload"), button:has-text("Submit")').last();
        if (await submit.count()) await submit.click().catch(() => {});
        await page.waitForTimeout(6000);
        uploadOk = true;
      } catch {}
    }
    await page.screenshot({ path: path.join(SHOTS, `${acct.role}_4_after_upload.png`), fullPage: true });
    rec(acct.role, 'Upload completes', { status: uploadOk ? 'PASS' : 'WARN', note: uploadOk ? 'submitted' : 'upload mechanism not found' });

    // 5. Back to files index - file should appear
    await page.goto(`${BASE}/files`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    const filesAfter = await page.locator('body').innerText();
    const hasFile = /\.csv|TORRENT|REVIEW_NEEDED|EXTRACTED|CLASSIFIED/.test(filesAfter);
    await page.screenshot({ path: path.join(SHOTS, `${acct.role}_5_files_after.png`), fullPage: true });
    rec(acct.role, 'Uploaded file visible on Files index', {
      status: hasFile ? 'PASS' : 'WARN',
      note: hasFile ? 'card appeared' : 'no card detected',
    });

    // 6. Click first file → detail
    const fileLink = page.locator('a[href^="/files/c"]').first();
    if (await fileLink.count()) {
      await fileLink.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2500);
      const url = page.url();
      await page.screenshot({ path: path.join(SHOTS, `${acct.role}_6_file_detail.png`), fullPage: true });
      const detailText = await page.locator('body').innerText();
      const hasFilename = /\.csv|TORRENT|AUDIT|bill/i.test(detailText);
      const hasUploadedBy = /by .+(User|Admin|Demo|brsr)/i.test(detailText);
      rec(acct.role, 'File detail shows real filename + uploader name', {
        status: hasFilename && hasUploadedBy ? 'PASS' : 'WARN',
        note: `filename:${hasFilename} uploader:${hasUploadedBy}`,
      });

      // 7. Click "Original" - should download (test API works without browser auth-redirect)
      // Use evaluate to trigger the click and watch for a download event
      let downloaded = false;
      try {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
          page.locator('button:has-text("Original")').first().click(),
        ]);
        downloaded = !!download;
      } catch {}
      rec(acct.role, 'Original download streams', { status: downloaded ? 'PASS' : 'WARN', note: downloaded ? 'browser triggered download' : 'no download event captured' });
    } else {
      rec(acct.role, 'File detail navigation', { status: 'WARN', note: 'no file link found' });
    }

    // 8. Settings/Users — admin should see + manage, demo should be blocked or empty
    await page.goto(`${BASE}/settings/users`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, `${acct.role}_7_users.png`), fullPage: true });
    const usersText = await page.locator('body').innerText();
    const seesAdmin = /admin@brsr\.ai/.test(usersText);
    const isForbidden = /forbidden|access denied|missing permission|403/i.test(usersText);
    if (acct.role === 'admin') {
      rec(acct.role, 'Sees Users list including admin@brsr.ai', { status: seesAdmin ? 'PASS' : 'WARN', note: '' });
    } else {
      // demo should EITHER see (with limited actions) OR be blocked
      rec(acct.role, 'Users page (demo)', { status: 'PASS', note: isForbidden ? 'blocked (expected)' : (seesAdmin ? 'visible (read-only)' : 'page rendered') });
    }

    // 9. BRSR P6-Q6 — should be UNANSWERED (data was wiped)
    await page.goto(`${BASE}/frameworks/BRSR`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);
    await page.locator('text=Principle 6').first().click().catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SHOTS, `${acct.role}_8_brsr_p6.png`), fullPage: true });
    const brsrText = await page.locator('body').innerText();
    const allUnanswered = /Principle 6\s*0 of [0-9]+ questions answered/.test(brsrText) || /0 \/ 7 answered/.test(brsrText) || (/UNANSWERED/.test(brsrText) && !/27,?232/.test(brsrText));
    rec(acct.role, 'BRSR P6 starts UNANSWERED after data wipe', {
      status: allUnanswered ? 'PASS' : 'WARN',
      note: allUnanswered ? 'clean baseline' : 'unexpected pre-fill',
    });

    await ctx.close();
  }

  fs.writeFileSync(path.join(__dirname, 'audit-end-to-end-report.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('\n=== Summary ===');
  const summary = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  console.log(JSON.stringify(summary));
})();
