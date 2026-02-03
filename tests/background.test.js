/**
 * Tests for background.js
 */

// Import the module (requires module.exports to be added to background.js)
const {
  formatConversationNote,
  filterNewMessages,
  getApiKey,
  affinityRequest,
  searchPerson,
  createPerson,
  addNote,
  getNotesForPerson,
  checkDuplicateAndGetExistingMessages
} = require('../Extension/background.js');

describe('formatConversationNote', () => {
  test('formats basic conversation correctly', () => {
    const data = {
      sender: {
        name: 'John Doe'
      },
      messages: [
        { sender: 'John Doe', content: 'Hello!', timestamp: '2024-01-15 10:30 AM', isIncoming: true },
        { sender: 'Me', content: 'Hi there!', timestamp: '2024-01-15 10:35 AM', isIncoming: false }
      ],
      conversationUrl: 'https://linkedin.com/messaging/thread/123',
      capturedAt: '2024-01-15T15:30:00.000Z'
    };

    const note = formatConversationNote(data);

    expect(note).toContain('## LinkedIn Conversation');
    expect(note).toContain('**With:** John Doe');
    expect(note).toContain('**Source:** https://linkedin.com/messaging/thread/123');
    expect(note).toContain('**John Doe** (2024-01-15 10:30 AM):');
    expect(note).toContain('Hello!');
    expect(note).toContain('**Me** (2024-01-15 10:35 AM):');
    expect(note).toContain('Hi there!');
  });

  test('handles missing sender headline', () => {
    const data = {
      sender: { name: 'Jane Smith' },
      messages: [],
      conversationUrl: 'https://linkedin.com/messaging/thread/456',
      capturedAt: '2024-01-15T15:30:00.000Z'
    };

    const note = formatConversationNote(data);

    expect(note).toContain('**With:** Jane Smith');
    expect(note).toContain('**Source:**');
  });

  test('handles missing messages', () => {
    const data = {
      sender: { name: 'Test User' },
      messages: null,
      conversationUrl: 'https://linkedin.com/messaging/thread/789',
      capturedAt: '2024-01-15T15:30:00.000Z'
    };

    const note = formatConversationNote(data);

    // Note should still be created with basic info
    expect(note).toContain('**With:** Test User');
    expect(note).not.toContain('---'); // No messages section divider
  });

  test('handles empty messages array', () => {
    const data = {
      sender: { name: 'Test User' },
      messages: [],
      conversationUrl: 'https://linkedin.com/messaging/thread/789',
      capturedAt: '2024-01-15T15:30:00.000Z'
    };

    const note = formatConversationNote(data);

    // Note should still be created with basic info
    expect(note).toContain('**With:** Test User');
    expect(note).not.toContain('---'); // No messages section divider
  });

  test('handles message without timestamp', () => {
    const data = {
      sender: { name: 'Test User' },
      messages: [{ sender: 'Test User', content: 'No timestamp here', isIncoming: true }],
      conversationUrl: 'https://linkedin.com/messaging/thread/789',
      capturedAt: '2024-01-15T15:30:00.000Z'
    };

    const note = formatConversationNote(data);

    expect(note).toContain('**Test User**:');
    expect(note).toContain('No timestamp here');
    expect(note).not.toContain('()'); // No empty parentheses
  });

  test('uses direction fallback when sender name is missing', () => {
    const data = {
      sender: { name: 'Test User' },
      messages: [
        { content: 'Incoming message', isIncoming: true },
        { content: 'Outgoing message', isIncoming: false }
      ],
      conversationUrl: 'https://linkedin.com/messaging/thread/789',
      capturedAt: '2024-01-15T15:30:00.000Z'
    };

    const note = formatConversationNote(data);

    expect(note).toContain('**← Incoming**');
    expect(note).toContain('**→ Outgoing**');
  });

  test('includes quick note when provided', () => {
    const data = {
      sender: { name: 'John Doe' },
      messages: [],
      conversationUrl: 'https://linkedin.com/messaging/thread/123',
      capturedAt: '2024-01-15T15:30:00.000Z',
      quickNote: 'Met at Web Summit 2024, interested in Series A'
    };

    const note = formatConversationNote(data);

    expect(note).toContain('> **Met at Web Summit 2024, interested in Series A**');
    // Quick note should appear before "With:"
    const noteIndex = note.indexOf('Met at Web Summit');
    const withIndex = note.indexOf('**With:**');
    expect(noteIndex).toBeLessThan(withIndex);
  });

  test('does not include note section when quickNote is empty', () => {
    const data = {
      sender: { name: 'Jane Smith' },
      messages: [],
      conversationUrl: 'https://linkedin.com/messaging/thread/456',
      capturedAt: '2024-01-15T15:30:00.000Z',
      quickNote: ''
    };

    const note = formatConversationNote(data);

    expect(note).not.toContain('**Note:**');
  });

  test('does not include note section when quickNote is undefined', () => {
    const data = {
      sender: { name: 'Jane Smith' },
      messages: [],
      conversationUrl: 'https://linkedin.com/messaging/thread/456',
      capturedAt: '2024-01-15T15:30:00.000Z'
    };

    const note = formatConversationNote(data);

    expect(note).not.toContain('**Note:**');
  });
});

