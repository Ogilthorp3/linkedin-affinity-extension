#!/bin/bash
# Generate PNG icons from SVG for Safari Extension

# Requires: brew install librsvg (for rsvg-convert)
# Or use any SVG to PNG converter

cd "$(dirname "$0")/Extension/icons"

# Check if rsvg-convert is available
if command -v rsvg-convert &> /dev/null; then
    rsvg-convert -w 16 -h 16 icon.svg > icon-16.png
    rsvg-convert -w 32 -h 32 icon.svg > icon-32.png
    rsvg-convert -w 48 -h 48 icon.svg > icon-48.png
    rsvg-convert -w 128 -h 128 icon.svg > icon-128.png
    echo "Icons generated successfully!"
else
    echo "rsvg-convert not found. Install with: brew install librsvg"
    echo "Or manually convert icon.svg to PNG at sizes: 16, 32, 48, 128"
fi
