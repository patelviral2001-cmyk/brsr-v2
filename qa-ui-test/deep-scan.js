// Deep customer-perspective sweep. For every meaningful page, capture:
//  * any raw cuid rendered (cm[a-z0-9]{20+})
//  * "undefined" or "null" rendered as text
//  * generic titles like "File", "Untitled", "Unknown"
//  * ISO date strings rendered raw
//  * disabled buttons with no helper text
//  * pages with no real data
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://srv1763596.hstgr.cloud';
const SHOTS = path.join(__dirname, 'shots-deep');
fs.mkdirSync(SHOTS, { recursive: true });

const pages = [
  { name: 'dashboard', url: '/dashboard' },
  { name: 'hierarchy', url: '/hierarchy' },
  { name: 'files', url: '/files' },
  { name: 'extraction_review', url: '/extraction-review' },
  { name: 'metrics_registry', url: '/metrics' },
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
  { name: 'carbon_macc', url: '/carbon/macc' },
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
  { name: 'settings_org', url: '/settings/organization' },
  { name: 'settings_integrations', url: '/settings/integrations' },
];

const RAW_CUID = /\bcm[a-z0-9]{15,}\b/i;
const ISO_DATE = /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // login
  for (let i = 1; i <= 3; i++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500 + i * 1000);
    await page.locator('input[type="email"]').first().fill('demo@imaginepowertree.com');
    await page.locator('input[type="password"]').first().fill('Demo@1234');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3500);
    if (!/\/login/.test(page.url())) break;
  }
  console.log('Logged in:', page.url());

  const results = [];
  for (const p of pages) {
    try {
      await page.goto(`${BASE}${p.url}`, { waitUntil: 'domcontentloaded', timeout: 18000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1800);
      const text = await page.locator('body').innerText().catch(() => '');
      // Trim sidebar/header (top + bottom common content). Take inner main region.
      const main = text
        .replace(/BRSR AI[\s\S]*?Imagine Powertree Group/i, '') // strip sidebar/header
        .replace(/Cmd K[\s\S]*?FY24-25/i, '')
        .trim();
      const cuids = [...new Set((main.match(/\bcm[a-z0-9]{20,}\b/g) || []))];
      const hasUndefined = /\bundefined\b/.test(main);
      const hasNull = /(\bnull\b|>null<)/.test(main);
      const hasNaN = /\bNaN\b/.test(main);
      const hasInvalid = /Invalid (Date|time value)/i.test(main);
      const hasISODate = ISO_DATE.test(main);
      const hasUntitled = /\bUntitled\b/i.test(main);
      const hasUnknown = /\bUnknown\b/i.test(main);
      const hasInputCSS = main.includes("Cannot read") || /Property '[^']+' does not exist/.test(main);
      const hasUntyped = (main.match(/—/g) || []).length;
      await page.screenshot({ path: path.join(SHOTS, `${p.name}.png`), fullPage: false });
      results.push({
        name: p.name,
        url: p.url,
        cuids,
        hasUndefined, hasNull, hasNaN, hasInvalid, hasISODate, hasUntitled, hasUnknown, hasInputCSS,
        emDashCount: hasUntyped,
        snippet: main.replace(/\s+/g, ' ').slice(0, 380),
      });
      const flags = [
        cuids.length ? `RAW_CUID:${cuids.length}` : null,
        hasUndefined ? 'undefined' : null,
        hasNull ? 'null' : null,
        hasNaN ? 'NaN' : null,
        hasInvalid ? 'InvalidDate' : null,
        hasISODate ? 'ISODate' : null,
        hasUntitled ? 'Untitled' : null,
        hasUnknown ? 'Unknown' : null,
      ].filter(Boolean).join(',');
      console.log(`[${p.name}] ${flags || 'ok'}`);
    } catch (e) {
      results.push({ name: p.name, url: p.url, error: e.message.slice(0, 120) });
      console.log(`[${p.name}] ERR ${e.message.slice(0, 80)}`);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'deep-report.json'), JSON.stringify(results, null, 2));
  await browser.close();
})();
