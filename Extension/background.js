// LinkedIn to Affinity - Background Service Worker
// Handles Affinity API communication

// Use browser or chrome API (Safari compatibility)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const AFFINITY_API_BASE = 'https://api.affinity.co';

/**
 * Get stored API key from extension storage
 */
async function getApiKey() {
  try {
    const result = await browserAPI.storage.sync.get(['affinityApiKey']);
    return result.affinityApiKey;
  } catch (error) {
    // Fallback to local storage if sync not available
    const result = await browserAPI.storage.local.get(['affinityApiKey']);
    return result.affinityApiKey;
  }
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
 * Fetch and parse a LinkedIn profile page for detailed information
 */
async function fetchLinkedInProfile(profileUrl) {
  if (!profileUrl) return null;

  try {

    const response = await fetch(profileUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      credentials: 'include' // Include cookies for authenticated request
    });

    if (!response.ok) {
      console.error('[LinkedIn to Affinity] Failed to fetch profile:', response.status);
      return null;
    }

    const html = await response.text();
    return parseLinkedInProfileHtml(html);
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error fetching profile:', error);
    return null;
  }
}

/**
 * Parse LinkedIn profile HTML to extract structured data
 */
function parseLinkedInProfileHtml(html) {
  const profile = {
    name: null,
    firstName: null,
    lastName: null,
    headline: null,
    title: null,
    company: null,
    location: null,
    about: null,
    profileImageUrl: null,
    connectionDegree: null
  };

  try {
    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Try to extract from JSON-LD structured data (most reliable)
    const jsonLdScript = doc.querySelector('script[type="application/ld+json"]');
    if (jsonLdScript) {
      try {
        const jsonLd = JSON.parse(jsonLdScript.textContent);
        if (jsonLd['@type'] === 'Person') {
          profile.name = jsonLd.name;
          profile.location = jsonLd.address?.addressLocality;
          profile.about = jsonLd.description;
          profile.profileImageUrl = jsonLd.image?.contentUrl || jsonLd.image;

          if (jsonLd.worksFor && jsonLd.worksFor.length > 0) {
            const currentJob = jsonLd.worksFor[0];
            profile.company = currentJob.name;
          }

          if (jsonLd.jobTitle && jsonLd.jobTitle.length > 0) {
            profile.title = jsonLd.jobTitle[0];
          }
        }
      } catch (e) {
        console.log('[LinkedIn to Affinity] Could not parse JSON-LD');
      }
    }

    // Fallback: Extract from meta tags
    if (!profile.name) {
      const titleMeta = doc.querySelector('meta[property="og:title"]');
      if (titleMeta) {
        // Format is usually "Name | LinkedIn" or "Name - Title | LinkedIn"
        const title = titleMeta.getAttribute('content');
        const namePart = title?.split('|')[0]?.split('-')[0]?.trim();
        if (namePart) profile.name = namePart;
      }
    }

    if (!profile.about) {
      const descMeta = doc.querySelector('meta[property="og:description"], meta[name="description"]');
      if (descMeta) {
        profile.about = descMeta.getAttribute('content');
      }
    }

    if (!profile.profileImageUrl) {
      const imageMeta = doc.querySelector('meta[property="og:image"]');
      if (imageMeta) {
        profile.profileImageUrl = imageMeta.getAttribute('content');
      }
    }

    // Fallback: Extract from visible page elements
    // Name from profile header
    if (!profile.name) {
      const nameEl = doc.querySelector(
        '.text-heading-xlarge, ' +
        '.pv-text-details__left-panel h1, ' +
        '[data-anonymize="person-name"]'
      );
      if (nameEl) profile.name = nameEl.textContent?.trim();
    }

    // Headline
    if (!profile.headline) {
      const headlineEl = doc.querySelector(
        '.text-body-medium.break-words, ' +
        '.pv-text-details__left-panel .text-body-medium, ' +
        '[data-anonymize="headline"]'
      );
      if (headlineEl) profile.headline = headlineEl.textContent?.trim();
    }

    // Location
    if (!profile.location) {
      const locationEl = doc.querySelector(
        '.text-body-small.inline.t-black--light.break-words, ' +
        '.pv-text-details__left-panel .text-body-small, ' +
        '[data-anonymize="location"]'
      );
      if (locationEl) profile.location = locationEl.textContent?.trim();
    }

    // Current position - look for Experience section
    if (!profile.title || !profile.company) {
      // Try to find current job in experience section
      const experienceSection = doc.querySelector('#experience, [data-section="experience"]');
      if (experienceSection) {
        const firstJob = experienceSection.querySelector('li, .pvs-entity');
        if (firstJob) {
          const jobTitleEl = firstJob.querySelector('.t-bold span, .mr1.t-bold span');
          const companyEl = firstJob.querySelector('.t-normal span, .t-14.t-normal span');

          if (jobTitleEl && !profile.title) {
            profile.title = jobTitleEl.textContent?.trim();
          }
          if (companyEl && !profile.company) {
            // Company name might include "· Full-time" etc, split it
            const companyText = companyEl.textContent?.trim();
            profile.company = companyText?.split('·')[0]?.trim();
          }
        }
      }
    }

    // Parse title and company from headline if not found elsewhere
    if (profile.headline && (!profile.title || !profile.company)) {
      const headlineParsed = parseHeadlineForProfile(profile.headline);
      if (!profile.title && headlineParsed.title) {
        profile.title = headlineParsed.title;
      }
      if (!profile.company && headlineParsed.company) {
        profile.company = headlineParsed.company;
      }
    }

    // Parse name into first/last
    if (profile.name) {
      const nameParts = profile.name.split(' ');
      profile.firstName = nameParts[0];
      profile.lastName = nameParts.slice(1).join(' ');
    }

    return profile;
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error parsing profile HTML:', error);
    return null;
  }
}

