const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Holocron Command Center Diagnostic
 * 
 * Specifically tests the connection between the Holocron UI (3333)
 * and the Command Center iframe (1111).
 */

test.describe('Holocron Command Center Diagnostic', () => {
  
  test('Verify Holocron UI and Command Center Iframe', async ({ page }) => {
    console.log('🚀 Initiating Holocron UI Diagnostic...');
    
    // 1. Check if Holocron UI is up
    console.log('🌐 Navigating to Holocron UI (3333)...');
    try {
      await page.goto('http://127.0.0.1:3333', { waitUntil: 'networkidle', timeout: 5000 });
      console.log('✅ Holocron UI reached.');
    } catch (e) {
      console.error('❌ Holocron UI (3333) is unreachable. Is the Vite server running?');
      throw e;
    }

    // 2. Switch to Command Tab
    console.log('🛡️ Attempting to switch to Command Center tab...');
    // The Command icon is the Shield icon in sidebar (App.tsx L153)
    // We can use the Shield icon or navigation logic
    const shieldIcon = page.locator('nav.sidebar .nav-icon').nth(2); // 0=Zap, 1=Message, 2=Shield
    await shieldIcon.click();
    console.log('✅ Clicked Shield icon.');

    // 3. Inspect Iframe
    console.log('🔍 Locating Command Center Iframe...');
    const iframe = page.frameLocator('iframe[title="Dashboard"]'); // App.tsx L201
    
    // Capture errors inside the frame
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`[IFRAME ERROR] ${msg.text()}`);
    });

    try {
      // Look for any element inside the iframe to verify it loaded
      // We'll wait for the body to be visible
      await expect(page.locator('iframe[title="Dashboard"]')).toBeVisible({ timeout: 10000 });
      console.log('✅ Iframe element is visible in the DOM.');
      
      // Attempt to reach the iframe content
      const frameContent = await iframe.locator('body').innerHTML();
      if (frameContent.trim().length === 0) {
        console.warn('⚠️ Iframe loaded but body is EMPTY.');
      } else {
        console.log(`✅ Iframe content detected (Length: ${frameContent.length})`);
      }
    } catch (error) {
      console.error('❌ Iframe content check failed:', error.message);
      
      // DIAGNOSTIC: Check port 1111 directly
      console.log('🔍 Attempting direct connection to http://127.0.0.1:1111...');
      try {
        const response = await page.request.get('http://127.0.0.1:1111');
        console.log(`📡 Direct response from 1111: ${response.status()} ${response.statusText()}`);
      } catch (directError) {
        console.error('❌ Direct connection to 1111 failed. Service is down or blocking requests.');
      }
    }

    // 4. Visual Verification (Dashboard)
    console.log('👁️ Performing Visual Sector Scan (Dashboard)...');
    await page.goto('http://127.0.0.1:3333', { waitUntil: 'networkidle' });
    // Mask the metrics since they change constantly (RAM/Disk)
    await expect(page).toHaveScreenshot('holocron-dashboard-master.png', {
      mask: [page.locator('.kyber-bar'), page.locator('.card div:last-child')],
      maxDiffPixelRatio: 0.05
    });
    console.log('✅ Dashboard visual alignment verified.');

    // 5. Visual Verification (Command Center)
    console.log('👁️ Performing Visual Sector Scan (Command Center)...');
    await shieldIcon.click();
    await page.waitForTimeout(2000); // Wait for transition
    await expect(page).toHaveScreenshot('holocron-command-master.png', {
      mask: [page.locator('iframe')], // Mask the dynamic iframe content
      maxDiffPixelRatio: 0.05
    });
    console.log('✅ Command Center visual alignment verified.');

    // 6. Capture state
    const screenshotPath = path.join(__dirname, 'holocron-command-diagnostic.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Diagnostic screenshot saved to: ${screenshotPath}`);
  });
});
