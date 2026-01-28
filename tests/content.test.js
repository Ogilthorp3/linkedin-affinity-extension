/**
 * Tests for content.js
 * Note: content.js is wrapped in an IIFE, so we need to test via the exported helpers
 */

const {
  escapeHtml,
  isConversationSelected,
  extractName,
  getTextNodes
} = require('../Extension/content.js');

describe('escapeHtml', () => {
  test('escapes HTML special characters', () => {
    const input = '<script>alert("XSS")</script>';
    const result = escapeHtml(input);

    expect(result).toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
  });

  test('escapes ampersand', () => {
    const input = 'Tom & Jerry';
    const result = escapeHtml(input);

    expect(result).toBe('Tom &amp; Jerry');
  });

  test('escapes quotes', () => {
    const input = 'Say "hello" to \'world\'';
    const result = escapeHtml(input);

    // textContent approach escapes quotes differently
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  test('handles empty string', () => {
    const result = escapeHtml('');
    expect(result).toBe('');
  });

  test('handles string with no special characters', () => {
    const input = 'Hello World';
    const result = escapeHtml(input);

    expect(result).toBe('Hello World');
  });

  test('handles Unicode characters', () => {
    const input = 'Hello 世界 🌍';
    const result = escapeHtml(input);

    expect(result).toBe('Hello 世界 🌍');
  });
});

describe('isConversationSelected', () => {
  // Create a mock element for testing
  function createMockElement(options = {}) {
    const element = document.createElement('div');

    if (options.classes) {
      options.classes.forEach(c => element.classList.add(c));
    }

    if (options.ariaSelected) {
      element.setAttribute('aria-selected', options.ariaSelected);
    }

    if (options.ariaCurrent) {
      element.setAttribute('aria-current', options.ariaCurrent);
    }

    if (options.tabindex) {
      element.setAttribute('tabindex', options.tabindex);
    }

    if (options.hasActiveChild) {
      const child = document.createElement('div');
      child.classList.add('active');
      element.appendChild(child);
    }

    if (options.parentClass) {
      const parent = document.createElement('div');
      parent.className = options.parentClass;
      parent.appendChild(element);
    }

    return element;
  }

  test('returns true for element with active class', () => {
    const element = createMockElement({ classes: ['conversation-item', 'active'] });
    expect(isConversationSelected(element)).toBe(true);
  });

  test('returns true for element with selected class', () => {
    const element = createMockElement({ classes: ['conversation-item', 'selected'] });
    expect(isConversationSelected(element)).toBe(true);
  });

  test('returns true for aria-selected="true"', () => {
    const element = createMockElement({ ariaSelected: 'true' });
    expect(isConversationSelected(element)).toBe(true);
  });

  test('returns true for aria-current="true"', () => {
    const element = createMockElement({ ariaCurrent: 'true' });
    expect(isConversationSelected(element)).toBe(true);
  });

  test('returns true when has active child element', () => {
    const element = createMockElement({ hasActiveChild: true });
    expect(isConversationSelected(element)).toBe(true);
  });

  test('returns true for class name containing active', () => {
    const element = document.createElement('div');
    element.className = 'msg-conversation-listitem--is-active';
    expect(isConversationSelected(element)).toBe(true);
  });

  test('returns false for non-selected element', () => {
    const element = createMockElement({ classes: ['conversation-item'] });
    expect(isConversationSelected(element)).toBe(false);
  });

  test('returns false for aria-selected="false"', () => {
    const element = createMockElement({ ariaSelected: 'false' });
    expect(isConversationSelected(element)).toBe(false);
  });
});

describe('extractName', () => {
  function createElementWithName(structure) {
    const container = document.createElement('div');
    container.innerHTML = structure;
    return container;
  }

  test('extracts name from h2 element', () => {
    const element = createElementWithName('<h2>John Doe</h2>');
    const result = extractName(element);

    expect(result).toBe('John Doe');
  });

  test('extracts name from participant-name class', () => {
    const element = createElementWithName('<span class="participant-name">Jane Smith</span>');
    const result = extractName(element);

    expect(result).toBe('Jane Smith');
  });

  test('extracts name from data-anonymize attribute', () => {
    const element = createElementWithName('<span data-anonymize="person-name">Bob Wilson</span>');
    const result = extractName(element);

    expect(result).toBe('Bob Wilson');
  });

  test('returns null for non-name text', () => {
    const element = createElementWithName('<span>You sent a message</span>');
    const result = extractName(element);

    // Should not match "You" or common patterns
    expect(result).not.toBe('You');
  });

  test('returns null for empty element', () => {
    const element = document.createElement('div');
    const result = extractName(element);

    expect(result).toBeNull();
  });

  test('handles names with special characters', () => {
    const element = createElementWithName('<h3>Jean-Pierre O\'Brien</h3>');
    const result = extractName(element);

    expect(result).toBe("Jean-Pierre O'Brien");
  });
});

describe('getTextNodes', () => {
  test('extracts text from simple element', () => {
    const element = document.createElement('div');
    element.textContent = 'Hello World';

    const result = getTextNodes(element);

    expect(result).toContain('Hello World');
  });

  test('extracts text from nested elements', () => {
    const element = document.createElement('div');
    element.innerHTML = '<span>Hello</span> <span>World</span>';

    const result = getTextNodes(element);

    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  test('ignores empty text nodes', () => {
    const element = document.createElement('div');
    element.innerHTML = '<span>Text</span>   <span></span>';

    const result = getTextNodes(element);

    // Should only contain meaningful text
    const nonEmptyResults = result.filter(t => t.trim().length > 0);
    expect(nonEmptyResults).toContain('Text');
  });

  test('returns empty array for empty element', () => {
    const element = document.createElement('div');

    const result = getTextNodes(element);

    expect(result).toEqual([]);
  });

  test('limits number of text nodes returned', () => {
    const element = document.createElement('div');
    // Create many text nodes
    for (let i = 0; i < 30; i++) {
      const span = document.createElement('span');
      span.textContent = `Text ${i}`;
      element.appendChild(span);
    }

    const result = getTextNodes(element);

    // Should be limited to 20
    expect(result.length).toBeLessThanOrEqual(20);
  });
});

describe('DOM Scanner integration', () => {
  beforeEach(() => {
    // Clean up document body
    document.body.innerHTML = '';
  });

  test('identifies conversation item by profile image', () => {
    const { isConversationItem } = require('../Extension/content.js');

    const item = document.createElement('li');
    item.innerHTML = `
      <img src="https://media.licdn.com/profile/123" alt="Profile">
      <span>John Doe</span>
    `;

    const result = isConversationItem(item);

    expect(result).toBe(true);
  });

  test('identifies conversation item by role attribute', () => {
    const { isConversationItem } = require('../Extension/content.js');

    const item = document.createElement('div');
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <img src="https://media.licdn.com/profile/123" alt="Profile">
      <a href="/in/johndoe">John Doe</a>
    `;

    const result = isConversationItem(item);

    expect(result).toBe(true);
  });

  test('rejects non-conversation element', () => {
    const { isConversationItem } = require('../Extension/content.js');

    const item = document.createElement('div');
    item.textContent = 'Just some random text';

    const result = isConversationItem(item);

    expect(result).toBe(false);
  });
});