describe('filterNewMessages', () => {
  test('returns all messages when no existing messages', () => {
    const messages = [
      { content: 'Hello' },
      { content: 'World' }
    ];
    const existingMessageContents = new Set();

    const result = filterNewMessages(messages, existingMessageContents);

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('Hello');
    expect(result[1].content).toBe('World');
  });

  test('returns all messages when existingMessageContents is null', () => {
    const messages = [
      { content: 'Hello' },
      { content: 'World' }
    ];

    const result = filterNewMessages(messages, null);

    expect(result).toHaveLength(2);
  });

  test('returns all messages when existingMessageContents is undefined', () => {
    const messages = [
      { content: 'Hello' },
      { content: 'World' }
    ];

    const result = filterNewMessages(messages, undefined);

    expect(result).toHaveLength(2);
  });

  test('filters out existing messages', () => {
    const messages = [
      { content: 'Hello' },
      { content: 'New message' },
      { content: 'World' }
    ];
    const existingMessageContents = new Set(['Hello', 'World']);

    const result = filterNewMessages(messages, existingMessageContents);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('New message');
  });

  test('handles messages with whitespace', () => {
    const messages = [
      { content: '  Hello  ' },
      { content: 'World' }
    ];
    const existingMessageContents = new Set(['Hello']);

    const result = filterNewMessages(messages, existingMessageContents);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('World');
  });

  test('filters out messages with empty content when checking against existing', () => {
    const messages = [
      { content: '' },
      { content: '   ' },
      { content: 'Valid message' }
    ];
    // Need at least one existing message for the filter logic to run
    const existingMessageContents = new Set(['Some old message']);

    const result = filterNewMessages(messages, existingMessageContents);

    // Empty and whitespace-only content should be filtered out by the content check
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Valid message');
  });

  test('handles messages with null content when checking against existing', () => {
    const messages = [
      { content: null },
      { content: 'Valid message' }
    ];
    // Need at least one existing message for the filter logic to run
    const existingMessageContents = new Set(['Some old message']);

    const result = filterNewMessages(messages, existingMessageContents);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Valid message');
  });
});

describe('getApiKey', () => {
  test('returns API key from sync storage', async () => {
    global.browser.storage.sync._setData({ affinityApiKey: 'test-api-key-123' });

    const apiKey = await getApiKey();

    expect(apiKey).toBe('test-api-key-123');
  });

  test('falls back to local storage when sync fails', async () => {
    global.browser.storage.sync.get.mockImplementationOnce(() => {
      throw new Error('Sync not available');
    });
    global.browser.storage.local._setData({ affinityApiKey: 'local-api-key' });

    const apiKey = await getApiKey();

    expect(apiKey).toBe('local-api-key');
  });

  test('returns undefined when no API key is set', async () => {
    const apiKey = await getApiKey();

    expect(apiKey).toBeUndefined();
  });
});

