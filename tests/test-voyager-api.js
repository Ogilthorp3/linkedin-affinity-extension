/**
 * Test LinkedIn Voyager API
 * Usage: node tests/test-voyager-api.js [linkedin-username]
 */

const https = require('https');

// Set these environment variables before running:
// LINKEDIN_LI_AT - Your li_at cookie value
// LINKEDIN_JSESSIONID - Your JSESSIONID cookie value
const cookies = {
  li_at: process.env.LINKEDIN_LI_AT,
  JSESSIONID: process.env.LINKEDIN_JSESSIONID
};

if (!cookies.li_at || !cookies.JSESSIONID) {
  console.error('Please set LINKEDIN_LI_AT and LINKEDIN_JSESSIONID environment variables');
  process.exit(1);
}

// Get username from command line or use default
const username = process.argv[2] || 'satlouis';

console.log('Testing Voyager API for profile:', username);
console.log('---');

// Try graphql-based endpoint for profile positions
const options = {
  hostname: 'www.linkedin.com',
  path: `/voyager/api/graphql?includeWebMetadata=true&variables=(profileUrn:urn%3Ali%3Afsd_profile%3A${username})&queryId=voyagerIdentityDashProfileComponents.7af7d42fe6ec6cdb2536687883aaf6d0`,
  method: 'GET',
  headers: {
    'Cookie': `li_at=${cookies.li_at}; JSESSIONID="${cookies.JSESSIONID}"`,
    'csrf-token': cookies.JSESSIONID,
    'x-li-lang': 'en_US',
    'accept': 'application/vnd.linkedin.normalized+json+2.1',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);

    if (res.statusCode === 200) {
      try {
        const json = JSON.parse(data);

        // Extract companies from positions
        const companies = [];
        const seen = new Set();

        if (json.included) {
          for (const item of json.included) {
            const type = item['$type'];

            // Look for Position entities
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
        }

        console.log('\nCompanies found:', companies.length);
        console.log('---');
        companies.forEach(c => {
          const status = c.isCurrent ? '(CURRENT)' : '(past)';
          console.log(` - ${c.name} ${status}`);
          if (c.title) console.log(`   Title: ${c.title}`);
        });

        // Also show some debug info
        console.log('\n--- Debug Info ---');
        console.log('Total included entities:', json.included?.length || 0);

        // Count entity types
        const types = {};
        if (json.included) {
          json.included.forEach(item => {
            const t = item['$type'] || 'unknown';
            types[t] = (types[t] || 0) + 1;
          });
        }
        console.log('Entity types found:');
        Object.entries(types).slice(0, 10).forEach(([t, count]) => {
          console.log(`  ${t}: ${count}`);
        });

      } catch (e) {
        console.log('Parse error:', e.message);
        console.log('Response preview:', data.substring(0, 1000));
      }
    } else {
      console.log('Error response:', data.substring(0, 500));
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.end();
