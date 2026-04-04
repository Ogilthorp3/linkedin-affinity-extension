// Replaced playwright with agent-browser CLI for discovery
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
  
  const CHROME_CONTENT_JS = path.join(__dirname, '../Extension/content.js');
  const SAFARI_CONTENT_JS = path.join(__dirname, '../LinkedIn Affinity/LinkedIn Affinity Extension/Resources/content.js');
  const STATUS_FILE = path.join(__dirname, 'monitor-status.json');
  
  // ... existing auth and browser setup ...

  try {
    // ... existing discovery logic to get newListSelector and newHeaderSelector ...

    // --- Patching Logic ---
    const targets = [CHROME_CONTENT_JS, SAFARI_CONTENT_JS];
    let anyPatched = false;

    for (const targetPath of targets) {
      if (!fs.existsSync(targetPath)) continue;
      
      let contentJs = fs.readFileSync(targetPath, 'utf8');
      let targetPatched = false;

      if (newListSelector && newListSelector.length > 3) {
        const oldListPattern = /'\.msg-conversations-container__conversations-list'/;
        if (contentJs.match(oldListPattern)) {
          contentJs = contentJs.replace(oldListPattern, `'${newListSelector}'`);
          targetPatched = true;
        }
      }

      if (newHeaderSelector && newHeaderSelector.length > 3) {
        const oldHeaderPattern = /'\.msg-thread__content-header'/;
        if (contentJs.match(oldHeaderPattern)) {
          contentJs = contentJs.replace(oldHeaderPattern, `'${newHeaderSelector}'`);
          targetPatched = true;
        }
      }

      if (targetPatched) {
        fs.writeFileSync(targetPath, contentJs);
        console.log(`🛠️ Patched: ${path.basename(path.dirname(targetPath))}/${path.basename(targetPath)}`);
        anyPatched = true;
      }
    }

    if (anyPatched) {
      console.log('✅ Sector Repair Complete. Both extensions synced.');
      // ... update status ...

  } catch (error) {
    console.error(`❌ Healing Protocol Failed: ${error.message}`);
  } finally {
    // browser closed via agent-browser CLI
  }
}

heal();