describe('affinityRequest', () => {
  test('throws error when API key not configured', async () => {
    await expect(affinityRequest('/test')).rejects.toThrow(
      'Affinity API key not configured'
    );
  });

  test('makes authenticated request with correct headers', async () => {
    setupApiKey('my-secret-key');
    mockFetchResponse({ data: 'test' });

    await affinityRequest('/test');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.affinity.co/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Basic'),
          'Content-Type': 'application/json'
        })
      })
    );
  });

  test('handles POST request with body', async () => {
    setupApiKey('my-secret-key');
    mockFetchResponse({ id: 123 });

    await affinityRequest('/persons', {
      method: 'POST',
      body: JSON.stringify({ first_name: 'John' })
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.affinity.co/persons',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ first_name: 'John' })
      })
    );
  });

  test('throws error on API failure', async () => {
    setupApiKey('my-secret-key');
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized')
      })
    );

    await expect(affinityRequest('/test')).rejects.toThrow(
      'Affinity API error (401): Unauthorized'
    );
  });

  test('returns parsed JSON response', async () => {
    setupApiKey('my-secret-key');
    mockFetchResponse({ persons: [{ id: 1, name: 'John' }] });

    const result = await affinityRequest('/persons');

    expect(result).toEqual({ persons: [{ id: 1, name: 'John' }] });
  });
});

describe('searchPerson', () => {
  beforeEach(() => {
    setupApiKey('test-key');
  });

  test('returns persons array from API response', async () => {
    mockFetchResponse({
      persons: [
        { id: 1, first_name: 'John', last_name: 'Doe' },
        { id: 2, first_name: 'Jane', last_name: 'Doe' }
      ]
    });

    const result = await searchPerson('Doe');

    expect(result).toHaveLength(2);
    expect(result[0].first_name).toBe('John');
  });

  test('returns empty array when no persons in response', async () => {
    mockFetchResponse({});

    const result = await searchPerson('Unknown');

    expect(result).toEqual([]);
  });

  test('returns empty array on error', async () => {
    global.fetch.mockImplementationOnce(() =>
      Promise.reject(new Error('Network error'))
    );

    const result = await searchPerson('Test');

    expect(result).toEqual([]);
  });

  test('encodes search term in URL', async () => {
    mockFetchResponse({ persons: [] });

    await searchPerson('John Doe');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('term=John%20Doe'),
      expect.anything()
    );
  });
});

describe('createPerson', () => {
  beforeEach(() => {
    setupApiKey('test-key');
  });

  test('creates person with first and last name', async () => {
    mockFetchResponse({ id: 123, first_name: 'John', last_name: 'Doe' });

    const result = await createPerson({
      firstName: 'John',
      lastName: 'Doe'
    });

    expect(result.id).toBe(123);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.affinity.co/persons',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          first_name: 'John',
          last_name: 'Doe',
          emails: []
        })
      })
    );
  });

  test('splits full name when firstName/lastName not provided', async () => {
    mockFetchResponse({ id: 456 });

    await createPerson({ name: 'Jane Marie Smith' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          first_name: 'Jane',
          last_name: 'Marie Smith',
          emails: []
        })
      })
    );
  });

  test('uses Unknown when no name provided', async () => {
    mockFetchResponse({ id: 789 });

    await createPerson({});

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          first_name: 'Unknown',
          last_name: '',
          emails: []
        })
      })
    );
  });
});

describe('addNote', () => {
  beforeEach(() => {
    setupApiKey('test-key');
  });

  test('adds note with person ID and content', async () => {
    mockFetchResponse({ id: 'note-123' });

    const result = await addNote(456, '## Test Note\n\nContent here');

    expect(result.id).toBe('note-123');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.affinity.co/notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          person_ids: [456],
          content: '## Test Note\n\nContent here'
        })
      })
    );
  });
});

