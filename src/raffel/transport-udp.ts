/**
 * UDP transport for RaffelClient.
 *
 * Uses node:dgram with raw JSON datagrams (no length-prefix framing),
 * matching Raffel's UDP adapter wire format.
 *
 * Limited capabilities: call + notify only.
 */

import { createSocket, type Socket as DgramSocket } from 'node:dgram';
import { TransportCapability } from './transport.js';
import type { RaffelTransport, RaffelTransportEvent } from './transport.js';
import type { RaffelUdpOptions } from './types.js';

type Listener = (...args: any[]) => void;

const MAX_DATAGRAM_SIZE = 65_507; // UDP max payload

const UDP_CAPABILITIES =
  TransportCapability.CALL |
  TransportCapability.NOTIFY;

export class UdpTransport implements RaffelTransport {
  readonly capabilities = UDP_CAPABILITIES;
  private socket: DgramSocket | null = null;
  private connected = false;
  private listeners = new Map<string, Set<Listener>>();
  private host: string;
  private port: number;
  private options: RaffelUdpOptions;

  constructor(url: string, options: RaffelUdpOptions = {}) {
    // Parse udp://host:port
    const parsed = new URL(url.replace('udp://', 'http://'));
    this.host = parsed.hostname;
    this.port = parseInt(parsed.port, 10) || 9000;
    this.options = options;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socketType = this.options.socketType ?? 'udp4';
      this.socket = createSocket(socketType);

      this.socket.on('message', (msg: Buffer) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(msg.toString('utf8'));
        } catch {
          this.emit('error', new Error('Invalid JSON in UDP datagram'));
          return;
        }
        this.emit('message', parsed);
      });

      this.socket.on('error', (err: Error) => {
        this.emit('error', err);
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.emit('disconnected');
      });

      // Bind to ephemeral local port
      this.socket.bind(0, () => {
        this.connected = true;
        this.emit('connected');
        resolve();
      });
    });
  }

  close(): void {
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    if (this.connected) {
      this.connected = false;
      this.emit('disconnected');
    }
  }

  send(data: unknown): void {
    if (!this.socket || !this.connected) {
      throw new Error('UDP transport not connected');
    }

    const json = JSON.stringify(data);
    const buf = Buffer.from(json, 'utf8');

    if (buf.length > MAX_DATAGRAM_SIZE) {
      throw new Error(`Datagram size ${buf.length} exceeds maximum ${MAX_DATAGRAM_SIZE}`);
    }

    this.socket.send(buf, this.port, this.host);
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
}
