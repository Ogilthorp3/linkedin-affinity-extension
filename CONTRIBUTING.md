# Developer Guide

Quick reference for contributing to the LinkedIn Affinity extension.

## Prerequisites

- Node.js 18+
- npm
- Xcode (for Safari builds)
- Chrome or Safari browser

## Setup

```bash
npm install
```

## Commands

### Testing

| Command | Description |
|---------|-------------|
| `npm test` | Run unit tests (mocked browser APIs) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:integration` | Run integration tests (requires real API keys) |
| `npm run test:all` | Run all tests sequentially |
| `npm run test:voyager` | Test LinkedIn Voyager API directly |

### Building

| Command | Description |
|---------|-------------|
| `npm run build` | Full build: sync files, run tests, build Xcode |
| `npm run build:quick` | Build without running tests |

### Build Script Options

```bash
./scripts/build.sh [options]

Options:
  --skip-tests    Skip Jest unit tests
  --skip-build    Skip Xcode build
  --open          Open Safari after build
  --verbose, -v   Show detailed output
```

## Project Structure

```
├── Extension/              # Chrome extension source (primary)
│   ├── manifest.json       # Extension manifest (Manifest V3)
│   ├── content.js          # LinkedIn DOM injection & data extraction
│   ├── background.js       # Affinity API handler
│   ├── popup.html/js       # Settings UI
│   └── styles.css          # Injected styles
│
├── LinkedIn Affinity/      # Safari wrapper (Xcode project)
│   └── ...Extension/Resources/  # Safari copies of Extension/ files
│
├── tests/
│   ├── setup.js            # Jest setup & global mocks
│   ├── mocks/browserAPI.js # Browser API mock factory
│   ├── content.test.js     # content.js unit tests
│   ├── background.test.js  # background.js unit tests
│   ├── integration/        # Real API integration tests
│   │   └── affinity-api.test.js
│   ├── e2e/                # End-to-end workflow tests
│   │   └── full-workflow.test.js
│   └── test-voyager-*.js   # LinkedIn API test scripts
│
├── scripts/
│   └── build.sh            # Automated build script
│
├── jest.config.js          # Jest configuration
└── package.json            # npm scripts & dependencies
```

## Architecture

```
LinkedIn Page → Content Script → Background Worker → Affinity API
     ↓               ↓                  ↓
  DOM Events    Extract Data      API Calls (CRUD)
  Button UI     Voyager API       Person/Org/Notes
```

### Content Script (`content.js`)
- Runs on `linkedin.com/messaging/*`
- Extracts: sender name, headline, LinkedIn URL, messages
- Fetches work history via Voyager API
- Injects "Send to Affinity" button
- Keyboard shortcut: `Cmd/Ctrl+Shift+A`

### Background Worker (`background.js`)
- Handles all Affinity API communication
- Workflow: search person → create if needed → link organizations → add note
- Duplicate detection via note content comparison

### Key Functions

**content.js:**
- `fetchProfileViaVoyager(url)` - Get full profile from LinkedIn API
- `extractCompaniesFromVoyagerResponse(data)` - Parse work history
- `getLinkedInCsrfToken()` - Extract CSRF from cookies

**background.js:**
- `affinityRequest(endpoint, options)` - Authenticated API call
- `searchPerson(name)` / `createPerson(data)` - Person CRUD
- `findOrCreateOrganization(name)` - Organization CRUD
- `addNote(personId, content)` - Add conversation note
- `checkDuplicateAndGetExistingMessages()` - Prevent duplicate sends

## Testing

### Unit Tests
Mock browser APIs and fetch. Test pure functions.

```javascript
// tests/background.test.js
describe('formatConversationNote', () => {
  test('formats conversation correctly', () => {...});
});
```

### Integration Tests
Require real API credentials. Set environment variables:

```bash
export AFFINITY_API_KEY="your-key"
export LINKEDIN_LI_AT="your-cookie"
export LINKEDIN_JSESSIONID="your-session"
npm run test:integration
```

### E2E Tests
Full workflow simulation with mocked responses. Covers:
- Voyager API profile fetching
- Person creation with field population
- Organization linking (all work history)
- Note creation with duplicate detection

### Test Helpers (from `tests/setup.js`)

```javascript
// Set up API key for tests
global.setupApiKey('test-key');

// Mock a fetch response
global.mockFetchResponse({ id: 123, name: 'Test' });

// Mock a fetch error
global.mockFetchError('Network error');
```

## APIs

### Affinity API
- **Auth:** Basic Auth with empty username
- **Base URL:** `https://api.affinity.co`
- **Endpoints:** `/persons`, `/organizations`, `/notes`, `/field-values`

```javascript
// Auth header format
`Basic ${btoa(':' + apiKey)}`
```

### LinkedIn Voyager API (Internal)
- **Auth:** Cookies (`li_at`, `JSESSIONID`) + CSRF token header
- **Endpoint:** `/voyager/api/identity/dash/profiles`

```javascript
// Headers required
{
  'csrf-token': JSESSIONID,
  'x-restli-protocol-version': '2.0.0',
  'accept': 'application/vnd.linkedin.normalized+json+2.1'
}
```

## Browser Loading

### Chrome
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `Extension/` directory

### Safari
1. Run `npm run build` (syncs files + builds Xcode)
2. Safari → Settings → Extensions → Enable "LinkedIn Affinity"
3. For unsigned dev: Safari → Develop → Allow Unsigned Extensions

## Common Issues

**Button not appearing:**
LinkedIn changes DOM frequently. Update selectors in `content.js` using DevTools.

**Voyager API 403:**
Cookies expired. Re-extract `li_at` and `JSESSIONID` from browser.

**Duplicate detection not working:**
Affinity escapes markdown in notes. Check regex in `checkDuplicateAndGetExistingMessages()`.

**Safari not updating:**
Run `npm run build` to sync files. Safari caches aggressively.

## Debugging

All operations log with `[LinkedIn to Affinity]` prefix:

```javascript
console.log('[LinkedIn to Affinity] Creating person:', name);
```

Open browser DevTools console to see logs.

## Making Changes

1. Edit files in `Extension/` (primary source)
2. Run `npm test` to verify
3. For Safari: `npm run build` syncs to Safari resources
4. Test in browser
5. Keep Chrome and Safari files in sync
