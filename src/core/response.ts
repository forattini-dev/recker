import { ConnectionInfo, ReckerResponse, Timings, SSEEvent, ProgressEvent } from '../types/index.js';
import { Dispatcher } from 'undici'; // Import Dispatcher
import { parseSSE } from '../utils/sse.js';
import { cleanHtml } from '../utils/html-cleaner.js';
import { calculateProgress } from '../utils/progress.js';
import { webToNodeStream } from '../utils/streaming.js';
import { parseHeaders, type HeaderInfo, type CacheInfo, type RateLimitInfo } from '../utils/header-parser.js';
import { parseLinkHeader, type LinkHeaderParser } from '../utils/link-header.js';
import type { Readable } from 'node:stream';
import { ReckerError } from './errors.js';

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
   * Get parsed Link header for pagination and resource relationships
   * Returns null if no Link header is present
   *
   * @example
   * ```typescript
   * const response = await client.get('/api/users?page=1');
   * const links = response.links();
   *
   * if (links?.hasNext()) {
   *   const nextUrl = links.getPagination().next;
   *   const nextPage = await client.get(nextUrl);
   * }
   * ```
   */
  links(): LinkHeaderParser | null {
    return parseLinkHeader(this.headers);
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
      throw new ReckerError(
        'Response has no body to pipe',
        undefined,
        this,
        [
          'Ensure the request method returns a body (e.g., not HEAD).',
          'Check the upstream response status and headers.',
          'Verify the request was not aborted before receiving a body.'
        ]
      );
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
   *
   * @example
   * ```typescript
   * const response = await client.get('/large-file.zip');
   * for await (const progress of response.download()) {
   *   console.log(`${progress.percent?.toFixed(1)}% (${progress.rate} B/s)`);
   * }
   * ```
   */
  async *download(): AsyncGenerator<ProgressEvent> {
    if (!this.raw.body) {
      return;
    }

    const contentLength = this.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : undefined;
    let loaded = 0;
    const startTime = Date.now();
    let lastUpdate = 0;
    let lastLoaded = 0;
    let lastRateUpdate = startTime;
    let smoothedRate = 0;
    const rateSmoothingFactor = 0.3;

    const createProgress = (isFinal: boolean): ProgressEvent => {
      const now = Date.now();
      const intervalMs = now - lastRateUpdate;
      const bytesInInterval = loaded - lastLoaded;

      if (intervalMs > 0) {
        const instantRate = (bytesInInterval / intervalMs) * 1000;
        smoothedRate = smoothedRate === 0
          ? instantRate
          : smoothedRate * (1 - rateSmoothingFactor) + instantRate * rateSmoothingFactor;
      }

      lastLoaded = loaded;
      lastRateUpdate = now;

      let percent: number | undefined;
      if (total) {
        percent = isFinal ? 100 : Math.min((loaded / total) * 100, 99.9);
      }

      return {
        loaded,
        transferred: loaded,
        total,
        percent,
        rate: smoothedRate,
        estimated: total && smoothedRate > 0 ? ((total - loaded) / smoothedRate) * 1000 : undefined,
        direction: 'download',
      };
    };

    const reader = this.raw.body.getReader();
    try {
      // Emit initial progress
      yield createProgress(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Final progress update
          yield createProgress(true);
          break;
        }

        if (value) {
          loaded += value.byteLength;
          const now = Date.now();

          // Throttle updates (max 10 per second)
          if (now - lastUpdate > 100) {
            yield createProgress(false);
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
