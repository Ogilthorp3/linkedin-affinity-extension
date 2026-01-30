/**
 * Affinity API Integration Tests
 *
 * These tests hit the real Affinity API to verify integration works correctly.
 * Requires AFFINITY_API_KEY environment variable to be set.
 *
 * Run with: AFFINITY_API_KEY=your-key npm run test:integration
 *
 * Test contacts are created with "[TEST]" prefix and should be cleaned up
 * after tests complete. If tests fail mid-run, you may need to manually
 * delete test contacts from Affinity.
 */

const AFFINITY_BASE_URL = 'https://api.affinity.co';
const TEST_PREFIX = '[TEST]';
const API_KEY = process.env.AFFINITY_API_KEY;

// Track created resources for cleanup
const createdPersonIds = [];
const createdNoteIds = [];

/**
 * Make authenticated request to Affinity API
 */
async function affinityRequest(endpoint, options = {}) {
  const auth = Buffer.from(':' + API_KEY).toString('base64');

  const response = await fetch(`${AFFINITY_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`Affinity API error (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Search for a person by name
 */
async function searchPerson(name) {
  const result = await affinityRequest(`/persons?term=${encodeURIComponent(name)}`);
  return result.persons || [];
}

/**
 * Create a new person
 */
async function createPerson(firstName, lastName) {
  const result = await affinityRequest('/persons', {
    method: 'POST',
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName
    })
  });
  createdPersonIds.push(result.id);
  return result;
}

/**
 * Delete a person
 */
async function deletePerson(personId) {
  try {
    await affinityRequest(`/persons/${personId}`, { method: 'DELETE' });
    return true;
  } catch (error) {
    console.warn(`Failed to delete person ${personId}:`, error.message);
    return false;
  }
}

/**
 * Add a note to a person
 */
async function addNote(personId, content) {
  const result = await affinityRequest('/notes', {
    method: 'POST',
    body: JSON.stringify({
      person_ids: [personId],
      content: content
    })
  });
  createdNoteIds.push(result.id);
  return result;
}

/**
 * Get notes for a person
 */
async function getNotesForPerson(personId) {
  const result = await affinityRequest(`/notes?person_id=${personId}`);
  return result.notes || result || [];
}

/**
 * Delete a note
 */
async function deleteNote(noteId) {
  try {
    await affinityRequest(`/notes/${noteId}`, { method: 'DELETE' });
    return true;
  } catch (error) {
    console.warn(`Failed to delete note ${noteId}:`, error.message);
    return false;
  }
}

/**
 * Get person field definitions
 */
async function getPersonFields() {
  return await affinityRequest('/persons/fields');
}

// Skip all tests if no API key
const describeIfApiKey = API_KEY ? describe : describe.skip;

describeIfApiKey('Affinity API Integration Tests', () => {
  // Increase timeout for API calls
  jest.setTimeout(30000);

  // Cleanup after all tests
  afterAll(async () => {
    console.log('\nCleaning up test data...');

    // Delete notes first (they reference persons)
    for (const noteId of createdNoteIds) {
      await deleteNote(noteId);
    }

    // Delete persons
    for (const personId of createdPersonIds) {
      await deletePerson(personId);
    }

    console.log(`Cleaned up ${createdNoteIds.length} notes and ${createdPersonIds.length} persons`);
  });

  describe('API Connection', () => {
    test('should authenticate and get current user', async () => {
      const result = await affinityRequest('/whoami');

      expect(result).toBeDefined();
      // Affinity /whoami returns {user_id: number}
      expect(result.user_id).toBeDefined();
      expect(typeof result.user_id).toBe('number');

      console.log(`  Connected as user_id: ${result.user_id}`);
    });

    test('should reject invalid API key', async () => {
      const originalKey = API_KEY;

      // Temporarily use invalid key
      const badAuth = Buffer.from(':invalid-key').toString('base64');

      await expect(
        fetch(`${AFFINITY_BASE_URL}/whoami`, {
          headers: { Authorization: `Basic ${badAuth}` }
        }).then(r => {
          if (!r.ok) throw new Error(`Status: ${r.status}`);
          return r.json();
        })
      ).rejects.toThrow();
    });
  });

  describe('Person Search', () => {
    test('should search for existing persons', async () => {
      // Search for a common name that likely exists
      const results = await searchPerson('test');

      expect(Array.isArray(results)).toBe(true);
      console.log(`  Found ${results.length} persons matching "test"`);
    });

    test('should return empty array for non-existent person', async () => {
      const results = await searchPerson('xyznonexistent12345');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe('Person Creation', () => {
    let testPerson;

    test('should create a new person', async () => {
      const timestamp = Date.now();
      testPerson = await createPerson(
        `${TEST_PREFIX} Integration`,
        `Test ${timestamp}`
      );

      expect(testPerson).toBeDefined();
      expect(testPerson.id).toBeDefined();
      expect(testPerson.first_name).toContain(TEST_PREFIX);

      console.log(`  Created person: ${testPerson.id} - ${testPerson.first_name} ${testPerson.last_name}`);
    });

    test('should find created person by search', async () => {
      if (!testPerson) {
        throw new Error('Test person was not created');
      }

      const results = await searchPerson(TEST_PREFIX);

      expect(results.length).toBeGreaterThan(0);

      const found = results.find(p => p.id === testPerson.id);
      expect(found).toBeDefined();
    });
  });

  describe('Notes', () => {
    let testPerson;
    let testNote;

    beforeAll(async () => {
      // Create a test person for notes
      const timestamp = Date.now();
      testPerson = await createPerson(
        `${TEST_PREFIX} Notes`,
        `Test ${timestamp}`
      );
    });

    test('should add a note to a person', async () => {
      const timestamp = new Date().toISOString();
      const noteContent = `## Test Note\n\nCreated at: ${timestamp}\n\nThis is a test note from integration tests.`;

      testNote = await addNote(testPerson.id, noteContent);

      expect(testNote).toBeDefined();
      expect(testNote.id).toBeDefined();
      // Affinity may normalize content (escape chars, newlines), so check key parts exist
      expect(testNote.content).toContain('Test Note');
      expect(testNote.content).toContain('integration tests');

      console.log(`  Created note: ${testNote.id}`);
    });

    test('should retrieve notes for a person', async () => {
      const notes = await getNotesForPerson(testPerson.id);

      expect(Array.isArray(notes)).toBe(true);
      expect(notes.length).toBeGreaterThan(0);

      const found = notes.find(n => n.id === testNote.id);
      expect(found).toBeDefined();
    });

    test('should detect duplicate conversation URL in notes', async () => {
      const conversationUrl = 'https://www.linkedin.com/messaging/thread/test-thread-123';
      const noteContent = `## LinkedIn Conversation\n\n**Source:** ${conversationUrl}\n\nTest message content`;

      await addNote(testPerson.id, noteContent);

      // Now check if we can detect the duplicate
      const notes = await getNotesForPerson(testPerson.id);
      const isDuplicate = notes.some(note =>
        note.content && note.content.includes(conversationUrl)
      );

      expect(isDuplicate).toBe(true);
    });
  });

  describe('Person Fields', () => {
    test('should retrieve person field definitions', async () => {
      const fields = await getPersonFields();

      expect(Array.isArray(fields)).toBe(true);
      console.log(`  Found ${fields.length} person fields`);

      if (fields.length > 0) {
        console.log('  Sample fields:');
        fields.slice(0, 5).forEach(f => {
          console.log(`    - ${f.name} (id: ${f.id}, type: ${f.value_type})`);
        });
      }
    });

    test('should identify field value types', async () => {
      const fields = await getPersonFields();

      // Value types in Affinity:
      // 0 = Text, 1 = Number, 2 = Dropdown, 3 = Date, 4 = Location, 5 = Person, 6 = Organization, 7 = URL

      const fieldTypes = {};
      fields.forEach(f => {
        const typeName = getValueTypeName(f.value_type);
        fieldTypes[typeName] = (fieldTypes[typeName] || 0) + 1;
      });

      console.log('  Field types distribution:', fieldTypes);
    });
  });

  describe('Full Workflow', () => {
    test('should complete full send-to-affinity workflow', async () => {
      const timestamp = Date.now();

      // Step 1: Search for person (won't exist)
      const searchResults = await searchPerson(`Workflow Test ${timestamp}`);
      expect(searchResults.length).toBe(0);

      // Step 2: Create person
      const person = await createPerson(
        `${TEST_PREFIX} Workflow`,
        `Test ${timestamp}`
      );
      expect(person.id).toBeDefined();
      console.log(`  Step 1: Created person ${person.id}`);

      // Step 3: Add conversation note
      const conversationUrl = `https://www.linkedin.com/messaging/thread/workflow-${timestamp}`;
      const noteContent = `## LinkedIn Conversation

**With:** Workflow Test ${timestamp}
**Date:** ${new Date().toISOString()}
**Source:** ${conversationUrl}

---

**Them:** Hello, this is a test message
**Me:** Hi! This is a reply`;

      const note = await addNote(person.id, noteContent);
      expect(note.id).toBeDefined();
      console.log(`  Step 2: Added note ${note.id}`);

      // Step 4: Verify duplicate detection
      const notes = await getNotesForPerson(person.id);
      const existingUrls = notes
        .filter(n => n.content?.includes('linkedin.com/messaging'))
        .map(n => {
          const match = n.content.match(/https:\/\/www\.linkedin\.com\/messaging\/[^\s\n]*/);
          return match ? match[0] : null;
        })
        .filter(Boolean);

      expect(existingUrls).toContain(conversationUrl);
      console.log(`  Step 3: Duplicate detection working - found ${existingUrls.length} conversation URLs`);

      // Step 5: Try to "send" same conversation - should be flagged as duplicate
      const isDuplicate = existingUrls.includes(conversationUrl);
      expect(isDuplicate).toBe(true);
      console.log('  Step 4: Duplicate correctly identified');
    });
  });
});

// Helper function
function getValueTypeName(valueType) {
  const types = {
    0: 'Text',
    1: 'Number',
    2: 'Dropdown',
    3: 'Date',
    4: 'Location',
    5: 'Person',
    6: 'Organization',
    7: 'URL'
  };
  return types[valueType] || `Unknown(${valueType})`;
}

// If no API key, show a helpful message
if (!API_KEY) {
  describe('Affinity API Integration Tests', () => {
    test.skip('SKIPPED: Set AFFINITY_API_KEY environment variable to run integration tests', () => {});
  });

  console.log('\n');
  console.log('='.repeat(60));
  console.log('Affinity API Integration Tests SKIPPED');
  console.log('='.repeat(60));
  console.log('');
  console.log('To run integration tests, set your Affinity API key:');
  console.log('');
  console.log('  AFFINITY_API_KEY=your-api-key npm run test:integration');
  console.log('');
  console.log('='.repeat(60));
  console.log('');
}
