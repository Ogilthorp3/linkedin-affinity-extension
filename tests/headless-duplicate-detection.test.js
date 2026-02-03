/**
 * Headless Browser Test for Duplicate Detection Fix
 *
 * Tests the normalizeMessageContent and filterNewMessages functions
 * in an actual browser environment using Puppeteer to verify the
 * escape character fix works correctly.
 *
 * @jest-environment node
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

describe('Duplicate Detection in Headless Browser', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();

    // Load the background.js file content
    const backgroundJsPath = path.join(__dirname, '../Extension/background.js');
    const backgroundJs = fs.readFileSync(backgroundJsPath, 'utf8');

    // Create a test HTML page that loads the extension code
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Extension Test</title></head>
      <body>
        <script>
          // Mock browser APIs
          const browser = {
            storage: {
              sync: { get: async () => ({}), set: async () => {} },
              local: { get: async () => ({}), set: async () => {} }
            },
            runtime: {
              sendMessage: () => {},
              onMessage: { addListener: () => {} }
            },
            commands: { onCommand: { addListener: () => {} } },
            tabs: { query: () => {}, sendMessage: () => {} }
          };
          const chrome = browser;

          // Mock fetch for API calls
          window.fetch = async () => ({ ok: true, json: async () => ({}) });
        </script>
        <script>
          ${backgroundJs}
        </script>
      </body>
      </html>
    `;

    await page.setContent(testHtml);
  }, 30000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('normalizeMessageContent', () => {
    test('handles escaped apostrophes (French text bug fix)', async () => {
      const result = await page.evaluate(() => {
        return normalizeMessageContent("Salut Bert, enchanté de t\\'avoir rencontré");
      });
      expect(result).toBe("Salut Bert, enchanté de t'avoir rencontré");
    });

    test('handles double-escaped apostrophes', async () => {
      const result = await page.evaluate(() => {
        return normalizeMessageContent("t\\\\'avoir");
      });
      expect(result).toBe("t'avoir");
    });

    test('handles escaped double quotes', async () => {
      const result = await page.evaluate(() => {
        return normalizeMessageContent('He said \\"hello\\"');
      });
      expect(result).toBe('He said "hello"');
    });

    test('normalizes whitespace', async () => {
      const result = await page.evaluate(() => {
        return normalizeMessageContent("hello   world");
      });
      expect(result).toBe("hello world");
    });

    test('converts curly quotes to straight quotes', async () => {
      const result = await page.evaluate(() => {
        // Use unicode escapes to ensure proper encoding
        return normalizeMessageContent("it\u2019s a \u201Ctest\u201D");
      });
      expect(result).toBe("it's a \"test\"");
    });

    test('trims whitespace', async () => {
      const result = await page.evaluate(() => {
        return normalizeMessageContent("  hello  ");
      });
      expect(result).toBe("hello");
    });

    test('handles empty string', async () => {
      const result = await page.evaluate(() => {
        return normalizeMessageContent("");
      });
      expect(result).toBe("");
    });

    test('handles null', async () => {
      const result = await page.evaluate(() => {
        return normalizeMessageContent(null);
      });
      expect(result).toBe("");
    });
  });

  describe('filterNewMessages', () => {
    test('detects duplicate with escaped apostrophe (exact bug case)', async () => {
      const result = await page.evaluate(() => {
        const messages = [
          { content: "Salut Bert, enchanté de t'avoir rencontré en personne" }
        ];
        const existingMessageContents = new Set([
          "Salut Bert, enchanté de t\\'avoir rencontré en personne"
        ]);
        return filterNewMessages(messages, existingMessageContents).length;
      });
      expect(result).toBe(0); // Should be filtered as duplicate
    });

    test('detects duplicate with double-escaped quotes', async () => {
      const result = await page.evaluate(() => {
        const messages = [
          { content: 'He said "hello" to me' }
        ];
        const existingMessageContents = new Set([
          'He said \\"hello\\" to me'
        ]);
        return filterNewMessages(messages, existingMessageContents).length;
      });
      expect(result).toBe(0);
    });

    test('returns new messages when no match', async () => {
      const result = await page.evaluate(() => {
        const messages = [
          { content: "This is a new message" }
        ];
        const existingMessageContents = new Set([
          "Some old message"
        ]);
        return filterNewMessages(messages, existingMessageContents).length;
      });
      expect(result).toBe(1);
    });

    test('filters correctly with mixed new and existing', async () => {
      const result = await page.evaluate(() => {
        const messages = [
          { content: "Old message" },
          { content: "New message" },
          { content: "Another old one" }
        ];
        const existingMessageContents = new Set([
          "Old message",
          "Another old one"
        ]);
        const filtered = filterNewMessages(messages, existingMessageContents);
        return {
          count: filtered.length,
          content: filtered[0]?.content
        };
      });
      expect(result.count).toBe(1);
      expect(result.content).toBe("New message");
    });

    test('handles empty existing set', async () => {
      const result = await page.evaluate(() => {
        const messages = [
          { content: "Message 1" },
          { content: "Message 2" }
        ];
        const existingMessageContents = new Set();
        return filterNewMessages(messages, existingMessageContents).length;
      });
      expect(result).toBe(2);
    });

    test('handles real-world French conversation', async () => {
      const result = await page.evaluate(() => {
        // Simulating how Affinity might store the content with escapes
        const messages = [
          { content: "Salut! Comment ça va?" },
          { content: "J'espère qu'on pourra se voir bientôt" },
          { content: "C'est vraiment super de t'avoir rencontré" }
        ];
        const existingMessageContents = new Set([
          "Salut! Comment ça va?",
          "J\\'espère qu\\'on pourra se voir bientôt",
          "C\\'est vraiment super de t\\'avoir rencontré"
        ]);
        return filterNewMessages(messages, existingMessageContents).length;
      });
      expect(result).toBe(0); // All should be detected as duplicates
    });
  });
});
