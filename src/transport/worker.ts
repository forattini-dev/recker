/**
 * Web Worker HTTP Transport
 *
 * Executes HTTP requests in a dedicated Web Worker to avoid blocking
 * the main UI thread during heavy network operations.
 *
 * @example
 * ```typescript
 * import { WorkerTransport, createClient } from 'recker/browser';
 *
 * const client = createClient({
 *   transport: new WorkerTransport()
 * });
 *
 * // Requests run in a background thread
 * const data = await client.get('https://api.example.com/large-data').json();
 * ```
 */

import type { ReckerRequest, ReckerResponse, Transport, Timings, ProgressEvent, SSEEvent } from '../types/index.js';

// Worker script as an inline blob URL
const WORKER_SCRIPT = `
self.onmessage = async (event) => {
  const { id, method, url, headers, body, timeout } = event.data;

  try {
    const controller = new AbortController();
    let timeoutId;

    if (timeout) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
    }

    const start = performance.now();

    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      keepalive: true
    });

    if (timeoutId) clearTimeout(timeoutId);

    const totalTime = performance.now() - start;

    // Read response body as ArrayBuffer for transferability
    const arrayBuffer = await response.arrayBuffer();

    // Serialize headers
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    self.postMessage({
      id,
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      ok: response.ok,
      url: response.url,
      body: arrayBuffer,
      timings: { total: totalTime, firstByte: totalTime }
    }, [arrayBuffer]);

  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: {
        name: error.name,
        message: error.message
      }
    });
  }
};
`;

interface WorkerMessage {
  id: string;
  success: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  ok?: boolean;
  url?: string;
  body?: ArrayBuffer;
  timings?: Timings;
  error?: { name: string; message: string };
}

export interface WorkerTransportOptions {
  /**
   * Number of workers in the pool (default: navigator.hardwareConcurrency or 4)
   */
  poolSize?: number;
}

/**
 * Web Worker-based HTTP transport.
 *
 * Benefits:
 * - Non-blocking: HTTP requests don't block the main UI thread
 * - Performance: Better responsiveness during large file transfers
 * - Parallelism: Multiple requests can run truly in parallel
 *
 * Limitations:
 * - Streaming: Response body is fully buffered (no streaming support)
 * - SSE: Server-Sent Events require main thread for real-time updates
 * - Progress: Download progress events are not available
 */
export class WorkerTransport implements Transport {
  private workers: Worker[] = [];
  private workerIndex = 0;
  private pendingRequests: Map<string, {
    resolve: (value: ReckerResponse) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private workerUrl: string;

  constructor(private options: WorkerTransportOptions = {}) {
    const poolSize = options.poolSize ?? (
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4
    ) ?? 4;

    // Create worker blob URL
    const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
    this.workerUrl = URL.createObjectURL(blob);

    // Initialize worker pool
    for (let i = 0; i < poolSize; i++) {
      this.createWorker();
    }
  }

  /**
   * Check if Web Workers are supported
   */
  static isSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  private createWorker(): void {
    const worker = new Worker(this.workerUrl);

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { id, success, error, ...response } = event.data;
      const pending = this.pendingRequests.get(id);

      if (!pending) return;
      this.pendingRequests.delete(id);

      if (success) {
        pending.resolve(new WorkerResponseWrapper(response));
      } else {
        const err = new Error(error?.message || 'Worker request failed');
        err.name = error?.name || 'WorkerError';
        pending.reject(err);
      }
    };

    worker.onerror = (event) => {
      console.error('[WorkerTransport] Worker error:', event.message);
    };

    this.workers.push(worker);
  }

  private getNextWorker(): Worker {
    const worker = this.workers[this.workerIndex];
    this.workerIndex = (this.workerIndex + 1) % this.workers.length;
    return worker;
  }

  async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    if (!WorkerTransport.isSupported()) {
      throw new Error('Web Workers are not supported in this environment');
    }

    const id = crypto.randomUUID();
    const worker = this.getNextWorker();

    // Extract timeout value
    const timeoutMs = typeof req.timeout === 'number'
      ? req.timeout
      : req.timeout?.request;

