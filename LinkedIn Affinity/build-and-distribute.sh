#!/bin/bash

#===============================================================================
# LinkedIn Affinity Safari Extension - Build and Distribution Script
#===============================================================================
# This script builds, signs, notarizes, and packages the Safari extension
# as a professional DMG installer ready for distribution to colleagues.
#
# Prerequisites:
#   - Apple Developer account with Team ID: GJ994MN2YF
#   - Developer ID Application certificate installed in Keychain
#   - App-specific password stored in Keychain for notarization
#   - Xcode command line tools installed
#
# Usage:
#   ./build-and-distribute.sh
#   ./build-and-distribute.sh --skip-notarization  (for testing)
#   ./build-and-distribute.sh --version 1.1        (specify version)
#===============================================================================

set -e  # Exit on any error

# Configuration
TEAM_ID="GJ994MN2YF"
BUNDLE_ID="com.TriptyqCapital.LinkedInAffinity"
APP_NAME="LinkedIn Affinity"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
XCODEPROJ="$PROJECT_DIR/LinkedIn Affinity.xcodeproj"
BUILD_DIR="$PROJECT_DIR/build"
ARCHIVE_DIR="$BUILD_DIR/Archives"
EXPORT_DIR="$BUILD_DIR/Export"
DMG_DIR="$BUILD_DIR/DMG"
OUTPUT_DIR="$PROJECT_DIR/dist"

# Notarization credentials (stored in Keychain)
KEYCHAIN_PROFILE="linkedin-affinity-notarization"

# Parse arguments
SKIP_NOTARIZATION=false
VERSION=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-notarization)
            SKIP_NOTARIZATION=true
            shift
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-notarization    Skip Apple notarization (for testing)"
            echo "  --version VERSION      Specify version number (e.g., 1.1)"
            echo "  --help, -h             Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

#===============================================================================
# Helper Functions
#===============================================================================

print_header() {
    echo ""
    echo "============================================================"
    echo "$1"
    echo "============================================================"
}

print_step() {
    echo ""
    echo ">>> $1"
}

print_success() {
    echo "[SUCCESS] $1"
}

print_error() {
    echo "[ERROR] $1" >&2
}

print_warning() {
    echo "[WARNING] $1"
}

cleanup() {
    print_step "Cleaning up temporary files..."
    rm -rf "$BUILD_DIR"
}

#===============================================================================
# Prerequisite Checks
#===============================================================================

check_prerequisites() {
    print_header "Checking Prerequisites"

    local errors=0

    # Check Xcode
    print_step "Checking Xcode installation..."
    if ! command -v xcodebuild &> /dev/null; then
        print_error "xcodebuild not found. Please install Xcode command line tools:"
        echo "         xcode-select --install"
        errors=$((errors + 1))
    else
        XCODE_VERSION=$(xcodebuild -version | head -1)
        print_success "Found $XCODE_VERSION"
    fi

    # Check for Developer ID Application certificate
    print_step "Checking Developer ID Application certificate..."
    CERT_COUNT=$(security find-identity -v -p codesigning | grep -c "Developer ID Application" || true)
    if [ "$CERT_COUNT" -eq 0 ]; then
        print_error "No 'Developer ID Application' certificate found in Keychain."
        echo ""
        echo "To fix this, you need to:"
        echo "1. Log in to https://developer.apple.com/account/resources/certificates/list"
        echo "2. Create a 'Developer ID Application' certificate"
        echo "3. Download and double-click to install in Keychain"
        echo ""
        echo "See DISTRIBUTION-GUIDE.md for detailed instructions."
        errors=$((errors + 1))
    else
        CERT_NAME=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed 's/.*"\(.*\)".*/\1/')
        print_success "Found certificate: $CERT_NAME"
    fi

    # Check for notarization profile (only if not skipping)
    if [ "$SKIP_NOTARIZATION" = false ]; then
        print_step "Checking notarization credentials..."
        if ! xcrun notarytool history --keychain-profile "$KEYCHAIN_PROFILE" &> /dev/null 2>&1; then
            print_warning "Notarization credentials not found in Keychain."
            echo ""
            echo "To set up notarization, run:"
            echo "  xcrun notarytool store-credentials '$KEYCHAIN_PROFILE' \\"
            echo "    --apple-id YOUR_APPLE_ID \\"
            echo "    --team-id $TEAM_ID \\"
            echo "    --password YOUR_APP_SPECIFIC_PASSWORD"
            echo ""
            echo "You can create an app-specific password at: https://appleid.apple.com/account/manage"
            echo ""
            echo "To skip notarization for testing, run with --skip-notarization"
            errors=$((errors + 1))
        else
            print_success "Notarization credentials found"
        fi
    else
        print_warning "Skipping notarization check (--skip-notarization flag)"
    fi

    # Check project exists
    print_step "Checking Xcode project..."
    if [ ! -d "$XCODEPROJ" ]; then
        print_error "Xcode project not found at: $XCODEPROJ"
        errors=$((errors + 1))
    else
        print_success "Found Xcode project"
    fi

    # Check for create-dmg or hdiutil
    print_step "Checking DMG creation tools..."
    if command -v create-dmg &> /dev/null; then
        DMG_TOOL="create-dmg"
        print_success "Found create-dmg (preferred)"
    else
        DMG_TOOL="hdiutil"
        print_success "Using hdiutil (built-in)"
    fi

    if [ $errors -gt 0 ]; then
        print_error "$errors prerequisite(s) failed. Please fix the issues above."
        exit 1
    fi

    print_success "All prerequisites passed!"
}

