# LinkedIn to Affinity - Safari Extension Setup

This guide walks you through setting up the Safari Web Extension in Xcode.

## Prerequisites

- macOS 12.0 or later
- Xcode 14.0 or later
- Apple Developer account (for signing)
- Affinity API key

## Step 1: Generate Icons

First, generate the PNG icons from the SVG:

```bash
# Install librsvg if needed
brew install librsvg

# Generate icons
chmod +x setup-icons.sh
./setup-icons.sh
```

Or manually export `Extension/icons/icon.svg` to PNG at these sizes:
- 16x16 → icon-16.png
- 32x32 → icon-32.png
- 48x48 → icon-48.png
- 128x128 → icon-128.png

## Step 2: Create Xcode Project

1. **Open Xcode** and select **File → New → Project**

2. **Choose template:**
   - Select **macOS** tab
   - Choose **Safari Extension App**
   - Click **Next**

3. **Configure project:**
   - Product Name: `LinkedIn Affinity`
   - Team: Select your Apple Developer team
   - Organization Identifier: `com.yourname` (e.g., `com.bert`)
   - Language: **Swift**
   - Check: **Include Tests** (optional)
   - Click **Next**

4. **Save location:**
   - Save in the `linkedin-affinity-extension` folder
   - This creates the Xcode project alongside the Extension folder

## Step 3: Replace Extension Files

Xcode generates boilerplate extension files. Replace them with ours:

1. In Xcode's Project Navigator, find the **Extension** folder (named `LinkedIn Affinity Extension`)

2. **Delete** the generated files:
   - manifest.json
   - background.js
   - content.js
   - popup.html
   - popup.js
   - (any .css files)

3. **Add our files:**
   - Right-click the Extension folder → **Add Files to "LinkedIn Affinity Extension"**
   - Navigate to the `Extension` folder in this repo
   - Select all files: `manifest.json`, `background.js`, `content.js`, `popup.html`, `popup.js`, `styles.css`
   - Make sure **"Copy items if needed"** is checked
   - Click **Add**

4. **Add icons:**
   - Right-click the Extension folder → **Add Files**
   - Add the `icons` folder with all PNG files

## Step 4: Update Info.plist (if needed)

The extension's `Info.plist` should have the correct bundle identifier. Verify:

1. Select the Extension target
2. Go to **Build Settings**
3. Search for "Bundle Identifier"
4. Should be something like: `com.bert.LinkedIn-Affinity.Extension`

## Step 5: Build and Run

1. Select **LinkedIn Affinity** scheme (the app, not the extension)
2. Select **My Mac** as the destination
3. Click **Run** (⌘R)

This builds both the container app and the extension.

## Step 6: Enable in Safari

1. Open **Safari**
2. Go to **Safari → Settings** (⌘,)
3. Click **Extensions** tab
4. Find **LinkedIn Affinity** and check the box to enable it
5. Grant permissions when prompted

### Development Mode (if extension doesn't appear)

1. In Safari, go to **Safari → Settings → Advanced**
2. Check **"Show features for web developers"**
3. Go to **Develop** menu → **Allow Unsigned Extensions**
4. Re-check Extensions settings

## Step 7: Configure API Key

1. Click the extension icon in Safari's toolbar
2. Enter your Affinity API key
3. Click **Save** then **Test** to verify connection

## Usage

1. Go to LinkedIn.com and open a conversation
2. Click the **"Send to Affinity"** button in the conversation header
3. Or use the keyboard shortcut: **⌘ + Shift + A**

The conversation will be captured and added as a note to the contact in Affinity.

## Troubleshooting

### Extension not loading

- Make sure "Allow Unsigned Extensions" is enabled in Develop menu
- Rebuild the project in Xcode
- Check Console.app for errors

### Button not appearing on LinkedIn

- LinkedIn may have updated their DOM structure
- Check browser console for errors (right-click → Inspect Element → Console)
- The selectors in `content.js` may need updating

### API errors

- Verify your API key is correct
- Check that your Affinity account has API access
- Look at background script logs in Safari's Web Inspector

### Updating DOM Selectors

LinkedIn changes their DOM frequently. If the button stops appearing or data extraction breaks:

1. Open LinkedIn Messages in Safari
2. Right-click → Inspect Element
3. Find the current class names for:
   - Conversation header
   - Profile link
   - Name element
   - Message containers
4. Update the selectors in `content.js`

## Distribution

For personal use, you can run the unsigned extension in development mode.

For distribution to others:
1. Archive the app in Xcode
2. Submit to App Store (requires App Store Connect account)
3. Or distribute via Developer ID signing for direct download

## Project Structure

```
linkedin-affinity-extension/
├── Extension/
│   ├── manifest.json      # Extension configuration
│   ├── content.js         # Injected into LinkedIn pages
│   ├── background.js      # Handles Affinity API calls
│   ├── popup.html         # Settings UI
│   ├── popup.js           # Settings logic
│   ├── styles.css         # Button styling
│   └── icons/             # Extension icons
├── LinkedIn Affinity/     # Swift container app (generated by Xcode)
├── LinkedIn Affinity.xcodeproj
├── SETUP.md               # This file
└── setup-icons.sh         # Icon generation script
```
