#!/usr/bin/env bash
# Holocron Command Center Diagnostic using agent-browser

set -euo pipefail

REPORT_DIR="$(dirname "$0")"
log() { echo "$(date '+%H:%M:%S') $1"; }

log "🚀 Initiating Holocron UI Diagnostic..."

# Use a named session
cleanup() {
  agent-browser close --session holocron-diag || true
}
trap cleanup EXIT

# 1. Check Holocron UI
log "🌐 Navigating to Holocron UI (3333)..."
if ! agent-browser --session holocron-diag open "http://127.0.0.1:3333"; then
  log "❌ Holocron UI (3333) is unreachable."
  exit 1
fi
agent-browser --session holocron-diag wait --load networkidle

# 2. Switch to Command Tab
log "🛡️ Attempting to switch to Command Center tab..."
# The Command icon is the 3rd nav item
agent-browser --session holocron-diag find role navigation click --name "Shield" || \
agent-browser --session holocron-diag click "nav.sidebar .nav-icon:nth-child(3)"

# 3. Inspect Iframe
log "🔍 Locating Command Center Iframe..."
SNAPSHOT=$(agent-browser --session holocron-diag snapshot -i)

if echo "$SNAPSHOT" | grep -q "Iframe"; then
  log "✅ Iframe detected in snapshot."
  # agent-browser inlines iframe content, check for expected text
  if echo "$SNAPSHOT" | grep -q "Command Center"; then
    log "✅ Iframe content verified."
  else
    log "⚠️ Iframe present but content missing or unexpected."
  fi
else
  log "❌ Iframe NOT detected."
  # Diagnostic: check port 1111
  log "🔍 Checking port 1111 directly..."
  if curl -sf http://127.0.0.1:1111 > /dev/null; then
    log "📡 Port 1111 is UP but not showing in UI."
  else
    log "❌ Port 1111 is DOWN."
  fi
fi

# 4. Capture Final State
log "📸 Capturing diagnostic screenshot..."
agent-browser --session holocron-diag screenshot --full "$REPORT_DIR/holocron-command-diagnostic.png"
log "✅ Diagnostic complete."
