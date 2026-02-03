#!/bin/bash

#===============================================================================
# LinkedIn Affinity Safari Extension - Distribution Setup Script
#===============================================================================
# This script helps you set up the prerequisites for building and distributing
# the Safari extension. Run this ONCE before using build-and-distribute.sh
#
# Prerequisites you'll need:
#   - Apple Developer account (Individual) with Team ID: GJ994MN2YF
#   - Access to https://developer.apple.com
#   - Access to https://appleid.apple.com
#===============================================================================

set -e

TEAM_ID="GJ994MN2YF"
KEYCHAIN_PROFILE="linkedin-affinity-notarization"

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
    echo "[OK] $1"
}

print_warning() {
    echo "[!] $1"
}

#===============================================================================
# Check Current Status
#===============================================================================

check_current_status() {
    print_header "Checking Current Setup Status"

    # Check Xcode
    print_step "Xcode Command Line Tools"
    if command -v xcodebuild &> /dev/null; then
        XCODE_VERSION=$(xcodebuild -version | head -1)
        print_success "Installed: $XCODE_VERSION"
    else
        print_warning "NOT INSTALLED - Will guide you through installation"
    fi

    # Check Developer ID certificate
    print_step "Developer ID Application Certificate"
    CERT_COUNT=$(security find-identity -v -p codesigning | grep -c "Developer ID Application" || true)
    if [ "$CERT_COUNT" -gt 0 ]; then
        CERT_NAME=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed 's/.*"\(.*\)".*/\1/')
        print_success "Found: $CERT_NAME"
    else
        print_warning "NOT FOUND - Will guide you through creation"
    fi

    # Check notarization credentials
    print_step "Notarization Credentials"
    if xcrun notarytool history --keychain-profile "$KEYCHAIN_PROFILE" &> /dev/null 2>&1; then
        print_success "Configured in Keychain"
    else
        print_warning "NOT CONFIGURED - Will guide you through setup"
    fi

    # Check create-dmg (optional)
    print_step "create-dmg (optional, for prettier DMGs)"
    if command -v create-dmg &> /dev/null; then
        print_success "Installed"
    else
        print_warning "Not installed - Will use hdiutil instead (still works fine)"
    fi
}

#===============================================================================
# Installation Guides
#===============================================================================

guide_xcode() {
    print_header "Step 1: Install Xcode Command Line Tools"

    if command -v xcodebuild &> /dev/null; then
        echo "Xcode command line tools are already installed."
        echo ""
        read -p "Press Enter to continue..."
        return
    fi

    echo "You need Xcode command line tools to build the extension."
    echo ""
    echo "Run this command in Terminal:"
    echo ""
    echo "    xcode-select --install"
    echo ""
    echo "A dialog will appear - click 'Install' and wait for it to complete."
    echo ""
    read -p "Press Enter after installation completes..."

    if command -v xcodebuild &> /dev/null; then
        print_success "Xcode tools installed successfully!"
    else
        print_warning "Xcode tools not detected. Please try again."
    fi
}

guide_certificate() {
    print_header "Step 2: Create Developer ID Application Certificate"

    CERT_COUNT=$(security find-identity -v -p codesigning | grep -c "Developer ID Application" || true)
    if [ "$CERT_COUNT" -gt 0 ]; then
        echo "Developer ID Application certificate is already installed."
        echo ""
        read -p "Press Enter to continue..."
        return
    fi

    echo "You need a 'Developer ID Application' certificate to sign the app"
    echo "for distribution outside the Mac App Store."
    echo ""
    echo "Follow these steps:"
    echo ""
    echo "1. Open Keychain Access on your Mac"
    echo "   (Applications > Utilities > Keychain Access)"
    echo ""
    echo "2. Go to: Keychain Access > Certificate Assistant > Request a Certificate"
    echo "   from a Certificate Authority"
    echo ""
    echo "3. Fill in:"
    echo "   - User Email Address: your Apple ID email"
    echo "   - Common Name: your name"
    echo "   - Request is: Saved to disk"
    echo ""
    echo "4. Save the .certSigningRequest file"
    echo ""
    echo "5. Open https://developer.apple.com/account/resources/certificates/list"
    echo ""
    echo "6. Click the '+' button to create a new certificate"
    echo ""
    echo "7. Select 'Developer ID Application' and click Continue"
    echo ""
    echo "8. Upload the .certSigningRequest file you created"
    echo ""
    echo "9. Download the certificate and double-click to install"
    echo ""
    echo "NOTE: If you see 'Developer ID Application' greyed out, you may need"
    echo "      to request access through the Apple Developer Program."
    echo ""
    read -p "Press Enter after you've installed the certificate..."

    CERT_COUNT=$(security find-identity -v -p codesigning | grep -c "Developer ID Application" || true)
    if [ "$CERT_COUNT" -gt 0 ]; then
        print_success "Certificate installed successfully!"
    else
        echo ""
        echo "Certificate not detected. Let me check for common issues..."
        echo ""
        echo "Checking for any Apple signing certificates..."
        security find-identity -v -p codesigning | head -10
        echo ""
        print_warning "If you see other certificates but not 'Developer ID Application',"
        print_warning "you may have installed the wrong type. Please try again."
    fi
}

