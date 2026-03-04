/**
 * TCP transport for RaffelClient.
 *
 * Uses node:net Socket with 4-byte uint32 BE length-prefix framing,
 * matching Raffel's TCP adapter wire format exactly.
 *
 * Full capabilities: call, notify, subscribe, publish, cancel, stream.
 */

import { createConnection, type Socket } from 'node:net';
import { TransportCapability } from './transport.js';
import type { RaffelTransport, RaffelTransportEvent } from './transport.js';
import type { RaffelTcpOptions } from './types.js';

type Listener = (...args: any[]) => void;

const MAX_MESSAGE_SIZE = 16 * 1024 * 1024; // 16MB

const ALL_CAPABILITIES =
  TransportCapability.CALL |
  TransportCapability.NOTIFY |
  TransportCapability.SUBSCRIBE |
  TransportCapability.PUBLISH |
  TransportCapability.CANCEL |
  TransportCapability.STREAM;

export class TcpTransport implements RaffelTransport {
  readonly capabilities = ALL_CAPABILITIES;
  private socket: Socket | null = null;
  private connected = false;
  private listeners = new Map<string, Set<Listener>>();
  private host: string;
  private port: number;
  private options: RaffelTcpOptions;
  private buffer = Buffer.alloc(0);
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(url: string, options: RaffelTcpOptions = {}) {
    // Parse tcp://host:port
    const parsed = new URL(url.replace('tcp://', 'http://'));
    this.host = parsed.hostname;
    this.port = parseInt(parsed.port, 10) || 9000;
    this.options = options;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    this.closed = false;
    return this._connect();
  }

  private _connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket = createConnection({
        host: this.host,
        port: this.port,
      });

      const noDelay = this.options.noDelay ?? true;
      this.socket.setNoDelay(noDelay);

      const keepAlive = this.options.keepAlive ?? true;
      if (keepAlive) {
        this.socket.setKeepAlive(true, this.options.keepAliveInterval ?? 30_000);
      }

      const onConnect = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.buffer = Buffer.alloc(0);
        cleanup();
        this.emit('connected');
        resolve();
      };

      const onError = (err: Error) => {
        cleanup();
        if (!this.connected) {
          reject(err);
        } else {
          this.emit('error', err);
        }
      };

      const cleanup = () => {
        this.socket!.removeListener('connect', onConnect);
        this.socket!.removeListener('error', onError);
      };

      this.socket.once('connect', onConnect);
      this.socket.once('error', onError);

      this.socket.on('data', (chunk: Buffer) => this.onData(chunk));
      this.socket.on('close', () => this.onClose());
      this.socket.on('error', (err: Error) => {
        if (this.connected) this.emit('error', err);
      });
    });
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    if (this.connected) {
      this.connected = false;
      this.emit('disconnected');
    }
  }

  send(data: unknown): void {
    if (!this.socket || !this.connected) {
      throw new Error('TCP transport not connected');
    }

    const json = JSON.stringify(data);
    const payload = Buffer.from(json, 'utf8');

    if (payload.length > MAX_MESSAGE_SIZE) {
      throw new Error(`Message size ${payload.length} exceeds maximum ${MAX_MESSAGE_SIZE}`);
    }

    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);
    this.socket.write(Buffer.concat([header, payload]));
  }

  // ==========================================================================
  // Event emitter
  // ==========================================================================

  on(event: RaffelTransportEvent, listener: Listener): void {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
  }

  off(event: RaffelTransportEvent, listener: Listener): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(event);
    }
  }

  once(event: RaffelTransportEvent, listener: Listener): void {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }

  private emit(event: string, ...args: any[]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      listener(...args);
    }
  }

  // ==========================================================================
  // Frame parsing
  // ==========================================================================

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 4) {
      const messageLength = this.buffer.readUInt32BE(0);

      if (messageLength > MAX_MESSAGE_SIZE) {
        this.emit('error', new Error(`Message size ${messageLength} exceeds maximum ${MAX_MESSAGE_SIZE}`));
        this.socket?.destroy();
        return;
      }

      if (this.buffer.length < 4 + messageLength) {
        break; // Wait for more data
      }

      const jsonBuf = this.buffer.subarray(4, 4 + messageLength);
      this.buffer = this.buffer.subarray(4 + messageLength);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonBuf.toString('utf8'));
      } catch {
        this.emit('error', new Error('Invalid JSON in TCP frame'));
        continue;
      }

      this.emit('message', parsed);
    }
  }

  // ==========================================================================
  // Reconnection
  // ==========================================================================

  private onClose(): void {
    this.connected = false;
    this.emit('disconnected');

    if (!this.closed && this.options.reconnect !== false) {
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    const maxAttempts = this.options.maxReconnectAttempts ?? 10;
    if (this.reconnectAttempts >= maxAttempts) return;

    this.reconnectAttempts++;
    const baseDelay = this.options.reconnectDelay ?? 1000;
    // Exponential backoff with jitter
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), 30_000);
    const jitter = delay * (0.5 + Math.random() * 0.5);

    this.emit('reconnecting', this.reconnectAttempts, jitter);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this._connect();
      } catch {
        // onClose will trigger again
      }
    }, jitter);
  }
}
