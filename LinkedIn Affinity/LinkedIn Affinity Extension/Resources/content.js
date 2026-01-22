// LinkedIn to Affinity - Content Script
// Injected into LinkedIn messaging pages

(function() {
  'use strict';

  // Avoid multiple injections
  if (window.linkedinAffinityInjected) return;
  window.linkedinAffinityInjected = true;

  // Configuration
  const BUTTON_ID = 'affinity-send-btn';
  const CHECK_INTERVAL = 1000;

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
      // Get profile link in conversation header
      const profileLink = document.querySelector(
        '.msg-thread__link-to-profile, ' +
        '.msg-conversation-card__profile-link, ' +
        'a[href*="/in/"][data-control-name]'
      );

      if (profileLink) {
        info.linkedinUrl = profileLink.href?.split('?')[0];
      }

      // Get name from header
      const nameElement = document.querySelector(
        '.msg-entity-lockup__entity-title, ' +
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

        // Determine if incoming
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
    // Don't inject if button already exists
    if (document.getElementById(BUTTON_ID)) {
      return;
    }

    // Try to find the actions area in the conversation header
    // LinkedIn 2024/2025 structure
    const actionsArea = document.querySelector(
      '.msg-conversation-card__inbox-shortcuts, ' +
      '.msg-thread-actions, ' +
      '.msg-overlay-bubble-header__controls'
    );

    if (actionsArea) {
      const button = createAffinityButton();
      actionsArea.insertBefore(button, actionsArea.firstChild);
      console.log('[LinkedIn to Affinity] Button injected into actions area');
      return;
    }

    // Fallback: try to inject into the title bar
    const titleBar = document.querySelector(
      '.msg-title-bar, ' +
      '.msg-thread__content-header, ' +
      '.msg-overlay-conversation-bubble__header'
    );

    if (titleBar) {
      const button = createAffinityButton();
      titleBar.appendChild(button);
      console.log('[LinkedIn to Affinity] Button injected into title bar');
      return;
    }

    // Last fallback: inject into conversation card
    const conversationCard = document.querySelector('.msg-conversation-card');
    if (conversationCard) {
      const button = createAffinityButton();
      conversationCard.appendChild(button);
      console.log('[LinkedIn to Affinity] Button injected into conversation card');
    }
  }

  /**
   * Handle sending conversation to Affinity
   */
  async function handleSendToAffinity() {
    const button = document.getElementById(BUTTON_ID);

    try {
      button.classList.add('affinity-loading');
      button.querySelector('span').textContent = 'Sending...';

      const senderInfo = extractSenderInfo();
      const messages = extractMessages();

      if (!senderInfo.name) {
        throw new Error('Could not extract sender name. Please make sure you have a conversation open.');
      }

      const payload = {
        sender: senderInfo,
        messages: messages,
        conversationUrl: window.location.href,
        capturedAt: new Date().toISOString()
      };

      const response = await browser.runtime.sendMessage({
        action: 'sendToAffinity',
        data: payload
      });

      if (response.success) {
        button.classList.remove('affinity-loading');
        button.classList.add('affinity-success');
        button.querySelector('span').textContent = 'Sent!';

        setTimeout(() => {
          button.classList.remove('affinity-success');
          button.querySelector('span').textContent = 'Send to Affinity';
        }, 2000);
      } else {
        throw new Error(response.error || 'Failed to send to Affinity');
      }

    } catch (error) {
      console.error('[LinkedIn to Affinity] Error:', error);

      button.classList.remove('affinity-loading');
      button.classList.add('affinity-error');
      button.querySelector('span').textContent = error.message || 'Error';

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
    injectButton();

    setInterval(() => {
      if (window.location.href !== currentConversationUrl) {
        currentConversationUrl = window.location.href;
        setTimeout(injectButton, 500);
      }
    }, CHECK_INTERVAL);

    const observer = new MutationObserver((mutations) => {
      if (!document.getElementById(BUTTON_ID)) {
        injectButton();
      }
    });

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

    if (document.readyState === 'complete') {
      watchForConversationChanges();
    } else {
      window.addEventListener('load', watchForConversationChanges);
    }
  }

  init();

})();
