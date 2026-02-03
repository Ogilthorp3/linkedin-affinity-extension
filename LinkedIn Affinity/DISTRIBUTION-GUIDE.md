# LinkedIn Affinity Safari Extension - Distribution Guide

This guide explains how to build, sign, notarize, and distribute the LinkedIn Affinity Safari extension as a professional DMG installer.

## Overview

The distribution process creates a DMG file that colleagues can:
1. Download
2. Open and drag to Applications
3. Enable in Safari

No Gatekeeper warnings, no "Allow Anyway" in System Preferences - it just works.

## Table of Contents

1. [One-Time Setup](#one-time-setup)
2. [Building the Installer](#building-the-installer)
3. [Distributing to Colleagues](#distributing-to-colleagues)
4. [Colleague Installation Guide](#colleague-installation-guide)
5. [Troubleshooting](#troubleshooting)
6. [Technical Details](#technical-details)

---

## One-Time Setup

Before you can build distributable installers, you need to set up code signing and notarization. This only needs to be done once.

### Quick Setup (Recommended)

Run the interactive setup script:

```bash
cd "LinkedIn Affinity"
./setup-distribution.sh
```

This will guide you through all the steps below.

### Manual Setup

#### Step 1: Install Xcode Command Line Tools

```bash
xcode-select --install
```

Click "Install" in the dialog that appears.

#### Step 2: Create Developer ID Application Certificate

1. **Generate a Certificate Signing Request:**
   - Open **Keychain Access** (Applications > Utilities)
   - Menu: Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority
   - Enter your email address and name
   - Select "Saved to disk"
   - Save the `.certSigningRequest` file

2. **Create the Certificate:**
   - Go to [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)
   - Click the **+** button
   - Select **Developer ID Application**
   - Upload your `.certSigningRequest` file
   - Download the certificate

3. **Install the Certificate:**
   - Double-click the downloaded `.cer` file
   - It will be added to your Keychain

4. **Verify Installation:**
   ```bash
   security find-identity -v -p codesigning | grep "Developer ID"
   ```
   You should see something like:
   ```
   "Developer ID Application: Your Name (GJ994MN2YF)"
   ```

#### Step 3: Create App-Specific Password for Notarization

Apple requires two-factor authentication for notarization, so you need an app-specific password.

1. Go to [Apple ID Account Management](https://appleid.apple.com/account/manage)
2. Sign in with your Apple ID
3. Go to **Sign-In and Security** > **App-Specific Passwords**
4. Click **+** to generate a new password
5. Name it "LinkedIn Affinity Notarization"
6. Copy the generated password (format: `xxxx-xxxx-xxxx-xxxx`)

#### Step 4: Store Notarization Credentials

Store your credentials securely in the macOS Keychain:

```bash
xcrun notarytool store-credentials "linkedin-affinity-notarization" \
  --apple-id "your-apple-id@example.com" \
  --team-id "GJ994MN2YF" \
  --password "xxxx-xxxx-xxxx-xxxx"
```

Verify it worked:
```bash
xcrun notarytool history --keychain-profile "linkedin-affinity-notarization"
```

#### Step 5: (Optional) Install create-dmg

For prettier DMG installers:

```bash
brew install create-dmg
```

---

## Building the Installer

Once setup is complete, building is simple:

### Standard Build (Recommended)

```bash
cd "LinkedIn Affinity"
./build-and-distribute.sh
```

This will:
1. Build the app with Release configuration
2. Sign with your Developer ID Application certificate
3. Submit to Apple for notarization (~2-5 minutes)
4. Create a DMG installer
5. Notarize the DMG
6. Output everything to the `dist/` folder

### Build Options

```bash
# Skip notarization (for quick testing)
./build-and-distribute.sh --skip-notarization

# Specify a version number
./build-and-distribute.sh --version 1.2

# Combine options
./build-and-distribute.sh --version 1.2 --skip-notarization
```

### Build Output

After a successful build, you'll find:
- `dist/LinkedIn Affinity-1.0.dmg` - The installer
- `dist/LinkedIn Affinity-1.0.sha256` - Checksum for verification

---

## Distributing to Colleagues

### Sharing the DMG

Share the DMG file via:
- Company file server
- Dropbox/Google Drive/OneDrive
- Email (if small enough)
- Slack/Teams

### Verifying Integrity (Optional)

Share the `.sha256` file so colleagues can verify the download:

```bash
# On colleague's Mac
shasum -a 256 -c "LinkedIn Affinity-1.0.sha256"
```

---

## Colleague Installation Guide

Share these instructions with your colleagues:

### Installing LinkedIn Affinity

1. **Download** the `LinkedIn Affinity-X.X.dmg` file

2. **Open** the DMG by double-clicking it

3. **Drag** "LinkedIn Affinity" to the Applications folder
   ![Drag to Applications](drag-to-apps.png)

4. **Eject** the DMG (right-click > Eject)

5. **Open** LinkedIn Affinity from Applications
   - The app window confirms the extension is installed

6. **Enable in Safari:**
   - Open Safari
   - Go to **Safari > Settings** (or press `Cmd + ,`)
   - Click the **Extensions** tab
   - Check the box next to **LinkedIn Affinity Extension**
   - Click **Turn On** in the confirmation dialog

7. **Done!** The extension is now active on LinkedIn.

### Using the Extension

- Navigate to any LinkedIn conversation
- Look for the "Send to Affinity" button in the conversation
- Or use the keyboard shortcut: `Cmd + Shift + A`

---

## Troubleshooting

### Build Issues

#### "Developer ID Application certificate not found"

Your certificate isn't installed or has expired.

**Fix:** Follow Step 2 in [Manual Setup](#manual-setup) to create a new certificate.

#### "Notarization credentials not found"

The notarization profile isn't set up in your Keychain.

**Fix:** Run:
```bash
xcrun notarytool store-credentials "linkedin-affinity-notarization" \
  --apple-id "your-email@example.com" \
  --team-id "GJ994MN2YF" \
  --password "your-app-specific-password"
```

#### "Notarization failed"

Apple rejected the app. Common reasons:
- Code signing issues
- Missing entitlements
- Embedded malware (unlikely)

**Fix:** Check the notarization log:
```bash
xcrun notarytool log <submission-id> --keychain-profile "linkedin-affinity-notarization"
```

#### "xcodebuild failed"

Build errors in the Xcode project.

**Fix:** Try opening the project in Xcode and building manually to see detailed errors:
```bash
open "LinkedIn Affinity.xcodeproj"
```

### Installation Issues (Colleagues)

#### "App is damaged and can't be opened"

The app wasn't properly notarized or the notarization wasn't stapled.

**Fix (if you're the developer):** Rebuild with notarization enabled.

**Temporary fix (for colleague):**
```bash
xattr -cr /Applications/LinkedIn\ Affinity.app
```

#### "App can't be opened because Apple cannot check it for malicious software"

The app wasn't notarized.

**Fix:** Right-click > Open > Open. This bypasses Gatekeeper for that app.

#### Extension doesn't appear in Safari

1. Make sure Safari is fully quit and reopened
2. Check **Safari > Settings > Extensions**
3. If still not there, try reinstalling the app

#### Extension is disabled after macOS update

macOS updates sometimes disable extensions.

**Fix:** Re-enable in Safari > Settings > Extensions

---

## Technical Details

### Project Configuration

The Xcode project is configured for distribution:

| Setting | Value |
|---------|-------|
| Team ID | GJ994MN2YF |
| Bundle ID (App) | com.TriptyqCapital.LinkedInAffinity |
| Bundle ID (Extension) | com.TriptyqCapital.LinkedInAffinity.Extension |
| Code Sign Identity | Developer ID Application |
| Hardened Runtime | Enabled |
| App Sandbox | Enabled |

### Entitlements

**Main App** (`LinkedIn Affinity/LinkedIn Affinity.entitlements`):
- `com.apple.security.app-sandbox`: App Sandbox enabled
- `com.apple.security.files.user-selected.read-only`: Can read user-selected files
- `com.apple.security.network.client`: Can make network connections (for API calls)

**Extension** (`LinkedIn Affinity Extension/LinkedIn Affinity Extension.entitlements`):
- `com.apple.security.app-sandbox`: App Sandbox enabled
- `com.apple.security.files.user-selected.read-only`: Can read user-selected files

### Code Signing Flow

1. **Archive** - Xcode creates a signed archive
2. **Export** - Archive is exported with Developer ID signing
3. **Notarization** - App is uploaded to Apple for security scanning
4. **Stapling** - Notarization ticket is attached to the app
5. **DMG Creation** - App is packaged in a DMG
6. **DMG Notarization** - DMG is also notarized and stapled

### File Structure

```
LinkedIn Affinity/
├── LinkedIn Affinity.xcodeproj/     # Xcode project
├── LinkedIn Affinity/                # Main app source
│   ├── LinkedIn Affinity.entitlements
│   ├── AppDelegate.swift
│   └── ...
├── LinkedIn Affinity Extension/      # Safari extension
│   ├── LinkedIn Affinity Extension.entitlements
│   ├── Info.plist
│   └── Resources/
├── build-and-distribute.sh          # Build script
├── setup-distribution.sh            # Setup wizard
├── DISTRIBUTION-GUIDE.md            # This file
└── dist/                            # Build output (created by script)
    ├── LinkedIn Affinity-1.0.dmg
    └── LinkedIn Affinity-1.0.sha256
```

---

## Quick Reference

### Commands

```bash
# One-time setup
./setup-distribution.sh

# Build installer
./build-and-distribute.sh

# Build without notarization (testing)
./build-and-distribute.sh --skip-notarization

# Check certificate status
security find-identity -v -p codesigning | grep "Developer ID"

# Check notarization credentials
xcrun notarytool history --keychain-profile "linkedin-affinity-notarization"

# Verify app signature
codesign --verify --deep --strict -vvvv /Applications/LinkedIn\ Affinity.app

# Check notarization status of app
spctl --assess --verbose /Applications/LinkedIn\ Affinity.app
```

### Important URLs

- [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)
- [Apple ID Account (App-Specific Passwords)](https://appleid.apple.com/account/manage)
- [Apple Notarization Docs](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)

---

## Support

If you encounter issues not covered in this guide:

1. Check the build output for specific error messages
2. Run the setup script again to verify prerequisites
3. Try building in Xcode directly to see detailed errors
4. Check Apple's Developer Forums for similar issues
