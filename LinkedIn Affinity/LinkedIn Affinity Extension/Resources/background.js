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
 * Create a new field definition in Affinity
 * @param {string} name - Field name
 * @param {number} entityType - 0=Person, 1=Organization, 2=Opportunity
 * @param {number} valueType - 0=Person, 1=Org, 2=Dropdown, 3=Number, 4=Date, 5=Location, 6=Text
 */
async function createField(name, entityType, valueType) {
  try {
    const payload = {
      name: name,
      entity_type: entityType,
      value_type: valueType
    };

    console.log('[LinkedIn to Affinity] Creating field:', payload);
    const result = await affinityRequest('/fields', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    console.log('[LinkedIn to Affinity] Field created:', result);
    return result;
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error creating field:', error);
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
  // value_type: 0 = Person, 1 = Organization, 2 = Dropdown, 3 = Number, 4 = Date, 5 = Location, 6 = Text, 7 = Ranked Dropdown
  fieldsCache = {
    // LinkedIn URL - Text field (value_type 6)
    linkedin: personFields.find(f =>
      (f.name?.toLowerCase() === 'linkedin url' ||
       f.name?.toLowerCase() === 'linkedin profile url' ||
       f.name?.toLowerCase() === 'linkedin') &&
      f.value_type === 6
    ),
    // Headline - Text field (value_type 6)
    headline: personFields.find(f =>
      (f.name?.toLowerCase() === 'linkedin profile headline' ||
       f.name?.toLowerCase() === 'headline' ||
       f.name?.toLowerCase() === 'profile headline') &&
      f.value_type === 6
    ),
    // Current Job Title - Text (6) or Dropdown (2)
    currentJobTitle: personFields.find(f =>
      (f.name?.toLowerCase() === 'current job title' ||
       f.name?.toLowerCase() === 'job title' ||
       f.name?.toLowerCase() === 'current title' ||
       f.name?.toLowerCase() === 'title' ||
       f.name?.toLowerCase() === 'position' ||
       f.name?.toLowerCase() === 'role') &&
      (f.value_type === 6 || f.value_type === 2)
    ),
    // Job Titles - Text (6) or Dropdown (2)
    jobTitles: personFields.find(f =>
      (f.name?.toLowerCase() === 'job titles' ||
       f.name?.toLowerCase() === 'all job titles' ||
       f.name?.toLowerCase() === 'past titles' ||
       f.name?.toLowerCase() === 'positions') &&
      (f.value_type === 6 || f.value_type === 2)
    ),
    // Location - Text or Location field (value_type 5 or 6)
    location: personFields.find(f =>
      (f.name?.toLowerCase() === 'location' ||
       f.name?.toLowerCase() === 'city' ||
       f.name?.toLowerCase() === 'region' ||
       f.name?.toLowerCase() === 'address') &&
      (f.value_type === 5 || f.value_type === 6)
    ),
    // Industry - Text or Dropdown field (value_type 2 or 6)
    industry: personFields.find(f =>
      (f.name?.toLowerCase() === 'industry' ||
       f.name?.toLowerCase() === 'sector') &&
      (f.value_type === 2 || f.value_type === 6)
    ),
    // Phone Number - Text field (value_type 6)
    phone: personFields.find(f =>
      (f.name?.toLowerCase() === 'phone number' ||
       f.name?.toLowerCase() === 'phone' ||
       f.name?.toLowerCase() === 'mobile' ||
       f.name?.toLowerCase() === 'cell') &&
      f.value_type === 6
    ),
    // Bio/About - Text field (value_type 6)
    bio: personFields.find(f =>
      (f.name?.toLowerCase() === 'bio' ||
       f.name?.toLowerCase() === 'about' ||
       f.name?.toLowerCase() === 'summary' ||
       f.name?.toLowerCase() === 'description' ||
       f.name?.toLowerCase() === 'notes') &&
      f.value_type === 6
    ),
    // Source of Introduction - Dropdown field (value_type 2)
    sourceOfIntroduction: personFields.find(f =>
      (f.name?.toLowerCase() === 'source of introduction' ||
       f.name?.toLowerCase() === 'introduction source' ||
       f.name?.toLowerCase() === 'source') &&
      f.value_type === 2 // Dropdown type
    ),
    // Fallback: Source as text field
    sourceText: personFields.find(f =>
      (f.name?.toLowerCase() === 'source' ||
       f.name?.toLowerCase() === 'lead source' ||
       f.name?.toLowerCase() === 'how we met') &&
      f.value_type === 6 // Text type
    ),
    // Contact Type / Relationship Type - Dropdown (2) or Text (6)
    contactType: personFields.find(f =>
      (f.name?.toLowerCase() === 'contact type' ||
       f.name?.toLowerCase() === 'relationship type' ||
       f.name?.toLowerCase() === 'type' ||
       f.name?.toLowerCase() === 'category' ||
       f.name?.toLowerCase() === 'tag' ||
       f.name?.toLowerCase() === 'tags') &&
      (f.value_type === 2 || f.value_type === 6)
    ),
    // Note: "Current Organization" is an Affinity Data enrichment field
    // and cannot be set via API - it's auto-populated by Affinity's system
    _all: personFields
  };

  console.log('[LinkedIn to Affinity] Found person fields:', {
    linkedin: fieldsCache.linkedin?.name,
    headline: fieldsCache.headline?.name,
    currentJobTitle: fieldsCache.currentJobTitle?.name,
    jobTitles: fieldsCache.jobTitles?.name,
    location: fieldsCache.location?.name,
    industry: fieldsCache.industry?.name,
    phone: fieldsCache.phone?.name,
    sourceOfIntroduction: fieldsCache.sourceOfIntroduction?.name,
    sourceText: fieldsCache.sourceText?.name,
    contactType: fieldsCache.contactType?.name,
    totalFields: personFields.length
  });

  return fieldsCache;
}

/**
 * Find dropdown option ID by name (case-insensitive) with fuzzy matching
 */
function findDropdownOption(field, optionName) {
  if (!field || !field.dropdown_options || !field.dropdown_options.length || !optionName) return null;

  const lowerName = optionName.toLowerCase().trim();
  const options = field.dropdown_options;

  // 1. Exact match
  let option = options.find(opt => opt.text?.toLowerCase().trim() === lowerName);
  if (option) return option.id;

  // 2. Contains match (option contains search term or vice versa)
  option = options.find(opt => {
    const optText = opt.text?.toLowerCase().trim();
    return optText?.includes(lowerName) || lowerName.includes(optText);
  });
  if (option) return option.id;

  // 3. Fuzzy match - find best similarity score
  let bestMatch = null;
  let bestScore = 0;

  for (const opt of options) {
    const optText = opt.text?.toLowerCase().trim();
    if (!optText) continue;

    const score = calculateSimilarity(lowerName, optText);
    if (score > bestScore && score > 0.4) { // Minimum 40% similarity threshold
      bestScore = score;
      bestMatch = opt;
    }
  }

  if (bestMatch) {
    console.log(`[LinkedIn to Affinity] Fuzzy matched "${optionName}" to "${bestMatch.text}" (${Math.round(bestScore * 100)}% match)`);
    return bestMatch.id;
  }

  return null;
}

/**
 * Calculate similarity between two strings (0-1 score)
 * Uses a combination of word overlap and character-level comparison
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  // Word-based similarity
  const words1 = str1.split(/\s+/).filter(w => w.length > 2);
  const words2 = str2.split(/\s+/).filter(w => w.length > 2);

  let wordMatches = 0;
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
        wordMatches++;
        break;
      }
    }
  }

  const wordScore = words1.length > 0 ? wordMatches / Math.max(words1.length, words2.length) : 0;

  // Character-level similarity (Dice coefficient)
  const bigrams1 = getBigrams(str1);
  const bigrams2 = getBigrams(str2);

  let matches = 0;
  for (const bg of bigrams1) {
    if (bigrams2.has(bg)) matches++;
  }

  const charScore = bigrams1.size + bigrams2.size > 0
    ? (2 * matches) / (bigrams1.size + bigrams2.size)
    : 0;

  // Combined score (weight word matches more heavily)
  return (wordScore * 0.6) + (charScore * 0.4);
}

/**
 * Get bigrams (2-character sequences) from a string
 */
function getBigrams(str) {
  const bigrams = new Set();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.substring(i, i + 2));
  }
  return bigrams;
}

