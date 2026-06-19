const { chromium } = require('playwright');
const path = require('path');
const SHOTS = path.join(__dirname, 'shots3');
const BASE = 'https://srv1763596.hstgr.cloud';

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
  await page.waitForTimeout(3500);

  await page.goto(`${BASE}/frameworks/BRSR`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);
  // Click "Principle 6"
  await page.locator('text=Principle 6').first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS, '10_brsr_principle_6_open.png'), fullPage: true });
  const bodyText = await page.locator('body').innerText();
  const hasValue = /27[,.]?232|27232/.test(bodyText) || /P6-Q6/i.test(bodyText);
  console.log(`Principle 6 detail page: P6-Q6 / value=27232 visible: ${hasValue}`);
  if (hasValue) {
    // Find a snippet with the value
    const idx = bodyText.search(/27[,.]?232|27232|P6-Q6/i);
    console.log(`Excerpt: ${bodyText.slice(Math.max(0, idx - 80), idx + 120).replace(/\s+/g, ' ')}`);
  }

  await browser.close();
})();
