#!/usr/bin/env bash
# Neural Link: Capture Current View using agent-browser

set -euo pipefail

SCREENSHOT_PATH="$(dirname "$0")/holocron-live-analysis.png"

echo "👁️ Neural Link: Initiating capture via agent-browser..."

# Connect to the ALREADY RUNNING browser on port 1138 and take screenshot
agent-browser --cdp 1138 screenshot --full "$SCREENSHOT_PATH"

if [[ -f "$SCREENSHOT_PATH" ]]; then
  echo "📸 View captured to: $SCREENSHOT_PATH"
else
  echo "❌ Capture failed."
  exit 1
fi
