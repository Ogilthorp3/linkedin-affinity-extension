// LinkedIn to Affinity - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const statusDiv = document.getElementById('status');
  const connectionDot = document.getElementById('connectionDot');
  const connectionText = document.getElementById('connectionText');

  // Load existing API key
  chrome.storage.sync.get(['affinityApiKey'], (result) => {
    if (result.affinityApiKey) {
      apiKeyInput.value = result.affinityApiKey;
      updateConnectionStatus('checking');
      testConnection();
    }
  });

  // Save API key
  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    chrome.storage.sync.set({ affinityApiKey: apiKey }, () => {
      showStatus('API key saved successfully', 'success');
      testConnection();
    });
  });

  // Test connection
  testBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    // Save first, then test
    chrome.storage.sync.set({ affinityApiKey: apiKey }, () => {
      testConnection();
    });
  });

  function testConnection() {
    updateConnectionStatus('checking');
    showStatus('Testing connection...', 'info');

    chrome.runtime.sendMessage({ action: 'testConnection' }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('Extension error: ' + chrome.runtime.lastError.message, 'error');
        updateConnectionStatus('error');
        return;
      }

      if (response.success) {
        const userName = response.user?.grant?.first_name || 'User';
        showStatus(`Connected as ${userName}`, 'success');
        updateConnectionStatus('connected', `Connected as ${userName}`);
      } else {
        showStatus('Connection failed: ' + response.error, 'error');
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
});
