# LinkedIn to Affinity

**Built by [Triptyq Capital](https://triptyq.com)** | Chrome & Safari Extension

A browser extension that captures LinkedIn conversations and syncs them to [Affinity CRM](https://www.affinity.co/) with one click. Built for dealflow teams who manage relationships in Affinity and don't want to leave LinkedIn to log interactions.

## Features

- **One-click sync** — Send any LinkedIn conversation to Affinity as a formatted note
- **Smart contact matching** — Finds existing contacts or creates new ones automatically
- **Work history import** — Pulls current and past roles from LinkedIn profiles via Voyager API
- **Organization linking** — Associates contacts with their companies in Affinity
- **Duplicate detection** — Prevents syncing the same conversation twice
- **Dashboard** — View Affinity lists, recent activity, and follow-up reminders from the extension popup
- **Weekly summary** — Copy a markdown dealflow summary to clipboard
- **Keyboard shortcut** — `Cmd+Shift+A` to sync instantly
- **Desktop notifications** — Confirmation when a sync completes
- **Cross-platform** — Chrome (native Manifest V3) and Safari (via Xcode wrapper)

## How It Works

```
LinkedIn Messaging  →  Content Script  →  Background Worker  →  Affinity CRM
   (extract data)      (parse & format)     (API calls)         (person + note)
```

1. Open any conversation on LinkedIn Messaging
2. Click the **Send to Affinity** button in the conversation header (or press `Cmd+Shift+A`)
3. The extension extracts the conversation, finds or creates the contact in Affinity, links their organizations, and adds the conversation as a note

## Requirements

- An [Affinity CRM](https://www.affinity.co/) account with API access
- Your Affinity API key (found in Affinity Settings > API)

## Installation

### Chrome / Chromium

1. Clone this repo
2. Open `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `Extension/` directory
5. Click the extension icon and enter your Affinity API key

### Safari

1. Install [librsvg](https://formulae.brew.sh/formula/librsvg) and generate icons:
   ```bash
   brew install librsvg
   ./setup-icons.sh
   ```
2. Open `LinkedIn Affinity.xcodeproj` in Xcode
3. Select the **LinkedIn Affinity** scheme and press `Cmd+R`
4. In Safari: **Settings > Extensions** > enable **LinkedIn Affinity**
5. For development builds: **Safari > Develop > Allow Unsigned Extensions**

See [SETUP.md](SETUP.md) for the full Safari walkthrough.

## Tech Stack

- **Extension:** Vanilla JavaScript (ES6+), Chrome Extension Manifest V3 — no frameworks, no bundler
- **Safari wrapper:** Swift (Xcode container app)
- **APIs:** Affinity REST API, LinkedIn Voyager API (internal)
- **Tests:** Jest with mocked browser APIs, plus `agent-browser` shell diagnostics for live UI checks

## Development

```bash
npm install               # Install dev dependencies (testing only)
npm test                  # Run unit tests
./remedy_environment.sh   # Self-healing: restores node_modules if missing
npm run test:coverage     # Generate coverage report
npm run test:agent-browser  # Run live agent-browser diagnostics
npm run test:holocron       # Holocron iframe diagnostic
npm run build             # Full build: sync files, test, build Xcode
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full developer guide.

## Privacy

The extension processes all data locally in your browser. Conversation data is sent directly to the Affinity API using your own credentials — no intermediary servers, no analytics, no tracking.

See [PRIVACY-POLICY.md](PRIVACY-POLICY.md) for details.

## Project Structure

```
Extension/                 # Chrome extension source (primary)
  manifest.json            # Manifest V3 config
  content.js               # LinkedIn DOM injection & data extraction
  background.js            # Affinity API handler
  popup.html / popup.js    # Settings & dashboard UI
  styles.css               # Injected styles

LinkedIn Affinity/         # Safari wrapper (Xcode project)
tests/                     # Jest unit, integration, and e2e tests
scripts/                   # Build automation
```

## Live Browser Diagnostics

The repo now uses `agent-browser` for live browser diagnostics instead of Playwright:

```bash
npm run test:monitor:linkedin
npm run test:monitor:obliteratus
npm run test:holocron
npm run test:vision
```

These scripts are intended for local operator sessions and write disposable artifacts into ignored report directories instead of keeping Playwright HTML reports in the repo.

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Triptyq Capital</strong><br>
  <em>Dealflow tools for the modern investor</em>
</p>
