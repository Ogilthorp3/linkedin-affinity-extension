// LinkedIn to Affinity - Content Script
// Injected into LinkedIn messaging pages

(function() {
  'use strict';

  // Avoid multiple injections
  if (window.linkedinAffinityInjected) return;
  window.linkedinAffinityInjected = true;

  // Use browser or chrome API (Safari compatibility)
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // Configuration
  const BUTTON_CLASS = 'affinity-send-btn';
  const BUTTON_ID = 'affinity-send-btn'; // Keep for backward compatibility
  const MODAL_ID = 'affinity-contact-modal';
  const CHECK_INTERVAL = 1000; // Check for conversation changes
  const API_TIMEOUT = 30000; // 30 second timeout for API calls

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
     * Check if an element looks like a conversation item
     * Uses heuristics rather than class names
     */
    isConversationItem(element) {
      if (!element || element.nodeType !== 1) return false;

      // Must have a profile image or avatar
      const hasImage = element.querySelector('img[src*="profile"], img[src*="media.licdn"], img[class*="presence"], img[class*="photo"], img[class*="avatar"]') !== null;

      // Must have text content that looks like a name (2-4 words, capitalized)
      const textNodes = this.getTextNodes(element);
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
    },

    /**
     * Get all text nodes from an element (first level deep)
     */
    getTextNodes(element) {
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
     * Extract name from an element using multiple strategies
     */
    extractName(element) {
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
      const texts = this.getTextNodes(element);
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
    },

    /**
     * Extract profile URL from an element
     */
    extractProfileUrl(element) {
      if (!element) return null;

      const link = element.querySelector('a[href*="/in/"]');
      if (link) {
        return link.href.split('?')[0];
      }

      // Check if element itself is a link
      if (element.tagName === 'A' && element.href?.includes('/in/')) {
        return element.href.split('?')[0];
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
   * Extract sender information from the conversation header
   */
  function extractSenderInfo() {
    const info = {
      name: null,
      firstName: null,
      lastName: null,
      headline: null,
      linkedinUrl: null,
      profileImageUrl: null
    };

    try {
      // Use adaptive scanner to find header
      const header = DOMScanner.findConversationHeader();

      if (header) {
        // Extract name using adaptive method
        info.name = DOMScanner.extractName(header);
        info.linkedinUrl = DOMScanner.extractProfileUrl(header);

        // Get profile image
        const profileImg = header.querySelector('img[src*="profile"], img[src*="media.licdn"], img[class*="presence"], img[class*="photo"]');
        if (profileImg) {
          info.profileImageUrl = profileImg.src;
        }

        // Try to get headline/subtitle
        const subtitleEl = header.querySelector('[class*="subtitle"], [class*="headline"], .t-12, .t-14');
        if (subtitleEl) {
          info.headline = subtitleEl.textContent?.trim();
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
        const profileLink = document.querySelector(
          '.msg-thread__link-to-profile, ' +
          '.msg-conversation-card__profile-link, ' +
          'a[href*="/in/"]'
        );
        if (profileLink) {
          info.linkedinUrl = profileLink.href?.split('?')[0];
        }
      }

      // Parse name into first/last
      if (info.name) {
        const nameParts = info.name.split(' ');
        info.firstName = nameParts[0];
        info.lastName = nameParts.slice(1).join(' ');
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

        // Get timestamp
        const timeEl = msgEl.querySelector(
          '.msg-s-message-group__timestamp, ' +
          '.msg-s-message-list-item__timestamp, ' +
          'time'
        );
        if (timeEl) {
          message.timestamp = timeEl.textContent?.trim() || timeEl.getAttribute('datetime');
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
          handleContactSelection(person.id, conversationData);
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
    modal.appendChild(footer);
    overlay.appendChild(modal);

    // Event listeners
    header.querySelector('.affinity-modal-close').addEventListener('click', () => hideContactModal(activeButton));
    footer.querySelector('.affinity-modal-cancel').addEventListener('click', () => hideContactModal(activeButton));
    footer.querySelector('.affinity-modal-create-new').addEventListener('click', () => {
      handleCreateNewContact(conversationData);
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
   * Show feedback message on the modal (success, warning, or error)
   * @param {Object} duplicateData - Optional data for "Send Anyway" button (personId, conversationData)
   */
  function showModalFeedback(modalOverlay, type, message, duplicateData = null) {
    const modal = modalOverlay.querySelector('.affinity-modal');
    if (!modal) return;

    // Remove loading state
    modal.classList.remove('affinity-modal-loading');

    // Hide contact list
    const list = modal.querySelector('.affinity-contact-list');
    const footer = modal.querySelector('.affinity-modal-footer');
    const subtitle = modal.querySelector('.affinity-modal-subtitle');

    if (list) list.style.display = 'none';

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
        modalOverlay.querySelector('.affinity-modal').classList.add('affinity-modal-loading');
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
  async function handleContactSelection(personId, conversationData) {
    const modalOverlay = document.getElementById(MODAL_ID);
    const button = activeButton;

    try {
      // Show loading state on modal
      if (modalOverlay) {
        modalOverlay.querySelector('.affinity-modal').classList.add('affinity-modal-loading');
      }

      const response = await sendMessage({
        action: 'sendToAffinityWithPerson',
        personId: personId,
        conversationData: conversationData
      });

      if (response.success) {
        // Show success feedback on modal
        if (modalOverlay) {
          showModalFeedback(modalOverlay, 'success', 'Conversation sent successfully!');
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
  async function handleCreateNewContact(conversationData) {
    const modalOverlay = document.getElementById(MODAL_ID);
    const button = activeButton;

    try {
      // Show loading state on modal
      if (modalOverlay) {
        modalOverlay.querySelector('.affinity-modal').classList.add('affinity-modal-loading');
      }

      const response = await sendMessage({
        action: 'createPersonAndSend',
        senderData: conversationData.sender,
        conversationData: conversationData
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
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
   * Find the best place to insert a button in an element (under the name)
   */
  function findButtonInsertionPoint(element) {
    // Strategy 1: Find the name element and insert after it
    const nameSelectors = [
      '.msg-conversation-listitem__participant-names',
      '.msg-conversation-card__participant-names',
      '[data-anonymize="person-name"]',
      '[class*="participant-name"]',
      '[class*="profile-name"]',
      'h3', 'h4'
    ];

    for (const selector of nameSelectors) {
      const nameElement = element.querySelector(selector);
      if (nameElement && nameElement.textContent.trim().length > 0) {
        return { parent: nameElement.parentElement || element, position: 'after-name', nameElement };
      }
    }

    // Strategy 2: Look for existing actions area
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

    // Strategy 3: Add to element itself with block positioning
    return { parent: element, position: 'append-block' };
  }

  /**
   * Inject buttons into LinkedIn's UI - both conversation list and active conversation
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
      // Skip if already has a button
      if (item.querySelector('.' + BUTTON_CLASS)) return;

      // Verify this still looks like a conversation item
      if (!DOMScanner.isConversationItem(item) && !item.className.includes('msg-conversation')) {
        return;
      }

      const button = createAffinityButton(item);
      const insertionPoint = findButtonInsertionPoint(item);

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
          // Fallback: append to item with relative positioning
          item.style.position = 'relative';
          button.style.display = 'block';
          button.style.marginTop = '6px';
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

      // Only extract messages if the clicked contact matches the active conversation
      let messages = [];
      const activeConversationInfo = extractSenderInfo();

      if (activeConversationInfo?.name && senderInfo?.name) {
        // Normalize names for comparison (lowercase, trim, remove extra spaces)
        const clickedName = senderInfo.name.toLowerCase().trim().replace(/\s+/g, ' ');
        const activeName = activeConversationInfo.name.toLowerCase().trim().replace(/\s+/g, ' ');

        // Check if names match or if one contains the other (for partial matches)
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
