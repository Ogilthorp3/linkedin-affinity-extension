/**
 * Mock factory for browser extension APIs (Chrome/Safari)
 * Creates mock implementations of chrome/browser APIs for testing
 */

/**
 * Create a mock storage area (sync or local)
 */
function createMockStorage() {
  const store = {};

  return {
    get: jest.fn((keys) => {
      return Promise.resolve(
        Array.isArray(keys)
          ? keys.reduce((acc, key) => {
              if (store[key] !== undefined) acc[key] = store[key];
              return acc;
            }, {})
          : typeof keys === 'string'
            ? { [keys]: store[keys] }
            : { ...store }
      );
    }),
    set: jest.fn((items) => {
      Object.assign(store, items);
      return Promise.resolve();
    }),
    remove: jest.fn((keys) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach(key => delete store[key]);
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
      return Promise.resolve();
    }),
    // Helper for tests to set initial state
    _setData: (data) => Object.assign(store, data),
    _getData: () => ({ ...store }),
    _clear: () => Object.keys(store).forEach(key => delete store[key])
  };
}

/**
 * Create mock runtime API
 */
function createMockRuntime() {
  const messageListeners = [];

  return {
    sendMessage: jest.fn((message) => {
      return Promise.resolve({ success: true });
    }),
    onMessage: {
      addListener: jest.fn((callback) => {
        messageListeners.push(callback);
      }),
      removeListener: jest.fn((callback) => {
        const index = messageListeners.indexOf(callback);
        if (index > -1) messageListeners.splice(index, 1);
      }),
      // Helper to simulate receiving a message
      _trigger: (message, sender = {}) => {
        const sendResponse = jest.fn();
        messageListeners.forEach(listener => {
          listener(message, sender, sendResponse);
        });
        return sendResponse;
      }
    },
    getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
    id: 'mock-extension-id'
  };
}

/**
 * Create mock tabs API
 */
function createMockTabs() {
  return {
    query: jest.fn(() => Promise.resolve([{ id: 1, url: 'https://linkedin.com/messaging' }])),
    sendMessage: jest.fn(() => Promise.resolve({ success: true })),
    create: jest.fn(() => Promise.resolve({ id: 2 })),
    update: jest.fn(() => Promise.resolve())
  };
}

/**
 * Create mock commands API
 */
function createMockCommands() {
  const commandListeners = [];

  return {
    onCommand: {
      addListener: jest.fn((callback) => {
        commandListeners.push(callback);
      }),
      removeListener: jest.fn((callback) => {
        const index = commandListeners.indexOf(callback);
        if (index > -1) commandListeners.splice(index, 1);
      }),
      // Helper to simulate a command
      _trigger: (command) => {
        commandListeners.forEach(listener => listener(command));
      }
    }
  };
}

/**
 * Create complete browser API mock
 */
function createBrowserAPIMock() {
  return {
    storage: {
      sync: createMockStorage(),
      local: createMockStorage()
    },
    runtime: createMockRuntime(),
    tabs: createMockTabs(),
    commands: createMockCommands()
  };
}

/**
 * Create mock fetch function
 */
function createMockFetch() {
  return jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('')
    })
  );
}

module.exports = {
  createMockStorage,
  createMockRuntime,
  createMockTabs,
  createMockCommands,
  createBrowserAPIMock,
  createMockFetch
};
