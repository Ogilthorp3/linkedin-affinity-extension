/**
 * Dashboard Performance Test
 *
 * Measures dashboard loading performance in a real browser environment
 * using Puppeteer. Simulates network latency to test caching behavior
 * under realistic conditions.
 *
 * @jest-environment node
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

describe('Dashboard Performance', () => {
  let browser;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }, 30000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  async function createPage(fetchLatencyMs = 50) {
    const page = await browser.newPage();

    const backgroundJsPath = path.join(__dirname, '../Extension/background.js');
    const backgroundJs = fs.readFileSync(backgroundJsPath, 'utf8');

    // Use a single script block with var declarations so everything shares scope
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Dashboard Performance Test</title></head>
      <body>
        <script>
          // Mock browser APIs (var to ensure global scope)
          var browser = {
            storage: {
              sync: {
                get: function(keys) {
                  return new Promise(function(resolve) {
                    var result = {};
                    var keysArr = Array.isArray(keys) ? keys : [keys];
                    if (keysArr.includes('affinityApiKey')) result.affinityApiKey = 'test-key';
                    if (keysArr.includes('notificationsEnabled')) result.notificationsEnabled = true;
                    resolve(result);
                  });
                },
                set: function() { return Promise.resolve(); }
              },
              local: {
                get: function() {
                  return Promise.resolve({
                    syncCount: 5,
                    weeklyContactsCount: 3,
                    weeklyNotesCount: 7,
                    weeklyStatsWeek: null
                  });
                },
                set: function() { return Promise.resolve(); }
              }
            },
            runtime: {
              sendMessage: function() {},
              onMessage: { addListener: function() {} }
            },
            commands: { onCommand: { addListener: function() {} } },
            tabs: {
              query: function() { return Promise.resolve([]); },
              sendMessage: function() {}
            },
            alarms: {
              create: function() {},
              onAlarm: { addListener: function() {} }
            },
            notifications: {
              create: function() {},
              onClicked: { addListener: function() {} }
            },
            action: {
              setBadgeText: function() {},
              setBadgeBackgroundColor: function() {},
              openPopup: function() {}
            }
          };
          var chrome = browser;

          // Track API call count
          window._apiCallCount = 0;
          window._fetchLatency = ${fetchLatencyMs};

          // Mock fetch with configurable latency
          window.fetch = function(url) {
            window._apiCallCount++;
            return new Promise(function(resolve) {
              setTimeout(function() {
                var response = {};
                if (url.indexOf('/list-entries') !== -1) {
                  response = Array.from({ length: 100 }, function(_, i) { return { id: i + 1 }; });
                } else if (url.indexOf('/lists') !== -1) {
                  response = Array.from({ length: 6 }, function(_, i) {
                    return { id: 100 + i, name: 'List ' + (i + 1), type: i % 3 === 0 ? 8 : 0 };
                  });
                } else if (url.indexOf('/notes') !== -1) {
                  response = { notes: Array.from({ length: 15 }, function(_, i) {
                    return {
                      id: i + 1,
                      content: '**Person ' + i + '** follow up on LinkedIn conversation',
                      created_at: new Date(Date.now() - i * 3600000).toISOString()
                    };
                  })};
                } else if (url.indexOf('/whoami') !== -1) {
                  response = { grant: { first_name: 'Test', last_name: 'User' } };
                }
                resolve({
                  ok: true,
                  status: 200,
                  json: function() { return Promise.resolve(response); },
                  text: function() { return Promise.resolve(JSON.stringify(response)); }
                });
              }, window._fetchLatency);
            });
          };

          ${backgroundJs}
        </script>
      </body>
      </html>
    `;

    await page.setContent(testHtml, { waitUntil: 'load' });
    // Wait a moment for module initialization
    await new Promise(r => setTimeout(r, 100));
    return page;
  }

  test('measures cold vs warm dashboard load times', async () => {
    const page = await createPage(50);

    // --- Cold load (no cache) ---
    const coldResult = await page.evaluate(async () => {
      // Clear any startup-warmed cache
      resetCaches();
      window._apiCallCount = 0;
      const start = performance.now();
      const result = await getDashboardData();
      const elapsed = performance.now() - start;
      return {
        time: elapsed,
        apiCalls: window._apiCallCount,
        isStale: result.isStale,
        listCount: result.data?.lists?.length || 0,
        noteCount: result.data?.recentActivity?.length || 0
      };
    });

    expect(coldResult.isStale).toBe(false);
    expect(coldResult.listCount).toBe(6);
    expect(coldResult.apiCalls).toBeGreaterThan(0);

    // --- Warm load (cached) ---
    const warmResult = await page.evaluate(async () => {
      window._apiCallCount = 0;
      const start = performance.now();
      const result = await getDashboardData();
      const elapsed = performance.now() - start;
      return {
        time: elapsed,
        apiCalls: window._apiCallCount,
        isStale: result.isStale
      };
    });

    expect(warmResult.isStale).toBe(false);
    expect(warmResult.apiCalls).toBe(0);
    expect(warmResult.time).toBeLessThan(coldResult.time);

    // --- Stale load (after TTL) ---
    const staleResult = await page.evaluate(async () => {
      dashboardDataCacheTime = Date.now() - (3 * 60 * 1000);
      window._apiCallCount = 0;
      const start = performance.now();
      const result = await getDashboardData();
      const elapsed = performance.now() - start;
      await new Promise(r => setTimeout(r, 500));
      return {
        time: elapsed,
        apiCalls: window._apiCallCount,
        isStale: result.isStale
      };
    });

    expect(staleResult.isStale).toBe(true);
    expect(staleResult.time).toBeLessThan(5);

    const report = [
      '',
      '┌─────────────────────────────────────────────────────────────┐',
      '│          Puppeteer Dashboard Performance Test               │',
      '│          (simulated 50ms network latency per request)       │',
      '├─────────────────────────────────────────────────────────────┤',
      `│ Cold load:  ${coldResult.time.toFixed(0).padStart(6)}ms | ${String(coldResult.apiCalls).padStart(2)} API calls | ${coldResult.listCount} lists, ${coldResult.noteCount} activities │`,
      `│ Warm load:  ${warmResult.time.toFixed(2).padStart(6)}ms | ${String(warmResult.apiCalls).padStart(2)} API calls | from cache                  │`,
      `│ Stale load: ${staleResult.time.toFixed(2).padStart(6)}ms | ${String(staleResult.apiCalls).padStart(2)} API calls | instant return + bg refresh │`,
      '├─────────────────────────────────────────────────────────────┤',
      `│ Speedup (warm vs cold): ${(coldResult.time / Math.max(warmResult.time, 0.01)).toFixed(0).padStart(6)}x                                    │`,
      `│ Speedup (stale vs cold): ${(coldResult.time / Math.max(staleResult.time, 0.01)).toFixed(0).padStart(5)}x                                    │`,
      '└─────────────────────────────────────────────────────────────┘',
    ];
    console.log(report.join('\n'));

    await page.close();
  }, 30000);

  test('measures impact of list counts cache', async () => {
    const page = await createPage(100);

    // --- Full fresh fetch (no caches) ---
    const fullFreshResult = await page.evaluate(async () => {
      resetCaches();
      window._apiCallCount = 0;
      const start = performance.now();
      await getDashboardDataFresh();
      const elapsed = performance.now() - start;
      return {
        time: elapsed,
        apiCalls: window._apiCallCount
      };
    });

    // --- Fresh fetch with list counts cached ---
    const cachedCountsResult = await page.evaluate(async () => {
      // List counts are still cached from previous call
      // But reset the full dashboard cache so it re-fetches notes/lists metadata
      dashboardDataCache = null;
      dashboardDataCacheTime = 0;
      window._apiCallCount = 0;
      const start = performance.now();
      await getDashboardDataFresh();
      const elapsed = performance.now() - start;
      return {
        time: elapsed,
        apiCalls: window._apiCallCount
      };
    });

    expect(cachedCountsResult.apiCalls).toBeLessThan(fullFreshResult.apiCalls);
    expect(cachedCountsResult.time).toBeLessThan(fullFreshResult.time);

    const saved = fullFreshResult.apiCalls - cachedCountsResult.apiCalls;
    const report = [
      '',
      '┌────────────────────────────────────────────────────────────────┐',
      '│          List Counts Cache Impact (100ms simulated latency)   │',
      '├────────────────────────────────────────────────────────────────┤',
      `│ Without cache: ${fullFreshResult.time.toFixed(0).padStart(5)}ms | ${String(fullFreshResult.apiCalls).padStart(2)} API calls                              │`,
      `│ With cache:    ${cachedCountsResult.time.toFixed(0).padStart(5)}ms | ${String(cachedCountsResult.apiCalls).padStart(2)} API calls                              │`,
      `│ Time saved:    ${(fullFreshResult.time - cachedCountsResult.time).toFixed(0).padStart(5)}ms | ${String(saved).padStart(2)} fewer API calls                       │`,
      '└────────────────────────────────────────────────────────────────┘',
    ];
    console.log(report.join('\n'));

    await page.close();
  }, 30000);
});