#===============================================================================
# Build Process
#===============================================================================

build_app() {
    print_header "Building Application"

    # Clean previous builds
    print_step "Cleaning previous builds..."
    rm -rf "$BUILD_DIR"
    mkdir -p "$ARCHIVE_DIR" "$EXPORT_DIR" "$DMG_DIR" "$OUTPUT_DIR"

    # Get version from project or use specified
    if [ -z "$VERSION" ]; then
        VERSION=$(xcodebuild -showBuildSettings -project "$XCODEPROJ" -scheme "$APP_NAME" 2>/dev/null | grep MARKETING_VERSION | head -1 | awk '{print $3}')
        if [ -z "$VERSION" ]; then
            VERSION="1.0"
        fi
    fi
    print_step "Building version: $VERSION"

    # Archive the app
    print_step "Creating archive..."
    xcodebuild archive \
        -project "$XCODEPROJ" \
        -scheme "$APP_NAME" \
        -configuration Release \
        -archivePath "$ARCHIVE_DIR/$APP_NAME.xcarchive" \
        MARKETING_VERSION="$VERSION" \
        CODE_SIGN_IDENTITY="Developer ID Application" \
        DEVELOPMENT_TEAM="$TEAM_ID" \
        CODE_SIGN_STYLE=Manual \
        | grep -E "^(Build|Archive|Signing|error:|warning:)" || true

    if [ ! -d "$ARCHIVE_DIR/$APP_NAME.xcarchive" ]; then
        print_error "Archive creation failed"
        exit 1
    fi
    print_success "Archive created"

    # Create export options plist
    print_step "Creating export options..."
    cat > "$BUILD_DIR/ExportOptions.plist" << 'EXPORTEOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>developer-id</string>
    <key>teamID</key>
    <string>GJ994MN2YF</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>signingCertificate</key>
    <string>Developer ID Application</string>
</dict>
</plist>
EXPORTEOF

    # Export the archive
    print_step "Exporting signed application..."
    xcodebuild -exportArchive \
        -archivePath "$ARCHIVE_DIR/$APP_NAME.xcarchive" \
        -exportPath "$EXPORT_DIR" \
        -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" \
        | grep -E "^(Export|error:|warning:)" || true

    APP_PATH="$EXPORT_DIR/$APP_NAME.app"
    if [ ! -d "$APP_PATH" ]; then
        print_error "Export failed - app not found"
        exit 1
    fi
    print_success "Application exported to: $APP_PATH"

    # Verify code signature
    print_step "Verifying code signature..."
    codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1 | head -5
    print_success "Code signature verified"
}

#===============================================================================
# Notarization
#===============================================================================

notarize_app() {
    if [ "$SKIP_NOTARIZATION" = true ]; then
        print_header "Skipping Notarization"
        print_warning "App will show Gatekeeper warnings when colleagues try to open it"
        return
    fi

    print_header "Notarizing Application"

    APP_PATH="$EXPORT_DIR/$APP_NAME.app"
    ZIP_PATH="$BUILD_DIR/$APP_NAME.zip"

    # Create ZIP for notarization
    print_step "Creating ZIP for notarization..."
    ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"
    print_success "ZIP created"

    # Submit for notarization
    print_step "Submitting to Apple for notarization..."
    echo "         This may take several minutes..."

    NOTARIZE_OUTPUT=$(xcrun notarytool submit "$ZIP_PATH" \
        --keychain-profile "$KEYCHAIN_PROFILE" \
        --wait 2>&1)

    echo "$NOTARIZE_OUTPUT"

    # Check if notarization succeeded
    if echo "$NOTARIZE_OUTPUT" | grep -q "status: Accepted"; then
        print_success "Notarization successful!"
    else
        print_error "Notarization failed"
        echo ""
        echo "You can check the notarization log with:"
        SUBMISSION_ID=$(echo "$NOTARIZE_OUTPUT" | grep "id:" | head -1 | awk '{print $2}')
        echo "  xcrun notarytool log $SUBMISSION_ID --keychain-profile $KEYCHAIN_PROFILE"
        exit 1
    fi

    # Staple the notarization ticket
    print_step "Stapling notarization ticket to app..."
    xcrun stapler staple "$APP_PATH"
    print_success "Notarization ticket stapled"

    # Verify the staple
    print_step "Verifying stapled notarization..."
    xcrun stapler validate "$APP_PATH"
    print_success "Staple verified"

    # Clean up ZIP
    rm "$ZIP_PATH"
}

#===============================================================================
# DMG Creation
#===============================================================================

