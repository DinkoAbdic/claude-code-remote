const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { loadOrCreate, CONFIG_PATH } = require('./config');
const { authenticate } = require('./auth');
const { MessageType, validate, makeSessionCreated, makeError } = require('./protocol');
const tm = require('./terminal-manager');
const logger = require('./logger');

const config = loadOrCreate();
const { port, shell, sandboxRoot } = config;

// --- HTTP server (for upgrade-level auth) ---
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('claude-code-remote daemon is running\n');
});

// --- WebSocket server (noServer mode) ---
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!authenticate(req, config.token)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    logger.warn('Rejected unauthenticated upgrade request');
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

// --- Connection handling ---
wss.on('connection', (ws, req) => {
  const clientAddr = req.socket.remoteAddress;
  logger.info(`Client connected from ${clientAddr}`);

  // Parse desired cols/rows from query params, default 80x24
  let cols = 80;
  let rows = 24;
  let cwd = process.cwd();
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.searchParams.has('cols')) cols = Math.max(1, parseInt(url.searchParams.get('cols'), 10) || 80);
    if (url.searchParams.has('rows')) rows = Math.max(1, parseInt(url.searchParams.get('rows'), 10) || 24);
    if (url.searchParams.has('cwd')) cwd = url.searchParams.get('cwd');
  } catch {
    // use defaults
  }

  // Create session
  const sessionId = uuidv4();
  try {
    tm.createSession(sessionId, cwd, cols, rows, shell, sandboxRoot);
    tm.attachWebSocket(sessionId, ws);
    ws.send(makeSessionCreated(sessionId, cols, rows));
  } catch (err) {
    logger.error(`Failed to create session: ${err.message}`);
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
    // Keep pty alive for 5 minutes for reconnection
    tm.scheduleDestroy(sessionId, 5 * 60 * 1000);
  });

  ws.on('error', (err) => {
    logger.error(`WebSocket error (session ${sessionId}): ${err.message}`);
  });
});

// --- Start listening ---
server.listen(port, '0.0.0.0', () => {
  logger.info(`Daemon listening on 0.0.0.0:${port}`);
  logger.info(`Config: ${CONFIG_PATH}`);
  if (sandboxRoot) {
    logger.info(`Sandbox root: ${sandboxRoot}`);
  } else {
    logger.info('Sandbox: disabled (no sandboxRoot configured)');
  }
});

// --- Graceful shutdown ---
function shutdown(signal) {
  logger.info(`${signal} received, shutting down...`);
  tm.destroyAll();
  wss.close(() => {
    server.close(() => {
      logger.info('Daemon stopped');
      process.exit(0);
    });
  });
  // Force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
