/**
 * Test LinkedIn Voyager API using Puppeteer
 * This runs in the browser context with proper authentication
 */

const puppeteer = require('puppeteer');

// Set these environment variables before running:
// LINKEDIN_LI_AT - Your li_at cookie value
// LINKEDIN_JSESSIONID - Your JSESSIONID cookie value
if (!process.env.LINKEDIN_LI_AT || !process.env.LINKEDIN_JSESSIONID) {
  console.error('Please set LINKEDIN_LI_AT and LINKEDIN_JSESSIONID environment variables');
  process.exit(1);
}

const cookies = [
  {
    name: 'li_at',
    value: process.env.LINKEDIN_LI_AT,
    domain: '.linkedin.com'
  },
  {
    name: 'JSESSIONID',
    value: `"${process.env.LINKEDIN_JSESSIONID}"`,
    domain: '.www.linkedin.com'
  },
  {
    name: 'lang',
    value: 'v=2&lang=en-us',
    domain: '.linkedin.com'
  }
];

const username = process.argv[2] || 'williamhgates'; // Bill Gates as test profile

async function testVoyagerAPI() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set cookies
    await page.setCookie(...cookies);

    // Go to LinkedIn first to establish context
    console.log('Navigating to LinkedIn...');
    await page.goto('https://www.linkedin.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Now fetch the profile via Voyager API
    console.log('Fetching profile for:', username);

    const result = await page.evaluate(async (profileUsername) => {
      // Get CSRF token from cookies
      const getCsrfToken = () => {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'JSESSIONID') {
            return value.replace(/"/g, '');
          }
        }
        return null;
      };

      const csrfToken = getCsrfToken();
      console.log('CSRF Token:', csrfToken);

      // Try the profile positions endpoint
      const url = `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${profileUsername}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`;

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'csrf-token': csrfToken,
            'x-restli-protocol-version': '2.0.0',
            'accept': 'application/vnd.linkedin.normalized+json+2.1'
          },
          credentials: 'include'
        });

        const data = await response.json();
        return { status: response.status, data };
      } catch (error) {
        return { error: error.message };
      }
    }, username);

    console.log('\nAPI Response Status:', result.status || 'error');

    if (result.error) {
      console.log('Error:', result.error);
      return;
    }

    if (result.data && result.data.included) {
      // Extract companies
      const companies = [];
      const seen = new Set();

      for (const item of result.data.included) {
        const type = item['$type'];
        if (type && type.includes('Position')) {
          const name = item.companyName;
          if (name && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            companies.push({
              name: name,
              title: item.title,
              isCurrent: !item.dateRange?.end
            });
          }
        }
      }

      console.log('\nCompanies found:', companies.length);
      console.log('---');
      companies.forEach(c => {
        const status = c.isCurrent ? '(CURRENT)' : '(past)';
        console.log(` - ${c.name} ${status}`);
        if (c.title) console.log(`   Title: ${c.title}`);
      });
    } else {
      console.log('Response data:', JSON.stringify(result.data).substring(0, 500));
    }

  } finally {
    await browser.close();
  }
}

testVoyagerAPI().catch(console.error);
