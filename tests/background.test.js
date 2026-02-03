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
  checkDuplicateAndGetExistingMessages,
  findPersonFields,
  populatePersonFields,
  findDropdownOption,
  resetCaches
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

    expect(note).toContain('# 💬 LinkedIn Conversation');
    expect(note).toContain('**John Doe**');
    expect(note).toContain('2 messages');
    expect(note).toContain('[View on LinkedIn](https://linkedin.com/messaging/thread/123)');
    expect(note).toContain('**◀︎ John Doe**');
    expect(note).toContain('> Hello!');
    expect(note).toContain('**▶︎ Me**');
    expect(note).toContain('> Hi there!');
  });

  test('handles missing sender headline', () => {
    const data = {
      sender: { name: 'Jane Smith' },
      messages: [],
      conversationUrl: 'https://linkedin.com/messaging/thread/456',
      capturedAt: '2024-01-15T15:30:00.000Z'
    };

    const note = formatConversationNote(data);

    expect(note).toContain('**Jane Smith**');
    expect(note).toContain('[View on LinkedIn]');
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
    expect(note).toContain('**Test User**');
    expect(note).toContain('0 messages');
    expect(note).not.toContain('### Conversation'); // No conversation section
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
    expect(note).toContain('**Test User**');
    expect(note).toContain('0 messages');
    expect(note).not.toContain('### Conversation'); // No conversation section
  });

  test('handles message without timestamp', () => {
    const data = {
      sender: { name: 'Test User' },
      messages: [{ sender: 'Test User', content: 'No timestamp here', isIncoming: true }],
      conversationUrl: 'https://linkedin.com/messaging/thread/789',
      capturedAt: '2024-01-15T15:30:00.000Z'
    };

    const note = formatConversationNote(data);

    expect(note).toContain('**◀︎ Test User**');
    expect(note).toContain('> No timestamp here');
    expect(note).not.toContain('· _\n'); // No empty timestamp
  });

  test('uses sender name fallback when message sender is missing', () => {
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

    expect(note).toContain('**◀︎ Test User**'); // Uses sender name for incoming
    expect(note).toContain('**▶︎ You**'); // Uses "You" for outgoing
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

    expect(note).toContain('📝 **Note:**');
    expect(note).toContain('> Met at Web Summit 2024, interested in Series A');
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

    expect(note).not.toContain('📝 **Note:**');
  });

  test('does not include note section when quickNote is undefined', () => {
    const data = {
      sender: { name: 'Jane Smith' },
      messages: [],
      conversationUrl: 'https://linkedin.com/messaging/thread/456',
      capturedAt: '2024-01-15T15:30:00.000Z'
    };

    const note = formatConversationNote(data);

    expect(note).not.toContain('📝 **Note:**');
  });

  test('includes tags when provided', () => {
    const data = {
      sender: { name: 'John Doe' },
      messages: [],
      conversationUrl: 'https://linkedin.com/messaging/thread/123',
      capturedAt: '2024-01-15T15:30:00.000Z',
      tags: ['Founder', 'Series A']
    };

    const note = formatConversationNote(data);

    expect(note).toContain('🏷️ **Tags:**');
    expect(note).toContain('Founder, Series A');
  });

  test('formats multiline messages correctly', () => {
    const data = {
      sender: { name: 'John Doe' },
      messages: [
        { sender: 'John Doe', content: 'Line 1\nLine 2\nLine 3', isIncoming: true }
      ],
      conversationUrl: 'https://linkedin.com/messaging/thread/123',
      capturedAt: '2024-01-15T15:30:00.000Z'
    };

    const note = formatConversationNote(data);

    expect(note).toContain('> Line 1');
    expect(note).toContain('> Line 2');
    expect(note).toContain('> Line 3');
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

  test('matches messages with escaped apostrophes (French text)', () => {
    // This is the exact case from the bug report:
    // Stored in Affinity: "Salut Bert, enchanté de t\\'avoir rencontré"
    // Incoming from LinkedIn: "Salut Bert, enchanté de t'avoir rencontré"
    const messages = [
      { content: "Salut Bert, enchanté de t'avoir rencontré en personne" }
    ];
    const existingMessageContents = new Set(["Salut Bert, enchanté de t\\'avoir rencontré en personne"]);

    const result = filterNewMessages(messages, existingMessageContents);

    expect(result).toHaveLength(0); // Should detect as duplicate
  });

  test('matches messages with double-escaped quotes', () => {
    const messages = [
      { content: 'He said "hello" to me' }
    ];
    const existingMessageContents = new Set(['He said \\"hello\\" to me']);

    const result = filterNewMessages(messages, existingMessageContents);

    expect(result).toHaveLength(0); // Should detect as duplicate
  });

  test('matches messages with curly quotes vs straight quotes', () => {
    const messages = [
      { content: "It's a 'test' message" }
    ];
    const existingMessageContents = new Set(["It's a 'test' message"]); // curly quotes

    const result = filterNewMessages(messages, existingMessageContents);

    expect(result).toHaveLength(0); // Should detect as duplicate
  });
});

