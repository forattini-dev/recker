import { ConnectionInfo, ReckerResponse, Timings, SSEEvent, ProgressEvent } from '../types/index.js';
import { Dispatcher } from 'undici'; // Import Dispatcher
import { parseSSE } from '../utils/sse.js';
import { cleanHtml } from '../utils/html-cleaner.js';
import { calculateProgress } from '../utils/progress.js';
import { webToNodeStream } from '../utils/streaming.js';
import { parseHeaders, type HeaderInfo, type CacheInfo, type RateLimitInfo } from '../utils/header-parser.js';
import type { Readable } from 'node:stream';

export class HttpResponse<T = unknown> implements ReckerResponse<T> {
  public readonly timings?: Timings;
  public readonly connection?: ConnectionInfo;
  public readonly raw: Response; // Always a Web Response object

  constructor(
    undiciRawResponse: Response | Dispatcher.ResponseData, // Accept either
    options: { timings?: Timings; connection?: ConnectionInfo } = {}
  ) {
    this.timings = options.timings;
    this.connection = options.connection;

    if (undiciRawResponse instanceof Response) {
      this.raw = undiciRawResponse;
    } else {
      // Reconstruct Web Response from Dispatcher.ResponseData
      // HeadersInit can be a plain object, which Dispatcher.ResponseData.headers is.
      this.raw = new Response(undiciRawResponse.body as unknown as ReadableStream<Uint8Array>, {
        status: undiciRawResponse.statusCode,
        statusText: String(undiciRawResponse.statusCode), // Dispatcher.ResponseData might not have statusText directly
        headers: undiciRawResponse.headers as HeadersInit,
      });
    }
  }

  get status() {
    return this.raw.status;
  }

  get statusText() {
    return this.raw.statusText;
  }

  get headers() {
    return this.raw.headers;
  }

  get ok() {
    return this.raw.ok;
  }

  get url() {
    return this.raw.url;
  }

  /**
   * Get cache information from response headers
   * Detects cache hits, providers (Cloudflare, Fastly, etc.)
   */
  get cache(): CacheInfo {
    return parseHeaders(this.headers, this.status).cache;
  }

  /**
   * Get rate limit information from response headers
   * Includes limit, remaining, reset time, and retry-after
   */
  get rateLimit(): RateLimitInfo {
    return parseHeaders(this.headers, this.status).rateLimit;
  }

  /**
   * Get all parsed header information at once
   */
  get headerInfo(): HeaderInfo {
    return parseHeaders(this.headers, this.status);
  }

  async json<R = T>(): Promise<R> {
    return (await this.raw.json()) as R;
  }

  async text(): Promise<string> {
    return this.raw.text();
  }

  async cleanText(): Promise<string> {
    const rawText = await this.text();
    return cleanHtml(rawText);
  }

  async blob(): Promise<Blob> {
    return this.raw.blob();
  }

  read(): ReadableStream<Uint8Array> | null {
    return this.raw.body;
  }

  /**
   * Convert response body to Node.js Readable stream
   * Useful for piping to file system, other requests, etc.
   *
   * @example
   * ```typescript
   * const response = await client.get('/large-file.zip');
   * const nodeStream = response.toNodeStream();
   *
   * // Pipe to file
   * import { createWriteStream } from 'fs';
   * nodeStream.pipe(createWriteStream('./file.zip'));
   *
   * // Or pipe to another request
   * await client.put('/backup/file.zip', nodeStream);
   * ```
   */
  toNodeStream(): Readable | null {
    if (!this.raw.body) {
      return null;
    }
    return webToNodeStream(this.raw.body);
  }

  /**
   * Pipe response body to a writable stream
   * Returns a promise that resolves when piping completes
   *
   * @example
   * ```typescript
   * import { createWriteStream } from 'fs';
   *
   * const response = await client.get('/file.zip');
   * await response.pipe(createWriteStream('./file.zip'));
   * ```
   */
  async pipe(destination: NodeJS.WritableStream): Promise<void> {
    const nodeStream = this.toNodeStream();
    if (!nodeStream) {
      throw new Error('Response has no body to pipe');
    }

    return new Promise((resolve, reject) => {
      nodeStream.pipe(destination);
      nodeStream.on('end', resolve);
      nodeStream.on('error', reject);
      destination.on('error', reject);
    });
  }

  clone(): ReckerResponse<T> {
    return new HttpResponse(this.raw.clone(), {
      timings: this.timings,
      connection: this.connection
    });
  }

  sse(): AsyncGenerator<SSEEvent> {
    return parseSSE(this.raw);
  }

  /**
   * Download with progress tracking
   * Yields progress events as the response is downloaded
   */
  async *download(): AsyncGenerator<ProgressEvent> {
    if (!this.raw.body) {
      return;
    }

    const contentLength = this.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : undefined;
    let loaded = 0;
    const startTime = Date.now();
    let lastUpdate = startTime;

    const reader = this.raw.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Final progress update
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = elapsed > 0 ? loaded / elapsed : 0;
          yield {
            loaded,
            total,
            percent: total ? 100 : undefined,
            rate,
          };
          break;
        }

        if (value) {
          loaded += value.byteLength;
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;
          const rate = elapsed > 0 ? loaded / elapsed : 0;

          // Throttle updates (max 10 per second)
          if (now - lastUpdate > 100) {
            yield {
              loaded,
              total,
              percent: total ? (loaded / total) * 100 : undefined,
              rate,
              estimated: total && rate > 0 ? ((total - loaded) / rate) * 1000 : undefined,
            };
            lastUpdate = now;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
    if (!this.raw.body) {
        return;
    }
    const reader = this.raw.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
}
