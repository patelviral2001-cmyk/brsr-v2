const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'https://srv1763596.hstgr.cloud';
const SHOTS = path.join(__dirname, 'shots4');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('input[type="email"]').first().fill('demo@imaginepowertree.com');
  await page.locator('input[type="password"]').first().fill('Demo@1234');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(4500);

  await page.screenshot({ path: path.join(SHOTS, '01_dashboard.png'), fullPage: true });

  const text = await page.locator('body').innerText();
  console.log('--- Dashboard KPI excerpt ---');
  // Look for the key KPIs
  const checks = [
    { label: 'Total Emissions card', re: /Total Emissions[\s\S]{0,200}/ },
    { label: 'Energy Intensity card', re: /Energy Intensity[\s\S]{0,200}/ },
    { label: 'ESG Score', re: /ESG Score[\s\S]{0,200}/ },
    { label: 'Data Completeness', re: /Data Completeness[\s\S]{0,200}/ },
  ];
  for (const c of checks) {
    const m = text.match(c.re);
    console.log(`\n[${c.label}] ${m ? m[0].replace(/\s+/g, ' ').slice(0, 200) : 'NOT FOUND'}`);
  }

  // Quick check: does any number > 0 appear near "Emissions"?
  const hasNonzero = /19\.?\s*5|19\.498|tCO/i.test(text);
  console.log(`\nReal-data signal present (19.5 / tCO2e): ${hasNonzero}`);

  // Scope 2 page too
  await page.goto(`${BASE}/carbon/scope2`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SHOTS, '02_scope2.png'), fullPage: true });

  await browser.close();
})();
