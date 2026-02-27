const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { loadOrCreate, saveConfig, CONFIG_PATH } = require('./config');
const { authenticate } = require('./auth');
const { MessageType, validate, makeSessionCreated, makeSessionEnded, makeError } = require('./protocol');
const tm = require('./terminal-manager');
const { getTailscaleStatus } = require('./tailscale');
const { generateDashboard } = require('./dashboard');
const logger = require('./logger');

const config = loadOrCreate();
const { port, shell, sandboxRoot } = config;

// --- Auth helpers ---
const tsInfo = getTailscaleStatus();
const localTailscaleIp = tsInfo.ip;

function isLocalRequest(req) {
  const addr = req.socket.remoteAddress;
  if (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1') return true;
  // Requests from the daemon's own Tailscale IP are local (same machine via Tailscale)
  if (localTailscaleIp && (addr === localTailscaleIp || addr === `::ffff:${localTailscaleIp}`)) return true;
  return false;
}

// --- HTTP request handler (shared by both servers) ---
async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Auth gate: localhost is allowed without token, remote requires auth
  const local = isLocalRequest(req);
  if (!local && !authenticate(req, config.token)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  if (pathname === '/' || pathname === '/dashboard') {
    try {
      const tsStatus = getTailscaleStatus();
      const sessionList = tm.getSessionList();
      const connectedDevices = sessionList
        .filter(s => s.hasClient)
        .map(s => ({ sessionId: s.id, name: s.name, deviceName: s.deviceName }));
      const html = await generateDashboard(config, tsStatus, tm.getSessionCount(), connectedDevices, local);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      logger.error(`Dashboard error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
    return;
  }

  if (pathname === '/api/status') {
    const tsStatus = getTailscaleStatus();
    const sessionList = tm.getSessionList();
    const connectedDevices = sessionList
      .filter(s => s.hasClient)
      .map(s => ({ sessionId: s.id, name: s.name, deviceName: s.deviceName }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      tailscale: { installed: tsStatus.installed, running: tsStatus.running, ip: tsStatus.ip },
      port: config.port,
      sessions: tm.getSessionCount(),
      connectedDevices,
      defaultCwd: config.defaultCwd || null,
    }));
    return;
  }

  if (pathname === '/api/settings' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ defaultCwd: config.defaultCwd || '' }));
    return;
  }

  if (pathname === '/api/pick-directory' && req.method === 'POST') {
    const { execFile } = require('child_process');
    const scriptPath = path.join(__dirname, 'pick-folder.ps1');
    execFile('powershell', ['-STA', '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { encoding: 'utf-8', timeout: 120000, windowsHide: true }, (err, stdout) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ path: stdout.trim() }));
    });
    return;
  }

  if (pathname === '/api/browse' && req.method === 'GET') {
    const { validatePath } = require('./sandbox');
    const requestedPath = url.searchParams.get('path');

    // No path provided on Windows → list drive letters
    if (!requestedPath && process.platform === 'win32') {
      const { execSync } = require('child_process');
      try {
        const raw = execSync('wmic logicaldisk get name,volumename', { encoding: 'utf-8' });
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        // Skip header line, parse "C:  Label" rows
        const drives = [];
        for (let i = 1; i < lines.length; i++) {
          const match = lines[i].match(/^([A-Z]:)\s*(.*)/i);
          if (match) {
            drives.push({
              name: match[1].toUpperCase() + '\\',
              label: match[2].trim() || null,
              isDirectory: true,
            });
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          path: null,
          parent: null,
          entries: drives,
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to list drives: ' + err.message }));
      }
      return;
    }

    // No path and not Windows → use defaultCwd or home
    const targetPath = requestedPath || config.defaultCwd || os.homedir();

    // Sandbox check
    if (config.sandboxRoot) {
      const validated = validatePath(targetPath, config.sandboxRoot);
      if (!validated) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Path outside sandbox' }));
        return;
      }
    }

    try {
      const resolved = path.resolve(targetPath);
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const dirs = entries
        .filter(e => e.isDirectory())
        .map(e => ({ name: e.name, isDirectory: true }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      const parsed = path.parse(resolved);
      const parent = parsed.dir === resolved ? null : parsed.dir;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ path: resolved, parent, entries: dirs }));
    } catch (err) {
      const status = err.code === 'ENOENT' ? 404 : err.code === 'EACCES' ? 403 : 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/mkdir' && req.method === 'POST') {
    const { validatePath } = require('./sandbox');
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { path: dirPath } = JSON.parse(body);
        if (!dirPath || typeof dirPath !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid "path" field' }));
          return;
        }

        const resolved = path.resolve(dirPath);

        if (config.sandboxRoot) {
          const validated = validatePath(resolved, config.sandboxRoot);
          if (!validated) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Path outside sandbox' }));
            return;
          }
        }

        fs.mkdirSync(resolved, { recursive: true });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: resolved }));
      } catch (err) {
        const status = err.code === 'EACCES' ? 403 : 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/settings' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const updates = JSON.parse(body);
        if (typeof updates.defaultCwd === 'string') {
          config.defaultCwd = updates.defaultCwd || null;
        }
        saveConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/sessions' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessions: tm.getSessionList() }));
    return;
  }

  if (pathname === '/api/external-sessions' && req.method === 'GET') {
    const { scanExternalClaudeSessions } = require('./process-scanner');
    const daemonPids = tm.getDaemonPtyPids();
    const external = scanExternalClaudeSessions(daemonPids);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessions: external }));
    return;
  }

  // DELETE /api/sessions/:id
  const deleteMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const sessionId = decodeURIComponent(deleteMatch[1]);
    tm.destroySession(sessionId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('claude-code-remote daemon is running\n');
}

// --- WebSocket upgrade handler (shared by both servers) ---
function upgradeHandler(req, socket, head) {
  if (!authenticate(req, config.token)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    logger.warn('Rejected unauthenticated upgrade request');
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
}

// --- Create servers ---
const localServer = http.createServer(requestHandler);
localServer.on('upgrade', upgradeHandler);

let tsServer = null;

// --- WebSocket server (noServer mode) ---
const wss = new WebSocketServer({ noServer: true });

// --- Connection handling ---
wss.on('connection', (ws, req) => {
  const clientAddr = req.socket.remoteAddress;
  logger.info(`Client connected from ${clientAddr}`);

  // Parse desired cols/rows from query params, default 80x24
  let cols = 80;
  let rows = 24;
  let cwd = config.defaultCwd || process.cwd();
  let sessionName;
  let deviceName;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.searchParams.has('cols')) cols = Math.max(1, parseInt(url.searchParams.get('cols'), 10) || 80);
    if (url.searchParams.has('rows')) rows = Math.max(1, parseInt(url.searchParams.get('rows'), 10) || 24);
    if (url.searchParams.has('cwd') && url.searchParams.get('cwd')) cwd = url.searchParams.get('cwd');
    if (url.searchParams.has('name') && url.searchParams.get('name')) sessionName = url.searchParams.get('name');
    if (url.searchParams.has('deviceName') && url.searchParams.get('deviceName')) deviceName = url.searchParams.get('deviceName');
  } catch {
    // use defaults
  }

  // Reconnect to existing session or create new one
  let sessionId;
  let requestedId;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    requestedId = url.searchParams.get('sessionId');
  } catch {}

  try {
    if (requestedId && tm.getSession(requestedId)) {
      // Reattach to existing session
      sessionId = requestedId;
      if (deviceName) tm.setDeviceName(sessionId, deviceName);
      tm.attachWebSocket(sessionId, ws);
      const session = tm.getSession(sessionId);
      ws.send(makeSessionCreated(sessionId, cols, rows, {
        cwd: session.cwd,
        name: session.name,
        createdAt: session.createdAt,
      }));
      logger.info(`Session ${sessionId} reattached`);
    } else {
      // Create new session
      sessionId = uuidv4();
      tm.createSession(sessionId, cwd, cols, rows, shell, sandboxRoot, sessionName, deviceName);
      tm.attachWebSocket(sessionId, ws);
      const session = tm.getSession(sessionId);
      ws.send(makeSessionCreated(sessionId, cols, rows, {
        cwd: session.cwd,
        name: session.name,
        createdAt: session.createdAt,
      }));
    }
  } catch (err) {
    logger.error(`Failed to create/reattach session: ${err.message}`);
    ws.send(makeError(err.message));
    ws.close(1011, 'Session creation failed');
    return;
  }

  // Store session ID on the ws object for cleanup
  ws._sessionId = sessionId;

  // --- Message routing ---
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(makeError('Invalid JSON'));
      return;
    }

    const validationError = validate(msg);
    if (validationError) {
      ws.send(makeError(validationError));
      return;
    }

    switch (msg.type) {
      case MessageType.TERMINAL_INPUT:
        try {
          tm.writeToSession(msg.sessionId, msg.data);
        } catch (err) {
          ws.send(makeError(err.message));
        }
        break;

      case MessageType.TERMINAL_RESIZE:
        try {
          tm.resizeSession(msg.sessionId, msg.cols, msg.rows);
        } catch (err) {
          ws.send(makeError(err.message));
        }
        break;

      default:
        ws.send(makeError(`Unhandled message type: ${msg.type}`));
    }
  });

  // --- Disconnect handling ---
  ws.on('close', () => {
    logger.info(`Client disconnected (session ${sessionId})`);
    tm.detachWebSocket(sessionId);
    // Keep pty alive for reconnection (configurable, default 30 min)
    const keepAliveMs = (config.sessionKeepAliveMinutes || 30) * 60 * 1000;
    tm.scheduleDestroy(sessionId, keepAliveMs);
  });

  ws.on('error', (err) => {
    logger.error(`WebSocket error (session ${sessionId}): ${err.message}`);
  });
});

// --- Start listening ---
localServer.listen(port, '127.0.0.1', () => {
  logger.info(`Listening on 127.0.0.1:${port}`);
  logger.info(`Config: ${CONFIG_PATH}`);
  if (sandboxRoot) {
    logger.info(`Sandbox root: ${sandboxRoot}`);
  } else {
    logger.info('Sandbox: disabled (no sandboxRoot configured)');
  }
  logger.info(`Local dashboard: http://localhost:${port}`);

  // Start Tailscale server if IP is available
  const tsStatus = getTailscaleStatus();
  if (tsStatus.ip) {
    tsServer = http.createServer(requestHandler);
    tsServer.on('upgrade', upgradeHandler);
    tsServer.listen(port, tsStatus.ip, () => {
      logger.info(`Listening on ${tsStatus.ip}:${port}`);
      logger.info(`Remote dashboard: http://${tsStatus.ip}:${port}`);
    });
    tsServer.on('error', (err) => {
      logger.warn(`Failed to bind Tailscale server on ${tsStatus.ip}:${port}: ${err.message}`);
      tsServer = null;
    });
  } else {
    logger.warn(`Tailscale: ${tsStatus.error || 'not available'}`);
  }
});

// --- Graceful shutdown ---
function shutdown(signal) {
  logger.info(`${signal} received, shutting down...`);
  tm.destroyAll();
  wss.close(() => {
    localServer.close(() => {
      if (tsServer) {
        tsServer.close(() => {
          logger.info('Daemon stopped');
          process.exit(0);
        });
      } else {
        logger.info('Daemon stopped');
        process.exit(0);
      }
    });
  });
  // Force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
