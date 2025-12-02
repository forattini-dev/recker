/**
 * WebSocket client built on Undici WebSocket
 * Provides easy-to-use interface for WebSocket connections
 */

import { WebSocket } from 'undici';
import { EventEmitter } from 'events';
import type { TLSOptions, ProxyOptions } from '../types/index.js';
import type { Dispatcher } from 'undici';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { nodeToWebStream, webToNodeStream } from '../utils/streaming.js';
import { StateError, StreamError, ConnectionError } from '../core/errors.js';

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
   * Undici dispatcher to use (supports ProxyAgent/AgentManager).
   */
  dispatcher?: Dispatcher;

  /**
   * Proxy configuration (maps to ProxyAgent).
   */
  proxy?: ProxyOptions | string;

  /**
   * TLS options for secure connections.
   */
  tls?: TLSOptions;

  /**
   * Enable permessage-deflate extension.
   * @default false
   */
  perMessageDeflate?: boolean;

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

  /**
   * How long to wait for a pong before considering the connection dead.
   * @default 10000
   */
  heartbeatTimeout?: number;
}

export interface WebSocketMessage {
  data: string | Buffer;
  isBinary: boolean;
}

interface BackoffOptions {
  base: number;
  factor: number;
  jitter: boolean;
  max?: number;
}

/**
 * WebSocket client wrapper
 */
