# Playwright Collaborative Debugging Guide

This project uses a **"Navigator-Driver"** debugging loop with Playwright to manage LinkedIn's fragile DOM structure.

## The Strategy

Since LinkedIn frequently changes its internal CSS classes and DOM structure, we use a proactive monitoring script (`tests/linkedin-selector-monitor.spec.js`) to verify that the extension's selectors are still valid.

### The Feedback Loop

1. **Navigator (Gemini CLI)**: Writes the script with heavy logging, explicit error handling, and automated state capture (screenshots/HTML).
2. **Driver (User)**: Runs the script locally and provides the full terminal output.
3. **Navigator**: Analyzes logs and captured artifacts to diagnose selector failures or navigation issues.
4. **Iterate**: Gemini provides a revised script or selector update for `content.js`.

## Holocron UI Diagnostic

If a section of the Holocron (like the Command Center) is not loading, use the interface diagnostic:

```bash
npx playwright test tests/holocron-diagnostic.spec.js --headed
```

This will:
1. Navigate to the Holocron UI (3333).
2. Switch to the Command Center tab.
3. Inspect the iframe on port 1111.
4. Capture any console errors from inside the iframe.
5. Save a diagnostic screenshot: `tests/holocron-command-diagnostic.png`.

## 👁️ The Vision Bridge (Giving Gemini Eyes)

If you want me to "see" what is on your screen to help diagnose a UI glitch:

1. **Snapshot Mode**:
```bash
node tools/vision/capture.js
```
This saves `tests/holocron-live-view.png` for me to analyze.

2. **Neural Link Mode (Persistent)**:
Ensure you started the Holocron via `./run_sanctum.sh`. I can now use Playwright to "Attach" to your live window on port 1138 to inspect the DOM.


## Setup & Execution

### Prerequisites

You must set your LinkedIn authentication cookies as environment variables:

- `LINKEDIN_LI_AT`: Found in Browser DevTools > Application > Cookies.
- `LINKEDIN_JSESSIONID`: Found in the same location.

### Running the Monitor

```bash
export LINKEDIN_LI_AT="your_li_at_cookie"
export LINKEDIN_JSESSIONID="your_jsessionid"
npx playwright test tests/linkedin-selector-monitor.spec.js
```

## Debug Artifacts

If a test fails, the monitor script automatically generates:

1. **Detailed Logs**: Every step (navigation, selector checks) is logged to the console.
2. **Manual Screenshot**: `debug-screenshot-manual.png` (Full page view at the moment of failure).
3. **HTML Snapshot**: `debug-linkedin-state.html` (Full DOM structure for offline selector analysis).
4. **Playwright Report**: A standard HTML report is generated in `playwright-report/`.

## Best Practices for Selectors

When updating `content.js` or the monitor script:
- **Prefer ARIA roles** (`getByRole`) or test IDs where possible.
- **Use fallback selectors** in a comma-separated list (e.g., `header.msg-entity-lockup__header, .msg-thread__topcard-container`).
- **Log bounding boxes** for visual confirmation of element locations.