describe('normalizeMessageContent', () => {
  const { normalizeMessageContent } = require('../Extension/background.js');

  test('removes escaped apostrophes', () => {
    expect(normalizeMessageContent("t\\'avoir")).toBe("t'avoir");
  });

  test('removes escaped double quotes', () => {
    expect(normalizeMessageContent('said \\"hello\\"')).toBe('said "hello"');
  });

  test('handles double-escaped backslashes', () => {
    expect(normalizeMessageContent("path\\\\to\\\\file")).toBe("path\\to\\file");
  });

  test('normalizes multiple spaces to single space', () => {
    expect(normalizeMessageContent("hello   world")).toBe("hello world");
  });

  test('converts curly single quotes to straight quotes', () => {
    expect(normalizeMessageContent("it's")).toBe("it's");
  });

  test('converts curly double quotes to straight quotes', () => {
    expect(normalizeMessageContent('"quoted"')).toBe('"quoted"');
  });

  test('handles empty string', () => {
    expect(normalizeMessageContent('')).toBe('');
  });

  test('handles null/undefined', () => {
    expect(normalizeMessageContent(null)).toBe('');
    expect(normalizeMessageContent(undefined)).toBe('');
  });

  test('trims whitespace', () => {
    expect(normalizeMessageContent('  hello world  ')).toBe('hello world');
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

describe('findDropdownOption', () => {
  test('finds option by exact name match', () => {
    const field = {
      dropdown_options: [
        { id: 1, text: 'Email' },
        { id: 2, text: 'LinkedIn' },
        { id: 3, text: 'Referral' }
      ]
    };

    expect(findDropdownOption(field, 'LinkedIn')).toBe(2);
  });

  test('finds option case-insensitively', () => {
    const field = {
      dropdown_options: [
        { id: 1, text: 'Email' },
        { id: 2, text: 'LinkedIn' },
        { id: 3, text: 'Referral' }
      ]
    };

    expect(findDropdownOption(field, 'linkedin')).toBe(2);
    expect(findDropdownOption(field, 'LINKEDIN')).toBe(2);
  });

  test('finds option by partial match', () => {
    const field = {
      dropdown_options: [
        { id: 1, text: 'Email Campaign' },
        { id: 2, text: 'LinkedIn Outreach' },
        { id: 3, text: 'Referral' }
      ]
    };

    expect(findDropdownOption(field, 'linkedin')).toBe(2);
  });

  test('returns null when no match', () => {
    const field = {
      dropdown_options: [
        { id: 1, text: 'Email' },
        { id: 2, text: 'Referral' }
      ]
    };

    expect(findDropdownOption(field, 'LinkedIn')).toBeNull();
  });

  test('returns null for null field', () => {
    expect(findDropdownOption(null, 'LinkedIn')).toBeNull();
  });

  test('returns null for field without dropdown_options', () => {
    const field = { id: 1, name: 'Source' };
    expect(findDropdownOption(field, 'LinkedIn')).toBeNull();
  });
});

describe('findPersonFields', () => {
  beforeEach(() => {
    resetCaches();
  });

  test('finds all field types correctly', async () => {
    setupApiKey();
    mockFetchResponse([
      { id: 1, name: 'LinkedIn URL', value_type: 6 },
      { id: 2, name: 'LinkedIn Profile Headline', value_type: 6 },
      { id: 3, name: 'Current Job Title', value_type: 6 },
      { id: 4, name: 'Job Titles', value_type: 6 },
      { id: 5, name: 'Location', value_type: 6 },
      { id: 6, name: 'Industry', value_type: 2, dropdown_options: [{ id: 100, text: 'Technology' }] },
      { id: 7, name: 'Phone Number', value_type: 6 },
      { id: 8, name: 'Source of Introduction', value_type: 2, dropdown_options: [{ id: 200, text: 'LinkedIn' }] },
      { id: 9, name: 'Bio', value_type: 6 }
    ]);

    const fields = await findPersonFields();

    expect(fields.linkedin?.id).toBe(1);
    expect(fields.headline?.id).toBe(2);
    expect(fields.currentJobTitle?.id).toBe(3);
    expect(fields.jobTitles?.id).toBe(4);
    expect(fields.location?.id).toBe(5);
    expect(fields.industry?.id).toBe(6);
    expect(fields.phone?.id).toBe(7);
    expect(fields.sourceOfIntroduction?.id).toBe(8);
    expect(fields.bio?.id).toBe(9);
  });

  test('finds fields with alternative names', async () => {
    setupApiKey();
    mockFetchResponse([
      { id: 1, name: 'LinkedIn', value_type: 6 },
      { id: 2, name: 'Headline', value_type: 6 },
      { id: 3, name: 'Title', value_type: 6 },
      { id: 4, name: 'City', value_type: 6 },
      { id: 5, name: 'Sector', value_type: 6 },
      { id: 6, name: 'Mobile', value_type: 6 }
    ]);

    const fields = await findPersonFields();

    expect(fields.linkedin?.id).toBe(1);
    expect(fields.headline?.id).toBe(2);
    expect(fields.currentJobTitle?.id).toBe(3);
    expect(fields.location?.id).toBe(4);
    expect(fields.industry?.id).toBe(5);
    expect(fields.phone?.id).toBe(6);
  });

  test('caches field definitions', async () => {
    setupApiKey();
    mockFetchResponse([{ id: 1, name: 'LinkedIn URL', value_type: 6 }]);

    await findPersonFields();
    await findPersonFields();

    // Fetch should only be called once (for the first call)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('handles empty field list', async () => {
    setupApiKey();
    mockFetchResponse([]);

    const fields = await findPersonFields();

    expect(fields.linkedin).toBeUndefined();
    expect(fields._all).toEqual([]);
  });
});

describe('populatePersonFields', () => {
  beforeEach(() => {
    resetCaches();
  });

  test('populates all available text fields', async () => {
    setupApiKey();

    // First call returns field definitions
    mockFetchResponse([
      { id: 1, name: 'LinkedIn URL', value_type: 6 },
      { id: 2, name: 'LinkedIn Profile Headline', value_type: 6 },
      { id: 3, name: 'Current Job Title', value_type: 6 },
      { id: 4, name: 'Job Titles', value_type: 6 },
      { id: 5, name: 'Location', value_type: 6 },
      { id: 6, name: 'Industry', value_type: 6 },
      { id: 7, name: 'Bio', value_type: 6 }
    ]);

    // Subsequent calls return success for field value creation
    for (let i = 0; i < 7; i++) {
      mockFetchResponse({ id: 100 + i });
    }

    const profileData = {
      linkedinUrl: 'https://linkedin.com/in/johndoe',
      headline: 'CEO at TechCorp',
      currentJobTitle: 'Chief Executive Officer',
      allJobTitles: ['CEO', 'CTO', 'Engineer'],
      location: 'San Francisco, CA',
      industry: 'Technology',
      about: 'Passionate about technology'
    };

    const results = await populatePersonFields(123, profileData, true);

    expect(results.length).toBe(7);
    expect(results.map(r => r.field)).toContain('linkedin');
    expect(results.map(r => r.field)).toContain('headline');
    expect(results.map(r => r.field)).toContain('currentJobTitle');
    expect(results.map(r => r.field)).toContain('jobTitles');
    expect(results.map(r => r.field)).toContain('location');
    expect(results.map(r => r.field)).toContain('industry');
    expect(results.map(r => r.field)).toContain('bio');
  });

  test('populates Source of Introduction dropdown for new persons', async () => {
    setupApiKey();

    // Field definitions with Source of Introduction dropdown
    mockFetchResponse([
      { id: 1, name: 'Source of Introduction', value_type: 2, dropdown_options: [
        { id: 100, text: 'Email' },
        { id: 101, text: 'LinkedIn' },
        { id: 102, text: 'Referral' }
      ]}
    ]);

    // Success for field value creation
    mockFetchResponse({ id: 200 });

    const results = await populatePersonFields(123, {}, true);

    expect(results.length).toBe(1);
    expect(results[0].field).toBe('sourceOfIntroduction');

    // Verify the correct dropdown option ID was used
    const calls = global.fetch.mock.calls;
    const fieldValueCall = calls.find(c => c[0].includes('/field-values'));
    expect(fieldValueCall).toBeDefined();
    const body = JSON.parse(fieldValueCall[1].body);
    expect(body.value).toBe(101); // LinkedIn option ID
  });

  test('does not populate Source of Introduction for existing persons', async () => {
    setupApiKey();

    mockFetchResponse([
      { id: 1, name: 'Source of Introduction', value_type: 2, dropdown_options: [
        { id: 101, text: 'LinkedIn' }
      ]}
    ]);

    const results = await populatePersonFields(123, {}, false); // isNewPerson = false

    expect(results.length).toBe(0);
  });

  test('populates industry dropdown field correctly', async () => {
    setupApiKey();

    // Affinity dropdown fields accept text values directly
    mockFetchResponse([
      { id: 1, name: 'Industry', value_type: 2 }
    ]);

    mockFetchResponse({ id: 200 });

    const results = await populatePersonFields(123, { industry: 'Technology' }, false);

    expect(results.length).toBe(1);
    expect(results[0].field).toBe('industry');

    // Verify the text value was set directly (Affinity dropdowns accept any text)
    const calls = global.fetch.mock.calls;
    const fieldValueCall = calls.find(c => c[0].includes('/field-values'));
    const body = JSON.parse(fieldValueCall[1].body);
    expect(body.value).toBe('Technology');
  });

  test('concatenates all job titles', async () => {
    setupApiKey();

    mockFetchResponse([
      { id: 1, name: 'Job Titles', value_type: 6 }
    ]);

    mockFetchResponse({ id: 200 });

    await populatePersonFields(123, {
      allJobTitles: ['CEO', 'CTO', 'Software Engineer']
    }, false);

    const calls = global.fetch.mock.calls;
    const fieldValueCall = calls.find(c => c[0].includes('/field-values'));
    const body = JSON.parse(fieldValueCall[1].body);
    expect(body.value).toBe('CEO, CTO, Software Engineer');
  });

  test('handles missing profile data gracefully', async () => {
    setupApiKey();

    mockFetchResponse([
      { id: 1, name: 'LinkedIn URL', value_type: 6 },
      { id: 2, name: 'Location', value_type: 6 }
    ]);

    // Should not make any field-value calls since no data provided
    const results = await populatePersonFields(123, {}, false);

    expect(results.length).toBe(0);
  });
});
