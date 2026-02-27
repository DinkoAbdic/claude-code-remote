/**
 * WebSocket message protocol for Claude Code Remote.
 * All messages are JSON text frames.
 */

const MessageType = {
  // Terminal
  TERMINAL_INPUT: 'terminal.input',
  TERMINAL_OUTPUT: 'terminal.output',
  TERMINAL_RESIZE: 'terminal.resize',

  // Session
  SESSION_CREATED: 'session.created',
  SESSION_ENDED: 'session.ended',
  SESSION_IDLE: 'session.idle',

  // Error
  ERROR: 'error',
};

function validate(msg) {
  if (!msg || typeof msg !== 'object') return 'Message must be a JSON object';
  if (!msg.type) return 'Missing "type" field';

  switch (msg.type) {
    case MessageType.TERMINAL_INPUT:
      if (typeof msg.data !== 'string') return 'terminal.input requires string "data"';
      if (!msg.sessionId) return 'terminal.input requires "sessionId"';
      break;

    case MessageType.TERMINAL_RESIZE:
      if (!Number.isInteger(msg.cols) || msg.cols < 1) return 'terminal.resize requires positive integer "cols"';
      if (!Number.isInteger(msg.rows) || msg.rows < 1) return 'terminal.resize requires positive integer "rows"';
      if (!msg.sessionId) return 'terminal.resize requires "sessionId"';
      break;

    default:
      return `Unknown message type: ${msg.type}`;
  }

  return null; // valid
}

function makeSessionCreated(sessionId, cols, rows, metadata) {
  return JSON.stringify({
    type: MessageType.SESSION_CREATED,
    sessionId,
    cols,
    rows,
    cwd: metadata?.cwd || null,
    name: metadata?.name || null,
    createdAt: metadata?.createdAt || null,
  });
}

function makeSessionEnded(sessionId, reason) {
  return JSON.stringify({
    type: MessageType.SESSION_ENDED,
    sessionId,
    reason,
  });
}

function makeTerminalOutput(sessionId, data) {
  return JSON.stringify({
    type: MessageType.TERMINAL_OUTPUT,
    sessionId,
    data,
  });
}

function makeSessionIdle(sessionId) {
  return JSON.stringify({
    type: MessageType.SESSION_IDLE,
    sessionId,
  });
}

function makeError(message) {
  return JSON.stringify({
    type: MessageType.ERROR,
    message,
  });
}

module.exports = { MessageType, validate, makeSessionCreated, makeSessionEnded, makeSessionIdle, makeTerminalOutput, makeError };
