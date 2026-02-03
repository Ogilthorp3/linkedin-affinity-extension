// LinkedIn to Affinity - Content Script
// Injected into LinkedIn messaging pages

// ============================================================
// TESTABLE HELPER FUNCTIONS
// These are defined outside the IIFE for testing purposes
// ============================================================

/**
 * Escape HTML to prevent XSS
 */
function _escapeHtml(text) {
  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  // Fallback for Node.js environment
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Check if a conversation item is currently selected/active
 */
function _isConversationSelected(item) {
  if (!item) return false;

  // Check for LinkedIn's active/selected classes
  if (item.classList.contains('active') ||
      item.classList.contains('selected') ||
      item.getAttribute('aria-selected') === 'true' ||
      item.getAttribute('aria-current') === 'true') {
    return true;
  }

  // Check for active class on child elements or parent
  if (item.querySelector('.active, .selected, [aria-selected="true"]')) {
    return true;
  }

  // Check for LinkedIn's specific active conversation class patterns
  if (item.className.includes('active') || item.className.includes('selected')) {
    return true;
  }

  // Check parent element for active state (LinkedIn sometimes marks parent)
  const parent = item.parentElement;
  if (parent && (parent.className.includes('active') || parent.className.includes('selected'))) {
    return true;
  }

  // Check for focus or current states
  if (item.matches && item.matches(':focus-within')) {
    return true;
  }

  if (item.getAttribute('tabindex') === '0') {
    return true;
  }

  return false;
}

/**
 * Get all text nodes from an element (first level deep)
 */
function _getTextNodes(element) {
  if (!element || typeof document === 'undefined') return [];

  const texts = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (node.textContent.trim().length > 0) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      }
    }
  );

  let node;
  let count = 0;
  while ((node = walker.nextNode()) && count < 20) {
    texts.push(node.textContent);
    count++;
  }
  return texts;
}

/**
 * Extract name from an element using multiple strategies
 */
