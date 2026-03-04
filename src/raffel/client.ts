import { ReckerWebSocket, type WebSocketMessage } from '../websocket/client.js';
import { RaffelError } from './types.js';
import type {
  RaffelEnvelope,
  RaffelChannelMessage,
  RaffelErrorPayload,
  RaffelClientOptions,
  RaffelCallOptions,
  ChannelEventHandler,
} from './types.js';

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
      if (set.size === 0) this.listeners.delete(event);
    }
    return this;
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

interface PendingCall {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * High-level client for Raffel envelope protocol over WebSocket.
 *
 * Wraps ReckerWebSocket with RPC call correlation, channel management,
 * and auto-resubscribe on reconnect.
 *
 * @example
 * ```typescript
 * const client = createRaffelClient('ws://localhost:9999', {
 *   channels: ['game'],
 *   channelHandlers: { game: (event, data) => console.log(event, data) },
 * });
 * await client.connect();
 * const result = await client.call('game.status');
 * client.notify('game.ping', { ts: Date.now() });
 * await client.close();
 * ```
 */
export class RaffelClient extends SimpleEmitter {
  private ws: ReckerWebSocket;
  private pendingCalls = new Map<string, PendingCall>();
  private subscribedChannels = new Map<string, ChannelEventHandler | null>();
  private idCounter = 0;
  private defaultTimeout: number;
  private onEvent?: (procedure: string, payload: unknown) => void;

  constructor(url: string, options: RaffelClientOptions = {}) {
    super();

    const {
      channels,
      channelHandlers,
      onEvent,
      defaultTimeout,
      ...wsOptions
    } = options;

    this.defaultTimeout = defaultTimeout ?? 30_000;
    this.onEvent = onEvent;
    this.ws = new ReckerWebSocket(url, wsOptions);

    // Pre-register channel handlers
    if (channels) {
      for (const ch of channels) {
        this.subscribedChannels.set(ch, channelHandlers?.[ch] ?? null);
      }
    }
    if (channelHandlers) {
      for (const [ch, handler] of Object.entries(channelHandlers)) {
        if (!this.subscribedChannels.has(ch)) {
          this.subscribedChannels.set(ch, handler);
        }
      }
    }

    // Wire up WS events
    this.ws.on('message', (msg: WebSocketMessage) => this.handleMessage(msg));

    this.ws.on('open', () => {
      this.emit('raffel:connected');
      // Auto-resubscribe to all tracked channels
      for (const [channel] of this.subscribedChannels) {
        this.sendChannelSubscribe(channel);
      }
    });

    this.ws.on('close', (_code: number, _reason: string) => {
      this.emit('raffel:disconnected');
      // Reject all pending calls — server won't respond after close
      for (const [id, pending] of this.pendingCalls) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.reject(new Error(`Connection closed while waiting for response to ${id}`));
      }
      this.pendingCalls.clear();
    });

    // Forward useful WS events
    this.ws.on('reconnecting', (attempt: number, delay: number) => {
      this.emit('ws:reconnecting', attempt, delay);
    });

    this.ws.on('error', (err: Error) => {
      this.emit('ws:error', err);
    });
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /** Connect to the Raffel server */
  async connect(): Promise<void> {
    return this.ws.connect();
  }

