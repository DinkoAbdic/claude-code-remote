const path = require('path');
const pty = require('node-pty');
const { validatePath } = require('./sandbox');
const { makeTerminalOutput, makeSessionEnded, makeSessionIdle } = require('./protocol');
const logger = require('./logger');

const MAX_SCROLLBACK = 50 * 1024; // 50KB
const IDLE_TIMEOUT_MS = 3000; // 3s of no output = idle
const DEBUG_XTERM_BRIDGE = process.env.DEBUG_XTERM_BRIDGE === '1';

function debugBridge(...args) {
  if (!DEBUG_XTERM_BRIDGE) return;
  logger.info('[xterm-bridge]', ...args);
}

/** @type {Map<string, {pty: any, ws: any|null, destroyTimer: any|null, idleTimer: any|null, scrollback: string, scrollbackHandler: any, exitHandler: any, dataHandler: any|null, cwd: string, name: string, createdAt: string, deviceName: string|null}>} */
const sessions = new Map();

function createSession(id, cwd, cols, rows, shell, sandboxRoot, name, deviceName) {
  const resolvedCwd = validatePath(cwd, sandboxRoot);
  if (!resolvedCwd) {
    throw new Error(`Path rejected by sandbox: ${cwd}`);
  }

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: resolvedCwd,
    env: process.env,
  });

  const session = {
    pty: ptyProcess,
    ws: null,
    destroyTimer: null,
    idleTimer: null,
    scrollback: '',
    scrollbackHandler: null,
    exitHandler: null,
    dataHandler: null,
    cwd: resolvedCwd,
    name: name || path.basename(resolvedCwd) || resolvedCwd,
    createdAt: new Date().toISOString(),
    deviceName: deviceName || null,
  };

  sessions.set(id, session);

  // Permanent scrollback capture — runs regardless of WS state
  session.scrollbackHandler = ptyProcess.onData((data) => {
    session.scrollback += data;
    if (session.scrollback.length > MAX_SCROLLBACK) {
      session.scrollback = session.scrollback.slice(-MAX_SCROLLBACK);
    }

    // Idle detection: reset timer on every output chunk
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      session.idleTimer = null;
      if (session.ws && session.ws.readyState === 1) {
        session.ws.send(makeSessionIdle(id));
      }
    }, IDLE_TIMEOUT_MS);
  });

  // Permanent exit handler
  session.exitHandler = ptyProcess.onExit(({ exitCode }) => {
    logger.info(`Session ${id} pty exited with code ${exitCode}`);
    if (session.ws && session.ws.readyState === 1) {
      session.ws.send(makeSessionEnded(id, `Process exited with code ${exitCode}`));
      session.ws.close(1000, 'pty exited');
    }
    // Clean up permanent handlers
    if (session.scrollbackHandler) session.scrollbackHandler.dispose();
    if (session.exitHandler) session.exitHandler.dispose();
    if (session.dataHandler) session.dataHandler.dispose();
    if (session.destroyTimer) clearTimeout(session.destroyTimer);
    if (session.idleTimer) clearTimeout(session.idleTimer);
    sessions.delete(id);
  });

  logger.info(`Session ${id} created (shell=${shell}, cwd=${resolvedCwd}, ${cols}x${rows})`);
  return id;
}

function attachWebSocket(id, ws) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);

  debugBridge('attach requested', {
    sessionId: id,
    hasScrollback: session.scrollback.length > 0,
    scrollbackBytes: session.scrollback.length,
    hadExistingWs: Boolean(session.ws),
  });

  // Clear any pending destroy timer
  if (session.destroyTimer) {
    clearTimeout(session.destroyTimer);
    session.destroyTimer = null;
    logger.info(`Session ${id} reconnected, destroy timer cancelled`);
  }

  // Detach previous WS data forwarder if any
  if (session.ws) {
    detachWebSocket(id);
  }

  session.ws = ws;

  // Replay scrollback buffer so client sees previous terminal content
  if (session.scrollback) {
    debugBridge('replaying scrollback', {
      sessionId: id,
      scrollbackBytes: session.scrollback.length,
    });
    ws.send(makeTerminalOutput(id, session.scrollback));
  } else {
    debugBridge('no scrollback to replay', { sessionId: id });
  }

  // Wire pty output → WS (only the forwarding handler, not exit/scrollback)
  session.dataHandler = session.pty.onData((data) => {
    if (session.ws && session.ws.readyState === 1) { // WebSocket.OPEN
      debugBridge('forwarding live pty output', {
        sessionId: id,
        chunkBytes: data.length,
      });
      session.ws.send(makeTerminalOutput(id, data));
    }
  });

  logger.info(`WebSocket attached to session ${id}`);
}

function detachWebSocket(id) {
  const session = sessions.get(id);
  if (!session) return;

  // Only dispose the WS forwarding handler, NOT scrollback or exit handlers
  if (session.dataHandler) {
    session.dataHandler.dispose();
    session.dataHandler = null;
  }

  session.ws = null;
  logger.info(`WebSocket detached from session ${id}`);
}

function setDeviceName(id, deviceName) {
  const session = sessions.get(id);
  if (session) session.deviceName = deviceName || null;
}

function writeToSession(id, data) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  session.pty.write(data);
}

function resizeSession(id, cols, rows) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  session.pty.resize(cols, rows);
  logger.info(`Session ${id} resized to ${cols}x${rows}`);
}

function destroySession(id) {
  const session = sessions.get(id);
  if (!session) return;

  if (session.destroyTimer) {
    clearTimeout(session.destroyTimer);
  }
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
  }
  if (session.dataHandler) {
    session.dataHandler.dispose();
  }
  if (session.scrollbackHandler) {
    session.scrollbackHandler.dispose();
  }
  if (session.exitHandler) {
    session.exitHandler.dispose();
  }

  try {
    session.pty.kill();
  } catch {
    // already dead
  }

  sessions.delete(id);
  logger.info(`Session ${id} destroyed`);
}

function scheduleDestroy(id, delayMs = 5 * 60 * 1000) {
  const session = sessions.get(id);
  if (!session) return;

  session.destroyTimer = setTimeout(() => {
    logger.info(`Session ${id} abandoned, destroying after timeout`);
    destroySession(id);
  }, delayMs);

  logger.info(`Session ${id} scheduled for destruction in ${delayMs / 1000}s`);
}

function destroyAll() {
  for (const id of sessions.keys()) {
    destroySession(id);
  }
}

function getSession(id) {
  return sessions.get(id);
}

function getSessionCount() {
  return sessions.size;
}

function getDaemonPtyPids() {
  return [...sessions.values()].map(s => s.pty.pid).filter(Boolean);
}

function getSessionList() {
  const list = [];
  for (const [id, session] of sessions) {
    list.push({
      id,
      cwd: session.cwd,
      name: session.name,
      createdAt: session.createdAt,
      hasClient: session.ws !== null && session.ws.readyState === 1,
      deviceName: session.deviceName,
    });
  }
  return list;
}

module.exports = {
  createSession,
  attachWebSocket,
  detachWebSocket,
  setDeviceName,
  writeToSession,
  resizeSession,
  destroySession,
  scheduleDestroy,
  destroyAll,
  getSession,
  getSessionCount,
  getSessionList,
  getDaemonPtyPids,
};
