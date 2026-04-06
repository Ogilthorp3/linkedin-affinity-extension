#!/usr/bin/env bash
# OBLITERATUS ML Interface Monitor using agent-browser

set -euo pipefail

REPORT_DIR="$(dirname "$0")"
log() { echo "$(date '+%H:%M:%S') $1"; }

log "🚀 Initiating OBLITERATUS Sector Scan..."

# Brief wait for potential server startup
sleep 5

OBLIT_URL="http://127.0.0.1:7860"

cleanup() {
  agent-browser close --session obliteratus-monitor || true
}
trap cleanup EXIT

try_monitor() {
  log "🌐 Navigating to ML Engine: $OBLIT_URL"
  if ! agent-browser --session obliteratus-monitor open "$OBLIT_URL"; then
    log "❌ OBLITERATUS UI unreachable."
    return 1
  fi
  agent-browser --session obliteratus-monitor wait --load networkidle

  log "🔍 Locating Gradio interface blocks..."
  SNAPSHOT=$(agent-browser --session obliteratus-monitor snapshot -i)

  if echo "$SNAPSHOT" | grep -q "gradio-app"; then
    log "✅ Gradio application container detected."
  else
    log "❌ Gradio application container NOT detected."
    return 1
  fi

  log "⏳ Checking UI hydration..."
  # Check if we have enough content
  CONTENT_LEN=$(agent-browser --session obliteratus-monitor get text body | wc -c)
  if (( CONTENT_LEN < 100 )); then
    log "❌ ML UI detected but seems empty (Length: $CONTENT_LEN)."
    return 1
  fi
  
  log "📊 Sector Density: $CONTENT_LEN characters detected."
  log "✅ UI Hydration verified."
  return 0
}

if try_monitor; then
  log "✨ OBLITERATUS stable."
else
  log "❌ OBLITERATUS Monitor Failed."
  # Capture failure state
  agent-browser --session obliteratus-monitor screenshot "$REPORT_DIR/obliteratus-failure.png"
  
  # Update status via node
  node -e "
    const fs = require('fs');
    const path = require('path');
    const statusPath = '$REPORT_DIR/monitor-status.json';
    const data = {
      status: 'ML_BREACH',
      lastRun: new Date().toISOString(),
      error: 'UI Validation Failed',
      sector: 'OBLITERATUS'
    };
    fs.writeFileSync(statusPath, JSON.stringify(data, null, 2));
  "
  exit 1
fi