export class ReckerWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private options: Required<Pick<WebSocketOptions, 'protocols' | 'headers' | 'reconnect' | 'reconnectDelay' | 'maxReconnectAttempts' | 'heartbeatInterval' | 'heartbeatTimeout' | 'perMessageDeflate'>> & Pick<WebSocketOptions, 'dispatcher' | 'proxy' | 'tls'>;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private isClosed = false;
  private isReconnecting = false;
  private pongWatchdog?: NodeJS.Timeout;
  private backoff: BackoffOptions;
  private closedByUser = false;

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
      heartbeatTimeout: options.heartbeatTimeout ?? 10000,
      dispatcher: options.dispatcher,
      proxy: options.proxy,
      tls: options.tls,
      perMessageDeflate: options.perMessageDeflate ?? false
    };

    this.backoff = {
      base: this.options.reconnectDelay,
      factor: 2,
      jitter: true,
      max: 30000
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsOptions: any = {
          headers: this.options.headers,
          dispatcher: this.options.dispatcher,
          perMessageDeflate: this.options.perMessageDeflate,
        };

        // Proxy support via ProxyAgent if provided in options
        if (this.options.proxy) {
          const proxyConfig: ProxyOptions = typeof this.options.proxy === 'string'
            ? { url: this.options.proxy }
            : this.options.proxy;
          // Lazy require to avoid circular deps
          const { ProxyAgent } = require('undici');
          wsOptions.dispatcher = new ProxyAgent(proxyConfig.url);
        }

        if (this.options.tls) {
          wsOptions.tls = this.options.tls;
        }

        // @ts-expect-error - undici WebSocket accepts options as third argument
        this.ws = new WebSocket(this.url, this.options.protocols, wsOptions);

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
          this.stopPongWatchdog(); // got data, connection is alive
        });

        this.ws.addEventListener('close', (event) => {
          this.stopHeartbeat();
          this.stopPongWatchdog();
          this.emit('close', event.code, event.reason);
          
          if (!this.closedByUser && !this.isClosed && this.options.reconnect) {
            this.attemptReconnect();
          }
        });

        this.ws.addEventListener('error', (event) => {
          const err = event.error instanceof Error
            ? event.error
            : new ConnectionError(
                'WebSocket connection error',
                {
                  host: this.url,
                  retriable: true,
                }
              );
          this.emit('error', err);
          reject(err);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send data through WebSocket
   */
  async send(data: string | Buffer | ArrayBuffer | ArrayBufferView, options?: { awaitDrain?: boolean; highWaterMark?: number }): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new StateError(
        'WebSocket is not connected',
        {
          expectedState: 'open',
          actualState: this.ws ? 'closed' : 'not-created',
        }
      );
    }

    const awaitDrain = options?.awaitDrain ?? false;
    const highWaterMark = options?.highWaterMark ?? 16 * 1024; // 16KB default

    this.ws.send(data as any);

    if (awaitDrain) {
      await this.waitForDrain(highWaterMark);
    }
  }

  /**
   * Send a Node.js Readable stream as a sequence of binary frames.
   * Optional backpressure wait based on bufferedAmount.
   */
  async sendStream(stream: Readable, options?: { awaitDrain?: boolean; highWaterMark?: number }): Promise<void> {
    for await (const chunk of stream) {
      await this.send(chunk as Buffer, options);
    }
  }

  /**
   * Send JSON data
   */
  sendJSON(data: any): void {
    void this.send(JSON.stringify(data));
  }

  /**
   * Close WebSocket connection
   */
  close(code = 1000, reason = ''): void {
    this.isClosed = true;
    this.closedByUser = true;
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // If undici exposes ping, prefer it (Node-only).
    const anyWs = this.ws as any;
    if (typeof anyWs.ping === 'function') {
      try {
        anyWs.ping();
        return;
      } catch {
        // fallback to data ping
      }
    }

    try {
      this.ws.send('__heartbeat__');
    } catch {
      // Ignore errors during heartbeat
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
   * Convert the websocket into a duplex Node.js stream (adapter).
   * Useful for piping data between WS and file/network streams.
   */
  toReadable(): Readable | null {
    if (!this.ws) return null;
    // Undici exposes a WHATWG stream for incoming messages; wrap into Node stream.
    const wsAny = this.ws as any;
    if (wsAny.readable) {
      return webToNodeStream(wsAny.readable);
    }
    return null;
  }

  /**
   * Pipe a Node.js Readable into the WebSocket (binary frames).
   */
  async pipeFrom(source: Readable, options?: { awaitDrain?: boolean; highWaterMark?: number }): Promise<void> {
    await this.sendStream(source, options);
  }

  /**
   * Pipe websocket incoming data to a destination writable stream.
   */
  async pipeTo(destination: NodeJS.WritableStream): Promise<void> {
    const readable = this.toReadable();
    if (!readable) {
      throw new StreamError(
        'WebSocket has no readable stream',
        {
          streamType: 'websocket',
          retriable: false,
        }
      );
    }
    await pipeline(readable, destination);
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

    const baseDelay = this.backoff.base * Math.pow(this.backoff.factor, this.reconnectAttempts - 1);
    const capped = this.backoff.max ? Math.min(baseDelay, this.backoff.max) : baseDelay;
    const jittered = this.backoff.jitter ? randomJitter(capped) : capped;
    this.emit('reconnecting', this.reconnectAttempts, jittered);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.emit('reconnect-error', error);
      });
    }, jittered);
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
        this.startPongWatchdog();
      }
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    this.stopPongWatchdog();
  }

  private startPongWatchdog(): void {
    this.stopPongWatchdog();
    if (this.options.heartbeatTimeout <= 0) return;

    this.pongWatchdog = setTimeout(() => {
      this.emit('heartbeat-timeout');
      if (!this.closedByUser && this.options.reconnect) {
        this.ws?.close(4000, 'heartbeat timeout');
      }
    }, this.options.heartbeatTimeout);
  }

  private stopPongWatchdog(): void {
    if (this.pongWatchdog) {
      clearTimeout(this.pongWatchdog);
      this.pongWatchdog = undefined;
    }
  }

  private getBufferedAmount(): number {
    // undici's WHATWG WebSocket doesn't expose bufferedAmount; default to 0.
    return (this.ws as any)?.bufferedAmount ?? 0;
  }

  private async waitForDrain(highWaterMark: number): Promise<void> {
    const buffered = this.getBufferedAmount();
    if (buffered <= highWaterMark) return;

    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.getBufferedAmount() <= highWaterMark || !this.isConnected) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };

      setTimeout(check, 10);
    });
  }
}

/**
 * Create a WebSocket connection
 *
 * @example
 * ```typescript
 * import { createWebSocket } from 'recker';
 *
 * const ws = createWebSocket('wss://api.example.com/ws', {
 *   reconnect: true,
 *   heartbeatInterval: 30000,
 *   debug: true
 * });
 *
 * ws.on('message', (msg) => console.log(msg.data));
 *
 * // Or use async iterator
 * for await (const message of ws) {
 *   console.log(message.data);
 * }
 * ```
 */
export function createWebSocket(url: string, options?: WebSocketOptions): ReckerWebSocket {
  const ws = new ReckerWebSocket(url, options);
  ws.connect().catch(() => {
    // Error will be emitted via 'error' event
  });
  return ws;
}

function randomJitter(value: number) {
  const jitter = 0.2 * value;
  return value - jitter + Math.random() * (2 * jitter);
}
