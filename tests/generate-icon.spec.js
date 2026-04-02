const { test } = require('@playwright/test');
const path = require('path');

test('Generate Sith Holocron Icon', async ({ page }) => {
  const htmlPath = `file://${path.join(__dirname, 'new-icon-design.html')}`;
  await page.setViewportSize({ width: 512, height: 512 });
  await page.goto(htmlPath);
  
  // Ensure transparent background if needed, but the CSS handles the look
  await page.screenshot({ 
    path: path.join(__dirname, 'sith-holocron-icon.png'),
    omitBackground: true 
  });
  
  console.log('✅ New Sith Holocron Icon generated successfully.');
});
