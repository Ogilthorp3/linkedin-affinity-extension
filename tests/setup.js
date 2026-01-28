/**
 * Jest setup file
 * Configures global mocks for browser extension APIs
 */

const { createBrowserAPIMock, createMockFetch } = require('./mocks/browserAPI');

// Create browser API mock
const browserAPI = createBrowserAPIMock();

// Set up global browser/chrome API
global.browser = browserAPI;
global.chrome = browserAPI;

// Set up global fetch mock
global.fetch = createMockFetch();

// Mock btoa for Node.js environment (used for Basic Auth)
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');

// Mock console methods to reduce noise in tests (optional)
// Uncomment if you want to suppress console output during tests
// global.console = {
//   ...console,
//   log: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn()
// };

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();

  // Reset storage data
  global.browser.storage.sync._clear();
  global.browser.storage.local._clear();

  // Reset fetch mock
  global.fetch.mockClear();
  global.fetch.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('')
    })
  );
});

// Helper to set up API key for tests that need it
global.setupApiKey = (apiKey = 'test-api-key') => {
  global.browser.storage.sync._setData({ affinityApiKey: apiKey });
};

// Helper to mock fetch responses
global.mockFetchResponse = (response, options = {}) => {
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: options.ok !== false,
      status: options.status || 200,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response))
    })
  );
};

// Helper to mock fetch error
global.mockFetchError = (errorMessage) => {
  global.fetch.mockImplementationOnce(() =>
    Promise.reject(new Error(errorMessage))
  );
};
