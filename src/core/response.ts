import { ConnectionInfo, ReckerResponse, Timings, SSEEvent, ProgressEvent } from '../types/index.js';
import type { Dispatcher } from 'undici'; // Import Dispatcher
import { parseSSE } from '../utils/sse.js';
import { cleanHtml } from '../utils/html-cleaner.js';
import { calculateProgress } from '../utils/progress.js';
import { webToNodeStream } from '../utils/streaming.js';
import { parseHeaders, type HeaderInfo, type CacheInfo, type RateLimitInfo } from '../utils/header-parser.js';
import { parseLinkHeader, type LinkHeaderParser } from '../utils/link-header.js';
import type { Readable } from 'node:stream';
import { StreamError } from './errors.js';
import { parseYaml, type YamlParseOptions } from '../plugins/yaml.js';
import { parseCsv, type CsvParseOptions } from '../plugins/csv.js';

/**
 * Status codes that must not have a body per Fetch API spec.
 * See: https://fetch.spec.whatwg.org/#statuses
 */
const NULL_BODY_STATUS = [101, 103, 204, 205, 304];

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
      // For null body status codes (101, 103, 204, 205, 304), body must be null
      const body = NULL_BODY_STATUS.includes(undiciRawResponse.statusCode)
        ? null
        : undiciRawResponse.body as unknown as ReadableStream<Uint8Array>;
      this.raw = new Response(body, {
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

  /**
   * Parse response body as YAML
   *
   * First HTTP client with native YAML support!
   * Implements RFC 9512 (application/yaml media type).
   *
   * @example
   * ```typescript
   * // Parse YAML response
   * const config = await client.get('/config.yaml').yaml();
   *
   * // With type parameter
   * interface Config { server: { port: number } }
   * const config = await client.get('/config.yaml').yaml<Config>();
   *
   * // With options
   * const data = await client.get('/data.yaml').yaml({ parseDates: false });
   * ```
   */
  async yaml<R = T>(options?: YamlParseOptions): Promise<R> {
    const text = await this.raw.text();
    return parseYaml<R>(text, options);
  }

  /**
   * Parse response body as CSV
   *
   * Native CSV support following RFC 4180 specification.
   *
   * @example
   * ```typescript
   * // Parse as array of objects (with headers)
   * const users = await client.get('/users.csv').csv();
   * // [{ name: 'John', age: '30' }, { name: 'Jane', age: '25' }]
   *
   * // Parse as array of arrays (no headers)
   * const data = await client.get('/data.csv').csv({ headers: false });
   * // [['John', '30'], ['Jane', '25']]
   *
   * // With type parameter
   * interface User { name: string; age: string }
   * const users = await client.get('/users.csv').csv<User>();
   * ```
   */
  async csv<R = Record<string, string>>(options?: CsvParseOptions): Promise<R[]> {
    const text = await this.raw.text();
    return parseCsv<R>(text, options as any);
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
      throw new StreamError(
        'Response has no body to pipe',
        {
          streamType: 'response',
          retriable: true,
        }
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
