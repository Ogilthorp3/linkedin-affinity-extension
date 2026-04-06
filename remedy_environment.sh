#!/bin/bash
# Navigator Environment Healer
# 
# Verifies node_modules and critical test files.

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "🧪 [Navigator] Checking environment health..."

# Check node_modules
if [ ! -d node_modules ]; then
  echo "⚠️ [Navigator] node_modules missing. Installing..."
  npm install
  echo "✅ [Navigator] node_modules restored."
else
  echo "✅ [Navigator] node_modules found."
fi

# Check for monitor-service.js
if [ ! -f tests/monitor-service.js ]; then
  echo "❌ [Navigator] CRITICAL: monitor-service.js missing!"
  exit 1
fi

echo "✅ [Navigator] Environment is healthy."
