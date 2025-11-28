/**
 * WebSocket client built on Undici WebSocket
 * Provides easy-to-use interface for WebSocket connections
 */

import { WebSocket } from 'undici';
import { EventEmitter } from 'events';

export interface WebSocketOptions {
  /**
   * Protocols to use
   */
  protocols?: string | string[];

  /**
   * Headers to send during handshake
   */
  headers?: Record<string, string>;

  /**
   * Auto-reconnect on disconnect
   * @default false
   */
  reconnect?: boolean;

  /**
   * Reconnect delay in milliseconds
   * @default 1000
   */
  reconnectDelay?: number;

  /**
   * Max reconnection attempts (0 = infinite)
   * @default 5
   */
  maxReconnectAttempts?: number;

  /**
   * Heartbeat interval in milliseconds (0 = disabled)
   * Sends ping frames to keep connection alive
   * @default 30000
   */
  heartbeatInterval?: number;
}

export interface WebSocketMessage {
  data: string | Buffer;
  isBinary: boolean;
}

/**
 * WebSocket client wrapper
 */
export class ReckerWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private options: Required<WebSocketOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private isClosed = false;
  private isReconnecting = false;

  constructor(url: string, options: WebSocketOptions = {}) {
    super();
    this.url = url;
    this.options = {
      protocols: options.protocols || [],
      headers: options.headers || {},
      reconnect: options.reconnect ?? false,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url, this.options.protocols);

        this.ws.addEventListener('open', () => {
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.startHeartbeat();
          this.emit('open');
          resolve();
        });

        this.ws.addEventListener('message', (event) => {
          const message: WebSocketMessage = {
            data: event.data,
            isBinary: event.data instanceof Buffer
          };
          this.emit('message', message);
        });

        this.ws.addEventListener('close', (event) => {
          this.stopHeartbeat();
          this.emit('close', event.code, event.reason);
          
          if (!this.isClosed && this.options.reconnect) {
            this.attemptReconnect();
          }
        });

        this.ws.addEventListener('error', (event) => {
          this.emit('error', event.error || new Error('WebSocket error'));
          reject(event.error || new Error('WebSocket connection failed'));
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send data through WebSocket
   */
  send(data: string | Buffer | ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(data);
  }

  /**
   * Send JSON data
   */
  sendJSON(data: any): void {
    this.send(JSON.stringify(data));
  }

  /**
   * Close WebSocket connection
   */
  close(code = 1000, reason = ''): void {
    this.isClosed = true;
    this.stopHeartbeat();
    this.clearReconnectTimer();
    
    if (this.ws) {
      this.ws.close(code, reason);
      this.ws = null;
    }
  }

  /**
   * Ping the server
   * Note: Sends a heartbeat message. WebSocket protocol-level ping/pong is automatic.
   */
  ping(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Undici WebSocket doesn't expose ping() in browser-compatible API
      // Send a heartbeat message instead
      try {
        this.ws.send('__heartbeat__');
      } catch (e) {
        // Ignore errors during heartbeat
      }
    }
  }

  /**
   * Get current connection state
   */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Async iterator for messages
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<WebSocketMessage> {
    const queue: WebSocketMessage[] = [];
    let resolveNext: ((value: WebSocketMessage | null) => void) | null = null;
    let closed = false;

    const messageHandler = (msg: WebSocketMessage) => {
      if (resolveNext) {
        resolveNext(msg);
        resolveNext = null;
      } else {
        queue.push(msg);
      }
    };

    const closeHandler = () => {
      closed = true;
      if (resolveNext) {
        resolveNext(null); // Resolve with null to break await
        resolveNext = null;
      }
    };

    this.on('message', messageHandler);
    this.on('close', closeHandler);

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          if (closed) break;
          
          const msg = await new Promise<WebSocketMessage | null>((resolve) => {
            resolveNext = resolve;
          });
          
          if (msg) {
            yield msg;
          } else {
            // Null means closed
            break;
          }
        }
      }
    } finally {
      this.off('message', messageHandler);
      this.off('close', closeHandler);
    }
  }

  // Private methods

  private attemptReconnect(): void {
    if (this.isReconnecting) return;
    if (this.options.maxReconnectAttempts > 0 && 
        this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.emit('max-reconnect-attempts');
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    this.emit('reconnecting', this.reconnectAttempts, delay);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.emit('reconnect-error', error);
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private startHeartbeat(): void {
    if (this.options.heartbeatInterval <= 0) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.ping();
      }
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}

/**
 * Create a WebSocket connection
 */
export function websocket(url: string, options?: WebSocketOptions): ReckerWebSocket {
  const ws = new ReckerWebSocket(url, options);
  ws.connect().catch(() => {
    // Error will be emitted via 'error' event
  });
  return ws;
}
