// Visit a real file detail page and screenshot it (same view the customer screenshot showed).
const { chromium } = require('playwright');
const path = require('path');
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
  await page.waitForTimeout(4500);

  // Navigate to Files index
  await page.goto(`${BASE}/files`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);

  // Click the first REVIEW_NEEDED card with OTHER docType (mirrors the screenshot)
  const target = page.locator('a').filter({ has: page.locator('text=REVIEW_NEEDED') }).first();
  if (await target.count()) {
    await target.click();
  } else {
    // Fallback: click any file card
    await page.locator('a[href^="/files/c"]').first().click();
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3500);
  const shot = path.join(__dirname, 'shots-walk', 'file_detail_FIXED.png');
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`url=${page.url()}`);
  console.log(`shot=${shot}`);
  await browser.close();
})();