guide_notarization() {
    print_header "Step 3: Set Up Notarization Credentials"

    if xcrun notarytool history --keychain-profile "$KEYCHAIN_PROFILE" &> /dev/null 2>&1; then
        echo "Notarization credentials are already configured."
        echo ""
        read -p "Press Enter to continue..."
        return
    fi

    echo "Notarization is required for Gatekeeper to allow your app to run"
    echo "without security warnings."
    echo ""
    echo "First, create an app-specific password:"
    echo ""
    echo "1. Go to https://appleid.apple.com/account/manage"
    echo ""
    echo "2. Sign in with your Apple ID"
    echo ""
    echo "3. Go to 'Sign-In and Security' > 'App-Specific Passwords'"
    echo ""
    echo "4. Click '+' to generate a new password"
    echo ""
    echo "5. Name it something like 'LinkedIn Affinity Notarization'"
    echo ""
    echo "6. Copy the generated password (format: xxxx-xxxx-xxxx-xxxx)"
    echo ""
    read -p "Press Enter when you have your app-specific password ready..."

    echo ""
    echo "Now let's store the credentials in your Keychain."
    echo ""
    echo "Enter your Apple ID email address:"
    read -r APPLE_ID

    echo ""
    echo "Enter your app-specific password:"
    read -rs APP_PASSWORD
    echo ""

    echo "Storing credentials in Keychain..."
    xcrun notarytool store-credentials "$KEYCHAIN_PROFILE" \
        --apple-id "$APPLE_ID" \
        --team-id "$TEAM_ID" \
        --password "$APP_PASSWORD"

    if xcrun notarytool history --keychain-profile "$KEYCHAIN_PROFILE" &> /dev/null 2>&1; then
        print_success "Notarization credentials stored successfully!"
    else
        print_warning "Failed to verify credentials. Please check your Apple ID and password."
    fi
}

guide_create_dmg() {
    print_header "Step 4: Install create-dmg (Optional)"

    if command -v create-dmg &> /dev/null; then
        echo "create-dmg is already installed."
        echo ""
        read -p "Press Enter to continue..."
        return
    fi

    echo "create-dmg is an optional tool that creates prettier DMG installers"
    echo "with nice backgrounds and icons. The build script will work without it,"
    echo "but the DMGs won't look as professional."
    echo ""
    echo "To install with Homebrew:"
    echo ""
    echo "    brew install create-dmg"
    echo ""
    echo "If you don't have Homebrew:"
    echo ""
    echo "    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo ""
    read -p "Press Enter to skip or after installation..."
}

#===============================================================================
# Final Summary
#===============================================================================

final_summary() {
    print_header "Setup Complete - Final Status"

    local all_ready=true

    # Xcode
    if command -v xcodebuild &> /dev/null; then
        XCODE_VERSION=$(xcodebuild -version | head -1)
        print_success "Xcode: $XCODE_VERSION"
    else
        print_warning "Xcode: NOT INSTALLED"
        all_ready=false
    fi

    # Certificate
    CERT_COUNT=$(security find-identity -v -p codesigning | grep -c "Developer ID Application" || true)
    if [ "$CERT_COUNT" -gt 0 ]; then
        print_success "Developer ID Certificate: INSTALLED"
    else
        print_warning "Developer ID Certificate: NOT FOUND"
        all_ready=false
    fi

    # Notarization
    if xcrun notarytool history --keychain-profile "$KEYCHAIN_PROFILE" &> /dev/null 2>&1; then
        print_success "Notarization Credentials: CONFIGURED"
    else
        print_warning "Notarization Credentials: NOT CONFIGURED"
        all_ready=false
    fi

    # create-dmg
    if command -v create-dmg &> /dev/null; then
        print_success "create-dmg: INSTALLED"
    else
        echo "[OPTIONAL] create-dmg: not installed (will use hdiutil)"
    fi

    echo ""
    if [ "$all_ready" = true ]; then
        print_header "Ready to Build!"
        echo ""
        echo "You can now run the build script:"
        echo ""
        echo "    ./build-and-distribute.sh"
        echo ""
        echo "This will create a signed, notarized DMG installer in the 'dist' folder."
    else
        print_header "Setup Incomplete"
        echo ""
        echo "Please complete the missing steps above before building."
        echo ""
        echo "Run this script again to continue setup:"
        echo ""
        echo "    ./setup-distribution.sh"
    fi
}

#===============================================================================
# Main Menu
#===============================================================================

main_menu() {
    print_header "LinkedIn Affinity Safari Extension - Distribution Setup"
    echo ""
    echo "This script will help you set up everything needed to build"
    echo "and distribute the Safari extension to your colleagues."
    echo ""
    echo "Team ID: $TEAM_ID"
    echo ""

    check_current_status

    echo ""
    echo "Would you like to:"
    echo "  1. Run interactive setup (recommended)"
    echo "  2. Just check status and exit"
    echo ""
    read -p "Enter choice (1 or 2): " choice

    case $choice in
        1)
            guide_xcode
            guide_certificate
            guide_notarization
            guide_create_dmg
            final_summary
            ;;
        2)
            final_summary
            ;;
        *)
            echo "Invalid choice"
            exit 1
            ;;
    esac
}

# Run main menu
main_menu
