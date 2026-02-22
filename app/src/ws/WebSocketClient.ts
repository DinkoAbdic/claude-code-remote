import { MessageType, ServerMessage, makeTerminalInput, makeTerminalResize } from './protocol';

type MessageHandler = (msg: ServerMessage) => void;
type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected') => void;

const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private onMessage: MessageHandler | null = null;
  private onStatusChange: StatusHandler | null = null;
  private retryDelay = INITIAL_RETRY_DELAY;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  setHandlers(onMessage: MessageHandler, onStatusChange: StatusHandler) {
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
  }

  connect(host: string, port: number, token: string) {
    this.intentionalClose = false;
    this.retryDelay = INITIAL_RETRY_DELAY;
    this.url = `ws://${host}:${port}?token=${encodeURIComponent(token)}`;
    this._connect();
  }

  private _connect() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch {}
    }

    this.onStatusChange?.('connecting');
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.retryDelay = INITIAL_RETRY_DELAY;
      this.onStatusChange?.('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data as string);
        this.onMessage?.(msg);
      } catch {
        console.warn('Failed to parse WS message:', event.data);
      }
    };

    this.ws.onclose = () => {
      this.onStatusChange?.('disconnected');
      if (!this.intentionalClose) {
        this._scheduleRetry();
      }
    };

    this.ws.onerror = (err) => {
      console.warn('WebSocket error:', err);
      // onclose will fire after this
    };
  }

  private _scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this._connect();
      // Exponential backoff
      this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_DELAY);
    }, this.retryDelay);
  }

  sendInput(sessionId: string, data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(makeTerminalInput(sessionId, data));
    }
  }

  sendResize(sessionId: string, cols: number, rows: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(makeTerminalResize(sessionId, cols, rows));
    }
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onStatusChange?.('disconnected');
  }
}

// Singleton
export const wsClient = new WebSocketClient();