function _extractName(element) {
  if (!element) return null;

  // Strategy 1: Known name selectors
  const nameSelectors = [
    '[class*="participant-name"]',
    '[class*="profile-name"]',
    '[data-anonymize="person-name"]',
    'h2', 'h3', 'h4',
    '[class*="title"]:not([class*="subtitle"])',
    'strong', 'b'
  ];

  for (const selector of nameSelectors) {
    const nameEl = element.querySelector(selector);
    if (nameEl) {
      const text = nameEl.textContent.trim();
      // Validate it looks like a name (1-5 words, starts with capital)
      if (text && /^[A-Z][a-zA-Z\s\-\.\']{1,50}$/.test(text)) {
        return text;
      }
    }
  }

  // Strategy 2: Find text that looks like a name
  const texts = _getTextNodes(element);
  for (const text of texts) {
    const trimmed = text.trim();
    const words = trimmed.split(/\s+/);
    if (words.length >= 1 && words.length <= 5 && /^[A-Z]/.test(trimmed) && trimmed.length < 50) {
      // Exclude common non-name patterns
      if (!/^(You|Me|Today|Yesterday|New|Message|Chat|Conversation|Messaging|Focused|Other|Inbox)/i.test(trimmed)) {
        return trimmed;
      }
    }
  }

  return null;
}

/**
 * Check if an element looks like a conversation item
 * Uses heuristics rather than class names
 */
function _isConversationItem(element) {
  if (!element || element.nodeType !== 1) return false;

  // Must have a profile image or avatar
  const hasImage = element.querySelector('img[src*="profile"], img[src*="media.licdn"], img[class*="presence"], img[class*="photo"], img[class*="avatar"]') !== null;

  // Must have text content that looks like a name (2-4 words, capitalized)
  const textNodes = _getTextNodes(element);
  const hasName = textNodes.some(text => {
    const words = text.trim().split(/\s+/);
    return words.length >= 1 && words.length <= 5 && /^[A-Z]/.test(text.trim());
  });

  // Should be a list item or have list-item-like behavior
  const isListLike = element.tagName === 'LI' ||
                     element.getAttribute('role') === 'listitem' ||
                     element.getAttribute('role') === 'option' ||
                     element.parentElement?.tagName === 'UL' ||
                     element.parentElement?.tagName === 'OL';

  // Should be clickable or contain clickable elements
  const isClickable = element.tagName === 'A' ||
                      element.querySelector('a') !== null ||
                      element.getAttribute('role') === 'button' ||
                      element.style.cursor === 'pointer';

  return (hasImage || hasName) && (isListLike || isClickable);
}

// ============================================================
// MAIN IIFE
// ============================================================

(function() {
  'use strict';

  // Avoid multiple injections
  if (typeof window !== 'undefined' && window.linkedinAffinityInjected) return;
  if (typeof window !== 'undefined') window.linkedinAffinityInjected = true;

  // Use browser or chrome API (Safari compatibility)
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // Configuration
  const BUTTON_CLASS = 'affinity-send-btn';
  const BUTTON_ID = 'affinity-send-btn'; // Keep for backward compatibility
  const MODAL_ID = 'affinity-contact-modal';
  const CHECK_INTERVAL = 1000; // Check for conversation changes
  const API_TIMEOUT = 30000; // 30 second timeout for API calls

  // ============================================================
  // LINKEDIN VOYAGER API
  // Fetches full profile data including work history
  // ============================================================

  /**
   * Get CSRF token from LinkedIn cookies
   */
  function getLinkedInCsrfToken() {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'JSESSIONID') {
        // Remove quotes if present
        return value.replace(/"/g, '');
      }
    }
    return null;
  }

  /**
   * Extract username/public-id from LinkedIn profile URL
   */
  function extractUsernameFromUrl(url) {
    if (!url) return null;
    // Handle various LinkedIn URL formats:
    // https://www.linkedin.com/in/username/
    // https://www.linkedin.com/in/ACoAAA.../
    const match = url.match(/linkedin\.com\/in\/([^/?]+)/);
    return match ? match[1] : null;
  }

  /**
   * Fetch profile data using LinkedIn's internal Voyager API
   * Returns full profile data including companies, job titles, location, industry
   */
  async function fetchProfileViaVoyager(linkedinUrl) {
    const username = extractUsernameFromUrl(linkedinUrl);
    if (!username) {
      console.log('[LinkedIn to Affinity] Could not extract username from URL:', linkedinUrl);
      return null;
    }

    const csrfToken = getLinkedInCsrfToken();
    if (!csrfToken) {
      console.log('[LinkedIn to Affinity] Could not get CSRF token');
      return null;
    }

    try {
      console.log('[LinkedIn to Affinity] Fetching profile via Voyager API:', username);

      const response = await fetch(`https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${username}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`, {
        method: 'GET',
        headers: {
          'csrf-token': csrfToken,
          'x-restli-protocol-version': '2.0.0',
          'x-li-lang': 'en_US',
          'accept': 'application/vnd.linkedin.normalized+json+2.1'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        console.log('[LinkedIn to Affinity] Voyager API error:', response.status);
        return null;
      }

      const data = await response.json();
      return extractProfileFromVoyagerResponse(data);
    } catch (error) {
      console.error('[LinkedIn to Affinity] Error fetching profile via Voyager:', error);
      return null;
    }
  }

  /**
   * Extract full profile data from Voyager API response
   * Returns object with companies, location, industry, job titles, etc.
   */
  function extractProfileFromVoyagerResponse(data) {
    const result = {
      companies: [],
      jobTitles: [],
      currentJobTitle: null,
      location: null,
      industry: null,
      headline: null
    };

    if (!data || !data.included) {
      return result;
    }

    const seenCompanies = new Set();
    const seenTitles = new Set();

    // Look through all included entities
    for (const item of data.included) {
      const type = item['$type'] || '';

      // Extract position/experience data
      if (type.includes('Position') || type.includes('position')) {
        const companyName = item.companyName || item.company?.name;
        const jobTitle = item.title;

        // Check if position is current (no end date)
        const isCurrent = !item.dateRange?.end && !item.timePeriod?.endDate && !item.endDate;

        // Add company
        if (companyName && !seenCompanies.has(companyName.toLowerCase())) {
          seenCompanies.add(companyName.toLowerCase());
          result.companies.push({
            name: companyName,
            title: jobTitle,
            isCurrent: isCurrent,
            startDate: item.dateRange?.start || item.timePeriod?.startDate || item.startDate,
            endDate: item.dateRange?.end || item.timePeriod?.endDate || item.endDate
          });
        }

        // Add job title
        if (jobTitle && !seenTitles.has(jobTitle.toLowerCase())) {
          seenTitles.add(jobTitle.toLowerCase());
          result.jobTitles.push(jobTitle);

          // Set current job title
          if (isCurrent && !result.currentJobTitle) {
            result.currentJobTitle = jobTitle;
          }
        }
      }

      // Extract profile data (location, industry, headline)
      if (type.includes('Profile') && !type.includes('Position')) {
        // Location - try various field names
        if (!result.location) {
          result.location = item.geoLocationName ||
                           item.locationName ||
                           item.geoLocation?.defaultLocalizedName ||
                           item.address?.city ||
                           item.location;
        }

        // Industry
        if (!result.industry && item.industryName) {
          result.industry = item.industryName;
        }
        if (!result.industry && item.industry) {
          result.industry = item.industry.name || item.industry;
        }

        // Headline
        if (!result.headline && item.headline) {
          result.headline = item.headline;
        }
      }

      // Also check for GeoLocation entities
      if (type.includes('Geo') && !result.location) {
        result.location = item.defaultLocalizedName || item.name;
      }

      // Check for Industry entities
      if (type.includes('Industry') && !result.industry) {
        result.industry = item.name || item.localizedName;
      }
    }

    console.log('[LinkedIn to Affinity] Extracted profile data:', {
      companies: result.companies.length,
      jobTitles: result.jobTitles,
      currentJobTitle: result.currentJobTitle,
      location: result.location,
      industry: result.industry
    });

    return result;
  }

  /**
   * Extract all companies from Voyager API response (legacy compatibility)
   * Returns array of company objects with name and other details
   */
  function extractCompaniesFromVoyagerResponse(data) {
    const profile = extractProfileFromVoyagerResponse(data);
    return profile.companies;
  }

  /**
   * Send message to background script with timeout
   */
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Request timed out. Please try again.'));
      }, API_TIMEOUT);

      try {
        browserAPI.runtime.sendMessage(message, (response) => {
          clearTimeout(timeoutId);

          // Check for runtime errors
          if (browserAPI.runtime.lastError) {
            console.error('[LinkedIn to Affinity] Runtime error:', browserAPI.runtime.lastError);
            reject(new Error(browserAPI.runtime.lastError.message || 'Extension error'));
            return;
          }

          if (response === undefined) {
            reject(new Error('No response from extension. Please reload the page.'));
            return;
          }

          resolve(response);
        });
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('[LinkedIn to Affinity] sendMessage error:', error);
        reject(error);
      }
    });
  }

  // Current conversation state
  let currentConversationUrl = null;
  let pendingConversationData = null;

  // ============================================================
  // ADAPTIVE DOM SCANNER
  // Dynamically detects LinkedIn's DOM structure
  // ============================================================
  const DOMScanner = {
    // Cache for detected selectors
    cache: {
      conversationList: null,
      conversationItems: null,
      conversationHeader: null,
      nameElement: null,
      profileLink: null,
      messageContainer: null,
      lastScanTime: 0
    },

    // Scan interval (rescan if cache is older than this)
    CACHE_TTL: 30000, // 30 seconds

    /**
     * Log DOM structure changes for debugging
     */
    log(message, data = null) {
      if (data) {
        console.log(`[LinkedIn to Affinity] DOM Scanner: ${message}`, data);
      } else {
        console.log(`[LinkedIn to Affinity] DOM Scanner: ${message}`);
      }
    },

    /**
     * Check if an element looks like a conversation item (wrapper for testable function)
     */
    isConversationItem(element) {
      return _isConversationItem(element);
    },

    /**
     * Get all text nodes from an element (wrapper for testable function)
     */
    getTextNodes(element) {
      return _getTextNodes(element);
    },

    /**
     * Find the conversation list container
     */
    findConversationList() {
      // Strategy 1: Look for common class patterns
      const knownSelectors = [
        '.msg-conversations-container__conversations-list',
        '.msg-overlay-list-bubble__content',
        '[class*="conversation"][class*="list"]',
        '[class*="msg"][class*="list"]'
      ];

      for (const selector of knownSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          this.log('Found conversation list via known selector', selector);
          return element;
        }
      }

      // Strategy 2: Find by structure - a scrollable container with multiple similar children
      const scrollContainers = document.querySelectorAll('[class*="msg"] ul, [class*="msg"] [role="list"], [class*="conversation"] ul');
      for (const container of scrollContainers) {
        const children = Array.from(container.children);
        if (children.length >= 2) {
          const conversationLikeChildren = children.filter(c => this.isConversationItem(c));
          if (conversationLikeChildren.length >= 2) {
            this.log('Found conversation list via structure analysis');
            return container;
          }
        }
      }

      // Strategy 3: Find any list with profile images
      const allLists = document.querySelectorAll('ul, ol, [role="list"]');
      for (const list of allLists) {
        const images = list.querySelectorAll('img[src*="profile"], img[src*="media.licdn"]');
        if (images.length >= 2) {
          this.log('Found conversation list via image detection');
          return list;
        }
      }

      return null;
    },

    /**
     * Find conversation items within a container or the whole page
     */
    findConversationItems(container = document) {
      const items = [];

      // Strategy 1: Known selectors
      const knownSelectors = [
        '.msg-conversation-listitem',
        '.msg-conversation-card',
        '.msg-conversations-container__convo-item',
        '[class*="msg-conversation"][class*="item"]',
        '[class*="conversation-list-item"]'
      ];

      for (const selector of knownSelectors) {
        const elements = container.querySelectorAll(selector);
        if (elements.length > 0) {
          this.log(`Found ${elements.length} items via known selector`, selector);
          return Array.from(elements);
        }
      }

      // Strategy 2: Find list items that look like conversations
      const listItems = container.querySelectorAll('li, [role="listitem"], [role="option"]');
      for (const item of listItems) {
        if (this.isConversationItem(item)) {
          items.push(item);
        }
      }

      if (items.length > 0) {
        this.log(`Found ${items.length} items via heuristic detection`);
        return items;
      }

      // Strategy 3: Find any clickable elements with profile images
      const clickables = container.querySelectorAll('a, [role="button"], [tabindex="0"]');
      for (const el of clickables) {
        if (el.querySelector('img[src*="profile"], img[src*="media.licdn"]') &&
            el.textContent.trim().length > 0 &&
            el.textContent.trim().length < 200) {
          items.push(el);
        }
      }

      if (items.length > 0) {
        this.log(`Found ${items.length} items via clickable+image detection`);
      }

      return items;
    },

    /**
     * Find the active conversation header
     */
    findConversationHeader() {
      // Strategy 1: Known selectors for the message thread (right pane), NOT the conversation list (left pane)
      const knownSelectors = [
        '.msg-thread__content-header',
        '.msg-overlay-conversation-bubble__header',
        '.msg-s-message-list-container header',
        '.msg-thread header'
      ];

      for (const selector of knownSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element;
        }
      }

      // Strategy 2: Find header-like element in message thread area (must be in thread, not list)
      const threadArea = document.querySelector('.msg-thread, .msg-s-message-list-container, [class*="conversation-bubble"]');
      if (threadArea) {
        const header = threadArea.querySelector('header, [class*="header"]:not([class*="list"])');
        if (header) return header;
      }

      return null;
    },

    /**
     * Extract name from an element (wrapper for testable function)
     */
    extractName(element) {
      return _extractName(element);
    },

    /**
     * Extract profile URL from an element or page
     */
    extractProfileUrl(element) {
      // Strategy 1: Look within the provided element
      if (element) {
        const link = element.querySelector('a[href*="/in/"]');
        if (link) {
          return link.href.split('?')[0];
        }

        // Check if element itself is a link
        if (element.tagName === 'A' && element.href?.includes('/in/')) {
          return element.href.split('?')[0];
        }
      }

      // Strategy 2: Look for profile link in message thread header area
      const headerSelectors = [
        '.msg-thread__link-to-profile',
        '.msg-overlay-bubble-header a[href*="/in/"]',
        '.msg-thread a[href*="/in/"]',
        '.msg-s-message-list-container a[href*="/in/"]',
        '.msg-entity-lockup a[href*="/in/"]',
        '.msg-title-bar a[href*="/in/"]',
        // Profile card in conversation
        '.pv-text-details__left-panel a[href*="/in/"]',
        '.msg-thread__content-header a[href*="/in/"]'
      ];

      for (const selector of headerSelectors) {
        const link = document.querySelector(selector);
        if (link && link.href?.includes('/in/')) {
          return link.href.split('?')[0];
        }
      }

      // Strategy 3: Find any profile link in the conversation pane (not sidebar)
      const conversationPane = document.querySelector('.msg-thread, .msg-overlay-conversation-bubble, .msg-s-message-list-container');
      if (conversationPane) {
        const links = conversationPane.querySelectorAll('a[href*="/in/"]');
        for (const link of links) {
          // Exclude links that are clearly message content (in message body)
          if (!link.closest('.msg-s-event-listitem__body, .msg-s-message-body')) {
            return link.href.split('?')[0];
          }
        }
      }

      // Strategy 4: Check for profile image link (often wraps the avatar)
      const avatarLink = document.querySelector('.msg-thread img[src*="media.licdn"]')?.closest('a[href*="/in/"]');
      if (avatarLink) {
        return avatarLink.href.split('?')[0];
      }

      return null;
    },

    /**
     * Full scan of the page to detect current DOM structure
     */
    scan() {
      const now = Date.now();

      // Use cache if still valid
      if (this.cache.lastScanTime && (now - this.cache.lastScanTime) < this.CACHE_TTL) {
        return this.cache;
      }

      this.log('Performing full DOM scan...');

      this.cache = {
        conversationList: this.findConversationList(),
        conversationItems: this.findConversationItems(),
        conversationHeader: this.findConversationHeader(),
        lastScanTime: now
      };

      this.log('Scan complete', {
        hasConversationList: !!this.cache.conversationList,
        itemCount: this.cache.conversationItems.length,
        hasHeader: !!this.cache.conversationHeader
      });

      return this.cache;
    },

    /**
     * Force a fresh scan (invalidate cache)
     */
    rescan() {
      this.cache.lastScanTime = 0;
      return this.scan();
    }
  };

  /**
   * Parse company name from LinkedIn headline
   * Handles formats like: "CEO at Company", "Engineer | Company", "Founder @ Company"
   */
  function parseCompanyFromHeadline(headline) {
    if (!headline) return null;

    // Common patterns for company separation
    const patterns = [
      /(?:at|@)\s+(.+?)(?:\s*[|·•]|$)/i,           // "Role at Company" or "Role @ Company"
      /(?:^|\s)[|·•]\s*(.+?)(?:\s*[|·•]|$)/,       // "Role | Company"
      /,\s*(.+?)(?:\s*[|·•]|$)/,                    // "Role, Company"
      /(?:^|\s)[-–—]\s*(.+?)(?:\s*[|·•]|$)/        // "Role - Company"
    ];

    for (const pattern of patterns) {
      const match = headline.match(pattern);
      if (match && match[1]) {
        const company = match[1].trim();
        // Filter out common non-company text
        if (company.length > 1 &&
            company.length < 100 &&
            !/^(and|the|a|an|in|for|with|to)$/i.test(company) &&
            !/looking for|open to|seeking|hiring/i.test(company)) {
          return company;
        }
      }
    }

    return null;
  }

  /**
   * Parse job title from LinkedIn headline
   */
  function parseTitleFromHeadline(headline) {
    if (!headline) return null;

    // Get the part before common separators
    const separators = [' at ', ' @ ', ' | ', ' · ', ' • ', ' - ', ' – ', ' — ', ', '];
    let title = headline;

    for (const sep of separators) {
      const idx = headline.toLowerCase().indexOf(sep.toLowerCase());
      if (idx > 0) {
        title = headline.substring(0, idx).trim();
        break;
      }
    }

    // Clean up and validate
    if (title && title.length > 1 && title.length < 100) {
      return title;
    }

    return null;
  }

  /**
   * Extract sender information from the conversation header
   */
  function extractSenderInfo() {
    const info = {
      name: null,
      firstName: null,
      lastName: null,
      headline: null,
      title: null,
      company: null,
      linkedinUrl: null,
      profileImageUrl: null,
      location: null
    };

    try {
      // Use adaptive scanner to find header
      const header = DOMScanner.findConversationHeader();

      if (header) {
        // Extract name using adaptive method
        info.name = DOMScanner.extractName(header);
        info.linkedinUrl = DOMScanner.extractProfileUrl(header);

        // Debug: log what we found

        // Get profile image
        const profileImg = header.querySelector('img[src*="profile"], img[src*="media.licdn"], img[class*="presence"], img[class*="photo"]');
        if (profileImg) {
          info.profileImageUrl = profileImg.src;
        }

        // Try to get headline/subtitle from header
        const subtitleEl = header.querySelector('[class*="subtitle"], [class*="headline"], .t-12, .t-14');
        if (subtitleEl) {
          info.headline = subtitleEl.textContent?.trim();
        }
      }

      // Fallback: Try broader headline selectors in the conversation pane
      if (!info.headline) {
        const headlineSelectors = [
          // Message thread header selectors
          '.msg-thread .msg-entity-lockup__entity-subtitle',
          '.msg-overlay-bubble-header .msg-entity-lockup__entity-subtitle',
          '.msg-s-message-list-container .msg-entity-lockup__entity-subtitle',
          '.msg-title-bar .msg-entity-lockup__entity-subtitle',
          // Generic subtitle/occupation selectors
          '.msg-thread [class*="occupation"]',
          '.msg-thread [class*="subtitle"]',
          '.msg-thread .t-12.t-black--light',
          '.msg-thread .t-14.t-black--light',
          // Profile mini card
          '.msg-thread .pv-text-details__left-panel .text-body-small'
        ];

        for (const selector of headlineSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            const text = el.textContent?.trim();
            // Make sure it's not empty or just whitespace
            if (text && text.length > 2 && text.length < 200) {
              info.headline = text;
              break;
            }
          }
        }
      }

      // Fallback: try known selectors if adaptive didn't work
      // Note: Only use selectors from the active conversation thread, NOT the conversation list
      if (!info.name) {
        const nameElement = document.querySelector(
          '.msg-thread__link-to-profile h2, ' +
          '.msg-overlay-bubble-header__title, ' +
          '.msg-thread h2, ' +
          '.msg-s-message-list-container h2, ' +
          '.msg-title-bar .msg-entity-lockup__entity-title'
        );
        if (nameElement) {
          info.name = nameElement.textContent?.trim();
        }
      }

      if (!info.linkedinUrl) {
        // Use the comprehensive extractProfileUrl which tries multiple strategies
        info.linkedinUrl = DOMScanner.extractProfileUrl(null);
      }

      // Parse name into first/last
      if (info.name) {
        const nameParts = info.name.split(' ');
        info.firstName = nameParts[0];
        info.lastName = nameParts.slice(1).join(' ');
      }

      // Parse company and title from headline
      if (info.headline) {
        info.company = parseCompanyFromHeadline(info.headline);
        info.title = parseTitleFromHeadline(info.headline);
      }

      // Try to extract location (often shown in conversation header or profile)
      const locationEl = document.querySelector(
        '.msg-thread [class*="location"], ' +
        '.msg-overlay-bubble-header [class*="location"], ' +
        '.t-black--light.t-12'
      );
      if (locationEl) {
        const locText = locationEl.textContent?.trim();
        // Make sure it's not the headline we already captured
        if (locText && locText !== info.headline && locText.length < 100) {
          info.location = locText;
        }
      }

    } catch (error) {
      console.error('[LinkedIn to Affinity] Error extracting sender info:', error);
    }

    return info;
  }

  /**
   * Extract messages from the current conversation
   */
  function extractMessages() {
    const messages = [];
    const seenContent = new Set(); // Track seen messages to avoid duplicates

    try {
      // Find all message items in the conversation - use specific selector to avoid duplicates
      const messageElements = document.querySelectorAll('.msg-s-event-listitem');

      messageElements.forEach((msgEl) => {
        const message = {
          sender: null,
          content: null,
          timestamp: null,
          isIncoming: false
        };

        // Get sender name
        const senderEl = msgEl.querySelector(
          '.msg-s-message-group__name, ' +
          '.msg-s-event-listitem__sender'
        );
        if (senderEl) {
          message.sender = senderEl.textContent?.trim();
        }

        // Get message content
        const contentEl = msgEl.querySelector(
          '.msg-s-event-listitem__body, ' +
          '.msg-s-message-group__content p'
        );
        if (contentEl) {
          message.content = contentEl.textContent?.trim();
        }

        // Get timestamp - prefer datetime attribute for full date/time
        const timeEl = msgEl.querySelector(
          '.msg-s-message-group__timestamp, ' +
          '.msg-s-message-list-item__timestamp, ' +
          'time'
        );
        if (timeEl) {
          // Try to get ISO datetime attribute first
          const isoDateTime = timeEl.getAttribute('datetime');
          if (isoDateTime) {
            // Format as readable date and time
            const date = new Date(isoDateTime);
            message.timestamp = date.toLocaleString();
          } else {
            // Fall back to text content
            message.timestamp = timeEl.textContent?.trim();
          }
        }

        // Determine if incoming (not from current user)
        const isOutgoing = msgEl.classList.contains('msg-s-event-listitem--outbound') ||
                          msgEl.querySelector('.msg-s-message-group--outbound');
        message.isIncoming = !isOutgoing;

        // Only add if we have content and haven't seen this exact message before
        if (message.content) {
          const contentKey = `${message.sender || ''}:${message.content}`;
          if (!seenContent.has(contentKey)) {
            seenContent.add(contentKey);
            messages.push(message);
          }
        }
      });

    } catch (error) {
      console.error('[LinkedIn to Affinity] Error extracting messages:', error);
    }

    return messages;
  }

  // Store reference to active button for modal operations
  let activeButton = null;

  /**
   * Create the contact selection modal
   */
  function createContactModal(matches, conversationData, button) {
    // Remove existing modal if present
    hideContactModal();
    activeButton = button;

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'affinity-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'affinity-modal';

    const senderName = conversationData.sender?.name || 'Unknown';
    const hasMatches = matches && matches.length > 0;

    // Header
    const header = document.createElement('div');
    header.className = 'affinity-modal-header';
    header.innerHTML = `
      <h3>${hasMatches ? 'Select Contact' : 'No Matches Found'}</h3>
      <button class="affinity-modal-close" title="Close">&times;</button>
    `;

    // Subtitle
    const subtitle = document.createElement('p');
    subtitle.className = 'affinity-modal-subtitle';
    if (hasMatches) {
      subtitle.textContent = `Found ${matches.length} contact${matches.length > 1 ? 's' : ''} matching "${senderName}"`;
    } else {
      subtitle.textContent = `No existing contacts found for "${senderName}"`;
    }

    // Contact list
    const list = document.createElement('div');
    list.className = 'affinity-contact-list';

    if (hasMatches) {
      matches.forEach((person) => {
        const item = document.createElement('div');
        item.className = 'affinity-contact-item';

        const name = `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Unknown';
        const email = person.primary_email || '';
        const org = person.organization_ids?.length > 0 ? 'Has organization' : '';

        item.innerHTML = `
          <div class="affinity-contact-info">
            <div class="affinity-contact-name">${escapeHtml(name)}</div>
            ${email ? `<div class="affinity-contact-email">${escapeHtml(email)}</div>` : ''}
            ${org ? `<div class="affinity-contact-org">${escapeHtml(org)}</div>` : ''}
          </div>
          <button class="affinity-contact-select" data-person-id="${person.id}">Select</button>
        `;

        item.querySelector('.affinity-contact-select').addEventListener('click', () => {
          const quickNote = document.getElementById('affinity-quick-note')?.value?.trim() || '';
          handleContactSelection(person.id, conversationData, quickNote);
        });

        list.appendChild(item);
      });
    } else {
      // No matches - show helpful message
      const noMatchesMsg = document.createElement('div');
      noMatchesMsg.className = 'affinity-no-matches';
      noMatchesMsg.innerHTML = `
        <p>Would you like to create a new contact for <strong>${escapeHtml(senderName)}</strong>?</p>
      `;
      list.appendChild(noMatchesMsg);
    }

    // Quick notes input
    const notesSection = document.createElement('div');
    notesSection.className = 'affinity-notes-section';
    notesSection.innerHTML = `
      <label class="affinity-notes-label" for="affinity-quick-note">Add a note (optional)</label>
      <textarea
        id="affinity-quick-note"
        class="affinity-notes-input"
        placeholder="e.g., Met at Web Summit, Referred by John, Series A looking for $5M..."
        rows="2"
      ></textarea>
    `;

    // Footer with Create New option
    const footer = document.createElement('div');
    footer.className = 'affinity-modal-footer';
    footer.innerHTML = `
      <button class="affinity-btn-secondary affinity-modal-cancel">Cancel</button>
      <button class="affinity-btn-primary affinity-modal-create-new">${hasMatches ? 'Create New Contact' : 'Create Contact'}</button>
    `;

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(subtitle);
    modal.appendChild(list);
    modal.appendChild(notesSection);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    // Event listeners
    header.querySelector('.affinity-modal-close').addEventListener('click', () => hideContactModal(activeButton));
    footer.querySelector('.affinity-modal-cancel').addEventListener('click', () => hideContactModal(activeButton));
    footer.querySelector('.affinity-modal-create-new').addEventListener('click', () => {
      const quickNote = document.getElementById('affinity-quick-note')?.value?.trim() || '';
      handleCreateNewContact(conversationData, quickNote);
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        hideContactModal(activeButton);
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', handleModalEscape);

    document.body.appendChild(overlay);
  }

  /**
   * Handle Escape key to close modal
   */
  function handleModalEscape(e) {
    if (e.key === 'Escape') {
      hideContactModal();
    }
  }

  /**
   * Hide and remove the contact modal
   */
  function hideContactModal(button) {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.remove();
    }
    document.removeEventListener('keydown', handleModalEscape);
    if (button) resetButton(button);
  }

  /**
   * Show loading state on the modal with a message
   */
  function showModalLoading(modalOverlay, message = 'Processing...') {
    const modal = modalOverlay.querySelector('.affinity-modal');
    if (!modal) return;

    modal.classList.add('affinity-modal-loading');

    // Update subtitle to show loading message
    const subtitle = modal.querySelector('.affinity-modal-subtitle');
    if (subtitle) {
      subtitle.textContent = message;
      subtitle.className = 'affinity-modal-subtitle';
    }
  }

  /**
   * Show feedback message on the modal (success, warning, or error)
   * @param {Object} duplicateData - Optional data for "Send Anyway" button (personId, conversationData)
   */
  function showModalFeedback(modalOverlay, type, message, duplicateData = null) {
    const modal = modalOverlay.querySelector('.affinity-modal');
    if (!modal) return;

    // Remove loading state
    modal.classList.remove('affinity-modal-loading');

    // Hide contact list and notes section
    const list = modal.querySelector('.affinity-contact-list');
    const notesSection = modal.querySelector('.affinity-notes-section');
    const footer = modal.querySelector('.affinity-modal-footer');
    const subtitle = modal.querySelector('.affinity-modal-subtitle');

    if (list) list.style.display = 'none';
    if (notesSection) notesSection.style.display = 'none';

    // Update header
    const header = modal.querySelector('.affinity-modal-header h3');
    if (header) {
      header.textContent = type === 'success' ? 'Success' :
                           type === 'warning' ? 'Already Sent' : 'Error';
    }

    // Show feedback message
    if (subtitle) {
      subtitle.textContent = message;
      subtitle.className = `affinity-modal-subtitle affinity-feedback-${type}`;
    }

    // For duplicates, show "Send Anyway" button; otherwise hide footer and auto-close
    if (type === 'warning' && duplicateData && footer) {
      footer.innerHTML = `
        <button class="affinity-btn-secondary affinity-modal-cancel">Cancel</button>
        <button class="affinity-btn-primary affinity-modal-send-anyway">Send Anyway</button>
      `;
      footer.style.display = 'flex';

      footer.querySelector('.affinity-modal-cancel').addEventListener('click', () => {
        hideContactModal(activeButton);
      });

      footer.querySelector('.affinity-modal-send-anyway').addEventListener('click', () => {
        handleForceSend(duplicateData.personId, duplicateData.conversationData);
      });
    } else {
      if (footer) footer.style.display = 'none';
      // Auto-close after delay
      const delay = type === 'error' ? 3000 : 2000;
      setTimeout(() => hideContactModal(activeButton), delay);
    }
  }

  /**
   * Force send to Affinity (bypass duplicate check)
   */
  async function handleForceSend(personId, conversationData) {
    const modalOverlay = document.getElementById(MODAL_ID);
    const button = activeButton;

    try {
      if (modalOverlay) {
        showModalLoading(modalOverlay, 'Sending conversation...');
      }

      const response = await sendMessage({
        action: 'sendToAffinityWithPerson',
        personId: personId,
        conversationData: conversationData,
        forceSend: true
      });

      if (response.success) {
        if (modalOverlay) {
          showModalFeedback(modalOverlay, 'success', 'Conversation sent successfully!');
        }
      } else {
        throw new Error(response.error || 'Failed to send');
      }
    } catch (error) {
      console.error('[LinkedIn to Affinity] Error:', error);
      if (modalOverlay) {
        showModalFeedback(modalOverlay, 'error', error.message || 'Failed to send');
      }
    }
  }

  /**
   * Reset button to default state
   */
  function resetButton(button) {
    if (!button) {
      // Reset all buttons if no specific button provided
      document.querySelectorAll('.' + BUTTON_CLASS).forEach(btn => {
        btn.classList.remove('affinity-loading', 'affinity-success', 'affinity-error', 'affinity-warning');
        const span = btn.querySelector('span');
        if (span) span.textContent = 'Send to Affinity';
      });
      return;
    }
    button.classList.remove('affinity-loading', 'affinity-success', 'affinity-error', 'affinity-warning');
    const span = button.querySelector('span');
    if (span) span.textContent = 'Send to Affinity';
  }

  /**
   * Handle contact selection from modal
   */
  async function handleContactSelection(personId, conversationData, quickNote = '') {
    const modalOverlay = document.getElementById(MODAL_ID);
    const button = activeButton;

    try {
      // Show loading state on modal
      if (modalOverlay) {
        showModalLoading(modalOverlay, 'Sending conversation...');
      }

      // Add quick note to conversation data
      const dataWithNote = {
        ...conversationData,
        quickNote: quickNote
      };

      const response = await sendMessage({
        action: 'sendToAffinityWithPerson',
        personId: personId,
        conversationData: dataWithNote
      });

      if (response.success) {
        // Show success feedback on modal
        const msgCount = response.newMessageCount;
        const successMsg = msgCount !== undefined
          ? (msgCount > 0 ? `Sent ${msgCount} new message(s)!` : 'Contact info sent!')
          : 'Conversation sent successfully!';

        if (modalOverlay) {
          showModalFeedback(modalOverlay, 'success', successMsg);
        } else {
          // Fallback to button feedback if modal was closed
          if (button) {
            button.classList.add('affinity-success');
            const span = button.querySelector('span');
            if (span) span.textContent = 'Sent!';
            setTimeout(() => resetButton(button), 2000);
          }
        }
      } else if (response.isDuplicate) {
        // Show duplicate warning on modal with "Send Anyway" option
        const dateStr = response.sentAt ? new Date(response.sentAt).toLocaleDateString() : 'previously';
        if (modalOverlay) {
          showModalFeedback(modalOverlay, 'warning', `This conversation was already sent on ${dateStr}`, {
            personId: personId,
            conversationData: conversationData
          });
        } else if (button) {
          button.classList.add('affinity-warning');
          const span = button.querySelector('span');
          if (span) span.textContent = 'Already sent';
          setTimeout(() => resetButton(button), 3000);
        }
      } else {
        throw new Error(response.error || 'Failed to send');
      }
    } catch (error) {
      console.error('[LinkedIn to Affinity] Error:', error);
      if (modalOverlay) {
        showModalFeedback(modalOverlay, 'error', error.message || 'Failed to send');
      } else {
        hideContactModal();
        if (button) {
          button.classList.add('affinity-error');
          const span = button.querySelector('span');
          if (span) span.textContent = error.message || 'Error';
          setTimeout(() => resetButton(button), 3000);
        }
      }
    }
  }

  /**
   * Handle creating a new contact from modal
   */
  async function handleCreateNewContact(conversationData, quickNote = '') {
    const modalOverlay = document.getElementById(MODAL_ID);
    const button = activeButton;

    try {
      // Show loading state on modal with descriptive message
      if (modalOverlay) {
        const name = conversationData.sender?.firstName || conversationData.sender?.name?.split(' ')[0] || 'contact';
        showModalLoading(modalOverlay, `Creating ${name}'s profile...`);
      }

      // Add quick note to conversation data
      const dataWithNote = {
        ...conversationData,
        quickNote: quickNote
      };

      const response = await sendMessage({
        action: 'createPersonAndSend',
        senderData: conversationData.sender,
        conversationData: dataWithNote
      });

      if (response.success) {
        // Show success feedback on modal
        const name = response.personName || conversationData.sender?.name || 'contact';
        if (modalOverlay) {
          showModalFeedback(modalOverlay, 'success', `Created ${name} and sent conversation!`);
        } else if (button) {
          button.classList.add('affinity-success');
          const span = button.querySelector('span');
          if (span) span.textContent = 'Sent!';
          setTimeout(() => resetButton(button), 2000);
        }
      } else {
        throw new Error(response.error || 'Failed to create contact');
      }
    } catch (error) {
      console.error('[LinkedIn to Affinity] Error:', error);
      if (modalOverlay) {
        showModalFeedback(modalOverlay, 'error', error.message || 'Failed to create contact');
      } else {
        hideContactModal();
        if (button) {
          button.classList.add('affinity-error');
          const span = button.querySelector('span');
          if (span) span.textContent = error.message || 'Error';
          setTimeout(() => resetButton(button), 3000);
        }
      }
    }
  }

  /**
   * Escape HTML to prevent XSS (wrapper for testable function)
   */
  function escapeHtml(text) {
    return _escapeHtml(text);
  }

  /**
   * Create the "Send to Affinity" button
   */
  function createAffinityButton(conversationItem) {
    const button = document.createElement('button');
    button.className = BUTTON_CLASS;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <!-- Triptyq T icon -->
        <path d="M1 2 L1 6 L23 6 L19 2 Z"/>
        <path d="M8 6 L8 16 L6 16 L12 22 L18 16 L16 16 L16 6 Z"/>
      </svg>
      <span>Send to Affinity</span>
    `;
    button.title = 'Send this conversation to Affinity CRM';

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleSendToAffinity(button, conversationItem);
    });

    return button;
  }

  /**
   * Extract sender info from a conversation list item
   */
  function extractSenderFromConversationItem(item) {
    const info = {
      name: null,
      firstName: null,
      lastName: null,
      headline: null,
      linkedinUrl: null,
      profileImageUrl: null
    };

    try {
      // Use adaptive scanner to extract name
      info.name = DOMScanner.extractName(item);
      info.linkedinUrl = DOMScanner.extractProfileUrl(item);

      // Fallback: try known selectors
      if (!info.name) {
        const nameElement = item.querySelector(
          '.msg-conversation-listitem__participant-names, ' +
          '.msg-conversation-card__participant-names, ' +
          '[data-anonymize="person-name"], ' +
          'h3, h4'
        );
        if (nameElement) {
          info.name = nameElement.textContent?.trim();
        }
      }

      // Get profile image using adaptive detection
      const profileImg = item.querySelector('img[src*="profile"], img[src*="media.licdn"], img[class*="presence"], img[class*="photo"], img[class*="avatar"]');
      if (profileImg && profileImg.src && !profileImg.src.includes('data:')) {
        info.profileImageUrl = profileImg.src;
      }

      // Parse name into first/last
      if (info.name) {
        const nameParts = info.name.split(' ');
        info.firstName = nameParts[0];
        info.lastName = nameParts.slice(1).join(' ');
      }

    } catch (error) {
      console.error('[LinkedIn to Affinity] Error extracting sender from item:', error);
    }

    return info;
  }

  /**
   * Find the best place to insert a button in an element (under the name and description)
   */
  function findButtonInsertionPoint(element) {
    // Strategy 1: Find the content container that holds name AND description
    // Insert after the entire content block, not just the name
    const contentContainerSelectors = [
      '.msg-conversation-listitem__content',
      '.msg-conversation-card__content',
      '.msg-conversation-listitem__message-info',
      '[class*="conversation"][class*="content"]',
      '[class*="message-info"]'
    ];

    for (const selector of contentContainerSelectors) {
      const contentContainer = element.querySelector(selector);
      if (contentContainer) {
        return { parent: contentContainer.parentElement || element, position: 'after-content', contentElement: contentContainer };
      }
    }

    // Strategy 2: Find the name element's parent container (which usually includes description)
    const nameSelectors = [
      '.msg-conversation-listitem__participant-names',
      '.msg-conversation-card__participant-names',
      '[data-anonymize="person-name"]',
      '[class*="participant-name"]',
      '[class*="profile-name"]'
    ];

    for (const selector of nameSelectors) {
      const nameElement = element.querySelector(selector);
      if (nameElement && nameElement.textContent.trim().length > 0) {
        // Find a parent that contains both name and any description
        let container = nameElement.parentElement;
        // Go up one more level if the parent is very small (just wraps the name)
        if (container && container.children.length <= 2) {
          const grandparent = container.parentElement;
          if (grandparent && grandparent !== element) {
            container = grandparent;
          }
        }
        return { parent: container?.parentElement || element, position: 'after-content', contentElement: container };
      }
    }

    // Strategy 3: Look for existing actions area
    const actionsSelectors = [
      '[class*="actions"]',
      '[class*="controls"]',
      '[class*="buttons"]',
      '[class*="toolbar"]'
    ];

    for (const selector of actionsSelectors) {
      const actionsArea = element.querySelector(selector);
      if (actionsArea && actionsArea.children.length < 10) {
        return { parent: actionsArea, position: 'prepend' };
      }
    }

    // Strategy 4: Add to element itself with block positioning
    return { parent: element, position: 'append-block' };
  }

  /**
   * Check if a conversation item is currently selected/active (wrapper for testable function)
   */
  function isConversationSelected(item) {
    return _isConversationSelected(item);
  }

  /**
   * Inject buttons into LinkedIn's UI - only on selected conversation
   */
  function injectButtons() {
    // Use adaptive scanner to find conversation items
    const scanResult = DOMScanner.scan();

    // Inject into conversation list items
    let conversationItems = scanResult.conversationItems;

    // Fallback: try known selectors if scanner found nothing
    if (!conversationItems || conversationItems.length === 0) {
      conversationItems = document.querySelectorAll(
        '.msg-conversation-listitem, ' +
        '.msg-conversation-card, ' +
        '.msg-conversations-container__convo-item, ' +
        'li[class*="msg-conversation"]'
      );
    }

    let injectedCount = 0;

    conversationItems.forEach((item) => {
      const existingButton = item.querySelector('.' + BUTTON_CLASS);
      const isSelected = isConversationSelected(item);

      // Remove button from non-selected items
      if (!isSelected && existingButton) {
        existingButton.remove();
        return;
      }

      // Skip if not selected or already has a button
      if (!isSelected || existingButton) return;

      // Verify this still looks like a conversation item
      if (!DOMScanner.isConversationItem(item) && !item.className.includes('msg-conversation')) {
        return;
      }

      const button = createAffinityButton(item);
      const insertionPoint = findButtonInsertionPoint(item);

      try {
        if (insertionPoint.position === 'after-content' && insertionPoint.contentElement && insertionPoint.contentElement.parentNode) {
          // Insert button after the content container (name + description)
          button.style.display = 'block';
          button.style.marginTop = '8px';
          button.style.marginLeft = '0';
          insertionPoint.contentElement.parentNode.insertBefore(button, insertionPoint.contentElement.nextSibling);
        } else if (insertionPoint.position === 'prepend' && insertionPoint.parent) {
          insertionPoint.parent.insertBefore(button, insertionPoint.parent.firstChild);
        } else {
          // Fallback: append to item with relative positioning
          item.style.position = 'relative';
          button.style.display = 'block';
          button.style.marginTop = '8px';
          item.appendChild(button);
        }
        injectedCount++;
      } catch (err) {
        // Final fallback: just append to item
        console.log('[LinkedIn to Affinity] Fallback button insertion');
        item.appendChild(button);
        injectedCount++;
      }
    });

    // Also inject into the active conversation header
    let header = scanResult.conversationHeader;

    // Fallback: try known selectors
    if (!header) {
      const headerContainer = document.querySelector(
        '.msg-thread__content-header, ' +
        '.msg-overlay-conversation-bubble__header, ' +
        '.msg-thread header, ' +
        '.msg-s-message-list-container'
      )?.closest('.msg-thread, .msg-overlay-conversation-bubble, [class*="msg-thread"]');

      if (headerContainer) {
        header = headerContainer.querySelector(
          '.msg-thread__content-header, ' +
          '.msg-overlay-conversation-bubble__header, ' +
          'header'
        );
      }
    }

    if (header && !header.querySelector('.' + BUTTON_CLASS)) {
      const button = createAffinityButton(header.closest('[class*="msg-thread"], [class*="conversation"]') || header);
      const insertionPoint = findButtonInsertionPoint(header);

      try {
        if (insertionPoint.position === 'after-name' && insertionPoint.nameElement && insertionPoint.nameElement.parentNode) {
          // Insert button after the name element
          button.style.display = 'block';
          button.style.marginTop = '6px';
          button.style.marginLeft = '0';
          insertionPoint.nameElement.parentNode.insertBefore(button, insertionPoint.nameElement.nextSibling);
        } else if (insertionPoint.position === 'prepend' && insertionPoint.parent) {
          insertionPoint.parent.insertBefore(button, insertionPoint.parent.firstChild);
        } else {
          // Fallback: append to header
          button.style.display = 'block';
          button.style.marginTop = '6px';
          header.appendChild(button);
        }
        injectedCount++;
      } catch (err) {
        // Final fallback: just append to header
        console.log('[LinkedIn to Affinity] Fallback header button insertion');
        header.appendChild(button);
        injectedCount++;
      }
    }

    if (injectedCount > 0) {
      console.log(`[LinkedIn to Affinity] Injected ${injectedCount} button(s)`);
    }
  }

  /**
   * Handle sending conversation to Affinity
   */
  async function handleSendToAffinity(button, conversationItem) {
    try {
      // Update button state
      button.classList.add('affinity-loading');
      const span = button.querySelector('span');
      if (span) span.textContent = 'Sending...';

      // Extract data - try from conversation item first, then from active conversation
      let senderInfo;
      if (conversationItem) {
        senderInfo = extractSenderFromConversationItem(conversationItem);
      }

      // Fall back to extracting from the page header if no name found
      if (!senderInfo?.name) {
        senderInfo = extractSenderInfo();
      }

      // Get additional info (headline, company, etc.) from the active conversation header
      // The conversation list item doesn't have all the details, but the header does
      const activeConversationInfo = extractSenderInfo();

      // Merge headline and other details from active conversation if it's the same person
      if (activeConversationInfo?.name && senderInfo?.name) {
        const clickedName = senderInfo.name.toLowerCase().trim().replace(/\s+/g, ' ');
        const activeName = activeConversationInfo.name.toLowerCase().trim().replace(/\s+/g, ' ');

        if (clickedName === activeName || clickedName.includes(activeName) || activeName.includes(clickedName)) {
          // Same person - merge the extra details
          senderInfo.headline = activeConversationInfo.headline || senderInfo.headline;
          senderInfo.title = activeConversationInfo.title || senderInfo.title;
          senderInfo.company = activeConversationInfo.company || senderInfo.company;
          senderInfo.location = activeConversationInfo.location || senderInfo.location;
          // Also prefer the linkedinUrl from header if available (more reliable)
          senderInfo.linkedinUrl = activeConversationInfo.linkedinUrl || senderInfo.linkedinUrl;
        }
      }

      // Fetch full profile data from LinkedIn via Voyager API
      if (senderInfo.linkedinUrl) {
        try {
          const voyagerProfile = await fetchProfileViaVoyager(senderInfo.linkedinUrl);
          if (voyagerProfile) {
            // Add companies
            if (voyagerProfile.companies && voyagerProfile.companies.length > 0) {
              senderInfo.allCompanies = voyagerProfile.companies;
              console.log('[LinkedIn to Affinity] Found', voyagerProfile.companies.length, 'companies in work history');
            }
            // Add job titles
            if (voyagerProfile.jobTitles && voyagerProfile.jobTitles.length > 0) {
              senderInfo.allJobTitles = voyagerProfile.jobTitles;
            }
            // Add current job title (prefer Voyager data)
            if (voyagerProfile.currentJobTitle) {
              senderInfo.currentJobTitle = voyagerProfile.currentJobTitle;
            }
            // Add location (prefer Voyager data if available)
            if (voyagerProfile.location) {
              senderInfo.location = voyagerProfile.location;
            }
            // Add industry
            if (voyagerProfile.industry) {
              senderInfo.industry = voyagerProfile.industry;
            }
            // Update headline if available from Voyager
            if (voyagerProfile.headline && !senderInfo.headline) {
              senderInfo.headline = voyagerProfile.headline;
            }
          }
        } catch (error) {
          console.log('[LinkedIn to Affinity] Could not fetch profile data:', error.message);
        }
      }

      // Only extract messages if the clicked contact matches the active conversation
      let messages = [];
      // Reuse activeConversationInfo from above
      if (activeConversationInfo?.name && senderInfo?.name) {
        const clickedName = senderInfo.name.toLowerCase().trim().replace(/\s+/g, ' ');
        const activeName = activeConversationInfo.name.toLowerCase().trim().replace(/\s+/g, ' ');

        if (clickedName === activeName || clickedName.includes(activeName) || activeName.includes(clickedName)) {
          // Names match - this is the active conversation, extract messages
          messages = extractMessages();
        }
      }

      // Validate we have minimum required data
      if (!senderInfo.name) {
        throw new Error('Could not extract sender name. Please make sure you have a conversation open.');
      }

      // Prepare payload
      const payload = {
        sender: senderInfo,
        messages: messages,
        conversationUrl: window.location.href,
        capturedAt: new Date().toISOString()
      };

      // Send to background script
      const response = await sendMessage({
        action: 'sendToAffinity',
        data: payload
      });

      if (response.success) {
        // Success state
        button.classList.remove('affinity-loading');
        button.classList.add('affinity-success');
        if (span) span.textContent = 'Sent!';

        // Reset after 2 seconds
        setTimeout(() => resetButton(button), 2000);
      } else if (response.needsSelection) {
        // Multiple matches - show selection modal
        button.classList.remove('affinity-loading');
        if (span) span.textContent = 'Select contact...';
        createContactModal(response.matches, response.conversationData, button);
      } else {
        throw new Error(response.error || 'Failed to send to Affinity');
      }

    } catch (error) {
      console.error('[LinkedIn to Affinity] Error:', error);

      // Error state
      button.classList.remove('affinity-loading');
      button.classList.add('affinity-error');
      const span = button.querySelector('span');
      if (span) span.textContent = error.message || 'Error';

      // Reset after 3 seconds
      setTimeout(() => resetButton(button), 3000);
    }
  }

  /**
   * Listen for keyboard shortcut
   */
  function setupKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + Shift + A
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        // Find the first visible button or create one for active conversation
        const activeButton = document.querySelector('.' + BUTTON_CLASS);
        if (activeButton) {
          activeButton.click();
        }
      }
    });
  }

  /**
   * Watch for conversation changes and inject buttons
   */
  function watchForConversationChanges() {
    // Initial scan and injection
    DOMScanner.scan();
    injectButtons();

    // Track if we've successfully injected buttons
    let lastSuccessfulInjection = Date.now();
    let consecutiveFailures = 0;

    // Watch for URL changes (conversation switches)
    setInterval(() => {
      if (window.location.href !== currentConversationUrl) {
        currentConversationUrl = window.location.href;
        // Force rescan on URL change
        DOMScanner.rescan();
        // Small delay to let LinkedIn render the conversation
        setTimeout(injectButtons, 500);
      }

      // Check if buttons exist
      const existingButtons = document.querySelectorAll('.' + BUTTON_CLASS);
      if (existingButtons.length === 0) {
        consecutiveFailures++;

        // If we've failed multiple times, force a rescan
        if (consecutiveFailures >= 3) {
          console.log('[LinkedIn to Affinity] No buttons found, rescanning DOM...');
          DOMScanner.rescan();
          consecutiveFailures = 0;
        }

        injectButtons();
      } else {
        consecutiveFailures = 0;
        lastSuccessfulInjection = Date.now();
      }
    }, CHECK_INTERVAL);

    // Also watch for DOM changes using MutationObserver
    const observer = new MutationObserver((mutations) => {
      // Check if significant DOM changes occurred
      const significantChange = mutations.some(m =>
        m.addedNodes.length > 0 ||
        m.removedNodes.length > 0
      );

      if (significantChange) {
        // Debounce the injection
        clearTimeout(observer.timeout);
        observer.timeout = setTimeout(() => {
          // Check if our buttons were removed
          const existingButtons = document.querySelectorAll('.' + BUTTON_CLASS);
          if (existingButtons.length === 0) {
            DOMScanner.rescan();
          }
          injectButtons();
        }, 200);
      }
    });

    // Observe the main messaging container - try multiple possible containers
    const possibleContainers = [
      document.querySelector('.msg-overlay-list-bubble'),
      document.querySelector('.msg-thread'),
      document.querySelector('.msg-conversations-container'),
      document.querySelector('[class*="messaging"]'),
      document.querySelector('main')
    ].filter(Boolean);

    possibleContainers.forEach(container => {
      observer.observe(container, {
        childList: true,
        subtree: true
      });
    });

    // Also observe body for messaging overlay appearing
    observer.observe(document.body, {
      childList: true,
      subtree: false
    });

    console.log('[LinkedIn to Affinity] Watching for conversation changes...');
  }

  /**
   * Initialize the extension
   */
  function init() {
    console.log('[LinkedIn to Affinity] Initializing...');

    setupKeyboardShortcut();

    // Wait for page to be ready
    if (document.readyState === 'complete') {
      watchForConversationChanges();
    } else {
      window.addEventListener('load', watchForConversationChanges);
    }
  }

  // Start
  init();

})();

// Export testable functions for testing (Node.js/Jest environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml: _escapeHtml,
    isConversationSelected: _isConversationSelected,
    extractName: _extractName,
    getTextNodes: _getTextNodes,
    isConversationItem: _isConversationItem
  };
}
