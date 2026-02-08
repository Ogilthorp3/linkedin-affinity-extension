# Privacy Policy - LinkedIn to Affinity

**Last Updated: February 7, 2026**

## Overview

LinkedIn to Affinity ("the Extension") is a browser extension that helps you capture LinkedIn conversations and sync them to your Affinity CRM account. Your privacy is important to us. This policy explains what data the Extension accesses and how it is handled.

## Data Collection

**The Extension does not collect, store, or transmit any personal data to us or any third party.**

All data processing happens locally in your browser or is sent directly to the Affinity API using your own API credentials.

## What Data the Extension Accesses

When you use the Extension on LinkedIn messaging pages, it accesses:

- **Conversation content**: The text of the LinkedIn conversation you choose to sync, including participant names, message text, and timestamps
- **Profile information**: The name and LinkedIn profile URL of the person you are messaging
- **Your Affinity API key**: Stored locally in your browser's extension storage to authenticate with the Affinity API

## How Data is Used

- **Conversation data** is sent directly from your browser to the Affinity API (`api.affinity.co`) to create or update contacts and add notes. This only happens when you explicitly click "Send to Affinity" or use the keyboard shortcut.
- **Your API key** is stored locally in your browser using the browser's built-in extension storage API. It is only used to authenticate requests to the Affinity API.
- **Dashboard data** (lists, notes, follow-ups) is fetched from the Affinity API and cached locally in your browser for performance. This cache is cleared when you close the browser.

## Data Storage

All data is stored locally in your browser:

- **API key and preferences**: Stored in browser sync storage (syncs across your devices if you use browser sync)
- **Sync statistics**: Stored in browser local storage
- **Dashboard cache**: Stored in memory only, cleared when the browser closes

No data is stored on any external server other than the Affinity API, which you connect to using your own account credentials.

## Third-Party Services

The Extension communicates with exactly two external services:

1. **LinkedIn** (`www.linkedin.com`): The Extension reads conversation content from LinkedIn pages you visit. It does not write to or modify your LinkedIn account.
2. **Affinity CRM** (`api.affinity.co`): The Extension sends conversation data to your Affinity account when you initiate a sync. All requests are authenticated with your personal API key.

No other third-party services, analytics, or tracking tools are used.

## Permissions Explained

- **storage**: Save your API key and preferences locally
- **activeTab**: Access the current LinkedIn page when you interact with the extension
- **notifications**: Show desktop notifications when a sync completes
- **alarms**: Schedule periodic follow-up reminders and cache updates
- **Host permissions for linkedin.com**: Read conversation data from LinkedIn messaging pages
- **Host permissions for api.affinity.co**: Send data to your Affinity CRM account

## Data Sharing

We do not share, sell, or transfer any user data to third parties. The only data transmission is between your browser and the Affinity API, initiated by you.

## Data Retention

The Extension does not retain your data beyond your browser's local storage. Uninstalling the extension removes all locally stored data.

## Children's Privacy

The Extension is not directed at children under 13 and does not knowingly collect data from children.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last Updated" date above.

## Contact

If you have questions about this privacy policy, please open an issue on our GitHub repository or contact us at the email associated with our developer account.

---

**Triptyq Capital**
