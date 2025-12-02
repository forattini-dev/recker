/**
 * UDP Response
 *
 * Response wrapper for UDP transport with Buffer support
 * and async iteration for streaming UDP.
 */

import type { ReckerResponse, SSEEvent, ProgressEvent } from '../types/index.js';
import type { UDPTimings, UDPConnection, UDPResponse } from '../types/udp.js';

/**
 * Options for creating a UDP response
 */
export interface UDPResponseOptions {
  timings?: UDPTimings;
  connection?: UDPConnection;
  url?: string;
}

/**
 * UDP Response wrapper
 */
export class UDPResponseWrapper implements UDPResponse {
  private _buffer: Buffer;
  private _timings: UDPTimings;
  private _connection: UDPConnection;
  private _url: string;
  private _bodyUsed: boolean = false;

  // ReckerResponse compatibility
  readonly status: number = 200;
  readonly statusText: string = 'OK';
  readonly headers: Headers;
  readonly ok: boolean = true;
  readonly raw: Response;

  constructor(data: Buffer, options: UDPResponseOptions = {}) {
    this._buffer = data;
    this._url = options.url || '';

    this._timings = options.timings ?? {
      queued: 0,
      send: 0,
      receive: 0,
      retransmissions: 0,
      total: 0,
    };

    this._connection = options.connection ?? {
      protocol: 'udp',
      localAddress: '',
      localPort: 0,
      remoteAddress: '',
      remotePort: 0,
    };

    // Create headers with UDP-specific info
    this.headers = new Headers({
      'content-type': 'application/octet-stream',
      'content-length': String(data.length),
      'x-protocol': 'udp',
    });

    // Create a raw Response for compatibility
    // Convert Buffer to Uint8Array for Response compatibility
    this.raw = new Response(new Uint8Array(data), {
      status: 200,
      statusText: 'OK',
      headers: this.headers,
    });
  }

  get url(): string {
    return this._url;
  }

  get timings(): UDPTimings {
    return this._timings;
  }

  get connection(): UDPConnection {
    return this._connection;
  }

  /**
   * Get response as raw Buffer
   */
  async buffer(): Promise<Buffer> {
    this._bodyUsed = true;
    return this._buffer;
  }

  /**
   * Get response as JSON
   */
  async json<R = unknown>(): Promise<R> {
    this._bodyUsed = true;
    const text = this._buffer.toString('utf8');
    return JSON.parse(text);
  }

  /**
   * Get response as text
   */
  async text(): Promise<string> {
    this._bodyUsed = true;
    return this._buffer.toString('utf8');
  }

  /**
   * Get clean text (for AI - strips any binary/control chars)
   */
  async cleanText(): Promise<string> {
    this._bodyUsed = true;
    return this._buffer
      .toString('utf8')
      .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get response as Blob
   */
  async blob(): Promise<Blob> {
    this._bodyUsed = true;
    return new Blob([new Uint8Array(this._buffer)]);
  }

  /**
   * Get readable stream
   */
  read(): ReadableStream<Uint8Array> | null {
    if (this._bodyUsed) {
      return null;
    }
    this._bodyUsed = true;

    const buffer = this._buffer;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      },
    });
  }

  /**
   * Clone the response
   */
  clone(): UDPResponseWrapper {
    return new UDPResponseWrapper(Buffer.from(this._buffer), {
      timings: { ...this._timings },
      connection: { ...this._connection },
      url: this._url,
    });
  }

  /**
   * SSE is not applicable to UDP
   */
  async *sse(): AsyncGenerator<SSEEvent> {
    throw new Error('SSE is not supported for UDP responses');
  }

  /**
   * Download with progress (single packet, instant)
   */
  async *download(): AsyncGenerator<ProgressEvent> {
    yield {
      loaded: this._buffer.length,
      transferred: this._buffer.length,
      total: this._buffer.length,
      percent: 100,
      direction: 'download',
    };
  }

  /**
   * Iterate over packets (for streaming UDP scenarios)
   * For a single response, yields the buffer once
   */
  async *packets(): AsyncGenerator<Buffer> {
    yield this._buffer;
  }

  /**
   * Async iterator for streaming
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
    yield new Uint8Array(this._buffer);
  }
}

/**
 * Create a streaming UDP response for multiple packets
 */
