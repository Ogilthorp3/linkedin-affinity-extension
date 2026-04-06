#!/bin/bash
# Build script for LinkedIn Affinity Safari Extension
# Automates: sync files, run tests, build Xcode project

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$PROJECT_ROOT/Extension"
SAFARI_RESOURCES="$PROJECT_ROOT/LinkedIn Affinity/LinkedIn Affinity Extension/Resources"
XCODE_PROJECT="$PROJECT_ROOT/LinkedIn Affinity/LinkedIn Affinity.xcodeproj"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}LinkedIn Affinity Extension Build Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

RUN_TESTS=true
BUILD_XCODE=true
OPEN_SAFARI=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            RUN_TESTS=false
            shift
            ;;
        --skip-build)
            BUILD_XCODE=false
            shift
            ;;
        --open)
            OPEN_SAFARI=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-tests    Skip running Jest unit tests"
            echo "  --skip-build    Skip Xcode build"
            echo "  --open          Open Safari after build"
            echo "  --verbose, -v   Show detailed output"
            echo "  --help, -h      Show this help"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${YELLOW}[1/4] Syncing Extension files to Safari...${NC}"

sync_file() {
    local src="$1"
    local dst="$2"
    if [ -f "$src" ]; then
        cp "$src" "$dst"
        if [ "$VERBOSE" = true ]; then
            echo "  Copied: $(basename "$src")"
        fi
    fi
}

sync_file "$EXTENSION_DIR/background.js" "$SAFARI_RESOURCES/background.js"
sync_file "$EXTENSION_DIR/content.js" "$SAFARI_RESOURCES/content.js"
sync_file "$EXTENSION_DIR/popup.js" "$SAFARI_RESOURCES/popup.js"
sync_file "$EXTENSION_DIR/popup.html" "$SAFARI_RESOURCES/popup.html"
sync_file "$EXTENSION_DIR/styles.css" "$SAFARI_RESOURCES/styles.css"

echo -e "${GREEN}  Files synced successfully${NC}"

if [ "$RUN_TESTS" = true ]; then
    echo ""
    echo -e "${YELLOW}[2/4] Running unit tests...${NC}"
    cd "$PROJECT_ROOT"

    if [ "$VERBOSE" = true ]; then
        npm test
    else
        npm test -- --silent 2>/dev/null
    fi

    TEST_EXIT=$?
    if [ $TEST_EXIT -eq 0 ]; then
        echo -e "${GREEN}  All tests passed${NC}"
    else
        echo -e "${RED}  Tests failed!${NC}"
        exit 1
    fi
else
    echo ""
    echo -e "${YELLOW}[2/4] Skipping unit tests${NC}"
fi

if [ "$BUILD_XCODE" = true ]; then
    echo ""
    echo -e "${YELLOW}[3/4] Building Xcode project...${NC}"

    cd "$PROJECT_ROOT"

    if [ "$VERBOSE" = true ]; then
        xcodebuild -project "$XCODE_PROJECT" \
            -scheme "LinkedIn Affinity" \
            -configuration Debug \
            build
    else
        xcodebuild -project "$XCODE_PROJECT" \
            -scheme "LinkedIn Affinity" \
            -configuration Debug \
            build 2>&1 | grep -E "(BUILD|error:|warning:)" || true
    fi

    BUILD_EXIT=${PIPESTATUS[0]}
    if [ $BUILD_EXIT -eq 0 ]; then
        echo -e "${GREEN}  Build succeeded${NC}"
    else
        echo -e "${RED}  Build failed!${NC}"
        exit 1
    fi
else
    echo ""
    echo -e "${YELLOW}[3/4] Skipping Xcode build${NC}"
fi

echo ""
if [ "$OPEN_SAFARI" = true ]; then
    echo -e "${YELLOW}[4/4] Opening Safari...${NC}"
    open -a Safari "https://www.linkedin.com/messaging/"
    echo -e "${GREEN}  Safari opened${NC}"
else
    echo -e "${YELLOW}[4/4] Skipping Safari open (use --open to enable)${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Build complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Open Safari Preferences > Extensions"
echo "  2. Enable 'LinkedIn Affinity' extension"
echo "  3. Go to LinkedIn Messaging to test"
echo ""
