/**
 * WebSocket transport for RaffelClient.
 *
 * Wraps ReckerWebSocket, forwarding parsed JSON messages as 'message' events.
 * Supports all capabilities: call, notify, subscribe, publish, cancel, stream.
 */

import { ReckerWebSocket, type WebSocketOptions, type WebSocketMessage } from '../websocket/client.js';
import { TransportCapability } from './transport.js';
import type { RaffelTransport, RaffelTransportEvent } from './transport.js';

type Listener = (...args: any[]) => void;

const ALL_CAPABILITIES =
  TransportCapability.CALL |
  TransportCapability.NOTIFY |
  TransportCapability.SUBSCRIBE |
  TransportCapability.PUBLISH |
  TransportCapability.CANCEL |
  TransportCapability.STREAM;

export class WsTransport implements RaffelTransport {
  readonly capabilities = ALL_CAPABILITIES;
  private ws: ReckerWebSocket;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string, options: WebSocketOptions = {}) {
    this.ws = new ReckerWebSocket(url, options);

    this.ws.on('message', (msg: WebSocketMessage) => {
      if (typeof msg.data !== 'string') return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.data);
      } catch {
        return;
      }
      this.emit('message', parsed);
    });

    this.ws.on('open', () => this.emit('connected'));
    this.ws.on('close', () => this.emit('disconnected'));
    this.ws.on('reconnecting', (attempt: number, delay: number) => this.emit('reconnecting', attempt, delay));
    this.ws.on('error', (err: Error) => this.emit('error', err));
  }

  get isConnected(): boolean {
    return this.ws.isConnected;
  }

  /** Direct access to the underlying ReckerWebSocket */
  get socket(): ReckerWebSocket {
    return this.ws;
  }

  async connect(): Promise<void> {
    return this.ws.connect();
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  send(data: unknown): void {
    this.ws.sendJSON(data);
  }

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
