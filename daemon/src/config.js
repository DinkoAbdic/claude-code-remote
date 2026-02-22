const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const logger = require('./logger');

const CONFIG_DIR = path.join(process.env.APPDATA || path.join(require('os').homedir(), '.config'), 'claude-code-remote');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

function detectShell() {
  const candidates = ['pwsh.exe', 'powershell.exe', 'cmd.exe'];
  for (const shell of candidates) {
    try {
      execSync(`where ${shell}`, { stdio: 'ignore' });
      logger.info(`Detected shell: ${shell}`);
      return shell;
    } catch {
      // not found, try next
    }
  }
  return 'cmd.exe'; // fallback
}

function loadOrCreate() {
  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (fs.existsSync(CONFIG_PATH)) {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    logger.info(`Config loaded from ${CONFIG_PATH}`);
    return config;
  }

  // First run — generate config
  const config = {
    token: crypto.randomBytes(32).toString('hex'),
    port: 8485,
    sandboxRoot: null,
    shell: detectShell(),
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  logger.info(`Config created at ${CONFIG_PATH}`);
  logger.info(`Auth token: ${config.token}`);
  return config;
}

module.exports = { loadOrCreate, CONFIG_PATH };
