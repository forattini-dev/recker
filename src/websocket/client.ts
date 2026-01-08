/**
 * WebSocket client built on Undici (Node) or native WebSocket (browser).
 * Provides easy-to-use interface for WebSocket connections.
 */

import type { TLSOptions, ProxyOptions } from '../types/index.js';
import { StateError, StreamError, ConnectionError, UnsupportedError } from '../core/errors.js';

type Listener = (...args: any[]) => void;

class SimpleEmitter {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  once(event: string, listener: Listener) {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, listener: Listener) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
    return this;
  }

  removeListener(event: string, listener: Listener) {
    return this.off(event, listener);
  }

  emit(event: string, ...args: any[]) {
    const set = this.listeners.get(event);
    if (!set) return false;
    for (const listener of [...set]) {
      listener(...args);
    }
    return true;
  }
}

const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

function isNodeRuntime(): boolean {
  return typeof globalThis !== 'undefined' && Boolean((globalThis as any).process?.versions?.node);
}

let undiciModulePromise: Promise<any> | null = null;

async function loadUndici() {
  if (!undiciModulePromise) {
    const moduleName = 'undici';
    undiciModulePromise = import(moduleName);
  }
  return undiciModulePromise;
}

type WebSocketLike = {
  readyState: number;
  send: (data: any) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: (type: string, listener: (event: any) => void) => void;
  removeEventListener: (type: string, listener: (event: any) => void) => void;
  bufferedAmount?: number;
  readable?: ReadableStream<Uint8Array>;
  ping?: () => void;
};

type WebSocketConstructor = new (url: string, protocols?: string | string[], options?: any) => WebSocketLike;

async function getWebSocketConstructor(): Promise<WebSocketConstructor> {
  if (isNodeRuntime()) {
    const undici = await loadUndici();
    return undici.WebSocket as WebSocketConstructor;
  }

  const ws = (globalThis as any).WebSocket as WebSocketConstructor | undefined;
  if (!ws) {
    throw new UnsupportedError('WebSocket is not available in this environment.', { feature: 'websocket' });
  }

  return ws;
}

function isReadableStream(value: any): value is ReadableStream<Uint8Array> {
  return Boolean(value && typeof value.getReader === 'function');
}

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
  dispatcher?: unknown;

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
  data: string | Uint8Array | ArrayBuffer | Blob;
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
export class ReckerWebSocket extends SimpleEmitter {
  private ws: WebSocketLike | null = null;
  private url: string;
  private options: Required<Pick<WebSocketOptions, 'protocols' | 'headers' | 'reconnect' | 'reconnectDelay' | 'maxReconnectAttempts' | 'heartbeatInterval' | 'heartbeatTimeout' | 'perMessageDeflate'>> & Pick<WebSocketOptions, 'dispatcher' | 'proxy' | 'tls'>;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private isClosed = false;
  private isReconnecting = false;
  private pongWatchdog?: ReturnType<typeof setTimeout>;
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
    const WebSocketCtor = await getWebSocketConstructor();
    const nodeEnv = isNodeRuntime();

    const wsOptions: any = nodeEnv
      ? {
          headers: this.options.headers,
          dispatcher: this.options.dispatcher,
          perMessageDeflate: this.options.perMessageDeflate,
        }
      : undefined;

    if (nodeEnv && this.options.proxy) {
      const proxyConfig: ProxyOptions = typeof this.options.proxy === 'string'
        ? { url: this.options.proxy }
        : this.options.proxy;
      const undici = await loadUndici();
      wsOptions.dispatcher = new undici.ProxyAgent(proxyConfig.url);
    }

    if (nodeEnv && this.options.tls) {
      wsOptions.tls = this.options.tls;
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = nodeEnv
          ? new WebSocketCtor(this.url, this.options.protocols, wsOptions)
          : new WebSocketCtor(this.url, this.options.protocols);

        this.ws.addEventListener('open', () => {
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.startHeartbeat();
          this.emit('open');
          resolve();
        });

        this.ws.addEventListener('message', (event) => {
          const data = event.data;
          const message: WebSocketMessage = {
            data,
            isBinary: typeof data !== 'string'
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
          const err = event?.error instanceof Error
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
  async send(
    data: string | ArrayBuffer | ArrayBufferView | Blob,
    options?: { awaitDrain?: boolean; highWaterMark?: number }
  ): Promise<void> {
    if (!this.ws || this.ws.readyState !== READY_STATE.OPEN) {
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
   * Send a stream (ReadableStream or AsyncIterable) as a sequence of binary frames.
   * Optional backpressure wait based on bufferedAmount.
   */
  async sendStream(
    stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
    options?: { awaitDrain?: boolean; highWaterMark?: number }
  ): Promise<void> {
    if (isReadableStream(stream)) {
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await this.send(value, options);
      }
      return;
    }

    for await (const chunk of stream) {
      await this.send(chunk, options);
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
    if (!this.ws || this.ws.readyState !== READY_STATE.OPEN) return;

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
    return this.ws?.readyState ?? READY_STATE.CLOSED;
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === READY_STATE.OPEN;
  }

  /**
   * Expose a ReadableStream when supported by the runtime.
   */
  toReadable(): ReadableStream<Uint8Array> | null {
    if (!this.ws) return null;
    const wsAny = this.ws as any;
    if (wsAny.readable && typeof wsAny.readable.getReader === 'function') {
      return wsAny.readable as ReadableStream<Uint8Array>;
    }
    return null;
  }

  /**
   * Pipe a Node.js Readable into the WebSocket (binary frames).
   */
  async pipeFrom(
    source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
    options?: { awaitDrain?: boolean; highWaterMark?: number }
  ): Promise<void> {
    await this.sendStream(source, options);
  }

  /**
   * Pipe websocket incoming data to a destination writable stream.
   */
  async pipeTo(destination: any): Promise<void> {
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

    if (destination && typeof destination.getWriter === 'function') {
      await readable.pipeTo(destination as WritableStream<Uint8Array>);
      return;
    }

    if (isNodeRuntime()) {
      const streamModuleName = 'node:stream';
      const pipelineModuleName = 'node:stream/promises';
      const streamModule = await import(streamModuleName);
      const pipelineModule = await import(pipelineModuleName);
      const nodeReadable = typeof streamModule.Readable?.fromWeb === 'function'
        ? streamModule.Readable.fromWeb(readable as any)
        : streamModule.Readable.from(readable as any);

      await pipelineModule.pipeline(nodeReadable, destination);
      return;
    }

    throw new StreamError(
      'Destination stream is not supported in this environment',
      {
        streamType: 'websocket',
        retriable: false,
      }
    );
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