/**
 * Populate all matching fields for a person
 * @param {number} personId - The Affinity person ID
 * @param {object} profileData - Profile data including linkedinUrl, headline, etc.
 * @param {boolean} isNewPerson - Whether this is a newly created person
 * @param {array} tags - Optional array of contact type tags (e.g., ["Founder", "LP"])
 */
async function populatePersonFields(personId, profileData, isNewPerson = true, tags = []) {
  const fields = await findPersonFields();
  const fieldPromises = [];

  // LinkedIn URL
  if (fields.linkedin && profileData.linkedinUrl) {
    fieldPromises.push(
      addFieldValue(fields.linkedin.id, personId, profileData.linkedinUrl)
        .then(result => result ? { field: 'linkedin', success: true } : null)
        .catch(() => null)
    );
  }

  // LinkedIn Profile Headline
  if (fields.headline && profileData.headline) {
    fieldPromises.push(
      addFieldValue(fields.headline.id, personId, profileData.headline)
        .then(result => result ? { field: 'headline', success: true } : null)
        .catch(() => null)
    );
  }

  // Current Job Title (prefer currentJobTitle, fall back to title)
  // Note: Affinity dropdown fields accept any text value directly
  const currentTitle = profileData.currentJobTitle || profileData.title;
  if (fields.currentJobTitle && currentTitle) {
    fieldPromises.push(
      addFieldValue(fields.currentJobTitle.id, personId, currentTitle)
        .then(result => result ? { field: 'currentJobTitle', success: true } : null)
        .catch(() => null)
    );
  }

  // All Job Titles - concatenate all titles
  // Note: Affinity dropdown fields accept any text value directly
  if (fields.jobTitles && profileData.allJobTitles && profileData.allJobTitles.length > 0) {
    const titlesText = profileData.allJobTitles.join(', ');
    fieldPromises.push(
      addFieldValue(fields.jobTitles.id, personId, titlesText)
        .then(result => result ? { field: 'jobTitles', success: true } : null)
        .catch(() => null)
    );
  }

  // Location - handle both text (type 6) and location (type 5) field types
  if (fields.location && profileData.location) {
    if (fields.location.value_type === 6) {
      // Text field - just set the string
      fieldPromises.push(
        addFieldValue(fields.location.id, personId, profileData.location)
          .then(result => result ? { field: 'location', success: true } : null)
          .catch(() => null)
      );
    } else if (fields.location.value_type === 5) {
      // Location field type - requires structured data
      fieldPromises.push(
        addFieldValue(fields.location.id, personId, { city: profileData.location, country: null })
          .then(result => result ? { field: 'location', success: true } : null)
          .catch(() => {
            console.log('[LinkedIn to Affinity] Location field requires structured data, skipping:', profileData.location);
            return null;
          })
      );
    }
  }

  // Industry
  // Note: Affinity dropdown fields accept any text value directly
  if (fields.industry && profileData.industry) {
    fieldPromises.push(
      addFieldValue(fields.industry.id, personId, profileData.industry)
        .then(result => result ? { field: 'industry', success: true } : null)
        .catch(() => null)
    );
  }

  // Phone Number (if available - usually not from LinkedIn)
  if (fields.phone && profileData.phone) {
    fieldPromises.push(
      addFieldValue(fields.phone.id, personId, profileData.phone)
        .then(result => result ? { field: 'phone', success: true } : null)
        .catch(() => null)
    );
  }

  // Bio/About
  if (fields.bio && profileData.about) {
    // Truncate if too long
    const bio = profileData.about.length > 2000
      ? profileData.about.substring(0, 2000) + '...'
      : profileData.about;
    fieldPromises.push(
      addFieldValue(fields.bio.id, personId, bio)
        .then(result => result ? { field: 'bio', success: true } : null)
        .catch(() => null)
    );
  }

  // Source of Introduction (only for new persons)
  if (isNewPerson) {
    // Try dropdown field first
    if (fields.sourceOfIntroduction) {
      const optionId = findDropdownOption(fields.sourceOfIntroduction, 'LinkedIn');
      if (optionId) {
        fieldPromises.push(
          addFieldValue(fields.sourceOfIntroduction.id, personId, optionId)
            .then(result => result ? { field: 'sourceOfIntroduction', success: true } : null)
            .catch(() => null)
        );
      } else {
        console.log('[LinkedIn to Affinity] LinkedIn option not found in Source of Introduction dropdown');
        console.log('[LinkedIn to Affinity] Available options:', fields.sourceOfIntroduction.dropdown_options?.map(o => o.text));
      }
    }
    // Fallback to text field
    else if (fields.sourceText) {
      fieldPromises.push(
        addFieldValue(fields.sourceText.id, personId, 'LinkedIn')
          .then(result => result ? { field: 'sourceText', success: true } : null)
          .catch(() => null)
      );
    }
  }

  // Note: "Current Organization" is an Affinity Data enrichment field
  // and cannot be set via API - enable Affinity Data enrichment in settings

  // Contact Type / Tags (from VC workflow)
  if (tags && tags.length > 0) {
    const tagsValue = tags.join(', ');
    let contactTypeField = fields.contactType;

    // Auto-create "Contact Type" field if it doesn't exist
    if (!contactTypeField) {
      console.log('[LinkedIn to Affinity] Contact Type field not found, creating it...');
      const newField = await createField('Contact Type', 0, 6); // 0=Person, 6=Text
      if (newField && newField.id) {
        contactTypeField = newField;
        // Clear cache so it's picked up next time
        fieldsCache = null;
        console.log('[LinkedIn to Affinity] Created Contact Type field:', newField.id);
      }
    }

    if (contactTypeField) {
      fieldPromises.push(
        addFieldValue(contactTypeField.id, personId, tagsValue)
          .then(result => {
            if (result) {
              console.log('[LinkedIn to Affinity] Tags saved to field:', contactTypeField.name, '=', tagsValue);
              return { field: 'contactType', success: true, value: tagsValue };
            }
            return null;
          })
          .catch((err) => {
            console.error('[LinkedIn to Affinity] Error saving tags:', err);
            return null;
          })
      );
    } else {
      console.log('[LinkedIn to Affinity] Could not create Contact Type field. Tags will only appear in notes.');
    }
  }

  // Run all field updates in parallel for speed
  const allResults = await Promise.all(fieldPromises);
  const results = allResults.filter(r => r !== null);

  console.log('[LinkedIn to Affinity] Populated fields:', results);
  return results;
}

