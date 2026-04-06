const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

/**
 * Holocron Archives Sidecar Service
 * 
 * Dynamic Port loading from holocron-config.yaml
 */

const CONFIG_PATH = path.join(__dirname, '../../holocron-config.yaml');
const STATUS_FILE = path.join(__dirname, 'monitor-status.json');

// Simple YAML parser for the port
function getPortFromConfig() {
  try {
    const yaml = fs.readFileSync(CONFIG_PATH, 'utf8');
    const match = yaml.match(/archives:\s+name:.*?\s+port:\s+(\d+)/s);
    return match ? parseInt(match[1]) : 3344;
  } catch (e) {
    return 3344;
  }
}

const PORT = getPortFromConfig();

const server = http.createServer((req, res) => {
  // CORS headers for Holocron (running on localhost:3333/Electron)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/status' && req.method === 'GET') {
    if (fs.existsSync(STATUS_FILE)) {
      const status = fs.readFileSync(STATUS_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(status);
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'INITIALIZING', lastRun: null }));
    }
  } else if (req.url === '/run' && req.method === 'POST') {
    console.log('[Sidecar] Triggering manual monitor run...');
    runMonitor();
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Monitor run initiated' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

function runMonitor() {
  console.log('[Sidecar] Starting full sector scan...');
  
  // Run LinkedIn Monitor
  exec('bash tests/linkedin-monitor.sh', {
    cwd: path.join(__dirname, '..'),
    env: process.env
  }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Sidecar] LinkedIn failed. Triggering Auto-Heal...`);
      autoHeal();
    }
  });
}

function autoHeal() {
  exec('node tests/sector-healer.js', {
    cwd: path.join(__dirname, '..'),
    env: process.env
  }, (error, stdout, stderr) => {
    console.log(stdout);
    if (!error) {
      console.log('[Sidecar] Auto-heal complete. Re-verifying...');
      runMonitor();
    } else {
      console.error(`[Sidecar] Auto-heal failed: ${error.message}`);
    }
  });
}

// Automatic scheduled run every 30 minutes
setInterval(runMonitor, 30 * 60 * 1000);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Holocron Archives Sidecar listening on http://127.0.0.1:${PORT}`);
});
