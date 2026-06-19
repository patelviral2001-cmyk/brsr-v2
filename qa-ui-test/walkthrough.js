// Full customer walkthrough — exercise every page in the sidebar + sub-pages
// and capture: (a) HTTP errors, (b) JS console errors, (c) the rendered body
// text. Output goes to walkthrough-report.json so we can grep for "null"
// rendered as text, missing labels, "—" everywhere, empty arrays etc.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://srv1763596.hstgr.cloud';
const SHOTS = path.join(__dirname, 'shots-walk');
fs.mkdirSync(SHOTS, { recursive: true });

const pages = [
  { name: 'dashboard', url: '/dashboard' },
  { name: 'hierarchy', url: '/hierarchy' },
  { name: 'files', url: '/files' },
  { name: 'files_upload', url: '/files/upload' },
  { name: 'extraction_review', url: '/extraction-review' },
  { name: 'metrics', url: '/metrics' },
  { name: 'metrics_events', url: '/metrics?tab=events' },
  { name: 'frameworks', url: '/frameworks' },
  { name: 'frameworks_brsr', url: '/frameworks/BRSR' },
  { name: 'frameworks_gri', url: '/frameworks/GRI' },
  { name: 'frameworks_tcfd', url: '/frameworks/TCFD' },
  { name: 'frameworks_ifrs_s2', url: '/frameworks/IFRS_S2' },
  { name: 'calculations', url: '/calculations' },
  { name: 'carbon', url: '/carbon' },
  { name: 'carbon_scope1', url: '/carbon/scope1' },
  { name: 'carbon_scope2', url: '/carbon/scope2' },
  { name: 'carbon_scope3', url: '/carbon/scope3' },
  { name: 'carbon_netzero', url: '/carbon/net-zero' },
  { name: 'carbon_abatement', url: '/carbon/abatement' },
  { name: 'carbon_credits', url: '/carbon/credits' },
  { name: 'reports', url: '/reports' },
  { name: 'reports_generate', url: '/reports/generate' },
  { name: 'materiality', url: '/materiality' },
  { name: 'suppliers', url: '/suppliers' },
  { name: 'assurance', url: '/assurance' },
  { name: 'audit_log', url: '/audit-log' },
  { name: 'copilot', url: '/copilot' },
  { name: 'settings', url: '/settings' },
  { name: 'settings_users', url: '/settings/users' },
  { name: 'settings_integrations', url: '/settings/integrations' },
];

const report = [];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ----- LOGIN -----
  let loggedIn = false;
  for (let attempt = 1; attempt <= 3 && !loggedIn; attempt++) {
    try {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2500 + attempt * 1000);
      await page.locator('input[type="email"]').first().click().catch(() => {});
      await page.locator('input[type="email"]').first().fill('demo@imaginepowertree.com');
      await page.locator('input[type="password"]').first().click().catch(() => {});
      await page.locator('input[type="password"]').first().fill('Demo@1234');
      await page.waitForTimeout(800);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 25_000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      if (!/\/login/.test(page.url())) loggedIn = true;
    } catch {}
  }
  if (!loggedIn) {
    console.log('LOGIN FAILED after 3 attempts');
    await browser.close();
    return;
  }
  console.log('Logged in:', page.url());

  for (const p of pages) {
    const consoleErrors = [];
    const networkErrors = [];
    const onCons = (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200));
    const onRes = (r) => {
      const s = r.status();
      if (s >= 400 && (r.url().includes('/api/') || r.url().includes('/v1/'))) {
        networkErrors.push(`${s} ${r.request().method()} ${r.url().slice(BASE.length).slice(0, 100)}`);
      }
    };
    page.on('console', onCons);
    page.on('response', onRes);
    try {
      await page.goto(`${BASE}${p.url}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
      await page.waitForTimeout(2200);
      const html = (await page.content()).toLowerCase();
      const visible = await page.locator('body').innerText().catch(() => '');
      await page.screenshot({ path: path.join(SHOTS, `${p.name}.png`), fullPage: false });
      report.push({
        name: p.name,
        url: p.url,
        finalUrl: page.url(),
        crashed: /something went wrong/.test(html),
        is404: /could not be found/.test(html) || /\b404\b/.test(html.split('html')[1] || ''),
        renderedNullText: /(\bnull\b|>null<)/.test(visible),
        renderedUndefinedText: /(\bundefined\b)/.test(visible),
        emptyShell: visible.replace(/\s+/g, ' ').length < 250,
        keyTexts: visible.replace(/\s+/g, ' ').slice(0, 350),
        consoleErrors: consoleErrors.slice(0, 5),
        networkErrors: networkErrors.slice(0, 5),
      });
      console.log(`  [${p.name}] ${page.url()}  ${consoleErrors.length} console / ${networkErrors.length} net errors`);
    } catch (e) {
      report.push({ name: p.name, url: p.url, error: e.message.slice(0, 150) });
      console.log(`  [${p.name}] ERROR ${e.message.slice(0, 100)}`);
    }
    page.off('console', onCons);
    page.off('response', onRes);
  }

  fs.writeFileSync(path.join(__dirname, 'walkthrough-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${report.length} pages. Shots in ${SHOTS}`);
  await browser.close();
})();
