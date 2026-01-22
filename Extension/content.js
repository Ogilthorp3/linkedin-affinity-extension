// LinkedIn to Affinity - Content Script
// Injected into LinkedIn messaging pages

(function() {
  'use strict';

  // Avoid multiple injections
  if (window.linkedinAffinityInjected) return;
  window.linkedinAffinityInjected = true;

  // Configuration
  const BUTTON_ID = 'affinity-send-btn';
  const CHECK_INTERVAL = 1000; // Check for conversation changes

  // Current conversation state
  let currentConversationUrl = null;

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
      // Get conversation header - LinkedIn uses various class names
      // These selectors may need updating as LinkedIn changes their DOM

      // Try to find the profile link in the conversation header
      const profileLink = document.querySelector(
        '.msg-thread__link-to-profile, ' +
        '.msg-conversation-card__profile-link, ' +
        'a[href*="/in/"][data-control-name]'
      );

      if (profileLink) {
        info.linkedinUrl = profileLink.href?.split('?')[0]; // Remove query params
      }

      // Get name from header
      const nameElement = document.querySelector(
        '.msg-thread__link-to-profile h2, ' +
        '.msg-conversation-listitem__participant-names, ' +
        '.msg-overlay-bubble-header__title, ' +
        '.msg-thread h2'
      );

      if (nameElement) {
        info.name = nameElement.textContent?.trim();
        if (info.name) {
          const nameParts = info.name.split(' ');
          info.firstName = nameParts[0];
          info.lastName = nameParts.slice(1).join(' ');
        }
      }

      // Get headline/title
      const headlineElement = document.querySelector(
        '.msg-thread__link-to-profile .t-12, ' +
        '.msg-overlay-bubble-header__subtitle, ' +
        '.msg-thread .t-12'
      );

      if (headlineElement) {
        info.headline = headlineElement.textContent?.trim();
      }

      // Get profile image
      const profileImg = document.querySelector(
        '.msg-thread img.presence-entity__image, ' +
        '.msg-thread img.EntityPhoto-circle-3'
      );

      if (profileImg) {
        info.profileImageUrl = profileImg.src;
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

    try {
      // Find all message items in the conversation
      const messageElements = document.querySelectorAll(
        '.msg-s-message-list__event, ' +
        '.msg-s-event-listitem, ' +
        '.message-item'
      );

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

        if (message.content) {
          messages.push(message);
        }
      });

    } catch (error) {
      console.error('[LinkedIn to Affinity] Error extracting messages:', error);
    }

    return messages;
  }

  /**
   * Create the "Send to Affinity" button
   */
  function createAffinityButton() {
    // Remove existing button if present
    const existingBtn = document.getElementById(BUTTON_ID);
    if (existingBtn) {
      existingBtn.remove();
    }

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 2L11 13"></path>
        <path d="M22 2L15 22L11 13L2 9L22 2Z"></path>
      </svg>
      <span>Send to Affinity</span>
    `;
    button.title = 'Send this conversation to Affinity CRM (Cmd+Shift+A)';

    button.addEventListener('click', handleSendToAffinity);

    return button;
  }

  /**
   * Inject the button into LinkedIn's UI
   */
  function injectButton() {
    // Find a suitable location in the conversation header
    const headerContainer = document.querySelector(
      '.msg-thread__content-header, ' +
      '.msg-overlay-conversation-bubble__header, ' +
      '.msg-thread header'
    );

    if (headerContainer && !document.getElementById(BUTTON_ID)) {
      const button = createAffinityButton();

      // Try to find actions area, otherwise append to header
      const actionsArea = headerContainer.querySelector(
        '.msg-thread__actions, ' +
        '.msg-overlay-bubble-header__controls'
      );

      if (actionsArea) {
        actionsArea.insertBefore(button, actionsArea.firstChild);
      } else {
        headerContainer.appendChild(button);
      }
    }
  }

  /**
   * Handle sending conversation to Affinity
   */
  async function handleSendToAffinity() {
    const button = document.getElementById(BUTTON_ID);

    try {
      // Update button state
      button.classList.add('affinity-loading');
      button.querySelector('span').textContent = 'Sending...';

      // Extract data
      const senderInfo = extractSenderInfo();
      const messages = extractMessages();

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
      const response = await chrome.runtime.sendMessage({
        action: 'sendToAffinity',
        data: payload
      });

      if (response.success) {
        // Success state
        button.classList.remove('affinity-loading');
        button.classList.add('affinity-success');
        button.querySelector('span').textContent = 'Sent!';

        // Reset after 2 seconds
        setTimeout(() => {
          button.classList.remove('affinity-success');
          button.querySelector('span').textContent = 'Send to Affinity';
        }, 2000);
      } else {
        throw new Error(response.error || 'Failed to send to Affinity');
      }

    } catch (error) {
      console.error('[LinkedIn to Affinity] Error:', error);

      // Error state
      button.classList.remove('affinity-loading');
      button.classList.add('affinity-error');
      button.querySelector('span').textContent = error.message || 'Error';

      // Reset after 3 seconds
      setTimeout(() => {
        button.classList.remove('affinity-error');
        button.querySelector('span').textContent = 'Send to Affinity';
      }, 3000);
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
        handleSendToAffinity();
      }
    });
  }

  /**
   * Watch for conversation changes and inject button
   */
  function watchForConversationChanges() {
    // Initial injection
    injectButton();

    // Watch for URL changes (conversation switches)
    setInterval(() => {
      if (window.location.href !== currentConversationUrl) {
        currentConversationUrl = window.location.href;
        // Small delay to let LinkedIn render the conversation
        setTimeout(injectButton, 500);
      }
    }, CHECK_INTERVAL);

    // Also watch for DOM changes using MutationObserver
    const observer = new MutationObserver((mutations) => {
      // Check if button needs to be re-injected
      if (!document.getElementById(BUTTON_ID)) {
        injectButton();
      }
    });

    // Observe the main messaging container
    const messagingContainer = document.querySelector('.msg-overlay-list-bubble, .msg-thread, main');
    if (messagingContainer) {
      observer.observe(messagingContainer, {
        childList: true,
        subtree: true
      });
    }
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
