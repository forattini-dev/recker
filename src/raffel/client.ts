import { ReckerWebSocket } from '../websocket/client.js';
import { UnsupportedError } from '../core/errors.js';
import { RaffelError } from './types.js';
import type {
  RaffelEnvelope,
  RaffelChannelMessage,
  RaffelErrorPayload,
  RaffelClientOptions,
  RaffelCallOptions,
  ChannelEventHandler,
} from './types.js';
import type { RaffelTransport, RaffelExecutableTransport } from './transport.js';
import { TransportCapability, hasExecute, hasCapability } from './transport.js';
import { WsTransport } from './transport-ws.js';
import { createTransport, detectTransportType } from './transport-factory.js';

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
 * High-level client for Raffel envelope protocol.
 *
 * Supports multiple transports: WebSocket, HTTP, TCP, UDP, JSON-RPC.
 * Transport is auto-detected from the URL scheme or can be set explicitly.
 *
 * @example
 * ```typescript
 * // WebSocket (full capabilities)
 * const client = await createRaffelClient('ws://localhost:9999', {
 *   channels: ['game'],
 *   channelHandlers: { game: (event, data) => console.log(event, data) },
 * });
 *
 * // HTTP (stateless, call + notify + streaming)
 * const client = await createRaffelClient('http://localhost:3000');
 *
 * // TCP (full capabilities)
 * const client = await createRaffelClient('tcp://localhost:9000');
 * ```
 */
export class RaffelClient extends SimpleEmitter {
  private transport!: RaffelTransport;
  private pendingCalls = new Map<string, PendingCall>();
  private subscribedChannels = new Map<string, ChannelEventHandler | null>();
  private idCounter = 0;
  private defaultTimeout: number;
  private onEvent?: (procedure: string, payload: unknown) => void;
  private url: string;
  private options: RaffelClientOptions;

  constructor(url: string, options: RaffelClientOptions = {}) {
    super();
    this.url = url;
    this.options = options;
    this.defaultTimeout = options.defaultTimeout ?? 30_000;
    this.onEvent = options.onEvent;

    // Pre-register channel handlers
    if (options.channels) {
      for (const ch of options.channels) {
        this.subscribedChannels.set(ch, options.channelHandlers?.[ch] ?? null);
      }
    }
    if (options.channelHandlers) {
      for (const [ch, handler] of Object.entries(options.channelHandlers)) {
        if (!this.subscribedChannels.has(ch)) {
          this.subscribedChannels.set(ch, handler);
        }
      }
    }
  }

  /**
   * Initialize the transport (async to support lazy imports for non-WS transports).
   * Called automatically by connect() if not already initialized.
   */
  private async ensureTransport(): Promise<void> {
    if (this.transport) return;
    this.transport = await createTransport(this.url, this.options);
    this.wireTransportEvents();
  }

  /**
   * Initialize with a pre-created transport (sync, for testing or direct use).
   * @internal
   */
  _setTransport(transport: RaffelTransport): void {
    this.transport = transport;
    this.wireTransportEvents();
  }

  private wireTransportEvents(): void {
    this.transport.on('message', (data: any) => this.handleIncoming(data));

    this.transport.on('connected', () => {
      this.emit('raffel:connected');
      // Auto-resubscribe to all tracked channels
      for (const [channel] of this.subscribedChannels) {
        this.sendChannelSubscribe(channel);
      }
    });

    this.transport.on('disconnected', () => {
      this.emit('raffel:disconnected');
      // Reject all pending calls
      for (const [id, pending] of this.pendingCalls) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.reject(new Error(`Connection closed while waiting for response to ${id}`));
      }
      this.pendingCalls.clear();
    });

    this.transport.on('reconnecting', (attempt: number, delay: number) => {
      this.emit('ws:reconnecting', attempt, delay);
    });

    this.transport.on('error', (err: Error) => {
      this.emit('ws:error', err);
    });
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /** Connect to the Raffel server */
  async connect(): Promise<void> {
    await this.ensureTransport();
    return this.transport.connect();
  }