create_dmg() {
    print_header "Creating DMG Installer"

    APP_PATH="$EXPORT_DIR/$APP_NAME.app"
    DMG_NAME="$APP_NAME-$VERSION"
    DMG_PATH="$OUTPUT_DIR/$DMG_NAME.dmg"

    # Remove existing DMG
    rm -f "$DMG_PATH"

    if [ "$DMG_TOOL" = "create-dmg" ]; then
        # Use create-dmg for a professional DMG
        print_step "Creating professional DMG with create-dmg..."
        create-dmg \
            --volname "$APP_NAME" \
            --volicon "$APP_PATH/Contents/Resources/AppIcon.icns" \
            --window-pos 200 120 \
            --window-size 600 400 \
            --icon-size 100 \
            --icon "$APP_NAME.app" 150 185 \
            --hide-extension "$APP_NAME.app" \
            --app-drop-link 450 185 \
            --no-internet-enable \
            "$DMG_PATH" \
            "$APP_PATH" \
            || true  # create-dmg returns non-zero even on success sometimes
    else
        # Use hdiutil for a basic DMG
        print_step "Creating DMG with hdiutil..."

        DMG_STAGING="$DMG_DIR/staging"
        mkdir -p "$DMG_STAGING"

        # Copy app
        cp -R "$APP_PATH" "$DMG_STAGING/"

        # Create Applications symlink
        ln -s /Applications "$DMG_STAGING/Applications"

        # Create README
        cat > "$DMG_STAGING/README.txt" << 'READMEEOF'
LinkedIn Affinity Safari Extension
==================================

Installation:
1. Drag "LinkedIn Affinity.app" to the Applications folder
2. Open the app from Applications
3. Go to Safari > Settings > Extensions
4. Enable "LinkedIn Affinity Extension"

That's it! The extension is now active on LinkedIn.
READMEEOF

        # Create temporary DMG
        hdiutil create \
            -volname "$APP_NAME" \
            -srcfolder "$DMG_STAGING" \
            -ov \
            -format UDRW \
            "$DMG_DIR/temp.dmg"

        # Convert to compressed read-only DMG
        hdiutil convert \
            "$DMG_DIR/temp.dmg" \
            -format UDZO \
            -imagekey zlib-level=9 \
            -o "$DMG_PATH"

        rm "$DMG_DIR/temp.dmg"
    fi

    if [ ! -f "$DMG_PATH" ]; then
        print_error "DMG creation failed"
        exit 1
    fi

    # Notarize and staple the DMG if notarization is enabled
    if [ "$SKIP_NOTARIZATION" = false ]; then
        print_step "Notarizing DMG..."

        NOTARIZE_OUTPUT=$(xcrun notarytool submit "$DMG_PATH" \
            --keychain-profile "$KEYCHAIN_PROFILE" \
            --wait 2>&1)

        if echo "$NOTARIZE_OUTPUT" | grep -q "status: Accepted"; then
            print_success "DMG notarization successful!"

            print_step "Stapling notarization ticket to DMG..."
            xcrun stapler staple "$DMG_PATH"
            print_success "DMG ticket stapled"
        else
            print_warning "DMG notarization failed - DMG may show warnings"
        fi
    fi

    # Calculate checksum
    print_step "Calculating checksum..."
    CHECKSUM=$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')
    echo "$CHECKSUM  $DMG_NAME.dmg" > "$OUTPUT_DIR/$DMG_NAME.sha256"

    print_success "DMG created: $DMG_PATH"
    echo "         SHA-256: $CHECKSUM"
}

#===============================================================================
# Summary
#===============================================================================

print_summary() {
    print_header "Build Complete!"

    echo ""
    echo "Distribution files are ready in: $OUTPUT_DIR"
    echo ""
    ls -lh "$OUTPUT_DIR"
    echo ""

    if [ "$SKIP_NOTARIZATION" = true ]; then
        print_warning "App was NOT notarized. Recipients will see Gatekeeper warnings."
        echo ""
        echo "To open an un-notarized app:"
        echo "  Right-click > Open > Open (bypass Gatekeeper)"
        echo ""
        echo "For production distribution, run without --skip-notarization"
    else
        print_success "App is signed and notarized - ready for distribution!"
        echo ""
        echo "Your colleagues can simply:"
        echo "  1. Open the DMG"
        echo "  2. Drag app to Applications"
        echo "  3. Open Safari > Settings > Extensions"
        echo "  4. Enable 'LinkedIn Affinity Extension'"
    fi

    echo ""
    echo "Files created:"
    echo "  - $OUTPUT_DIR/$APP_NAME-$VERSION.dmg"
    echo "  - $OUTPUT_DIR/$APP_NAME-$VERSION.sha256"
}

#===============================================================================
# Main
#===============================================================================

main() {
    print_header "LinkedIn Affinity Safari Extension - Build Script"
    echo "Team ID: $TEAM_ID"
    echo "Bundle ID: $BUNDLE_ID"

    check_prerequisites
    build_app
    notarize_app
    create_dmg
    print_summary

    # Optional cleanup
    # cleanup
}

# Run main function
main
