# Publishing Guide - LinkedIn to Affinity

## What's Been Prepared

- [x] Chrome extension zip: `dist/linkedin-to-affinity-chrome-1.0.0.zip`
- [x] Safari archive: built and ready for re-export after App Store Connect setup
- [x] Store listing text: `STORE-LISTING.md`
- [x] Privacy policy: `PRIVACY-POLICY.md`

---

## Part 1: Chrome Web Store

### Prerequisites
- A Google account
- Chrome Web Store developer registration ($5 one-time fee)

### Step 1: Register as a Chrome Web Store Developer
1. Go to https://chrome.google.com/webstore/devconsole
2. Pay the one-time $5 registration fee (if not already registered)
3. Verify your email address

### Step 2: Create a New Item
1. Click **"New item"** in the developer dashboard
2. Upload `dist/linkedin-to-affinity-chrome-1.0.0.zip`
3. Fill in the store listing:

   **Description:** Copy from `STORE-LISTING.md` → Chrome Web Store → Detailed Description

   **Category:** Productivity

   **Language:** English

### Step 3: Store Listing Assets
You need to provide:
- **Icon**: Already included in the zip (128x128)
- **Screenshots**: At least 1 screenshot (1280x800 or 640x400)
  - Take screenshots of: the popup settings page, the dashboard tab, the LinkedIn messaging page with the "Send to Affinity" button visible
- **Promotional tile** (optional): 440x280 small tile

**To take screenshots:**
1. Load the extension in Chrome (`chrome://extensions` → Load unpacked → select `Extension/`)
2. Navigate to LinkedIn messaging
3. Open the extension popup
4. Take screenshots using Cmd+Shift+4 (crop to the right size)

### Step 4: Privacy
1. **Privacy policy URL**: Host `PRIVACY-POLICY.md` somewhere accessible:
   - Option A: Add to your GitHub repo and use the raw URL
   - Option B: Host on your website
   - Option C: Use a GitHub Pages site
2. Check the **"Single purpose"** description: "Sync LinkedIn conversations to Affinity CRM"
3. Under **"Permissions justification"**, explain each permission:
   - `storage`: Store API key and user preferences
   - `activeTab`: Read LinkedIn conversation data when user clicks the extension
   - `notifications`: Notify user when sync completes
   - `alarms`: Schedule follow-up reminders and cache refreshes
4. Host permissions:
   - `linkedin.com`: Read conversation data from messaging pages
   - `api.affinity.co`: Send data to user's Affinity CRM account

### Step 5: Submit for Review
1. Set **Visibility** to "Public" (or "Unlisted" if you prefer a link-only distribution)
2. Click **"Submit for review"**
3. Review typically takes 1-3 business days

---

## Part 2: Safari App Store (macOS)

### Prerequisites
- Apple Developer Program membership ($99/year) — you already have this (Team ID: GJ994MN2YF)
- Xcode (already installed)

### Step 1: Create App in App Store Connect
1. Go to https://appstoreconnect.apple.com
2. Click **"My Apps"** → **"+"** → **"New App"**
3. Fill in:
   - **Platform:** macOS
   - **Name:** LinkedIn to Affinity
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** com.TriptyqCapital.LinkedInAffinity (select from dropdown)
   - **SKU:** linkedin-to-affinity (or any unique identifier)
   - **User Access:** Full Access
4. Click **"Create"**

### Step 2: Set Up App Information
In the App Store Connect page for your new app:

**App Information tab:**
- **Subtitle:** Sync LinkedIn to Affinity CRM
- **Category:** Productivity (Primary), Business (Secondary)
- **Content Rights:** Does not contain third-party content
- **Age Rating:** 4+

**Pricing and Availability tab:**
- **Price:** Free

**App Privacy tab:**
- **Privacy Policy URL:** Same URL as Chrome (host PRIVACY-POLICY.md)
- **Data types collected:** None (the extension doesn't collect data — it sends data from user's browser directly to their own Affinity API account)

### Step 3: Prepare Version Information
In the macOS App section → "Prepare for Submission":

- **Screenshots:** At least 1 screenshot at 1280x800 (same ones from Chrome work)
- **Description:** Copy from `STORE-LISTING.md` → Safari App Store → Description
- **Keywords:** LinkedIn,Affinity,CRM,dealflow,contacts,sync,conversations,notes,pipeline,networking
- **Support URL:** Your GitHub repo URL or website
- **Marketing URL** (optional): Your website
- **Promotional Text:** Copy from `STORE-LISTING.md`

### Step 4: Create Apple Distribution Certificate (if needed)
1. Open **Xcode** → **Settings** → **Accounts**
2. Select your Apple ID → Select team "GJ994MN2YF"
3. Click **"Manage Certificates"**
4. Click **"+"** → **"Apple Distribution"**
5. This creates the certificate needed for App Store uploads

### Step 5: Archive and Upload from Xcode
1. Open the project:
   ```bash
   open "LinkedIn Affinity/LinkedIn Affinity.xcodeproj"
   ```
2. In Xcode:
   - Select **"LinkedIn Affinity"** scheme
   - Select **"Any Mac"** as the destination
   - Set **Product → Destination → Any Mac**
3. Add App Category to Info.plist (recommended):
   - Select the "LinkedIn Affinity" target → General → App Category → **Productivity**
4. **Product → Archive**
5. When the archive completes, the Organizer window opens
6. Select your archive → Click **"Distribute App"**
7. Choose **"App Store Connect"**
8. Choose **"Upload"**
9. Let Xcode manage signing automatically
10. Click **"Upload"**

### Step 6: Submit for Review
1. Go back to App Store Connect
2. In your app page, select the build that was just uploaded
3. Fill in any remaining required fields
4. Click **"Submit for Review"**
5. Review typically takes 1-3 business days (can be longer for first submission)

---

## Alternative: Command Line Upload (after Step 1-4)

If you prefer uploading from terminal instead of Xcode GUI:

```bash
# 1. Build the archive
cd "LinkedIn Affinity"
xcodebuild -project "LinkedIn Affinity.xcodeproj" \
  -scheme "LinkedIn Affinity" \
  -configuration Release \
  -archivePath dist/LinkedInAffinity.xcarchive \
  archive \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=GJ994MN2YF \
  CODE_SIGN_IDENTITY="Apple Distribution"

# 2. Export for App Store
xcodebuild -exportArchive \
  -archivePath dist/LinkedInAffinity.xcarchive \
  -exportOptionsPlist ExportOptions-AppStore.plist \
  -exportPath dist/appstore-export \
  -allowProvisioningUpdates

# 3. Upload to App Store Connect
xcrun altool --upload-app \
  -f dist/appstore-export/LinkedIn\ Affinity.pkg \
  -t macos \
  -u "bertrand@nepveu.name" \
  --apiKey YOUR_API_KEY \
  --apiIssuer YOUR_ISSUER_ID
```

---

## Checklist

### Before Submission
- [ ] Host privacy policy at a public URL
- [ ] Take at least 1 screenshot (1280x800) for each store
- [ ] Test extension works correctly in Chrome
- [ ] Test extension works correctly in Safari

### Chrome Web Store
- [ ] Register as developer ($5)
- [ ] Upload zip package
- [ ] Fill in listing details
- [ ] Add screenshots
- [ ] Set privacy policy URL
- [ ] Submit for review

### Safari App Store
- [ ] Create app in App Store Connect
- [ ] Create Apple Distribution certificate
- [ ] Fill in app information
- [ ] Add screenshots
- [ ] Set privacy policy URL
- [ ] Archive and upload from Xcode
- [ ] Submit for review
