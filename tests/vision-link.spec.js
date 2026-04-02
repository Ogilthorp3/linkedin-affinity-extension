const { test, chromium } = require('@playwright/test');
const path = require('path');

test('Neural Link: Capture Current View', async () => {
  // Connect to the ALREADY RUNNING browser on port 1138
  const browser = await chromium.connectOverCDP('http://127.0.0.1:1138');
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages[0];

  console.log(`👁️ Neural Link established with page: ${await page.title()}`);
  
  const screenshotPath = path.join(__dirname, 'holocron-live-analysis.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  
  console.log(`📸 View captured to: ${screenshotPath}`);
  await browser.close();
});
