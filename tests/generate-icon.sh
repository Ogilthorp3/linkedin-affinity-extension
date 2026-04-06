#!/usr/bin/env bash
# Generate the Sith Holocron icon using agent-browser instead of Playwright.

set -euo pipefail

REPORT_DIR="$(dirname "$0")"
HTML_PATH="$(cd "$REPORT_DIR" && pwd)/new-icon-design.html"
OUTPUT_PATH="$REPORT_DIR/sith-holocron-icon.png"
SESSION="icon-generator"

cleanup() {
  agent-browser close --session "$SESSION" || true
}
trap cleanup EXIT

agent-browser --session "$SESSION" open "file://$HTML_PATH"
agent-browser --session "$SESSION" screenshot --full "$OUTPUT_PATH"

if [[ -f "$OUTPUT_PATH" ]]; then
  echo "Generated icon: $OUTPUT_PATH"
else
  echo "Icon generation failed"
  exit 1
fi
