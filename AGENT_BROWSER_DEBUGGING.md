# Agent-Browser Debugging Guide

This project now uses an `agent-browser` operator loop for live browser diagnostics instead of the older browser stack.

## The Strategy

LinkedIn changes its DOM constantly, so the repo keeps the live checks simple:

1. `agent-browser` opens the real target page in a local browser session.
2. The shell script captures semantic snapshots, screenshots, and minimal text artifacts.
3. The operator reviews those artifacts and patches selectors or runtime behavior in `content.js`.

This keeps the debugging path close to the real browser session instead of maintaining a parallel automation stack.

## Main Diagnostics

### LinkedIn selector monitor

```bash
export LINKEDIN_LI_AT="your_li_at_cookie"
export LINKEDIN_JSESSIONID="your_jsessionid"
export AFFINITY_API_KEY="your_affinity_key"
npm run test:monitor:linkedin
```

### OBLITERATUS monitor

```bash
npm run test:monitor:obliteratus
```

### Holocron iframe diagnostic

```bash
npm run test:holocron
```

### Live view capture

```bash
npm run test:vision
```

## Artifacts

These scripts may write temporary screenshots or status files under `tests/` or `test-results/`, but those directories are treated as disposable local artifacts and are ignored by git.

## Best Practices

- Prefer semantic `agent-browser` operations before brittle CSS clicks.
- Keep failure artifacts small and operator-readable.
- Store status in `tests/monitor-status.json` and scrub secrets before writing.
- When LinkedIn breaks selectors again, patch the shell monitor and `content.js` together so the live diagnostic stays honest.
