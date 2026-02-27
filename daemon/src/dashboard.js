const QRCode = require('qrcode');

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function generateDashboard(config, tailscaleStatus, sessionCount, connectedDevices, showQr = true) {
  let qrHtml = '';

  if (!showQr) {
    qrHtml = `
      <div class="qr-section">
        <div class="no-qr">
          <p>QR code hidden</p>
          <p class="qr-hint">Open dashboard from your PC (localhost) to see the setup QR code</p>
        </div>
      </div>`;
  } else if (tailscaleStatus.ip) {
    const payload = JSON.stringify({
      type: 'ccr',
      version: 1,
      host: tailscaleStatus.ip,
      port: config.port,
      token: config.token,
    });

    try {
      const dataUrl = await QRCode.toDataURL(payload, {
        width: 280,
        margin: 2,
        color: { dark: '#d4d4d4', light: '#1e1e1e' },
        errorCorrectionLevel: 'M',
      });
      qrHtml = `
        <div class="qr-section">
          <img src="${dataUrl}" alt="Setup QR Code" width="280" height="280" />
          <p class="qr-hint">Scan with the Claude Code Remote app</p>
        </div>`;
    } catch {
      qrHtml = '<p class="warning">Failed to generate QR code</p>';
    }
  } else {
    qrHtml = `
      <div class="qr-section">
        <div class="no-qr">
          <p>QR code unavailable</p>
          <p class="qr-hint">${tailscaleStatus.error || 'Tailscale not connected'}</p>
        </div>
      </div>`;
  }

  const tsStatusClass = tailscaleStatus.running ? 'ok' : 'warn';
  const tsStatusText = tailscaleStatus.running
    ? `Connected — ${tailscaleStatus.ip}`
    : tailscaleStatus.installed
      ? 'Installed but not running'
      : 'Not installed';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Claude Code Remote</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1e1e1e;
      color: #d4d4d4;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .card {
      background: #252526;
      border: 1px solid #3c3c3c;
      border-radius: 12px;
      padding: 32px;
      max-width: 400px;
      width: 90%;
      text-align: center;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .subtitle {
      color: #808080;
      font-size: 13px;
      margin-bottom: 24px;
    }
    .status-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 12px;
      text-align: left;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .status-label { color: #808080; }
    .status-value { font-weight: 500; }
    .ok { color: #4caf50; }
    .warn { color: #ff9800; }
    .qr-section { margin: 16px 0; }
    .qr-section img {
      border-radius: 8px;
      border: 1px solid #3c3c3c;
    }
    .qr-hint {
      color: #808080;
      font-size: 12px;
      margin-top: 10px;
    }
    .no-qr {
      background: #2d2d2d;
      border: 1px dashed #3c3c3c;
      border-radius: 8px;
      padding: 40px 20px;
      color: #808080;
    }
    .warning { color: #ff9800; }
    .settings {
      margin-top: 24px;
      border-top: 1px solid #3c3c3c;
      padding-top: 20px;
      text-align: left;
    }
    .settings h2 {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .settings label {
      display: block;
      color: #808080;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .settings input {
      width: 100%;
      background: #2d2d2d;
      color: #d4d4d4;
      border: 1px solid #3c3c3c;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 14px;
      font-family: monospace;
      outline: none;
    }
    .devices-section {
      margin-top: 16px;
      margin-bottom: 24px;
      text-align: left;
    }
    .devices-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .devices-header h2 {
      font-size: 14px;
      font-weight: 600;
      color: #808080;
    }
    .devices-count {
      font-size: 12px;
      color: #808080;
    }
    .device-list {
      list-style: none;
    }
    .device-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: #2d2d2d;
      border-radius: 6px;
      margin-bottom: 4px;
      font-size: 13px;
    }
    .device-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4caf50;
      flex-shrink: 0;
    }
    .device-name {
      font-weight: 500;
      color: #d4d4d4;
    }
    .device-session {
      color: #808080;
      font-size: 12px;
      margin-left: auto;
    }
    .no-devices {
      color: #808080;
      font-size: 13px;
      padding: 12px 10px;
      background: #2d2d2d;
      border-radius: 6px;
      border: 1px dashed #3c3c3c;
    }
    .settings input:focus { border-color: #da7756; }
    .settings .save-btn {
      margin-top: 10px;
      background: #da7756;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .settings .save-btn:hover { background: #c5654a; }
    .settings .save-msg {
      display: inline-block;
      margin-left: 10px;
      font-size: 13px;
      color: #4caf50;
      opacity: 0;
      transition: opacity 0.3s;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Claude Code Remote</h1>
    <p class="subtitle">Daemon Dashboard</p>

    <div class="status-grid">
      <span class="status-label">Tailscale</span>
      <span class="status-value ${tsStatusClass}">${tsStatusText}</span>

      <span class="status-label">Daemon Port</span>
      <span class="status-value">${config.port}</span>

      <span class="status-label">Sessions</span>
      <span class="status-value" id="sessionCount">${sessionCount}</span>
    </div>

    <div class="devices-section" id="devicesSection">
      <div class="devices-header">
        <h2>Connected Devices</h2>
      </div>
      ${(connectedDevices && connectedDevices.length > 0)
        ? `<ul class="device-list" id="deviceList">${connectedDevices.map(d =>
            `<li class="device-item"><span class="device-dot"></span><span class="device-name">${escapeHtml(d.deviceName || 'Unknown device')}</span><span class="device-session">${escapeHtml(d.name)}</span></li>`
          ).join('')}</ul>`
        : '<p class="no-devices" id="deviceList">No devices connected</p>'
      }
    </div>

    ${qrHtml}

    <div class="settings">
      <h2>Settings</h2>
      <label>Default Directory</label>
      <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px">
        <input type="text" id="defaultCwd" value="${(config.defaultCwd || '').replace(/"/g, '&quot;')}" placeholder="None (uses daemon working dir)" readonly style="flex:1; cursor: default; opacity: 0.8" />
        <button class="save-btn" onclick="browseDir()" id="browseBtn" style="margin:0; white-space: nowrap">Browse...</button>
      </div>
      <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center">
        <button class="save-btn" onclick="saveSettings()">Save</button>
        <button class="save-btn" onclick="clearDir()" style="background: #3c3c3c">Clear</button>
        <span class="save-msg" id="saveMsg">Saved!</span>
      </div>
    </div>
  </div>
  <script>
    async function browseDir() {
      const btn = document.getElementById('browseBtn');
      btn.textContent = 'Opening...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/pick-directory', { method: 'POST' });
        const data = await res.json();
        if (data.path) {
          document.getElementById('defaultCwd').value = data.path;
        }
      } catch (err) {
        alert('Failed to open folder picker: ' + err.message);
      }
      btn.textContent = 'Browse...';
      btn.disabled = false;
    }

    function clearDir() {
      document.getElementById('defaultCwd').value = '';
    }

    async function saveSettings() {
      const defaultCwd = document.getElementById('defaultCwd').value.trim();
      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ defaultCwd }),
        });
        if (res.ok) {
          const msg = document.getElementById('saveMsg');
          msg.style.opacity = '1';
          setTimeout(() => { msg.style.opacity = '0'; }, 2000);
        }
      } catch (err) {
        alert('Failed to save: ' + err.message);
      }
    }

    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function renderDevices(devices) {
      const section = document.getElementById('devicesSection');
      if (!section) return;
      let html = '<div class="devices-header"><h2>Connected Devices</h2></div>';
      if (devices && devices.length > 0) {
        html += '<ul class="device-list" id="deviceList">';
        for (const d of devices) {
          html += '<li class="device-item"><span class="device-dot"></span>'
            + '<span class="device-name">' + esc(d.deviceName || 'Unknown device') + '</span>'
            + '<span class="device-session">' + esc(d.name) + '</span></li>';
        }
        html += '</ul>';
      } else {
        html += '<p class="no-devices" id="deviceList">No devices connected</p>';
      }
      section.innerHTML = html;
    }

    // Poll status every 3 seconds
    setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          document.getElementById('sessionCount').textContent = data.sessions;
          renderDevices(data.connectedDevices);
        }
      } catch {}
    }, 3000);
  </script>
</body>
</html>`;
}

module.exports = { generateDashboard };
