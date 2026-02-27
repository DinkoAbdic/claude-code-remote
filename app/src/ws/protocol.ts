/**
 * WebSocket message protocol — mirrors daemon/src/protocol.js
 */

export const MessageType = {
  TERMINAL_INPUT: 'terminal.input',
  TERMINAL_OUTPUT: 'terminal.output',
  TERMINAL_RESIZE: 'terminal.resize',
  SESSION_CREATED: 'session.created',
  SESSION_ENDED: 'session.ended',
  SESSION_IDLE: 'session.idle',
  ERROR: 'error',
} as const;

export interface TerminalInputMessage {
  type: typeof MessageType.TERMINAL_INPUT;
  sessionId: string;
  data: string;
}

export interface TerminalOutputMessage {
  type: typeof MessageType.TERMINAL_OUTPUT;
  sessionId: string;
  data: string;
}

export interface TerminalResizeMessage {
  type: typeof MessageType.TERMINAL_RESIZE;
  sessionId: string;
  cols: number;
  rows: number;
}

export interface SessionCreatedMessage {
  type: typeof MessageType.SESSION_CREATED;
  sessionId: string;
  cols: number;
  rows: number;
  cwd?: string;
  name?: string;
  createdAt?: string;
}

export interface SessionEndedMessage {
  type: typeof MessageType.SESSION_ENDED;
  sessionId: string;
  reason: string;
}

export interface SessionIdleMessage {
  type: typeof MessageType.SESSION_IDLE;
  sessionId: string;
}

export interface ErrorMessage {
  type: typeof MessageType.ERROR;
  message: string;
}

export type ServerMessage = TerminalOutputMessage | SessionCreatedMessage | SessionEndedMessage | SessionIdleMessage | ErrorMessage;
export type ClientMessage = TerminalInputMessage | TerminalResizeMessage;

export function makeTerminalInput(sessionId: string, data: string): string {
  return JSON.stringify({ type: MessageType.TERMINAL_INPUT, sessionId, data });
}

export function makeTerminalResize(sessionId: string, cols: number, rows: number): string {
  return JSON.stringify({ type: MessageType.TERMINAL_RESIZE, sessionId, cols, rows });
}
