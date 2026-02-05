// LinkedIn to Affinity - Popup Script

// Use browser or chrome API (Safari compatibility)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Dashboard cache
let dashboardCache = null;
let dashboardCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

  // Tab switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      // Update active states
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`${tabId}-tab`).classList.add('active');

      // Load dashboard data when switching to dashboard tab
      if (tabId === 'dashboard') {
        loadDashboard();
      }
    });
  });

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

  // Load and setup notification toggle
  const notificationsToggle = document.getElementById('notificationsEnabled');
  if (notificationsToggle) {
    browserAPI.storage.sync.get(['notificationsEnabled'], (result) => {
      notificationsToggle.checked = result.notificationsEnabled !== false; // Default to true
    });

    notificationsToggle.addEventListener('change', () => {
      browserAPI.storage.sync.set({ notificationsEnabled: notificationsToggle.checked });
    });
  }

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

  // Dashboard functions
  function loadDashboard() {
    const loadingEl = document.getElementById('dashboard-loading');
    const contentEl = document.getElementById('dashboard-content');
    const errorEl = document.getElementById('dashboard-error');
    const notConnectedEl = document.getElementById('dashboard-not-connected');

    // Check if we have cached data
    if (dashboardCache && dashboardCacheTime && (Date.now() - dashboardCacheTime < CACHE_DURATION)) {
      renderDashboard(dashboardCache);
      return;
    }

    // Show loading state
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    errorEl.style.display = 'none';
    notConnectedEl.style.display = 'none';

    // Check if API key is configured
    browserAPI.storage.sync.get(['affinityApiKey'], (result) => {
      if (!result.affinityApiKey) {
        loadingEl.style.display = 'none';
        notConnectedEl.style.display = 'block';
        return;
      }

      // Fetch dashboard data
      browserAPI.runtime.sendMessage({ action: 'getDashboardData' }, (response) => {
        loadingEl.style.display = 'none';

        if (browserAPI.runtime.lastError) {
          errorEl.style.display = 'block';
          document.getElementById('dashboard-error-msg').textContent = browserAPI.runtime.lastError.message;
          return;
        }

        if (response && response.success) {
          dashboardCache = response.data;
          dashboardCacheTime = Date.now();
          renderDashboard(response.data);
        } else {
          errorEl.style.display = 'block';
          document.getElementById('dashboard-error-msg').textContent = response?.error || 'Unknown error';
        }
      });
    });
  }

  function renderDashboard(data) {
    const contentEl = document.getElementById('dashboard-content');
    contentEl.style.display = 'block';

    // Render weekly stats
    document.getElementById('stat-contacts').textContent = data.weeklyStats?.contactsSynced || 0;
    document.getElementById('stat-notes').textContent = data.weeklyStats?.notesAdded || 0;

    // Render lists
    renderLists(data.lists || []);

    // Render recent activity
    renderActivity(data.recentActivity || []);

    // Render follow-ups
    renderFollowUps(data.followUps || []);
  }

  function renderLists(lists) {
    const listEl = document.getElementById('lists-list');
    const emptyEl = document.getElementById('lists-empty');

    listEl.innerHTML = '';

    if (!lists || lists.length === 0) {
      listEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    listEl.style.display = 'block';
    emptyEl.style.display = 'none';

    // Find max count for bar scaling
    const maxCount = Math.max(...lists.map(l => l.count), 1);

    lists.forEach(list => {
      const item = document.createElement('li');
      item.className = 'pipeline-item';
      const barWidth = (list.count / maxCount) * 100;
      item.innerHTML = `
        <span class="pipeline-icon">${list.icon || '📋'}</span>
        <span class="pipeline-name">${escapeHtml(list.name)}</span>
        <div class="pipeline-bar-container">
          <div class="pipeline-bar" style="width: ${barWidth}%"></div>
        </div>
        <span class="pipeline-count">${list.count}</span>
      `;
      listEl.appendChild(item);
    });
  }

  function renderActivity(activities) {
    const listEl = document.getElementById('activity-list');
    const emptyEl = document.getElementById('activity-empty');

    listEl.innerHTML = '';

    if (activities.length === 0) {
      listEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    listEl.style.display = 'block';
    emptyEl.style.display = 'none';

    activities.slice(0, 5).forEach(activity => {
      const item = document.createElement('li');
      item.className = 'activity-item';

      const icon = activity.type === 'note' ? '📝' :
                   activity.type === 'stage_change' ? '📈' : '📌';

      item.innerHTML = `
        <span class="activity-icon">${icon}</span>
        <div class="activity-content">
          <div class="activity-title">${escapeHtml(activity.title)}</div>
          <div class="activity-meta">${escapeHtml(activity.meta)}</div>
        </div>
      `;
      listEl.appendChild(item);
    });
  }

  function renderFollowUps(followUps) {
    const listEl = document.getElementById('followup-list');
    const emptyEl = document.getElementById('followup-empty');

    listEl.innerHTML = '';

    if (followUps.length === 0) {
      listEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    listEl.style.display = 'block';
    emptyEl.style.display = 'none';

    followUps.slice(0, 5).forEach(followUp => {
      const item = document.createElement('div');
      item.className = 'followup-item';

      const dotClass = followUp.overdue ? 'followup-dot overdue' : 'followup-dot';
      const dateClass = followUp.overdue ? 'followup-date overdue' : 'followup-date';

      item.innerHTML = `
        <span class="${dotClass}"></span>
        <span class="followup-content">${escapeHtml(followUp.person)} - ${escapeHtml(followUp.action)}</span>
        <span class="${dateClass}">${escapeHtml(followUp.dueText)}</span>
      `;
      listEl.appendChild(item);
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Export summary button handler
  const exportBtn = document.getElementById('exportSummaryBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (dashboardCache) {
        exportWeeklySummary(dashboardCache, exportBtn);
      }
    });
  }

  /**
   * Export weekly summary as markdown to clipboard
   */
  async function exportWeeklySummary(data, button) {
    const originalText = button.textContent;

    try {
      const today = new Date();
      const weekStart = data.weeklyStats?.weekStart || today.toISOString().split('T')[0];

      let markdown = `# Weekly Dealflow Summary\n`;
      markdown += `**Week of ${weekStart}**\n\n`;

      // Stats
      markdown += `## 📊 This Week\n`;
      markdown += `- **Contacts synced:** ${data.weeklyStats?.contactsSynced || 0}\n`;
      markdown += `- **Notes added:** ${data.weeklyStats?.notesAdded || 0}\n\n`;

      // Lists
      if (data.lists && data.lists.length > 0) {
        markdown += `## 📋 Lists Overview\n`;
        data.lists.forEach(list => {
          markdown += `- ${list.icon || '📋'} **${list.name}:** ${list.count} entries\n`;
        });
        markdown += `\n`;
      }

      // Recent Activity
      if (data.recentActivity && data.recentActivity.length > 0) {
        markdown += `## 🔥 Recent Activity\n`;
        data.recentActivity.forEach(activity => {
          markdown += `- ${activity.title} _(${activity.meta})_\n`;
        });
        markdown += `\n`;
      }

      // Follow-ups
      if (data.followUps && data.followUps.length > 0) {
        markdown += `## ⏰ Follow-ups Due\n`;
        data.followUps.forEach(followUp => {
          const status = followUp.overdue ? '🔴' : '🟡';
          markdown += `- ${status} **${followUp.person}** - ${followUp.action} _(${followUp.dueText})_\n`;
        });
        markdown += `\n`;
      }

      markdown += `---\n_Generated by LinkedIn to Affinity_\n`;

      await navigator.clipboard.writeText(markdown);

      button.textContent = '✓ Copied to clipboard!';
      button.classList.add('success');

      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('success');
      }, 2000);

    } catch (error) {
      console.error('Error exporting summary:', error);
      button.textContent = '✗ Failed to copy';

      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    }
  }
});