    // Serialize headers
    const headers: Record<string, string> = {};
    if (req.headers) {
      if (req.headers instanceof Headers) {
        req.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (typeof req.headers === 'object') {
        Object.assign(headers, req.headers);
      }
    }

    // Serialize body if present
    let body: string | ArrayBuffer | undefined;
    if (req.body) {
      if (typeof req.body === 'string') {
        body = req.body;
      } else if (req.body instanceof ArrayBuffer) {
        body = req.body;
      } else if (req.body instanceof Blob) {
        body = await req.body.arrayBuffer();
      } else if (typeof req.body === 'object') {
        body = JSON.stringify(req.body);
      }
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Handle external abort signal
      if (req.signal) {
        req.signal.addEventListener('abort', () => {
          const pending = this.pendingRequests.get(id);
          if (pending) {
            this.pendingRequests.delete(id);
            const err = new Error('Request aborted');
            err.name = 'AbortError';
            pending.reject(err);
          }
        });
      }

      worker.postMessage({
        id,
        method: req.method,
        url: req.url,
        headers,
        body,
        timeout: timeoutMs
      });
    });
  }

  /**
   * Terminate all workers and clean up resources
   */
  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    URL.revokeObjectURL(this.workerUrl);

    // Reject any pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('Transport terminated'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Get the number of pending requests
   */
  get pendingCount(): number {
    return this.pendingRequests.size;
  }
}

/**
 * Response wrapper for Worker transport
 */
class WorkerResponseWrapper implements ReckerResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly ok: boolean;
  readonly url: string;
  readonly timings: Timings;
  readonly connection = {};
  readonly raw: Response;

  private bodyBuffer: ArrayBuffer;
  private bodyUsed = false;

  constructor(data: Partial<WorkerMessage>) {
    this.status = data.status ?? 0;
    this.statusText = data.statusText ?? '';
    this.ok = data.ok ?? false;
    this.url = data.url ?? '';
    this.timings = data.timings ?? { total: 0 };
    this.bodyBuffer = data.body ?? new ArrayBuffer(0);

    // Convert headers object to Headers
    this.headers = new Headers();
    if (data.headers) {
      for (const [key, value] of Object.entries(data.headers)) {
        this.headers.set(key, value);
      }
    }

    // Create a synthetic Response for compatibility
    this.raw = new Response(this.bodyBuffer, {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
    });
  }

  private checkBodyUsed(): void {
    if (this.bodyUsed) {
      throw new Error('Body has already been consumed');
    }
    this.bodyUsed = true;
  }

  async json<T = unknown>(): Promise<T> {
    this.checkBodyUsed();
    const text = new TextDecoder().decode(this.bodyBuffer);
    return JSON.parse(text) as T;
  }

  async text(): Promise<string> {
    this.checkBodyUsed();
    return new TextDecoder().decode(this.bodyBuffer);
  }

  async blob(): Promise<Blob> {
    this.checkBodyUsed();
    return new Blob([this.bodyBuffer]);
  }

  async cleanText(): Promise<string> {
    const text = await this.text();
    return text.replace(/<[^>]*>?/gm, '');
  }

  read(): ReadableStream<Uint8Array> | null {
    if (this.bodyUsed) return null;
    this.bodyUsed = true;

    // Create a stream from the ArrayBuffer
    const buffer = this.bodyBuffer;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      }
    });
  }

  clone(): ReckerResponse {
    // Create a new instance with a copy of the buffer
    const clonedBuffer = this.bodyBuffer.slice(0);
    const headersObj: Record<string, string> = {};
    this.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    return new WorkerResponseWrapper({
      status: this.status,
      statusText: this.statusText,
      ok: this.ok,
      url: this.url,
      timings: this.timings,
      body: clonedBuffer,
      headers: headersObj,
    });
  }

  async *sse(): AsyncGenerator<SSEEvent> {
    // SSE requires real-time streaming which is not supported in Worker transport
    throw new Error('SSE is not supported in WorkerTransport. Use FetchTransport for SSE.');
  }

  async *download(): AsyncGenerator<ProgressEvent> {
    // Progress events not available since body is fully buffered
    const total = this.bodyBuffer.byteLength;
    yield {
      loaded: total,
      transferred: total,
      total,
      percent: 100,
      direction: 'download'
    };
  }

  async *[Symbol.asyncIterator]() {
    if (this.bodyUsed) return;
    this.bodyUsed = true;
    yield new Uint8Array(this.bodyBuffer);
  }
}
