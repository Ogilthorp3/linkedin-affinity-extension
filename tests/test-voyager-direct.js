/**
 * Test LinkedIn Voyager API - Direct fetch
 */

// Set these environment variables before running:
// LINKEDIN_LI_AT - Your li_at cookie value
// LINKEDIN_JSESSIONID - Your JSESSIONID cookie value
const li_at = process.env.LINKEDIN_LI_AT;
const JSESSIONID = process.env.LINKEDIN_JSESSIONID;

if (!li_at || !JSESSIONID) {
  console.error('Please set LINKEDIN_LI_AT and LINKEDIN_JSESSIONID environment variables');
  process.exit(1);
}

const username = process.argv[2] || 'williamhgates';

// Various endpoint formats to try
const endpoints = [
  // Dash API format
  `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${username}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`,
  // Legacy format
  `/voyager/api/identity/profiles/${username}/profileContactInfo`,
  // Profile components
  `/voyager/api/identity/profiles/${username}/positions`,
];

async function testEndpoint(path) {
  const url = `https://www.linkedin.com${path}`;
  console.log('\\nTrying:', path.substring(0, 80) + '...');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': `li_at=${li_at}; JSESSIONID="${JSESSIONID}"`,
        'csrf-token': JSESSIONID,
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
        'x-li-track': '{"clientVersion":"1.13.8660","mpVersion":"1.13.8660","osName":"web","timezoneOffset":-5,"timezone":"America/Toronto"}',
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'referer': 'https://www.linkedin.com/in/' + username + '/',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors'
      }
    });

    console.log('Status:', response.status);

    if (response.status === 200) {
      const data = await response.json();

      // Look for position data
      if (data.included) {
        const companies = [];
        const seen = new Set();

        for (const item of data.included) {
          const type = item['$type'] || '';
          if (type.includes('Position') || type.includes('position')) {
            const name = item.companyName || item.company?.name;
            if (name && !seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase());
              companies.push({
                name,
                title: item.title,
                current: !item.dateRange?.end && !item.timePeriod?.endDate
              });
            }
          }
        }

        if (companies.length > 0) {
          console.log('SUCCESS! Found', companies.length, 'companies:');
          companies.forEach(c => console.log('  -', c.name, c.current ? '(current)' : '(past)'));
          return true;
        }
      }

      console.log('Response has', data.included?.length || 0, 'items');
      if (data.included?.length > 0) {
        const types = [...new Set(data.included.map(i => i['$type']))].slice(0, 5);
        console.log('Types found:', types);
      }
    } else {
      const text = await response.text();
      console.log('Error:', text.substring(0, 200));
    }
  } catch (error) {
    console.log('Error:', error.message);
  }
  return false;
}

async function main() {
  console.log('Testing Voyager API for profile:', username);
  console.log('='.repeat(50));

  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint);
    if (success) break;
  }
}

main();