export class StreamingUDPResponse implements UDPResponse {
  private _packets: Buffer[] = [];
  private _timings: UDPTimings;
  private _connection: UDPConnection;
  private _url: string;
  private _complete: boolean = false;
  private _waiters: Array<{
    resolve: (value: IteratorResult<Buffer>) => void;
    reject: (reason: Error) => void;
  }> = [];

  readonly status: number = 200;
  readonly statusText: string = 'OK';
  readonly headers: Headers;
  readonly ok: boolean = true;
  readonly raw: Response;

  constructor(options: UDPResponseOptions = {}) {
    this._url = options.url || '';
    this._timings = options.timings ?? {
      queued: 0,
      send: 0,
      receive: 0,
      retransmissions: 0,
      total: 0,
    };
    this._connection = options.connection ?? {
      protocol: 'udp',
      localAddress: '',
      localPort: 0,
      remoteAddress: '',
      remotePort: 0,
    };

    this.headers = new Headers({
      'content-type': 'application/octet-stream',
      'x-protocol': 'udp',
      'x-streaming': 'true',
    });

    this.raw = new Response(null, {
      status: 200,
      statusText: 'OK',
      headers: this.headers,
    });
  }

  get url(): string {
    return this._url;
  }

  get timings(): UDPTimings {
    return this._timings;
  }

  get connection(): UDPConnection {
    return this._connection;
  }

  /**
   * Add a packet to the stream
   */
  pushPacket(packet: Buffer): void {
    if (this._complete) {
      throw new Error('Cannot push to completed stream');
    }

    // If someone is waiting, give them the packet
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter.resolve({ value: packet, done: false });
    } else {
      this._packets.push(packet);
    }
  }

  /**
   * Mark the stream as complete
   */
  complete(): void {
    this._complete = true;
    // Resolve all waiters with done
    for (const waiter of this._waiters) {
      waiter.resolve({ value: undefined as any, done: true });
    }
    this._waiters = [];
  }

  /**
   * Get all received data as a single Buffer
   */
  async buffer(): Promise<Buffer> {
    // Wait for completion
    while (!this._complete) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return Buffer.concat(this._packets);
  }

  async json<R = unknown>(): Promise<R> {
    const buf = await this.buffer();
    return JSON.parse(buf.toString('utf8'));
  }

  async text(): Promise<string> {
    const buf = await this.buffer();
    return buf.toString('utf8');
  }

  async cleanText(): Promise<string> {
    const text = await this.text();
    return text
      .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async blob(): Promise<Blob> {
    const buf = await this.buffer();
    return new Blob([new Uint8Array(buf)]);
  }

  read(): ReadableStream<Uint8Array> | null {
    const self = this;
    return new ReadableStream({
      async pull(controller) {
        const result = await self.packets().next();
        if (result.done) {
          controller.close();
        } else {
          controller.enqueue(new Uint8Array(result.value));
        }
      },
    });
  }

  clone(): StreamingUDPResponse {
    const cloned = new StreamingUDPResponse({
      timings: { ...this._timings },
      connection: { ...this._connection },
      url: this._url,
    });
    cloned._packets = this._packets.map((p) => Buffer.from(p));
    cloned._complete = this._complete;
    return cloned;
  }

  async *sse(): AsyncGenerator<SSEEvent> {
    throw new Error('SSE is not supported for UDP responses');
  }

  async *download(): AsyncGenerator<ProgressEvent> {
    let loaded = 0;
    for await (const packet of this.packets()) {
      loaded += packet.length;
      yield {
        loaded,
        transferred: loaded,
        direction: 'download',
      };
    }
  }

  /**
   * Iterate over packets as they arrive
   */
  async *packets(): AsyncGenerator<Buffer> {
    while (true) {
      // If we have buffered packets, yield them
      if (this._packets.length > 0) {
        yield this._packets.shift()!;
        continue;
      }

      // If complete and no more packets, we're done
      if (this._complete) {
        return;
      }

      // Wait for next packet
      const packet = await new Promise<Buffer | null>((resolve, reject) => {
        this._waiters.push({
          resolve: (result) => resolve(result.done ? null : result.value),
          reject,
        });
      });

      if (packet === null) {
        return;
      }

      yield packet;
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
    for await (const packet of this.packets()) {
      yield new Uint8Array(packet);
    }
  }
}
