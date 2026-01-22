# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a cross-platform browser extension that captures LinkedIn conversations and sends them to Affinity CRM. It supports Chrome/Chromium (native) and Safari (via Xcode wrapper app).

**Tech stack:** Vanilla JavaScript (ES6+), Chrome Extension APIs (Manifest V3), Swift (Safari container app only). No npm dependencies or build tools for the extension itself.

## Development Commands

### Chrome Extension
```bash
# No build step - load directly in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select the Extension/ directory
```

### Safari Extension
```bash
# Generate icons from SVG (requires librsvg)
brew install librsvg
chmod +x setup-icons.sh
./setup-icons.sh

# Build in Xcode
# Open LinkedIn Affinity.xcodeproj, select "LinkedIn Affinity" scheme, press ⌘R

# Enable in Safari: Safari → Settings → Extensions → LinkedIn Affinity
# For development: Safari → Settings → Advanced → "Show features for web developers"
#                  Then: Develop menu → Allow Unsigned Extensions
```

## Architecture

The extension uses a three-component model:

1. **Content Script** (`Extension/content.js`) - Runs on LinkedIn messaging pages, extracts conversation data (sender info, messages, timestamps), injects "Send to Affinity" button into LinkedIn UI, handles keyboard shortcut (Cmd/Ctrl+Shift+A)

2. **Background Service Worker** (`Extension/background.js`) - Handles all Affinity API communication using Basic Auth. Workflow: search for person → create if not found → add formatted note

3. **Popup UI** (`Extension/popup.html`, `Extension/popup.js`) - Settings interface for API key configuration with test connection functionality

**Data flow:** LinkedIn Page → Content Script (extract) → Background Worker (API call) → Affinity CRM

## Key Files

| File | Purpose |
|------|---------|
| `Extension/manifest.json` | Chrome extension config (Manifest V3) |
| `Extension/content.js` | LinkedIn DOM injection & data extraction (343 lines) |
| `Extension/background.js` | Affinity API handler (234 lines) |
| `Extension/popup.html/js` | Settings UI & logic |
| `LinkedIn Affinity/LinkedIn Affinity Extension/Resources/` | Safari-specific extension files |

## Affinity API Integration

- **Auth:** Basic Auth with empty username: `Authorization: Basic ${btoa(':' + apiKey)}`
- **Base URL:** `https://api.affinity.co`
- **Endpoints used:** `/persons` (search/create), `/notes` (add), `/whoami` (test connection)

## Important Maintenance Notes

**DOM Selector Fragility:** LinkedIn frequently changes their DOM structure. If the button stops appearing or data extraction breaks, update selectors in `content.js`. Use browser DevTools to inspect current LinkedIn class names for: conversation header, profile link, name element, message containers.

**Debugging:** All operations log with `[LinkedIn to Affinity]` prefix. Check browser console for errors.

**Safari vs Chrome:** Both variants share the same logic but Safari files are in `LinkedIn Affinity Extension/Resources/`. Keep them in sync when making changes.
