/**
 * JSON-RPC 2.0 transport for RaffelClient.
 *
 * Uses recker's Client to send JSON-RPC 2.0 requests over HTTP,
 * matching Raffel's JSON-RPC adapter wire format.
 *
 * Limited capabilities: call + notify only.
 */

import { Client } from '../core/client.js';
import { TransportCapability } from './transport.js';
import { RaffelError } from './types.js';
import type { RaffelExecutableTransport, RaffelTransportEvent } from './transport.js';
import type { RaffelEnvelope, RaffelJsonRpcOptions } from './types.js';

type Listener = (...args: any[]) => void;

const JSONRPC_CAPABILITIES =
  TransportCapability.CALL |
  TransportCapability.NOTIFY;

/** JSON-RPC error code → Raffel error code mapping */
const JSONRPC_ERROR_MAP: Record<number, string> = {
  [-32700]: 'PARSE_ERROR',
  [-32600]: 'INVALID_ARGUMENT',
  [-32601]: 'NOT_FOUND',
  [-32602]: 'VALIDATION_ERROR',
  [-32603]: 'INTERNAL_ERROR',
  [-32001]: 'UNAUTHENTICATED',
  [-32002]: 'RATE_LIMITED',
};

export class JsonRpcTransport implements RaffelExecutableTransport {
  readonly capabilities = JSONRPC_CAPABILITIES;
  private client: Client;
  private connected = false;
  private listeners = new Map<string, Set<Listener>>();
  private rpcPath: string;
  private idCounter = 0;

  constructor(url: string, options: RaffelJsonRpcOptions = {}) {
    // Strip /rpc from baseUrl if present, we'll add it as the path
    this.rpcPath = options.path ?? '/rpc';
    let baseUrl = url;
    if (baseUrl.endsWith('/rpc')) {
      baseUrl = baseUrl.slice(0, -4);
    } else if (baseUrl.endsWith('/rpc/')) {
      baseUrl = baseUrl.slice(0, -5);
    }

    this.client = new Client({
      baseUrl,
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        ...options.headers,
      },
    });
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.emit('connected');
  }

  close(): void {
    this.connected = false;
    this.emit('disconnected');
  }

  send(_data: unknown): void {
    // JSON-RPC is request-response only, all sending goes through execute()
  }

  async execute(envelope: RaffelEnvelope): Promise<unknown> {
    const { procedure, type, payload } = envelope;

    const isNotification = type === 'notify' || type === 'event';

    const body: Record<string, unknown> = {
      jsonrpc: '2.0',
      method: procedure,
      params: payload ?? {},
    };

    // Notifications have no `id` field (server won't respond)
    if (!isNotification) {
      body.id = ++this.idCounter;
    }

    const response = await this.client.post(this.rpcPath, {
      body: JSON.stringify(body),
    });

    // Notifications: no response expected
    if (isNotification) {
      return undefined;
    }

    const result = await this.parseBody(response);

    if (result?.error) {
      const rpcError = result.error;
      const code = JSONRPC_ERROR_MAP[rpcError.code] ?? 'INTERNAL_ERROR';
      throw new RaffelError({
        code,
        status: this.rpcCodeToStatus(rpcError.code),
        message: rpcError.message ?? 'JSON-RPC error',
        details: rpcError.data,
      }, procedure);
    }

    return result?.result;
  }

  private rpcCodeToStatus(code: number): number {
    switch (code) {
      case -32700: return 400; // Parse error
      case -32600: return 400; // Invalid request
      case -32601: return 404; // Method not found
      case -32602: return 400; // Invalid params
      case -32001: return 401; // Unauthenticated
      case -32002: return 429; // Rate limited
      default: return 500;
    }
  }

  private async parseBody(response: any): Promise<any> {
    if (typeof response.json === 'function') {
      try {
        return await response.json();
      } catch {
        return undefined;
      }
    }
    const text = typeof response.text === 'function' ? await response.text() : String(response.body ?? '');
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
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
