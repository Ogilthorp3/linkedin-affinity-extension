// LinkedIn to Affinity - Popup Script

// Use browser or chrome API (Safari compatibility)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const subdomainInput = document.getElementById('affinitySubdomain');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const statusDiv = document.getElementById('status');
  const connectionDot = document.getElementById('connectionDot');
  const connectionText = document.getElementById('connectionText');
  const statsBadge = document.getElementById('statsBadge');
  const statsText = document.getElementById('statsText');

  // Load existing API key and subdomain
  browserAPI.storage.sync.get(['affinityApiKey', 'affinitySubdomain'], (result) => {
    if (result.affinityApiKey) {
      apiKeyInput.value = result.affinityApiKey;
      updateConnectionStatus('checking');
      testConnection();
    }
    if (result.affinitySubdomain) {
      subdomainInput.value = result.affinitySubdomain;
    }
  });

  // Load and display sync stats
  browserAPI.storage.local.get(['syncCount'], (result) => {
    const count = result.syncCount || 0;
    if (count > 0) {
      statsText.textContent = `${count} contact${count === 1 ? '' : 's'} synced`;
      statsBadge.style.display = 'flex';
    }
  });

  // Save API key and subdomain
  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const subdomain = subdomainInput.value.trim() || 'app';

    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    browserAPI.storage.sync.set({
      affinityApiKey: apiKey,
      affinitySubdomain: subdomain
    }, () => {
      showStatus('Settings saved successfully', 'success');
      testConnection();
    });
  });

  // Test connection
  testBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const subdomain = subdomainInput.value.trim() || 'app';

    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    // Save first, then test
    browserAPI.storage.sync.set({
      affinityApiKey: apiKey,
      affinitySubdomain: subdomain
    }, () => {
      testConnection();
    });
  });

  function testConnection() {
    updateConnectionStatus('checking');
    showStatus('Testing connection...', 'info');

    browserAPI.runtime.sendMessage({ action: 'testConnection' }, (response) => {
      if (browserAPI.runtime.lastError) {
        showStatus('Extension error: ' + browserAPI.runtime.lastError.message, 'error');
        updateConnectionStatus('error');
        return;
      }

      if (response && response.success) {
        const userName = response.user?.grant?.first_name || 'User';
        showStatus(`Connected as ${userName}`, 'success');
        updateConnectionStatus('connected', `Connected as ${userName}`);
      } else {
        showStatus('Connection failed: ' + (response?.error || 'Unknown error'), 'error');
        updateConnectionStatus('error', 'Connection failed');
      }
    });
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
  }

  function updateConnectionStatus(state, text) {
    connectionDot.className = 'connection-dot';

    switch (state) {
      case 'connected':
        connectionDot.classList.add('connected');
        connectionText.textContent = text || 'Connected';
        break;
      case 'error':
        connectionDot.classList.add('error');
        connectionText.textContent = text || 'Connection error';
        break;
      case 'checking':
        connectionText.textContent = 'Checking...';
        break;
      default:
        connectionText.textContent = 'Not configured';
    }
  }

  // Allow Enter key to save
  apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });

  subdomainInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });
});
