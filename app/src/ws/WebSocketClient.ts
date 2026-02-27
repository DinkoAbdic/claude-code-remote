import { MessageType, ServerMessage, makeTerminalInput, makeTerminalResize } from './protocol';

type MessageHandler = (msg: ServerMessage) => void;
type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected') => void;

const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private baseUrl: string = '';
  private onMessage: MessageHandler | null = null;
  private onStatusChange: StatusHandler | null = null;
  private retryDelay = INITIAL_RETRY_DELAY;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private _sessionId: string | null = null;

  // Stored connection params for reconnection
  private _host: string = '';
  private _port: number = 0;
  private _token: string = '';
  private _deviceName: string = '';

  get sessionId() { return this._sessionId; }
  set sessionId(id: string | null) { this._sessionId = id; }

  get host() { return this._host; }
  get port() { return this._port; }
  get token() { return this._token; }

  /** True if the underlying WebSocket is open right now */
  get isConnected() { return this.ws?.readyState === WebSocket.OPEN; }

  /** True if a connection or retry is in progress */
  get isConnecting() {
    return this.ws?.readyState === WebSocket.CONNECTING || this.retryTimer !== null;
  }

  setHandlers(onMessage: MessageHandler, onStatusChange: StatusHandler) {
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
  }

  connect(host: string, port: number, token: string, cwd?: string, name?: string, deviceName?: string) {
    this._host = host;
    this._port = port;
    this._token = token;
    if (deviceName) this._deviceName = deviceName;
    this.intentionalClose = false;
    this.retryDelay = INITIAL_RETRY_DELAY;
    let url = `ws://${host}:${port}?token=${encodeURIComponent(token)}`;
    if (cwd) url += `&cwd=${encodeURIComponent(cwd)}`;
    if (name) url += `&name=${encodeURIComponent(name)}`;
    if (this._deviceName) url += `&deviceName=${encodeURIComponent(this._deviceName)}`;
    this.baseUrl = url;
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
    let url = this.baseUrl;
    if (this._sessionId) {
      url += `&sessionId=${encodeURIComponent(this._sessionId)}`;
    }
    this.ws = new WebSocket(url);

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

  /** Close WS but keep sessionId for later reconnection */
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

  /** Close WS and clear sessionId (full reset) */
  reset() {
    this._sessionId = null;
    this.disconnect();
  }

  /** Switch to an existing session by closing current WS and reconnecting */
  switchSession(sessionId: string) {
    this.disconnect();
    this._sessionId = sessionId;
    // Rebuild base URL without cwd (reconnecting to existing session)
    let url = `ws://${this._host}:${this._port}?token=${encodeURIComponent(this._token)}`;
    if (this._deviceName) url += `&deviceName=${encodeURIComponent(this._deviceName)}`;
    this.baseUrl = url;
    this.intentionalClose = false;
    this.retryDelay = INITIAL_RETRY_DELAY;
    this._connect();
  }

  /** Close current WS and connect fresh (daemon creates new session) */
  connectNew(cwd?: string) {
    this.disconnect();
    this._sessionId = null;
    this.connect(this._host, this._port, this._token, cwd);
  }
}

// Singleton
export const wsClient = new WebSocketClient();
