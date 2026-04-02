const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * OBLITERATUS ML Interface Monitor
 * 
 * Specifically monitors the Gradio UI health for the ML engine.
 */

test.describe('OBLITERATUS Stability', () => {
  
  test('Verify Gradio UI Responsiveness', async ({ page }) => {
    console.log('🚀 Initiating OBLITERATUS Sector Scan...');
    
    const OBLIT_URL = 'http://127.0.0.1:7860';
    
    try {
      console.log(`🌐 Navigating to ML Engine: ${OBLIT_URL}`);
      await page.goto(OBLIT_URL, { waitUntil: 'networkidle', timeout: 10000 });
      console.log('✅ ML Engine UI reached.');

      // Check for common Gradio elements
      console.log('🔍 Locating Gradio interface blocks...');
      const gradioApp = page.locator('gradio-app');
      await expect(gradioApp).toBeVisible({ timeout: 15000 });
      console.log('✅ Gradio application container detected.');

      // Check if the title or any content is rendered
      const content = await page.locator('body').innerText();
      if (content.length < 100) {
        throw new Error('ML UI detected but seems empty or failed to load components.');
      }
      console.log(`📊 Sector Density: ${content.length} characters detected.`);

    } catch (error) {
      console.error('❌ OBLITERATUS Monitor Failed:', error.message);
      
      const statusPath = path.join(__dirname, 'monitor-status.json');
      fs.writeFileSync(statusPath, JSON.stringify({
        status: 'ML_BREACH',
        lastRun: new Date().toISOString(),
        error: error.message,
        sector: 'OBLITERATUS'
      }, null, 2));
      
      const screenshotPath = path.join(__dirname, 'obliteratus-failure.png');
      await page.screenshot({ path: screenshotPath });
      throw error;
    }
  });
});
