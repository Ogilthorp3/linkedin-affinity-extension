/**
 * LinkedIn Cookie Catcher
 * 
 * Copy and paste this into your browser console while on linkedin.com
 * to get the exact export commands for your terminal.
 */

(function() {
  const cookies = document.cookie.split('; ').reduce((acc, c) => {
    const [k, v] = c.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const li_at = cookies['li_at'];
  const jsessionid = cookies['JSESSIONID'] ? cookies['JSESSIONID'].replace(/"/g, '') : '';

  console.log("%c🌌 LinkedIn Navigator - Cookie Catcher", "color: #00e5ff; font-weight: bold; font-size: 16px;");
  console.log("%cCopy and paste these commands into your terminal:", "color: #fff; font-style: italic;");
  console.log(`\nexport LINKEDIN_LI_AT="${li_at}"\nexport LINKEDIN_JSESSIONID="${jsessionid}"\n`);
  
  // Also provide the Affinity command template
  console.log("%cDon't forget your Affinity API key:", "color: #a8a9ad;");
  console.log("export AFFINITY_API_KEY=\"your_key_here\"\n");
})();