/**
 * Parse headline to extract title and company (fallback)
 */
function parseHeadlineForProfile(headline) {
  const result = { title: null, company: null };
  if (!headline) return result;

  // Common patterns
  const patterns = [
    /^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[|·•]|$)/i,  // "Title at Company"
    /^(.+?)\s*[|·•]\s*(.+?)(?:\s*[|·•]|$)/,       // "Title | Company"
    /^(.+?),\s*(.+?)(?:\s*[|·•]|$)/               // "Title, Company"
  ];

  for (const pattern of patterns) {
    const match = headline.match(pattern);
    if (match) {
      result.title = match[1]?.trim();
      result.company = match[2]?.trim();
      break;
    }
  }

  // If no company found, the whole thing might just be a title
  if (!result.title && headline.length < 100) {
    result.title = headline;
  }

  return result;
}

/**
 * Search for an organization in Affinity by name
 */
async function searchOrganization(name) {
  try {
    const result = await affinityRequest(`/organizations?term=${encodeURIComponent(name)}`);
    return result.organizations || [];
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error searching organization:', error);
    return [];
  }
}

/**
 * Create a new organization in Affinity
 */
async function createOrganization(name, domain = null) {
  const payload = {
    name: name
  };

  if (domain) {
    payload.domain = domain;
  }

  try {
    const result = await affinityRequest('/organizations', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return result;
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error creating organization:', error);
    return null;
  }
}

/**
 * Find or create an organization in Affinity
 */
async function findOrCreateOrganization(companyName) {
  if (!companyName) return null;

  // Search for existing organization
  const matches = await searchOrganization(companyName);

  if (matches.length > 0) {
    // Return the best match (first result)
    console.log('[LinkedIn to Affinity] Found existing organization:', matches[0].name);
    return matches[0];
  }

  // Create new organization
  console.log('[LinkedIn to Affinity] Creating new organization:', companyName);
  return await createOrganization(companyName);
}

/**
 * Get field definitions for persons specifically
 * Affinity has separate endpoints for different entity types
 */
async function getPersonFieldDefinitions() {
  try {
    // Use the persons/fields endpoint for person-specific fields
    const result = await affinityRequest('/persons/fields');
    // Debug log removed
    return result || [];
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error getting person field definitions:', error);
    return [];
  }
}

/**
 * Add a field value to a person
 */
async function addFieldValue(fieldId, entityId, value) {
  try {
    const payload = {
      field_id: fieldId,
      entity_id: entityId,
      value: value
    };

    // Debug log removed
    const result = await affinityRequest('/field-values', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    // Debug log removed
    return result;
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error adding field value:', error);
    return null;
  }
}

/**
 * Cache for field definitions
 */
let fieldsCache = null;

/**
 * Reset caches (for testing)
 */
function resetCaches() {
  fieldsCache = null;
}

/**
 * Find relevant fields in Affinity for person data (cached)
 * Returns an object mapping field types to field definitions
 */
async function findPersonFields() {
  if (fieldsCache !== null) return fieldsCache;

  // Use the person-specific fields endpoint
  const personFields = await getPersonFieldDefinitions();

  // Handle case where fields is not an array
  if (!Array.isArray(personFields)) {
    console.log('[LinkedIn to Affinity] No person field definitions available');
    fieldsCache = { _all: [] };
    return fieldsCache;
  }

  // Map common field names to their definitions
  fieldsCache = {
    // value_type 6 = Text field in Affinity
    linkedin: personFields.find(f =>
      (f.name?.toLowerCase() === 'linkedin url' ||
       f.name?.toLowerCase() === 'linkedin profile url' ||
       f.name?.toLowerCase() === 'linkedin') &&
      f.value_type === 6 // Text type
    ),
    headline: personFields.find(f =>
      (f.name?.toLowerCase() === 'linkedin profile headline' ||
       f.name?.toLowerCase() === 'headline' ||
       f.name?.toLowerCase() === 'profile headline') &&
      f.value_type === 6 // Text type
    ),
    title: personFields.find(f =>
      (f.name?.toLowerCase() === 'title' ||
       f.name?.toLowerCase() === 'job title' ||
       f.name?.toLowerCase() === 'position' ||
       f.name?.toLowerCase() === 'role') &&
      f.value_type === 0 // Text type
    ),
    location: personFields.find(f =>
      (f.name?.toLowerCase() === 'location' ||
       f.name?.toLowerCase() === 'city' ||
       f.name?.toLowerCase() === 'region') &&
      f.value_type === 0 // Text type
    ),
    bio: personFields.find(f =>
      (f.name?.toLowerCase() === 'bio' ||
       f.name?.toLowerCase() === 'about' ||
       f.name?.toLowerCase() === 'summary' ||
       f.name?.toLowerCase() === 'description' ||
       f.name?.toLowerCase() === 'notes') &&
      f.value_type === 0 // Text type
    ),
    // Note: "Source of Introduction" is value_type 0 (Person reference), not text
    // We can only populate text fields (value_type 6) with arbitrary strings
    source: personFields.find(f =>
      (f.name?.toLowerCase() === 'source' ||
       f.name?.toLowerCase() === 'lead source' ||
       f.name?.toLowerCase() === 'how we met') &&
      f.value_type === 6 // Text type only
    ),
    // Current Organization - value_type 6 is Organization reference in Affinity
    currentOrganization: personFields.find(f =>
      (f.name?.toLowerCase() === 'current organization' ||
       f.name?.toLowerCase() === 'current company' ||
       f.name?.toLowerCase() === 'company') &&
      f.value_type === 6 // Organization type
    ),
    // For all available fields debugging
    _all: personFields
  };

  console.log('[LinkedIn to Affinity] Found person fields:', {
    linkedin: fieldsCache.linkedin?.name,
    headline: fieldsCache.headline?.name,
    title: fieldsCache.title?.name,
    location: fieldsCache.location?.name,
    bio: fieldsCache.bio?.name,
    source: fieldsCache.source?.name,
    currentOrganization: fieldsCache.currentOrganization?.name,
    totalFields: personFields.length
  });

  return fieldsCache;
}

/**
 * Populate all matching fields for a person
 * @param {number} personId - The Affinity person ID
 * @param {object} profileData - Profile data including linkedinUrl, headline, etc.
 * @param {number} organizationId - Optional organization ID for Current Organization field
 */
async function populatePersonFields(personId, profileData, organizationId = null) {
  const fields = await findPersonFields();
  const results = [];

  // LinkedIn URL
  if (fields.linkedin && profileData.linkedinUrl) {
    const result = await addFieldValue(fields.linkedin.id, personId, profileData.linkedinUrl);
    if (result) results.push({ field: 'linkedin', success: true });
  } else {
  }

  // LinkedIn Profile Headline
  if (fields.headline && profileData.headline) {
    const result = await addFieldValue(fields.headline.id, personId, profileData.headline);
    if (result) results.push({ field: 'headline', success: true });
  } else {
  }

  // Job Title
  if (fields.title && profileData.title) {
    const result = await addFieldValue(fields.title.id, personId, profileData.title);
    if (result) results.push({ field: 'title', success: true });
  } else {
  }

  // Location
  if (fields.location && profileData.location) {
    const result = await addFieldValue(fields.location.id, personId, profileData.location);
    if (result) results.push({ field: 'location', success: true });
  } else {
  }

  // Bio/About
  if (fields.bio && profileData.about) {
    // Truncate if too long
    const bio = profileData.about.length > 2000
      ? profileData.about.substring(0, 2000) + '...'
      : profileData.about;
    const result = await addFieldValue(fields.bio.id, personId, bio);
    if (result) results.push({ field: 'bio', success: true });
  } else {
  }

  // Source (set to LinkedIn)
  if (fields.source) {
    // For dropdown fields, we'd need to find the right option
    // For text fields, just set "LinkedIn"
    if (fields.source.value_type === 6) {
      const result = await addFieldValue(fields.source.id, personId, 'LinkedIn');
      if (result) results.push({ field: 'source', success: true });
    }
  }

  // Current Organization (Organization reference field)
  if (fields.currentOrganization && organizationId) {
    const result = await addFieldValue(fields.currentOrganization.id, personId, organizationId);
    if (result) results.push({ field: 'currentOrganization', success: true });
  }

  console.log('[LinkedIn to Affinity] Populated fields:', results);
  return results;
}

/**
 * Create a new person in Affinity with full profile data
 */
async function createPerson(personData) {
  // Enrich data by fetching the actual LinkedIn profile
  let enrichedData = { ...personData };

  if (personData.linkedinUrl) {
    const profileData = await fetchLinkedInProfile(personData.linkedinUrl);
    // Debug log removed

    if (profileData) {

      // Merge profile data, preferring fetched data over parsed headline data
      enrichedData = {
        ...personData,
        name: profileData.name || personData.name,
        firstName: profileData.firstName || personData.firstName,
        lastName: profileData.lastName || personData.lastName,
        title: profileData.title || personData.title,
        company: profileData.company || personData.company,
        headline: profileData.headline || personData.headline,
        location: profileData.location || personData.location,
        about: profileData.about,
        profileImageUrl: profileData.profileImageUrl || personData.profileImageUrl
      };
    } else {
      console.log('[LinkedIn to Affinity] No profile data extracted, using sender data only');
    }
  }

  // Build the person payload
  const payload = {
    first_name: enrichedData.firstName || enrichedData.name?.split(' ')[0] || 'Unknown',
    last_name: enrichedData.lastName || enrichedData.name?.split(' ').slice(1).join(' ') || '',
    emails: [] // LinkedIn doesn't expose emails
  };

  // Find or create organization if company name is available
  let currentOrgId = null;
  if (enrichedData.company) {
    console.log('[LinkedIn to Affinity] Looking for organization:', enrichedData.company);
    const org = await findOrCreateOrganization(enrichedData.company);
    console.log('[LinkedIn to Affinity] Organization result:', org);
    if (org && org.id) {
      payload.organization_ids = [org.id];
      currentOrgId = org.id;
      console.log('[LinkedIn to Affinity] Linking person to organization:', org.id, org.name);
    }
  } else {
    console.log('[LinkedIn to Affinity] No company name available for organization linking');
  }

  // Create the person
  const person = await affinityRequest('/persons', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  console.log('[LinkedIn to Affinity] Created person:', person.id, payload.first_name, payload.last_name);

  // Populate all matching custom fields (including Current Organization)
  if (person.id) {
    await populatePersonFields(person.id, enrichedData, currentOrgId);
  }

  // Return enriched person data
  return {
    ...person,
    _enrichment: {
      company: enrichedData.company,
      title: enrichedData.title,
      linkedinUrl: enrichedData.linkedinUrl,
      location: enrichedData.location,
      about: enrichedData.about
    }
  };
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
 * Note: Profile data (title, company, location, etc.) is now stored in Affinity fields,
 * so the note only contains the conversation and any user-added context.
 */
function formatConversationNote(data) {
  const { sender, messages, conversationUrl, capturedAt, quickNote } = data;

  let note = `## LinkedIn Conversation\n\n`;

  // Add quick note at the top if provided
  if (quickNote) {
    note += `> **${quickNote}**\n\n`;
  }

  // Basic reference info
  note += `**With:** ${sender.name || 'Unknown'}\n`;
  note += `**Date:** ${new Date(capturedAt).toLocaleString()}\n`;
  note += `**Source:** ${conversationUrl}\n\n`;

  // Messages section
  if (messages && messages.length > 0) {
    note += `---\n\n`;

    messages.forEach((msg) => {
      const direction = msg.isIncoming ? '← Incoming' : '→ Outgoing';
      const timestamp = msg.timestamp ? ` (${msg.timestamp})` : '';
      note += `**${msg.sender || direction}**${timestamp}:\n`;
      note += `${msg.content}\n\n`;
    });
  }

  return note;
}

/**
 * Get notes for a person from Affinity
 */
async function getNotesForPerson(personId) {
  try {
    const result = await affinityRequest(`/notes?person_id=${personId}`);
    return result.notes || result || [];
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error getting notes:', error);
    return [];
  }
}

/**
 * Check if a conversation has already been sent to Affinity and extract existing messages
 */
async function checkDuplicateAndGetExistingMessages(conversationUrl, personId) {
  try {
    // Get notes for this person from Affinity
    const notes = await getNotesForPerson(personId);
    const existingMessageContents = new Set();
    let latestNoteDate = null;
    let foundConversation = false;

    console.log('[LinkedIn to Affinity] Checking duplicates - personId:', personId, 'notes found:', notes.length, 'looking for URL:', conversationUrl);

    // Check all notes for this conversation URL and extract message contents
    for (const note of notes) {
      if (note.content && note.content.includes(conversationUrl)) {
        foundConversation = true;
        console.log('[LinkedIn to Affinity] Found matching note:', note.id);

        // Track the latest note date
        if (note.created_at) {
          const noteDate = new Date(note.created_at);
          if (!latestNoteDate || noteDate > latestNoteDate) {
            latestNoteDate = noteDate;
          }
        }

        // Extract message contents from the note to avoid re-sending
        // Find the part after "---" which contains the messages
        const separatorIdx = note.content.indexOf('---');
        if (separatorIdx > 0) {
          const messageSection = note.content.substring(separatorIdx);

          // Pattern: ):\n\n followed by content (timestamp ends with ): then double newline)
          const messagePattern = /\):\n+([^\n]+)/g;
          let match;

          while ((match = messagePattern.exec(messageSection)) !== null) {
            const content = match[1].trim();
            if (content && content !== '_No messages extracted_' && content !== '---') {
              existingMessageContents.add(content);
              console.log('[LinkedIn to Affinity] Found existing message:', content.substring(0, 50));
            }
          }
        }
      }
    }

    console.log('[LinkedIn to Affinity] Duplicate check result:', { isDuplicate: foundConversation, existingMessages: existingMessageContents.size });

    return {
      isDuplicate: foundConversation,
      sentAt: latestNoteDate?.toISOString() || null,
      existingMessageContents: existingMessageContents
    };
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error checking duplicate:', error);
    // On error, allow sending (fail open)
    return { isDuplicate: false, existingMessageContents: new Set() };
  }
}

/**
 * Filter out messages that have already been sent
 */
function filterNewMessages(messages, existingMessageContents) {
  if (!existingMessageContents || existingMessageContents.size === 0) {
    return messages;
  }

  console.log('[LinkedIn to Affinity] Existing messages in set:', Array.from(existingMessageContents));

  return messages.filter(msg => {
    const content = msg.content?.trim();
    const isExisting = existingMessageContents.has(content);
    console.log('[LinkedIn to Affinity] Checking message:', JSON.stringify(content), 'exists:', isExisting);
    return content && !isExisting;
  });
}

/**
 * Main handler: Process LinkedIn conversation and send to Affinity
 * Always returns matches for user selection (never auto-sends)
 */
async function sendToAffinity(data) {
  const { sender } = data;

  // Step 1: Search for existing persons
  let existingPersons = [];

  if (sender.name) {
    existingPersons = await searchPerson(sender.name);
    console.log('[LinkedIn to Affinity] Found matches:', existingPersons.length);
  }

  // Always return for user selection (even with 0 or 1 match)
  // This lets user confirm where to send or create new contact
  return {
    success: false,
    needsSelection: true,
    matches: existingPersons.slice(0, 10), // Limit to 10 matches
    conversationData: data
  };
}

/**
 * Send conversation to a specific person (after user selection)
 * @param {boolean} forceSend - If true, skip duplicate check
 */
async function sendToAffinityWithPerson(personId, conversationData, forceSend = false) {
  console.log('[LinkedIn to Affinity] sendToAffinityWithPerson - personId:', personId, 'forceSend:', forceSend);

  // Check for duplicate (unless force sending)
  // Check for existing messages and filter out already-sent ones
  const duplicateCheck = await checkDuplicateAndGetExistingMessages(conversationData.conversationUrl, personId);

  // Filter to only new messages
  const originalMessages = conversationData.messages || [];
  const newMessages = filterNewMessages(originalMessages, duplicateCheck.existingMessageContents);

  console.log('[LinkedIn to Affinity] Message filtering - original:', originalMessages.length, 'new:', newMessages.length, 'isDuplicate:', duplicateCheck.isDuplicate);

  // If no new messages and not force sending, show duplicate warning
  if (!forceSend && newMessages.length === 0 && duplicateCheck.isDuplicate) {
    console.log('[LinkedIn to Affinity] Returning duplicate warning');
    const dateStr = duplicateCheck.sentAt
      ? new Date(duplicateCheck.sentAt).toLocaleDateString()
      : 'a previous date';
    return {
      success: false,
      isDuplicate: true,
      sentAt: duplicateCheck.sentAt,
      personId: personId,
      error: `All messages were already sent on ${dateStr}`
    };
  }

  // If no new messages at all (even for new conversation), don't send empty note
  if (newMessages.length === 0 && originalMessages.length === 0) {
    // Still allow sending contact info without messages
  }

  // Create note with only new messages
  const dataWithNewMessages = {
    ...conversationData,
    messages: newMessages
  };

  const noteContent = formatConversationNote(dataWithNewMessages);
  const note = await addNote(personId, noteContent);
  console.log('[LinkedIn to Affinity] Added note with', newMessages.length, 'new message(s)');

  return {
    success: true,
    personId: personId,
    noteId: note.id,
    isNewPerson: false,
    newMessageCount: newMessages.length
  };
}

/**
 * Create a new person and send conversation to them
 */
async function createPersonAndSend(senderData, conversationData) {
  console.log('[LinkedIn to Affinity] Creating person with sender data - name:', senderData.name,
    '| headline:', senderData.headline,
    '| company:', senderData.company,
    '| linkedinUrl:', senderData.linkedinUrl);
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
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[LinkedIn to Affinity] Received message:', request.action);

  if (request.action === 'sendToAffinity') {
    sendToAffinity(request.data)
      .then((result) => {
        console.log('[LinkedIn to Affinity] sendToAffinity result:', result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[LinkedIn to Affinity] Error:', error);
        sendResponse({
          success: false,
          error: error.message || 'Unknown error'
        });
      });

    // Return true to indicate async response
    return true;
  }

  if (request.action === 'sendToAffinityWithPerson') {
    // Send to a specific person (after user selection from modal)
    sendToAffinityWithPerson(request.personId, request.conversationData, request.forceSend || false)
      .then((result) => {
        console.log('[LinkedIn to Affinity] sendToAffinityWithPerson result:', result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[LinkedIn to Affinity] Error:', error);
        sendResponse({
          success: false,
          error: error.message || 'Unknown error'
        });
      });

    return true;
  }

  if (request.action === 'createPersonAndSend') {
    // Create new person and send (when user chooses "Create New" from modal)
    createPersonAndSend(request.senderData, request.conversationData)
      .then((result) => {
        console.log('[LinkedIn to Affinity] createPersonAndSend result:', result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[LinkedIn to Affinity] Error:', error);
        sendResponse({
          success: false,
          error: error.message || 'Unknown error'
        });
      });

    return true;
  }

  if (request.action === 'testConnection') {
    // Test API connection
    affinityRequest('/whoami')
      .then((result) => {
        console.log('[LinkedIn to Affinity] testConnection result:', result);
        sendResponse({ success: true, user: result });
      })
      .catch((error) => {
        console.error('[LinkedIn to Affinity] testConnection error:', error);
        sendResponse({ success: false, error: error.message || 'Unknown error' });
      });

    return true;
  }

  // Unknown action
  console.warn('[LinkedIn to Affinity] Unknown action:', request.action);
  return false;
});

/**
 * Handle keyboard command
 */
if (browserAPI.commands && browserAPI.commands.onCommand) {
  browserAPI.commands.onCommand.addListener((command) => {
    if (command === 'send-to-affinity') {
      // Send message to active tab's content script
      browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          browserAPI.tabs.sendMessage(tabs[0].id, { action: 'triggerSend' });
        }
      });
    }
  });
}

console.log('[LinkedIn to Affinity] Background service worker loaded');

// Export for testing (Node.js/Jest environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatConversationNote,
    filterNewMessages,
    getApiKey,
    affinityRequest,
    searchPerson,
    searchOrganization,
    createOrganization,
    findOrCreateOrganization,
    fetchLinkedInProfile,
    parseLinkedInProfileHtml,
    parseHeadlineForProfile,
    findPersonFields,
    populatePersonFields,
    resetCaches,
    createPerson,
    addNote,
    getNotesForPerson,
    checkDuplicateAndGetExistingMessages,
    sendToAffinity,
    sendToAffinityWithPerson,
    createPersonAndSend
  };
}
