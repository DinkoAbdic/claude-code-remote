const pty = require('node-pty');
const { validatePath } = require('./sandbox');
const { makeTerminalOutput } = require('./protocol');
const logger = require('./logger');

/** @type {Map<string, {pty: any, ws: any|null, destroyTimer: any|null}>} */
const sessions = new Map();

function createSession(id, cwd, cols, rows, shell, sandboxRoot) {
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

  sessions.set(id, {
    pty: ptyProcess,
    ws: null,
    destroyTimer: null,
  });

  logger.info(`Session ${id} created (shell=${shell}, cwd=${resolvedCwd}, ${cols}x${rows})`);
  return id;
}

function attachWebSocket(id, ws) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);

  // Clear any pending destroy timer
  if (session.destroyTimer) {
    clearTimeout(session.destroyTimer);
    session.destroyTimer = null;
    logger.info(`Session ${id} reconnected, destroy timer cancelled`);
  }

  // Detach previous WS if any
  if (session.ws) {
    detachWebSocket(id);
  }

  session.ws = ws;

  // Wire pty output → WS
  session.dataHandler = session.pty.onData((data) => {
    if (session.ws && session.ws.readyState === 1) { // WebSocket.OPEN
      session.ws.send(makeTerminalOutput(id, data));
    }
  });

  session.exitHandler = session.pty.onExit(({ exitCode }) => {
    logger.info(`Session ${id} pty exited with code ${exitCode}`);
    if (session.ws && session.ws.readyState === 1) {
      session.ws.close(1000, 'pty exited');
    }
    sessions.delete(id);
  });

  logger.info(`WebSocket attached to session ${id}`);
}

function detachWebSocket(id) {
  const session = sessions.get(id);
  if (!session) return;

  if (session.dataHandler) {
    session.dataHandler.dispose();
    session.dataHandler = null;
  }
  if (session.exitHandler) {
    session.exitHandler.dispose();
    session.exitHandler = null;
  }

  session.ws = null;
  logger.info(`WebSocket detached from session ${id}`);
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
  if (session.dataHandler) {
    session.dataHandler.dispose();
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

module.exports = {
  createSession,
  attachWebSocket,
  detachWebSocket,
  writeToSession,
  resizeSession,
  destroySession,
  scheduleDestroy,
  destroyAll,
  getSession,
};
