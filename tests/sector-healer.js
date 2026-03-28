const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/**
 * Qui-Gon Sector Healer
 * 
 * Automatically discovers new LinkedIn selectors when the monitor fails
 * and patches the Extension/content.js file.
 */

async function heal() {
  console.log('🔮 Qui-Gon: Initiating Sector Healing Protocol...');
  
  const CONTENT_JS_PATH = path.join(__dirname, '../Extension/content.js');
  const STATUS_FILE = path.join(__dirname, 'monitor-status.json');
  
  const LI_AT = process.env.LINKEDIN_LI_AT;
  const JSESSIONID = process.env.LINKEDIN_JSESSIONID;

  if (!LI_AT || !JSESSIONID) {
    console.error('❌ Authentication missing. Cannot heal.');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([
    { name: 'li_at', value: LI_AT, domain: '.linkedin.com', path: '/' },
    { name: 'JSESSIONID', value: `"${JSESSIONID}"`, domain: '.www.linkedin.com', path: '/' }
  ]);

  const page = await context.newPage();
  
  try {
    console.log('🌐 Navigating to LinkedIn for discovery...');
    await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000); // Wait for dynamic content

    // --- Discovery Logic ---
    
    // 1. Find Conversation List
    console.log('🔍 Discovering Conversation List selector...');
    const listElement = await page.locator('ul, [role="list"]').filter({ has: page.locator('img[src*="profile"]') }).first();
    const listClasses = await listElement.evaluate(el => el.className);
    const newListSelector = listClasses.split(' ').map(c => `.${c}`).join('');
    console.log(`✨ Found potential list selector: ${newListSelector}`);

    // 2. Find Conversation Header
    console.log('🔍 Discovering Conversation Header selector...');
    // Click first item to ensure header is open
    await page.locator('li, [role="listitem"]').filter({ has: page.locator('img[src*="profile"]') }).first().click();
    await page.waitForTimeout(2000);

    const headerElement = await page.locator('header').filter({ hasText: /.+/ }).first();
    const headerClasses = await headerElement.evaluate(el => el.className);
    const newHeaderSelector = headerClasses.split(' ').map(c => `.${c}`).join('');
    console.log(`✨ Found potential header selector: ${newHeaderSelector}`);

    // --- Patching Logic ---
    
    let contentJs = fs.readFileSync(CONTENT_JS_PATH, 'utf8');
    let patched = false;

    // We look for the patterns in DOMScanner.findConversationList and findConversationHeader
    if (newListSelector && newListSelector.length > 3) {
      const oldListPattern = /'\.msg-conversations-container__conversations-list'/;
      if (contentJs.match(oldListPattern)) {
        contentJs = contentJs.replace(oldListPattern, `'${newListSelector}'`);
        patched = true;
        console.log('🛠️ Patched Conversation List selector.');
      }
    }

    if (newHeaderSelector && newHeaderSelector.length > 3) {
      const oldHeaderPattern = /'\.msg-thread__content-header'/;
      if (contentJs.match(oldHeaderPattern)) {
        contentJs = contentJs.replace(oldHeaderPattern, `'${newHeaderSelector}'`);
        patched = true;
        console.log('🛠️ Patched Conversation Header selector.');
      }
    }

    if (patched) {
      fs.writeFileSync(CONTENT_JS_PATH, contentJs);
      console.log('✅ Sector Repair Complete. content.js updated.');
      
      // Update status to HEALED
      fs.writeFileSync(STATUS_FILE, JSON.stringify({
        status: 'HEALED',
        lastRun: new Date().toISOString(),
        details: 'Qui-Gon auto-patched selectors in content.js'
      }, null, 2));
    } else {
      console.log('⚠️ No patches applied. Selectors might already match or pattern not found.');
    }

  } catch (error) {
    console.error(`❌ Healing Protocol Failed: ${error.message}`);
  } finally {
    await browser.close();
  }
}

heal();
