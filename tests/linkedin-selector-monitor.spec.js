const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * LinkedIn Selector & Affinity Heartbeat Monitor
 * 
 * Monitors LinkedIn DOM stability and Affinity API connectivity.
 * Follows "navigator-driver" pattern with automated status scrubbing.
 */

function updateStatus(status, message, details = {}) {
  const statusPath = path.join(__dirname, 'monitor-status.json');
  
  // Security Scrubbing (Windu's Requirement)
  const cleanDetails = JSON.parse(JSON.stringify(details));
  const sensitiveKeys = ['key', 'token', 'secret', 'password', 'li_at', 'jsessionid', 'auth'];
  
  const scrub = (obj) => {
    for (const key in obj) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        scrub(obj[key]);
      }
    }
  };
  scrub(cleanDetails);

  fs.writeFileSync(statusPath, JSON.stringify({
    status,
    lastRun: new Date().toISOString(),
    message,
    ...cleanDetails
  }, null, 2));
}

test.describe('LinkedIn & Affinity Ecosystem Stability', () => {
  
  const LI_AT = process.env.LINKEDIN_LI_AT;
  const JSESSIONID = process.env.LINKEDIN_JSESSIONID;
  const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;

  test('Affinity API Heartbeat (Jocasta Requirement)', async () => {
    console.log('🚀 Starting monitor: Affinity API Heartbeat');
    
    if (!AFFINITY_API_KEY) {
      console.warn('⚠️ Missing AFFINITY_API_KEY. Skipping heartbeat.');
      return;
    }

    try {
      const auth = Buffer.from(':' + AFFINITY_API_KEY).toString('base64');
      const response = await fetch('https://api.affinity.co/whoami', {
        headers: { 'Authorization': `Basic ${auth}` }
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Affinity Connected: User ${data.user_id}`);
      } else {
        throw new Error(`Affinity API returned ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Affinity Heartbeat Failed:', error.message);
      updateStatus('FAILED', 'Affinity API Heartbeat failure', { error: error.message });
      throw error;
    }
  });

  test.describe('LinkedIn Selector Stability', () => {
    test.beforeEach(async ({ context }) => {
      if (!LI_AT || !JSESSIONID) {
        console.error('❌ Missing LinkedIn credentials.');
        updateStatus('SKIPPED', 'Missing LinkedIn environment credentials');
        test.skip();
        return;
      }

      await context.addCookies([
        { name: 'li_at', value: LI_AT, domain: '.linkedin.com', path: '/' },
        { name: 'JSESSIONID', value: `"${JSESSIONID}"`, domain: '.www.linkedin.com', path: '/' }
      ]);
    });

    test('Monitor "Send to Affinity" Button Target', async ({ page }) => {
      console.log('🚀 Starting monitor: LinkedIn UI Selectors');
      
      try {
        console.log('🌐 Navigating to LinkedIn Messaging...');
        await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'domcontentloaded' });
        
        console.log('⏳ Waiting for messaging list...');
        const listSelector = '.msg-conversations-container__conversations-list';
        await page.waitForSelector(listSelector, { timeout: 15000 });

        console.log('🖱️ Clicking first conversation thread...');
        await page.locator('.msg-conversation-listitem').first().click();
        
        console.log('🔍 Locating conversation header...');
        const headerSelector = 'header.msg-entity-lockup__header, .msg-thread__topcard-container';
        const header = page.locator(headerSelector).first();
        await expect(header).toBeVisible({ timeout: 10000 });

        console.log('🔍 Testing profile name extraction...');
        const nameSelector = '.msg-entity-lockup__entity-title, .msg-thread__topcard-full-name';
        const nameElement = page.locator(nameSelector).first();
        if (await nameElement.isVisible()) {
          const name = await nameElement.innerText();
          console.log(`✅ Profile name found: "${name.strip ? name.strip() : name.trim()}"`);
        }

        updateStatus('PASSED', 'LinkedIn & Affinity Ecosystem is stable');
        console.log('✨ Monitor completed successfully.');

      } catch (error) {
        console.error('❌ Monitor failed:', error.message);
        
        const htmlPath = path.join(__dirname, 'debug-linkedin-state.html');
        fs.writeFileSync(htmlPath, await page.content());
        
        const screenshotPath = path.join(__dirname, 'debug-screenshot-manual.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        
        updateStatus('FAILED', 'LinkedIn Selector failure', {
          error: error.message,
          screenshot: screenshotPath,
          html: htmlPath
        });
        
        throw error;
      }
    });
  });
});