  /** Close the connection. Rejects all pending calls. */
  close(code?: number, reason?: string): void {
    // Reject pending calls before closing (close event may not fire synchronously)
    for (const [id, pending] of this.pendingCalls) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error(`Connection closed while waiting for response to ${id}`));
    }
    this.pendingCalls.clear();
    this.ws.close(code, reason);
  }

  /** Whether the underlying WebSocket is connected */
  get isConnected(): boolean {
    return this.ws.isConnected;
  }

  /** Escape hatch to the underlying ReckerWebSocket */
  get raw(): ReckerWebSocket {
    return this.ws;
  }

  /**
   * Call a remote procedure and wait for its response.
   *
   * Returns the response payload. Rejects with RaffelError on error envelopes,
   * or a generic Error on timeout / abort / connection loss.
   */
  async call<T = unknown>(
    procedure: string,
    payload?: unknown,
    options?: RaffelCallOptions
  ): Promise<T> {
    const id = this.nextId();
    const timeout = options?.timeout ?? this.defaultTimeout;

    const envelope: RaffelEnvelope = {
      id,
      procedure,
      type: 'request',
      payload: payload ?? {},
      metadata: {},
    };

    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        this.pendingCalls.delete(id);
        if (timer) clearTimeout(timer);
        if (options?.signal) {
          options.signal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => {
        cleanup();
        // Send cancel envelope
        this.sendRaw({ id, type: 'cancel' });
        reject(new Error(`Call to ${procedure} was aborted`));
      };

      if (timeout > 0) {
        timer = setTimeout(() => {
          cleanup();
          reject(new Error(`Call to ${procedure} timed out after ${timeout}ms`));
        }, timeout);
      }

      if (options?.signal) {
        if (options.signal.aborted) {
          reject(new Error(`Call to ${procedure} was aborted`));
          return;
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pendingCalls.set(id, { resolve, reject, timer });
      this.ws.sendJSON(envelope);
    });
  }

  /**
   * Fire-and-forget event to a procedure. No response correlation.
   */
  notify(procedure: string, payload?: unknown): void {
    const envelope: RaffelEnvelope = {
      id: this.nextId(),
      procedure,
      type: 'event',
      payload: payload ?? {},
      metadata: {},
    };
    this.ws.sendJSON(envelope);
  }

  /**
   * Subscribe to a channel. Optionally provide a handler for channel events.
   */
  subscribe(channel: string, handler?: ChannelEventHandler): void {
    this.subscribedChannels.set(channel, handler ?? null);
    if (this.ws.isConnected) {
      this.sendChannelSubscribe(channel);
    }
  }

  /**
   * Unsubscribe from a channel.
   */
  unsubscribe(channel: string): void {
    this.subscribedChannels.delete(channel);
    if (this.ws.isConnected) {
      const msg: RaffelChannelMessage = {
        id: this.nextId(),
        type: 'unsubscribe',
        channel,
      };
      this.ws.sendJSON(msg);
    }
  }

  /**
   * Publish an event to a channel.
   */
  publish(channel: string, event: string, data?: unknown): void {
    const msg: RaffelChannelMessage = {
      id: this.nextId(),
      type: 'publish',
      channel,
      event,
      data,
    };
    this.ws.sendJSON(msg);
  }

  /**
   * Cancel an in-flight RPC call by its request ID.
   */
  cancel(id: string): void {
    const pending = this.pendingCalls.get(id);
    if (pending) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error(`Call ${id} was cancelled`));
      this.pendingCalls.delete(id);
    }
    this.sendRaw({ id, type: 'cancel' });
  }

  // ==========================================================================
  // Internal message routing
  // ==========================================================================

  private handleMessage(msg: WebSocketMessage): void {
    if (typeof msg.data !== 'string') return;

    let parsed: any;
    try {
      parsed = JSON.parse(msg.data);
    } catch {
      return; // Not JSON, ignore
    }

    if (parsed.channel) {
      this.handleChannelMessage(parsed);
    } else if (parsed.procedure || parsed.type === 'cancel') {
      this.handleEnvelope(parsed);
    } else {
      this.emit('raffel:unknown', parsed);
    }
  }

  private handleEnvelope(envelope: RaffelEnvelope): void {
    const { id, type, procedure, payload } = envelope;

    // Event (fire-and-forget from server)
    if (type === 'event' && procedure) {
      this.onEvent?.(procedure, payload);
      this.emit('raffel:event', procedure, payload);
      return;
    }

    // Response or error — correlate by extracting base ID
    if (type === 'response' || type === 'error') {
      const baseId = this.extractBaseId(id);
      const pending = this.pendingCalls.get(baseId);
      if (!pending) return;

      if (pending.timer) clearTimeout(pending.timer);
      this.pendingCalls.delete(baseId);

      if (type === 'error') {
        pending.reject(new RaffelError(payload as RaffelErrorPayload, procedure));
      } else {
        pending.resolve(payload);
      }
      return;
    }
  }

  private handleChannelMessage(msg: RaffelChannelMessage): void {
    const { type, channel } = msg;

    switch (type) {
      case 'subscribed':
        this.emit('raffel:channel:subscribed', channel, msg.members);
        break;

      case 'unsubscribed':
        this.emit('raffel:channel:unsubscribed', channel);
        break;

      case 'event': {
        const event = msg.event ?? '';
        const data = msg.data;

        // Per-channel handler
        const handler = this.subscribedChannels.get(channel);
        if (handler) handler(event, data);

        // Catch-all
        this.emit('raffel:channel:event', channel, event, data);
        break;
      }
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private nextId(): string {
    return `req-${++this.idCounter}`;
  }

  /**
   * Extract the base request ID from a response/error ID.
   * `"req-5:response"` → `"req-5"`, `"req-5:error"` → `"req-5"`
   */
  private extractBaseId(id: string): string {
    const suffixes = [':response', ':error'];
    for (const suffix of suffixes) {
      if (id.endsWith(suffix)) {
        return id.slice(0, -suffix.length);
      }
    }
    return id;
  }

  private sendChannelSubscribe(channel: string): void {
    const msg: RaffelChannelMessage = {
      id: this.nextId(),
      type: 'subscribe',
      channel,
    };
    this.ws.sendJSON(msg);
  }

  private sendRaw(data: unknown): void {
    this.ws.sendJSON(data);
  }
}

/**
 * Create a RaffelClient instance.
 *
 * @example
 * ```typescript
 * import { createRaffelClient } from 'recker';
 *
 * const client = createRaffelClient('ws://game:9999', {
 *   reconnect: true,
 *   channels: ['game'],
 *   channelHandlers: { game: (event, data) => console.log(event, data) },
 * });
 *
 * await client.connect();
 * const status = await client.call('game.status');
 * ```
 */
export function createRaffelClient(url: string, options?: RaffelClientOptions): RaffelClient {
  return new RaffelClient(url, options);
}
