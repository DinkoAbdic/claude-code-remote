const { execSync } = require('child_process');
const path = require('path');
const logger = require('./logger');

let cached = null;
let cachedAt = 0;
const CACHE_TTL = 30_000;

// Windows installs Tailscale here but doesn't always add it to PATH
const TAILSCALE_PATHS = [
  'tailscale',
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Tailscale', 'tailscale.exe'),
];

function tryExec(cmd) {
  return execSync(cmd, {
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
}

function getTailscaleStatus() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL) return cached;

  const result = { installed: false, running: false, ip: null, error: null };

  // Try tailscale CLI (bare name first, then full Windows path)
  for (const bin of TAILSCALE_PATHS) {
    try {
      const raw = tryExec(`"${bin}" status --json`);
      const status = JSON.parse(raw.toString());
      result.installed = true;

      // TailscaleIPs at top level and on Self — check both
      const selfIPs = status.Self?.TailscaleIPs || status.TailscaleIPs || [];
      const ipv4 = selfIPs.find((ip) => /^100\./.test(ip));
      if (ipv4) {
        result.ip = ipv4;
        // BackendState can say "Stopped" even when the GUI shows Connected,
        // so treat having an IP as running
        result.running = true;
      } else {
        result.error = 'No Tailscale IPv4 address assigned';
      }

      cached = result;
      cachedAt = now;
      return result;
    } catch {
      // try next path
    }
  }

  // Fallback: parse ipconfig for Tailscale adapter
  try {
    const raw = tryExec('ipconfig');
    const output = raw.toString();
    const sections = output.split(/\r?\n\r?\n/);

    for (const section of sections) {
      if (!/tailscale/i.test(section)) continue;
      result.installed = true;

      const match = section.match(/IPv4[^:]*:\s*([\d.]+)/);
      if (match && match[1].startsWith('100.')) {
        result.running = true;
        result.ip = match[1];
        break;
      }
    }

    if (!result.ip && result.installed) {
      result.error = 'Tailscale adapter found but no 100.x IPv4 address';
    }
  } catch (err) {
    result.error = `Detection failed: ${err.message}`;
  }

  if (!result.installed) {
    result.error = 'Tailscale not found';
  }

  cached = result;
  cachedAt = now;
  return result;
}

module.exports = { getTailscaleStatus };