  /** Close the connection. Rejects all pending calls. */
  close(code?: number, reason?: string): void {
    // Reject pending calls before closing
    for (const [id, pending] of this.pendingCalls) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error(`Connection closed while waiting for response to ${id}`));
    }
    this.pendingCalls.clear();
    if (this.transport) {
      this.transport.close(code, reason);
    }
  }

  /** Whether the underlying transport is connected */
  get isConnected(): boolean {
    return this.transport?.isConnected ?? false;
  }

  /** Escape hatch to the underlying transport */
  get raw(): RaffelTransport {
    return this.transport;
  }

  /** Escape hatch to the underlying ReckerWebSocket (null if not using WS transport) */
  get rawWs(): ReckerWebSocket | null {
    return this.transport instanceof WsTransport ? this.transport.socket : null;
  }

  /**
   * Call a remote procedure and wait for its response.
   *
   * For executable transports (HTTP, JSON-RPC): uses direct request-response.
   * For message transports (WS, TCP, UDP): uses send + pending-map correlation.
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

    // Executable transports (HTTP, JSON-RPC): direct request-response
    if (hasExecute(this.transport)) {
      return this.executeWithTimeout<T>(this.transport, envelope, timeout, procedure, options?.signal);
    }

    // Message transports (WS, TCP, UDP): send + pending-map
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
        this.transport.send({ id, type: 'cancel' });
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
      this.transport.send(envelope);
    });
  }

  /**
   * Stream results from a remote procedure.
   *
   * For executable transports with streaming (HTTP): uses SSE.
   * For message transports (WS, TCP): yields stream:data envelopes until stream:end.
   */
  async *callStream<T = unknown>(
    procedure: string,
    payload?: unknown,
  ): AsyncIterable<T> {
    if (!hasCapability(this.transport, TransportCapability.STREAM)) {
      throw new UnsupportedError(
        `callStream() not supported over ${detectTransportType(this.url, this.options)}. Use WebSocket, HTTP, or TCP.`
      );
    }

    // Executable transports with executeStream (HTTP SSE)
    if (hasExecute(this.transport) && this.transport.executeStream) {
      const envelope: RaffelEnvelope = {
        id: this.nextId(),
        procedure,
        type: 'stream:start',
        payload: payload ?? {},
        metadata: {},
      };
      yield* this.transport.executeStream(envelope) as AsyncIterable<T>;
      return;
    }

    // Message transports (WS, TCP): stream via envelope protocol
    const id = this.nextId();
    const envelope: RaffelEnvelope = {
      id,
      procedure,
      type: 'stream:start',
      payload: payload ?? {},
      metadata: {},
    };

    // Create a queue-based async iterable
    const queue: { value?: T; error?: Error; done?: boolean }[] = [];
    let resolve: (() => void) | null = null;

    const push = (item: { value?: T; error?: Error; done?: boolean }) => {
      queue.push(item);
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    const streamHandler = (data: any) => {
      // Stream messages have IDs prefixed with the request ID (e.g., "req-1:1", "req-1:end")
      if (!data.id || !data.id.startsWith(id)) return;

      if (data.type === 'stream:data') {
        push({ value: data.payload as T });
      } else if (data.type === 'stream:end') {
        push({ done: true });
        this.transport.off('message', streamHandler);
      } else if (data.type === 'error') {
        push({ error: new RaffelError(data.payload as RaffelErrorPayload, procedure) });
        this.transport.off('message', streamHandler);
      }
    };

    this.transport.on('message', streamHandler);
    this.transport.send(envelope);

    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((r) => { resolve = r; });
        }
        const item = queue.shift()!;
        if (item.done) return;
        if (item.error) throw item.error;
        yield item.value!;
      }
    } finally {
      this.transport.off('message', streamHandler);
    }
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

    if (hasExecute(this.transport)) {
      (this.transport as RaffelExecutableTransport).execute({
        ...envelope,
        type: 'notify',
      }).catch(() => {}); // fire-and-forget
    } else {
      this.transport.send(envelope);
    }
  }

  /**
   * Subscribe to a channel. Optionally provide a handler for channel events.
   */
  subscribe(channel: string, handler?: ChannelEventHandler): void {
    if (!hasCapability(this.transport, TransportCapability.SUBSCRIBE)) {
      throw new UnsupportedError(
        `subscribe() not supported over ${detectTransportType(this.url, this.options)}. Use WebSocket or TCP.`
      );
    }

    this.subscribedChannels.set(channel, handler ?? null);
    if (this.transport.isConnected) {
      this.sendChannelSubscribe(channel);
    }
  }

  /**
   * Unsubscribe from a channel.
   */
  unsubscribe(channel: string): void {
    if (!hasCapability(this.transport, TransportCapability.SUBSCRIBE)) {
      throw new UnsupportedError(
        `unsubscribe() not supported over ${detectTransportType(this.url, this.options)}. Use WebSocket or TCP.`
      );
    }

    this.subscribedChannels.delete(channel);
    if (this.transport.isConnected) {
      const msg: RaffelChannelMessage = {
        id: this.nextId(),
        type: 'unsubscribe',
        channel,
      };
      this.transport.send(msg);
    }
  }

  /**
   * Publish an event to a channel.
   */
  publish(channel: string, event: string, data?: unknown): void {
    if (!hasCapability(this.transport, TransportCapability.PUBLISH)) {
      throw new UnsupportedError(
        `publish() not supported over ${detectTransportType(this.url, this.options)}. Use WebSocket or TCP.`
      );
    }

    const msg: RaffelChannelMessage = {
      id: this.nextId(),
      type: 'publish',
      channel,
      event,
      data,
    };
    this.transport.send(msg);
  }

  /**
   * Cancel an in-flight RPC call by its request ID.
   */
  cancel(id: string): void {
    if (!hasCapability(this.transport, TransportCapability.CANCEL)) {
      throw new UnsupportedError(
        `cancel() not supported over ${detectTransportType(this.url, this.options)}. Use WebSocket or TCP.`
      );
    }

    const pending = this.pendingCalls.get(id);
    if (pending) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error(`Call ${id} was cancelled`));
      this.pendingCalls.delete(id);
    }
    this.transport.send({ id, type: 'cancel' });
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private async executeWithTimeout<T>(
    transport: RaffelExecutableTransport,
    envelope: RaffelEnvelope,
    timeout: number,
    procedure: string,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) {
      throw new Error(`Call to ${procedure} was aborted`);
    }

    const promises: Promise<T>[] = [
      transport.execute(envelope) as Promise<T>,
    ];

    if (timeout > 0) {
      promises.push(
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(`Call to ${procedure} timed out after ${timeout}ms`)), timeout);
        })
      );
    }

    if (signal) {
      promises.push(
        new Promise<T>((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error(`Call to ${procedure} was aborted`)), { once: true });
        })
      );
    }

    return Promise.race(promises);
  }

  private handleIncoming(data: any): void {
    if (data.channel) {
      this.handleChannelMessage(data);
    } else if (data.procedure || data.type === 'cancel') {
      this.handleEnvelope(data);
    } else {
      this.emit('raffel:unknown', data);
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

        const handler = this.subscribedChannels.get(channel);
        if (handler) handler(event, data);

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
    this.transport.send(msg);
  }
}

/**
 * Create a RaffelClient instance.
 *
 * The transport is auto-detected from the URL scheme:
 * - `ws://` / `wss://` → WebSocket (full capabilities)
 * - `http://` / `https://` → HTTP (call, notify, stream)
 * - `tcp://` → TCP (full capabilities)
 * - `udp://` → UDP (call, notify only)
 * - `http://host/rpc` → JSON-RPC 2.0 (call, notify only)
 *
 * @example
 * ```typescript
 * const client = createRaffelClient('ws://game:9999', {
 *   channels: ['game'],
 *   channelHandlers: { game: (event, data) => console.log(event, data) },
 * });
 * await client.connect();
 * const status = await client.call('game.status');
 * ```
 */
export function createRaffelClient(url: string, options?: RaffelClientOptions): RaffelClient {
  return new RaffelClient(url, options);
}