describe('getNotesForPerson', () => {
  beforeEach(() => {
    setupApiKey('test-key');
  });

  test('returns notes array from API response', async () => {
    mockFetchResponse({
      notes: [
        { id: 1, content: 'Note 1' },
        { id: 2, content: 'Note 2' }
      ]
    });

    const result = await getNotesForPerson(123);

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('Note 1');
  });

  test('returns result directly if no notes property', async () => {
    mockFetchResponse([
      { id: 1, content: 'Direct note' }
    ]);

    const result = await getNotesForPerson(123);

    expect(result).toHaveLength(1);
  });

  test('returns empty array on error', async () => {
    global.fetch.mockImplementationOnce(() =>
      Promise.reject(new Error('API error'))
    );

    const result = await getNotesForPerson(123);

    expect(result).toEqual([]);
  });
});

describe('checkDuplicateAndGetExistingMessages', () => {
  beforeEach(() => {
    setupApiKey('test-key');
  });

  test('returns isDuplicate false when no matching notes', async () => {
    mockFetchResponse({ notes: [] });

    const result = await checkDuplicateAndGetExistingMessages(
      'https://linkedin.com/messaging/thread/123',
      456
    );

    expect(result.isDuplicate).toBe(false);
    expect(result.existingMessageContents.size).toBe(0);
  });

  test('returns isDuplicate true when conversation URL found in notes', async () => {
    // Note format must match formatConversationNote output - includes --- separator before messages
    mockFetchResponse({
      notes: [
        {
          id: 1,
          content: '## LinkedIn Conversation\n\n**Source:** https://linkedin.com/messaging/thread/123\n\n---\n\n**John** (Jan 1, 2024):\nHello world\n\n',
          created_at: '2024-01-15T10:00:00.000Z'
        }
      ]
    });

    const result = await checkDuplicateAndGetExistingMessages(
      'https://linkedin.com/messaging/thread/123',
      456
    );

    expect(result.isDuplicate).toBe(true);
    expect(result.sentAt).toBe('2024-01-15T10:00:00.000Z');
    expect(result.existingMessageContents.has('Hello world')).toBe(true);
  });

  test('extracts multiple message contents from note', async () => {
    // Note format must match formatConversationNote output - includes --- separator before messages
    mockFetchResponse({
      notes: [
        {
          id: 1,
          content: '**Source:** https://linkedin.com/messaging/thread/123\n\n---\n\n**John** (Jan 1, 2024):\nFirst message\n\n**Jane** (Jan 1, 2024):\nSecond message\n\n',
          created_at: '2024-01-15T10:00:00.000Z'
        }
      ]
    });

    const result = await checkDuplicateAndGetExistingMessages(
      'https://linkedin.com/messaging/thread/123',
      456
    );

    expect(result.existingMessageContents.size).toBe(2);
    expect(result.existingMessageContents.has('First message')).toBe(true);
    expect(result.existingMessageContents.has('Second message')).toBe(true);
  });

  test('returns fail-open on error', async () => {
    global.fetch.mockImplementationOnce(() =>
      Promise.reject(new Error('API error'))
    );

    const result = await checkDuplicateAndGetExistingMessages(
      'https://linkedin.com/messaging/thread/123',
      456
    );

    expect(result.isDuplicate).toBe(false);
    expect(result.existingMessageContents.size).toBe(0);
  });

  test('tracks latest note date across multiple matching notes', async () => {
    mockFetchResponse({
      notes: [
        {
          id: 1,
          content: '**Source:** https://linkedin.com/messaging/thread/123\n\n**A**:\nMsg1',
          created_at: '2024-01-10T10:00:00.000Z'
        },
        {
          id: 2,
          content: '**Source:** https://linkedin.com/messaging/thread/123\n\n**B**:\nMsg2',
          created_at: '2024-01-15T10:00:00.000Z'
        }
      ]
    });

    const result = await checkDuplicateAndGetExistingMessages(
      'https://linkedin.com/messaging/thread/123',
      456
    );

    expect(result.sentAt).toBe('2024-01-15T10:00:00.000Z');
  });
});
