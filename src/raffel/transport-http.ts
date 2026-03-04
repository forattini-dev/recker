/**
 * HTTP transport for RaffelClient.
 *
 * Stateless transport using recker's Client. Maps Raffel operations to HTTP routes
 * matching Raffel's HTTP adapter wire format:
 *
 * - call()       → POST /{procedure}        → JSON result
 * - notify()     → POST /events/{procedure} → 202
 * - callStream() → GET /streams/{procedure} → SSE
 */

import { Client } from '../core/client.js';
import { TransportCapability } from './transport.js';
import { RaffelError } from './types.js';
import type { RaffelExecutableTransport, RaffelTransportEvent } from './transport.js';
import type { RaffelEnvelope, RaffelHttpOptions, RaffelErrorPayload } from './types.js';

type Listener = (...args: any[]) => void;

const HTTP_CAPABILITIES =
  TransportCapability.CALL |
  TransportCapability.NOTIFY |
  TransportCapability.STREAM;

export class HttpTransport implements RaffelExecutableTransport {
  readonly capabilities = HTTP_CAPABILITIES;
  private client: Client;
  private connected = false;
  private listeners = new Map<string, Set<Listener>>();
  private baseUrl: string;

  constructor(url: string, options: RaffelHttpOptions = {}) {
    this.baseUrl = url;
    this.client = new Client({
      baseUrl: url,
      timeout: options.timeout ?? 30_000,
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
    // HTTP is request-response, not bidirectional.
    // All sending goes through execute() or the client sends in notify/call.
  }

  async execute(envelope: RaffelEnvelope): Promise<unknown> {
    const { procedure, type, payload, metadata } = envelope;

    if (type === 'notify' || type === 'event') {
      // Fire-and-forget: POST /events/{procedure}
      await this.client.post(`/events/${procedure}`, {
        body: JSON.stringify(payload ?? {}),
        throwHttpErrors: false,
      });
      return undefined;
    }

    // RPC call: POST /{procedure}
    const response = await this.client.post(`/${procedure}`, {
      body: JSON.stringify(payload ?? {}),
      headers: metadata as Record<string, string> | undefined,
      throwHttpErrors: false,
    });

    const status = response.status;

    if (status >= 400) {
      const body = await this.parseBody(response);
      if (body?.error) {
        throw new RaffelError(body.error as RaffelErrorPayload, procedure);
      }
      throw new RaffelError({
        code: 'INTERNAL_ERROR',
        status: status,
        message: `HTTP ${status}`,
      }, procedure);
    }

    return this.parseBody(response);
  }

  async *executeStream(envelope: RaffelEnvelope): AsyncIterable<unknown> {
    const { procedure, payload } = envelope;

    // Build query string from payload for GET request
    const params = new URLSearchParams();
    if (payload && typeof payload === 'object') {
      for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
        params.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    }

    const query = params.toString();
    const url = `/streams/${procedure}${query ? `?${query}` : ''}`;

    const response = await this.client.get(url, {
      headers: { accept: 'text/event-stream' },
      throwHttpErrors: false,
    });

    const body = response.read();
    if (!body) return;

    // Parse SSE stream
    yield* this.parseSSE(body, procedure);
  }

  private async *parseSSE(body: any, procedure?: string): AsyncIterable<unknown> {
    // Handle ReadableStream or Node stream
    const reader = this.getReader(body);
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let currentData = '';

    const processLine = function*(line: string): Generator<{ event: string; data: string }> {
      if (line === '') {
        // Empty line = end of event
        if (currentData) {
          yield { event: currentEvent || 'data', data: currentData };
          currentEvent = '';
          currentData = '';
        }
      } else if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        currentData += (currentData ? '\n' : '') + line.slice(6);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          for (const event of processLine(line)) {
            if (event.event === 'end') return;
            if (event.event === 'error') {
              let parsed: any;
              try { parsed = JSON.parse(event.data); } catch { parsed = { code: 'INTERNAL_ERROR', message: event.data, status: 500 }; }
              throw new RaffelError(parsed as RaffelErrorPayload, procedure);
            }
            if (event.event === 'data') {
              try {
                yield JSON.parse(event.data);
              } catch {
                yield event.data;
              }
            }
          }
        }
      }
    } finally {
      if ('cancel' in reader) {
        await (reader as ReadableStreamDefaultReader).cancel();
      }
    }
  }

  private getReader(body: any): ReadableStreamDefaultReader | AsyncIterableReader | null {
    // Web ReadableStream
    if (body && typeof body.getReader === 'function') {
      return body.getReader();
    }
    // Node.js stream
    if (body && Symbol.asyncIterator in body) {
      return asyncIterableToReader(body);
    }
    return null;
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

// Helper: wrap async iterable as reader-like
interface AsyncIterableReader {
  read(): Promise<{ done: boolean; value?: any }>;
}

function asyncIterableToReader(iterable: AsyncIterable<any>): AsyncIterableReader {
  const iterator = iterable[Symbol.asyncIterator]();
  return {
    async read() {
      const { done, value } = await iterator.next();
      return { done: done ?? false, value };
    },
  };
}