/**
 * Create a new person in Affinity with full profile data
 */
async function createPerson(personData, tags = []) {
  // Enrich data by fetching the actual LinkedIn profile
  let enrichedData = { ...personData };

  if (personData.linkedinUrl) {
    const profileData = await fetchLinkedInProfile(personData.linkedinUrl);
    // Debug log removed

    if (profileData) {

      // Merge profile data, preferring fetched data over parsed headline data
      // Note: Voyager API data (allCompanies, allJobTitles, currentJobTitle, industry)
      // comes from personData via content.js
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
        profileImageUrl: profileData.profileImageUrl || personData.profileImageUrl,
        // Voyager API data from content.js (keep as-is)
        allCompanies: personData.allCompanies,
        allJobTitles: personData.allJobTitles,
        currentJobTitle: personData.currentJobTitle,
        industry: personData.industry
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

  // Find or create organizations for all companies in work history
  const organizationIds = [];

  // Check if we have allCompanies from Voyager API (full work history)
  if (enrichedData.allCompanies && enrichedData.allCompanies.length > 0) {
    console.log('[LinkedIn to Affinity] Linking', enrichedData.allCompanies.length, 'organizations from work history (parallel)');

    // Parallelize organization lookups for faster processing
    const companiesToLink = enrichedData.allCompanies.filter(c => c.name);
    const orgPromises = companiesToLink.map(company =>
      findOrCreateOrganization(company.name)
        .then(org => ({ org, company }))
        .catch(error => {
          console.log('[LinkedIn to Affinity] Could not link organization:', company.name, error.message);
          return null;
        })
    );

    const orgResults = await Promise.all(orgPromises);
    for (const result of orgResults) {
      if (result && result.org && result.org.id && !organizationIds.includes(result.org.id)) {
        organizationIds.push(result.org.id);
        console.log('[LinkedIn to Affinity] Linked organization:', result.org.id, result.company.name, result.company.isCurrent ? '(current)' : '(past)');
      }
    }
  } else if (enrichedData.company) {
    // Fallback: use single company from headline
    console.log('[LinkedIn to Affinity] Looking for organization:', enrichedData.company);
    const org = await findOrCreateOrganization(enrichedData.company);
    if (org && org.id) {
      organizationIds.push(org.id);
      console.log('[LinkedIn to Affinity] Linking person to organization:', org.id, org.name);
    }
  } else {
    console.log('[LinkedIn to Affinity] No company name available for organization linking');
  }

  if (organizationIds.length > 0) {
    payload.organization_ids = organizationIds;
  }

  // Create the person
  const person = await affinityRequest('/persons', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  console.log('[LinkedIn to Affinity] Created person:', person.id, payload.first_name, payload.last_name);

  // Populate all matching custom fields (isNewPerson=true to set Source of Introduction)
  if (person.id) {
    await populatePersonFields(person.id, enrichedData, true, tags);
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
 * Update an existing note in Affinity
 */
async function updateNote(noteId, content) {
  const payload = {
    content: content
  };

  const result = await affinityRequest(`/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

  return result;
}

/**
 * Parse a message timestamp and extract the day key (YYYY-MM-DD)
 * Handles various timestamp formats from LinkedIn
 */
function parseMessageDay(message) {
  // Handle null/undefined
  if (!message) return null;

  // If message has pre-parsed date from content.js, use it
  if (typeof message === 'object' && message.date) {
    return message.date;
  }

  // Handle string timestamp (backwards compatibility)
  const timestamp = typeof message === 'object' ? message.timestamp : message;
  if (!timestamp) return null;

  const currentYear = new Date().getFullYear();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const lowerTimestamp = timestamp.toLowerCase();

  // Handle relative timestamps
  if (lowerTimestamp.includes('today') || lowerTimestamp.includes('hour') ||
      lowerTimestamp.includes('minute') || lowerTimestamp.includes('just now')) {
    return today;
  }

  if (lowerTimestamp.includes('yesterday')) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  // Days ago
  const daysAgoMatch = lowerTimestamp.match(/(\d+)\s*days?\s*ago/);
  if (daysAgoMatch) {
    const date = new Date(now);
    date.setDate(date.getDate() - parseInt(daysAgoMatch[1], 10));
    return date.toISOString().split('T')[0];
  }

  // Weeks ago
  const weeksAgoMatch = lowerTimestamp.match(/(\d+)\s*weeks?\s*ago/);
  if (weeksAgoMatch) {
    const date = new Date(now);
    date.setDate(date.getDate() - (parseInt(weeksAgoMatch[1], 10) * 7));
    return date.toISOString().split('T')[0];
  }

  // Check if this looks like a timestamp without a year (e.g., "Jan 15, 10:30 AM")
  const hasExplicitYear = /\b20\d{2}\b/.test(timestamp);

  if (!hasExplicitYear) {
    // Try to extract month and day, then use current year
    const monthDayMatch = timestamp.match(/([A-Za-z]+)\s+(\d{1,2})/);
    if (monthDayMatch) {
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthIndex = monthNames.indexOf(monthDayMatch[1].toLowerCase().substring(0, 3));
      if (monthIndex !== -1) {
        const day = parseInt(monthDayMatch[2], 10);
        return `${currentYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  // Try standard date parsing for dates with explicit year or ISO format
  const date = new Date(timestamp);

  if (isNaN(date.getTime())) {
    return null;
  }

  // Sanity check: year should be reasonable (2020-2100)
  const parsedYear = date.getFullYear();
  if (parsedYear < 2020 || parsedYear > 2100) {
    return null;
  }

  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Group messages by day
 * Returns a Map of dayKey -> messages array, sorted by date (oldest first)
 */
function groupMessagesByDay(messages) {
  if (!messages || messages.length === 0) return new Map();

  const groups = new Map();

  messages.forEach(msg => {
    // Pass full message object so parseMessageDay can use pre-parsed date
    const dayKey = parseMessageDay(msg) || 'unknown';
    if (!groups.has(dayKey)) {
      groups.set(dayKey, []);
    }
    groups.get(dayKey).push(msg);
  });

  // Sort by day (oldest first) and return
  const sortedEntries = [...groups.entries()].sort((a, b) => {
    if (a[0] === 'unknown') return 1;
    if (b[0] === 'unknown') return -1;
    return a[0].localeCompare(b[0]);
  });

  return new Map(sortedEntries);
}

/**
 * Format day key for display (YYYY-MM-DD -> "Mon, Jan 15, 2024")
 */
function formatDayKeyForDisplay(dayKey) {
  if (dayKey === 'unknown') return 'Unknown Date';

  const date = new Date(dayKey + 'T12:00:00'); // Add time to avoid timezone issues
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format the LinkedIn conversation as a note
 * Minimal Apple-like design: link first, then messages, no redundancy
 */
function formatConversationNote(data) {
  const { sender, messages, conversationUrl, capturedAt, quickNote, tags } = data;

  const senderName = sender?.name || 'Unknown';
  const capturedDate = new Date(capturedAt);
  const dateFormatted = capturedDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const dayKey = capturedDate.toISOString().split('T')[0];

  // Extract thread ID
  const threadIdMatch = conversationUrl.match(/\/(?:thread|conversation)\/([^/?]+)/);
  const threadId = threadIdMatch ? threadIdMatch[1] : '';

  // Build minimal note
  let note = '';

  // Link first
  note += `${conversationUrl}\n`;
  note += `${dateFormatted} · ${dayKey} · ${threadId}\n\n`;

  // Tags inline if present
  if (tags && tags.length > 0) {
    note += `${tags.join(' · ')}\n\n`;
  }

  // Quick note if present
  if (quickNote) {
    note += `> ${quickNote}\n\n`;
  }

  // Messages
  if (messages && messages.length > 0) {
    messages.forEach((msg) => {
      const isIncoming = msg.isIncoming;
      const arrow = isIncoming ? '←' : '→';
      const senderLabel = isIncoming ? senderName.split(' ')[0] : 'You';
      const time = msg.timestampDisplay || msg.timestamp || '';

      const timeStr = time ? ` (${time})` : '';
      note += `${arrow} **${senderLabel}**${timeStr}\n`;
      note += `${msg.content || ''}\n\n`;
    });
  }

  return note;
}

/**
 * Format a day-specific conversation note
 * Minimal Apple-like design: link first, then messages, no redundancy
 */
function formatDayConversationNote(data, dayKey, dayMessages) {
  const { sender, conversationUrl, quickNote, tags } = data;

  const senderName = sender?.name || 'Unknown';

  // Extract thread ID for tracking
  const threadIdMatch = conversationUrl.match(/\/(?:thread|conversation)\/([^/?]+)/);
  const threadId = threadIdMatch ? threadIdMatch[1] : '';

  // Format date compactly
  const dateObj = new Date(dayKey + 'T12:00:00');
  const dateFormatted = dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  // Build minimal note
  let note = '';

  // Link first (explains context without needing a header)
  note += `${conversationUrl}\n`;
  note += `${dateFormatted} · ${dayKey} · ${threadId}\n\n`;

  // Tags inline if present
  if (tags && tags.length > 0) {
    note += `${tags.join(' · ')}\n\n`;
  }

  // Quick note if present (brief)
  if (quickNote) {
    note += `> ${quickNote}\n\n`;
  }

  // Messages - clean and scannable
  if (dayMessages && dayMessages.length > 0) {
    dayMessages.forEach((msg) => {
      const isIncoming = msg.isIncoming;
      const arrow = isIncoming ? '←' : '→';
      const senderLabel = isIncoming ? senderName.split(' ')[0] : 'You';
      const time = msg.timestampDisplay || msg.timestamp || '';

      // Compact: arrow sender (time): message
      const timeStr = time ? ` (${time})` : '';
      note += `${arrow} **${senderLabel}**${timeStr}\n`;
      note += `${msg.content || ''}\n\n`;
    });
  }

  return note;
}

/**
 * Extract existing messages from a note's content
 * Supports both old format (blockquotes) and new minimal format
 */
function extractMessagesFromNote(noteContent) {
  const messages = new Set();

  if (!noteContent) return messages;

  const lines = noteContent.split('\n');
  let currentMessage = '';
  let inMessage = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New format: ← **Name** or → **You**
    if (line.match(/^[←→]\s+\*\*/)) {
      // Save previous message
      if (currentMessage.trim()) {
        messages.add(currentMessage.trim());
      }
      currentMessage = '';
      inMessage = true;
      continue;
    }

    // Old format: **◀︎ or **▶︎
    if (line.startsWith('**◀︎') || line.startsWith('**▶︎')) {
      if (currentMessage.trim()) {
        messages.add(currentMessage.trim());
      }
      currentMessage = '';
      inMessage = true;
      continue;
    }

    // Collect message content
    if (inMessage) {
      // Old format: blockquote lines
      if (line.startsWith('> ')) {
        currentMessage += (currentMessage ? '\n' : '') + line.substring(2);
      }
      // New format: plain text until next message or empty line followed by message header
      else if (line.trim() && !line.startsWith('---') && !line.startsWith('http')) {
        currentMessage += (currentMessage ? '\n' : '') + line;
      }
      // Empty line might end the message
      else if (line.trim() === '' && currentMessage.trim()) {
        // Check if next non-empty line is a message header
        let nextLine = '';
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim()) {
            nextLine = lines[j];
            break;
          }
        }
        if (nextLine.match(/^[←→]\s+\*\*/) || nextLine.startsWith('**◀︎') || nextLine.startsWith('**▶︎')) {
          messages.add(currentMessage.trim());
          currentMessage = '';
        }
      }
    }
  }

  // Don't forget the last message
  if (currentMessage.trim()) {
    messages.add(currentMessage.trim());
  }

  return messages;
}

/**
 * Append messages to an existing note
 * Returns the updated note content (minimal format)
 */
function appendMessagesToNote(existingContent, newMessages, senderName) {
  if (!newMessages || newMessages.length === 0) return existingContent;

  // Format new messages in minimal style
  let appendContent = '';
  newMessages.forEach(msg => {
    const isIncoming = msg.isIncoming;
    const arrow = isIncoming ? '←' : '→';
    const senderLabel = isIncoming ? (senderName || 'Them').split(' ')[0] : 'You';
    const time = msg.timestampDisplay || msg.timestamp || '';

    const timeStr = time ? ` (${time})` : '';
    appendContent += `${arrow} **${senderLabel}**${timeStr}\n`;
    appendContent += `${msg.content || ''}\n\n`;
  });

  // Just append to the end (no complex footer handling needed with minimal format)
  return existingContent.trimEnd() + '\n\n' + appendContent;
}

/**
 * Get notes for a person from Affinity
 */
async function getNotesForPerson(personId) {
  try {
    const result = await affinityRequest(`/notes?person_id=${personId}`);
    const notes = result.notes || result || [];
    console.log('[LinkedIn to Affinity] getNotesForPerson raw result:', JSON.stringify(result).substring(0, 500));
    console.log('[LinkedIn to Affinity] getNotesForPerson notes count:', notes.length);
    if (notes.length > 0) {
      console.log('[LinkedIn to Affinity] First note preview:', notes[0]?.content?.substring(0, 200));
    }
    return notes;
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error getting notes:', error);
    return [];
  }
}

/**
 * Normalize LinkedIn URL for comparison (remove query params, trailing slashes, normalize domain)
 */
function normalizeLinkedInUrl(url) {
  if (!url) return '';
  try {
    // Remove query parameters and hash
    const urlObj = new URL(url);
    let path = urlObj.pathname;
    // Remove trailing slashes
    path = path.replace(/\/+$/, '');
    // Normalize to www.linkedin.com (some URLs might not have www)
    const host = urlObj.host.replace(/^(www\.)?/, 'www.');
    return `https://${host}${path}`;
  } catch (e) {
    // If URL parsing fails, just do basic cleanup
    let cleaned = url.split('?')[0].split('#')[0].replace(/\/+$/, '');
    // Normalize www
    cleaned = cleaned.replace(/https?:\/\/(www\.)?linkedin\.com/, 'https://www.linkedin.com');
    return cleaned;
  }
}

/**
 * Extract thread ID from LinkedIn messaging URL
 */
function extractThreadId(url) {
  if (!url) return null;
  const match = url.match(/\/(?:thread|conversation)\/([^/?]+)/);
  return match ? match[1] : null;
}

/**
 * Check if a conversation has already been sent to Affinity and extract existing messages
 * Returns notes grouped by day for the day-based workflow
 */
async function checkDuplicateAndGetExistingMessages(conversationUrl, personId) {
  try {
    // Get notes for this person from Affinity
    const notes = await getNotesForPerson(personId);
    const existingMessageContents = new Set();
    const notesByDay = new Map(); // dayKey -> { noteId, content, messages }
    let latestNoteDate = null;
    let foundConversation = false;

    // Normalize URL for comparison (LinkedIn URLs can have varying query params)
    const normalizedUrl = normalizeLinkedInUrl(conversationUrl);
    // Also extract thread ID for more robust matching
    const threadId = extractThreadId(conversationUrl);

    console.log('[LinkedIn to Affinity] Checking duplicates - personId:', personId, 'notes found:', notes.length);
    console.log('[LinkedIn to Affinity] Looking for URL:', normalizedUrl, 'threadId:', threadId);

    // Check all notes for this conversation URL and extract message contents
    for (const note of notes) {
      if (!note.content) {
        console.log('[LinkedIn to Affinity] Note has no content, skipping:', note.id);
        continue;
      }

      // Check for URL match (normalized) or thread ID match or day marker
      // Support both http and https, with or without www
      const noteNormalizedUrls = note.content.match(/https?:\/\/(?:www\.)?linkedin\.com\/messaging\/[^\s)>\]]+/g) || [];

      // Look for day marker in new minimal format (second line): "Jan 15, 2024 · 2024-01-15 · threadId"
      const newDayMarkerMatch = note.content.match(/\n[A-Za-z]+ \d+, \d{4} · (\d{4}-\d{2}-\d{2}) · ([^\n]+)/);
      // Also support old emoji format: 📆 *Day: YYYY-MM-DD | Thread: xxx*
      const emojiDayMarkerMatch = note.content.match(/📆 \*Day: (\d{4}-\d{2}-\d{2}) \| Thread: ([^*]+)\*/);
      // Also support old HTML comment format for backwards compatibility
      const oldDayMarkerMatch = note.content.match(/<!-- day:(\d{4}-\d{2}-\d{2}) thread:([^\s]+) -->/);
      const effectiveDayMarker = newDayMarkerMatch || emojiDayMarkerMatch || oldDayMarkerMatch;

      const urlMatches = noteNormalizedUrls.some(noteUrl => {
        const normalizedNoteUrl = normalizeLinkedInUrl(noteUrl);
        return normalizedNoteUrl === normalizedUrl;
      });

      // Also check thread ID as fallback (more robust matching)
      const threadIdMatches = threadId && (
        note.content.includes(threadId) ||
        (effectiveDayMarker && effectiveDayMarker[2].includes(threadId))
      );

      if (urlMatches || threadIdMatches) {
        foundConversation = true;
        console.log('[LinkedIn to Affinity] Found matching note:', note.id, 'urlMatches:', urlMatches, 'threadIdMatches:', threadIdMatches);

        // Track the latest note date
        if (note.created_at) {
          const noteDate = new Date(note.created_at);
          if (!latestNoteDate || noteDate > latestNoteDate) {
            latestNoteDate = noteDate;
          }
        }

        // Extract day key from note (from day marker or created_at)
        let dayKey = null;
        if (effectiveDayMarker) {
          dayKey = effectiveDayMarker[1];
          console.log('[LinkedIn to Affinity] Found day marker in note:', dayKey);
        } else if (note.created_at) {
          dayKey = note.created_at.split('T')[0];
          console.log('[LinkedIn to Affinity] Using created_at date for note:', dayKey);
        }

        // Extract messages from this note using the new format
        const noteMessages = extractMessagesFromNote(note.content);

        // Add to notesByDay map
        if (dayKey) {
          notesByDay.set(dayKey, {
            noteId: note.id,
            content: note.content,
            messages: noteMessages
          });
          console.log('[LinkedIn to Affinity] Note', note.id, 'is for day:', dayKey, 'with', noteMessages.size, 'messages');
        }

        // Also add to global existing messages set (for backwards compatibility)
        noteMessages.forEach(msg => existingMessageContents.add(msg));

        // Fallback: also try old format extraction
        const separatorIdx = note.content.indexOf('---');
        if (separatorIdx > 0) {
          const messageSection = note.content.substring(separatorIdx);
          const messagePattern = /\):\n+([^\n]+)/g;
          let match;
          while ((match = messagePattern.exec(messageSection)) !== null) {
            const content = match[1].trim();
            if (content && content !== '_No messages extracted_' && content !== '---' && !content.startsWith('>')) {
              existingMessageContents.add(content);
            }
          }
        }
      }
    }

    console.log('[LinkedIn to Affinity] Duplicate check result:', {
      isDuplicate: foundConversation,
      existingMessages: existingMessageContents.size,
      daysFound: notesByDay.size
    });

    return {
      isDuplicate: foundConversation,
      sentAt: latestNoteDate?.toISOString() || null,
      existingMessageContents: existingMessageContents,
      notesByDay: notesByDay
    };
  } catch (error) {
    console.error('[LinkedIn to Affinity] Error checking duplicate:', error);
    // On error, allow sending (fail open)
    return { isDuplicate: false, existingMessageContents: new Set(), notesByDay: new Map() };
  }
}

/**
 * Normalize message content for comparison
 * Handles escape characters and other variations that can cause mismatches
 */
function normalizeMessageContent(content) {
  if (!content) return '';
  let normalized = content.trim();

  // Handle multiple levels of escaping (e.g., \\' -> ' and \' -> ')
  // Run replacement twice to handle double-escaping
  for (let i = 0; i < 2; i++) {
    normalized = normalized
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  return normalized
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Normalize quotes (curly quotes to straight)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

/**
 * Filter out messages that have already been sent
 */
function filterNewMessages(messages, existingMessageContents) {
  if (!existingMessageContents || existingMessageContents.size === 0) {
    return messages;
  }

  // Create a normalized set for comparison
  const normalizedExisting = new Set(
    Array.from(existingMessageContents).map(msg => normalizeMessageContent(msg))
  );

  console.log('[LinkedIn to Affinity] Existing messages (normalized):', Array.from(normalizedExisting).map(m => m.substring(0, 50)));

  return messages.filter(msg => {
    const content = msg.content?.trim();
    const normalizedContent = normalizeMessageContent(content);
    const isExisting = normalizedExisting.has(normalizedContent);
    console.log('[LinkedIn to Affinity] Checking message:', JSON.stringify(normalizedContent.substring(0, 50)), 'exists:', isExisting);
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
 * Groups messages by day and creates/updates notes accordingly
 * @param {boolean} forceSend - If true, skip duplicate check
 */
async function sendToAffinityWithPerson(personId, conversationData, forceSend = false) {
  console.log('[LinkedIn to Affinity] sendToAffinityWithPerson - personId:', personId, 'forceSend:', forceSend);
  console.log('[LinkedIn to Affinity] conversationUrl:', conversationData.conversationUrl);

  const senderName = conversationData.sender?.name || 'Unknown';

  // Check for existing messages and get notes by day
  const duplicateCheck = await checkDuplicateAndGetExistingMessages(conversationData.conversationUrl, personId);

  // Filter to only new messages (not already in any note)
  const originalMessages = conversationData.messages || [];

  // Log sample message timestamps to help debug day parsing
  if (originalMessages.length > 0) {
    console.log('[LinkedIn to Affinity] Sample message timestamps:', originalMessages.slice(0, 3).map(m => m.timestamp));
  }

  const newMessages = filterNewMessages(originalMessages, duplicateCheck.existingMessageContents);

  console.log('[LinkedIn to Affinity] Message filtering - original:', originalMessages.length, 'new:', newMessages.length, 'isDuplicate:', duplicateCheck.isDuplicate);
  console.log('[LinkedIn to Affinity] Existing notes by day:', Array.from(duplicateCheck.notesByDay.keys()));

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

  // If no new messages at all, just return success with 0 count
  if (newMessages.length === 0) {
    // Apply tags if provided (for existing contacts)
    const tags = conversationData.tags || [];
    if (tags.length > 0) {
      console.log('[LinkedIn to Affinity] Applying tags to existing contact:', tags);
      await populatePersonFields(personId, conversationData.sender || {}, false, tags);
    }
    return {
      success: true,
      personId: personId,
      isNewPerson: false,
      newMessageCount: 0
    };
  }

  // Group new messages by day
  const messagesByDay = groupMessagesByDay(newMessages);
  console.log('[LinkedIn to Affinity] Messages grouped into', messagesByDay.size, 'day(s)');

  const results = {
    notesCreated: 0,
    notesUpdated: 0,
    totalNewMessages: 0
  };

  // Process each day
  for (const [dayKey, dayMessages] of messagesByDay) {
    console.log('[LinkedIn to Affinity] Processing day:', dayKey, 'with', dayMessages.length, 'messages');

    // Check if there's an existing note for this day
    const existingDayNote = duplicateCheck.notesByDay.get(dayKey);

    if (existingDayNote) {
      // Append to existing note
      console.log('[LinkedIn to Affinity] Found existing note for day', dayKey, '- appending', dayMessages.length, 'messages');

      // Filter out any messages that might already be in this specific note
      const existingDayMessages = existingDayNote.messages || new Set();
      const normalizedExisting = new Set(
        Array.from(existingDayMessages).map(msg => normalizeMessageContent(msg))
      );

      const trulyNewMessages = dayMessages.filter(msg => {
        const normalized = normalizeMessageContent(msg.content);
        return !normalizedExisting.has(normalized);
      });

      if (trulyNewMessages.length > 0) {
        const updatedContent = appendMessagesToNote(existingDayNote.content, trulyNewMessages, senderName);
        await updateNote(existingDayNote.noteId, updatedContent);
        results.notesUpdated++;
        results.totalNewMessages += trulyNewMessages.length;
        console.log('[LinkedIn to Affinity] Updated note', existingDayNote.noteId, 'with', trulyNewMessages.length, 'new messages');
      } else {
        console.log('[LinkedIn to Affinity] No truly new messages for day', dayKey);
      }
    } else {
      // Create new note for this day
      console.log('[LinkedIn to Affinity] Creating new note for day', dayKey);

      // Only include tags and quickNote on first/earliest day
      const isFirstDay = dayKey === [...messagesByDay.keys()][0];
      const dayData = {
        ...conversationData,
        tags: isFirstDay ? conversationData.tags : [],
        quickNote: isFirstDay ? conversationData.quickNote : ''
      };

      const noteContent = formatDayConversationNote(dayData, dayKey, dayMessages);
      const note = await addNote(personId, noteContent);
      results.notesCreated++;
      results.totalNewMessages += dayMessages.length;
      console.log('[LinkedIn to Affinity] Created note', note.id, 'for day', dayKey, 'with', dayMessages.length, 'messages');
    }
  }

  // Apply tags if provided (for existing contacts)
  const tags = conversationData.tags || [];
  if (tags.length > 0) {
    console.log('[LinkedIn to Affinity] Applying tags to existing contact:', tags);
    await populatePersonFields(personId, conversationData.sender || {}, false, tags);
  }

  return {
    success: true,
    personId: personId,
    isNewPerson: false,
    newMessageCount: results.totalNewMessages,
    notesCreated: results.notesCreated,
    notesUpdated: results.notesUpdated
  };
}

/**
 * Create a new person and send conversation to them
 * Groups messages by day for clean organization
 */
async function createPersonAndSend(senderData, conversationData, tags = []) {
  console.log('[LinkedIn to Affinity] Creating person with sender data - name:', senderData.name,
    '| headline:', senderData.headline,
    '| company:', senderData.company,
    '| linkedinUrl:', senderData.linkedinUrl,
    '| tags:', tags);
  const person = await createPerson(senderData, tags);
  console.log('[LinkedIn to Affinity] Created new person:', person.id);

  // Group messages by day
  const messages = conversationData.messages || [];
  const messagesByDay = groupMessagesByDay(messages);

  let totalMessages = 0;
  let notesCreated = 0;
  let firstNoteId = null;

  if (messagesByDay.size === 0) {
    // No messages - create a single note with contact info
    const noteContent = formatConversationNote({ ...conversationData, tags });
    const note = await addNote(person.id, noteContent);
    firstNoteId = note.id;
    notesCreated = 1;
    console.log('[LinkedIn to Affinity] Added note:', note.id);
  } else {
    // Create a note for each day
    let isFirst = true;
    for (const [dayKey, dayMessages] of messagesByDay) {
      // Only include tags and quickNote on first day
      const dayData = {
        ...conversationData,
        tags: isFirst ? tags : [],
        quickNote: isFirst ? conversationData.quickNote : ''
      };

      const noteContent = formatDayConversationNote(dayData, dayKey, dayMessages);
      const note = await addNote(person.id, noteContent);

      if (isFirst) {
        firstNoteId = note.id;
        isFirst = false;
      }

      totalMessages += dayMessages.length;
      notesCreated++;
      console.log('[LinkedIn to Affinity] Added note for day', dayKey, ':', note.id, 'with', dayMessages.length, 'messages');
    }
  }

  return {
    success: true,
    personId: person.id,
    noteId: firstNoteId,
    isNewPerson: true,
    personName: `${person.first_name} ${person.last_name}`.trim(),
    newMessageCount: totalMessages,
    notesCreated: notesCreated
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
    const tags = request.tags || request.conversationData?.tags || [];
    createPersonAndSend(request.senderData, request.conversationData, tags)
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

  if (request.action === 'addFollowUpReminder') {
    // Add a follow-up reminder note to a person
    const reminderNote = `📅 **Follow-up Reminder**\n\nFollow up on: ${request.dateStr}\n\n_Set via LinkedIn to Affinity_`;
    addNote(request.personId, reminderNote)
      .then((result) => {
        console.log('[LinkedIn to Affinity] Follow-up reminder added:', result);
        sendResponse({ success: true, noteId: result.id });
      })
      .catch((error) => {
        console.error('[LinkedIn to Affinity] Error adding follow-up:', error);
        sendResponse({ success: false, error: error.message });
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
    formatDayConversationNote,
    filterNewMessages,
    normalizeMessageContent,
    parseMessageDay,
    groupMessagesByDay,
    formatDayKeyForDisplay,
    extractMessagesFromNote,
    appendMessagesToNote,
    updateNote,
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
    findDropdownOption,
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
