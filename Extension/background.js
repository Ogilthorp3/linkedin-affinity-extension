// LinkedIn to Affinity - Background Service Worker
// Handles Affinity API communication

const AFFINITY_API_BASE = 'https://api.affinity.co';

/**
 * Get stored API key from extension storage
 */
async function getApiKey() {
  const result = await chrome.storage.sync.get(['affinityApiKey']);
  return result.affinityApiKey;
}

/**
 * Make authenticated request to Affinity API
 */
async function affinityRequest(endpoint, options = {}) {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error('Affinity API key not configured. Click the extension icon to set it up.');
  }

  const url = `${AFFINITY_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Basic ${btoa(':' + apiKey)}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Affinity API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Search for a person in Affinity by name
 */
async function searchPerson(name) {
  try {
    const result = await affinityRequest(`/persons?term=${encodeURIComponent(name)}`);
    return result.persons || [];
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error searching person:', error);
    return [];
  }
}

/**
 * Search for a person by LinkedIn URL in field values
 */
async function findPersonByLinkedIn(linkedinUrl) {
  if (!linkedinUrl) return null;

  // First search by name, then filter by LinkedIn URL in the results
  // Affinity doesn't have a direct LinkedIn URL search, so we check field values
  // This is a limitation - in production you might want to cache/index this

  return null; // Will rely on name search for now
}

/**
 * Create a new person in Affinity
 */
async function createPerson(personData) {
  const payload = {
    first_name: personData.firstName || personData.name?.split(' ')[0] || 'Unknown',
    last_name: personData.lastName || personData.name?.split(' ').slice(1).join(' ') || '',
    emails: [] // LinkedIn doesn't expose emails
  };

  // Add organization if we can determine it from headline
  // This could be enhanced with company matching

  const result = await affinityRequest('/persons', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return result;
}

/**
 * Add a note to a person in Affinity
 */
async function addNote(personId, content) {
  const payload = {
    person_ids: [personId],
    content: content
  };

  const result = await affinityRequest('/notes', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return result;
}

/**
 * Format the LinkedIn conversation as a note
 */
function formatConversationNote(data) {
  const { sender, messages, conversationUrl, capturedAt } = data;

  let note = `## LinkedIn Conversation\n\n`;
  note += `**Contact:** ${sender.name || 'Unknown'}\n`;

  if (sender.headline) {
    note += `**Title:** ${sender.headline}\n`;
  }

  if (sender.linkedinUrl) {
    note += `**LinkedIn:** ${sender.linkedinUrl}\n`;
  }

  note += `**Captured:** ${new Date(capturedAt).toLocaleString()}\n`;
  note += `**Source:** ${conversationUrl}\n\n`;

  note += `---\n\n`;
  note += `### Messages\n\n`;

  if (messages && messages.length > 0) {
    messages.forEach((msg) => {
      const direction = msg.isIncoming ? '← Incoming' : '→ Outgoing';
      const timestamp = msg.timestamp ? ` (${msg.timestamp})` : '';
      note += `**${msg.sender || direction}**${timestamp}:\n`;
      note += `${msg.content}\n\n`;
    });
  } else {
    note += `_No messages extracted_\n`;
  }

  return note;
}

/**
 * Main handler: Process LinkedIn conversation and send to Affinity
 */
async function sendToAffinity(data) {
  const { sender } = data;

  // Step 1: Search for existing person
  let person = null;
  let isNewPerson = false;

  if (sender.name) {
    const existingPersons = await searchPerson(sender.name);

    if (existingPersons.length > 1) {
      // Multiple matches - return them for user selection
      console.log('[LinkedIn to Affinity] Found multiple matches:', existingPersons.length);
      return {
        success: false,
        needsSelection: true,
        matches: existingPersons.slice(0, 10), // Limit to 10 matches
        conversationData: data
      };
    } else if (existingPersons.length === 1) {
      // Single match - use it directly
      person = existingPersons[0];
      console.log('[LinkedIn to Affinity] Found existing person:', person.id);
    }
  }

  // Step 2: Create person if not found
  if (!person) {
    person = await createPerson(sender);
    isNewPerson = true;
    console.log('[LinkedIn to Affinity] Created new person:', person.id);
  }

  // Step 3: Add conversation as a note
  const noteContent = formatConversationNote(data);
  const note = await addNote(person.id, noteContent);
  console.log('[LinkedIn to Affinity] Added note:', note.id);

  return {
    success: true,
    personId: person.id,
    noteId: note.id,
    isNewPerson: isNewPerson,
    personName: `${person.first_name} ${person.last_name}`.trim()
  };
}

/**
 * Send conversation to a specific person (after user selection)
 */
async function sendToAffinityWithPerson(personId, conversationData) {
  const noteContent = formatConversationNote(conversationData);
  const note = await addNote(personId, noteContent);
  console.log('[LinkedIn to Affinity] Added note to selected person:', note.id);

  return {
    success: true,
    personId: personId,
    noteId: note.id,
    isNewPerson: false
  };
}

/**
 * Create a new person and send conversation to them
 */
async function createPersonAndSend(senderData, conversationData) {
  const person = await createPerson(senderData);
  console.log('[LinkedIn to Affinity] Created new person:', person.id);

  const noteContent = formatConversationNote(conversationData);
  const note = await addNote(person.id, noteContent);
  console.log('[LinkedIn to Affinity] Added note:', note.id);

  return {
    success: true,
    personId: person.id,
    noteId: note.id,
    isNewPerson: true,
    personName: `${person.first_name} ${person.last_name}`.trim()
  };
}

/**
 * Listen for messages from content script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendToAffinity') {
    sendToAffinity(request.data)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[LinkedIn to Affinity] Error:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      });

    // Return true to indicate async response
    return true;
  }

  if (request.action === 'sendToAffinityWithPerson') {
    // Send to a specific person (after user selection from modal)
    sendToAffinityWithPerson(request.personId, request.conversationData)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[LinkedIn to Affinity] Error:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      });

    return true;
  }

  if (request.action === 'createPersonAndSend') {
    // Create new person and send (when user chooses "Create New" from modal)
    createPersonAndSend(request.senderData, request.conversationData)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[LinkedIn to Affinity] Error:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      });

    return true;
  }

  if (request.action === 'testConnection') {
    // Test API connection
    affinityRequest('/whoami')
      .then((result) => {
        sendResponse({ success: true, user: result });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }
});

/**
 * Handle keyboard command
 */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'send-to-affinity') {
    // Send message to active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'triggerSend' });
      }
    });
  }
});

console.log('[LinkedIn to Affinity] Background service worker loaded');
