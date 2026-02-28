/**
 * Browser Mini Client - Maximum Performance Mode
 *
 * Zero-overhead HTTP client that wraps fetch directly.
 * Uses MiniRequestPromise for chainable methods without closure overhead.
 *
 * @example
 * ```typescript
 * import { createMiniClient } from 'recker/browser-mini';
 *
 * const client = createMiniClient({ baseUrl: 'https://api.example.com' });
 * const data = await client.get('/users').json();
 * ```
 */

export interface MiniClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

// Static cached closures - avoid per-call allocation (4.7% overhead vs 17.5% for async/await)
const extractJson = (r: Response) => r.json();
const extractText = (r: Response) => r.text();
const extractArrayBuffer = (r: Response) => r.arrayBuffer();
const extractBlob = (r: Response) => r.blob();
const extractFormData = (r: Response) => r.formData();

/**
 * Lightweight chainable promise for HTTP responses.
 * Uses wrapper pattern (implements Promise) instead of inheritance (extends Promise)
 * because it avoids creating a NEW promise - just wraps the existing one.
 *
 * Uses static cached closures for response extraction methods to minimize overhead.
 * Benchmark: cached closure adds only +4.7% overhead vs +17.5% for async/await.
 */
export class MiniRequestPromise<T = unknown> implements Promise<Response> {
  private readonly p: Promise<Response>;

  constructor(promise: Promise<Response>) {
    this.p = promise;
  }

  get [Symbol.toStringTag]() {
    return 'MiniRequestPromise';
  }

  then<TResult1 = Response, TResult2 = never>(
    onfulfilled?: ((value: Response) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.p.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<Response | TResult> {
    return this.p.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<Response> {
    return this.p.finally(onfinally);
  }

  /** Parse response as JSON */
  json<R = T>(): Promise<R> {
    return this.p.then(extractJson) as Promise<R>;
  }

  /** Get response as text */
  text(): Promise<string> {
    return this.p.then(extractText);
  }

  /** Get response as ArrayBuffer */
  arrayBuffer(): Promise<ArrayBuffer> {
    return this.p.then(extractArrayBuffer);
  }

  /** Get response as Blob */
  blob(): Promise<Blob> {
    return this.p.then(extractBlob);
  }

  /** Get response as FormData */
  formData(): Promise<FormData> {
    return this.p.then(extractFormData);
  }
}

/**
 * Mini HTTP client interface
 */
export interface MiniClient {
  get<T = unknown>(path: string): MiniRequestPromise<T>;
  post<T = unknown>(path: string, body?: unknown): MiniRequestPromise<T>;
  put<T = unknown>(path: string, body?: unknown): MiniRequestPromise<T>;
  patch<T = unknown>(path: string, body?: unknown): MiniRequestPromise<T>;
  delete<T = unknown>(path: string): MiniRequestPromise<T>;
  head<T = unknown>(path: string): MiniRequestPromise<T>;
  options<T = unknown>(path: string): MiniRequestPromise<T>;
  request<T = unknown>(method: string, path: string, body?: unknown): MiniRequestPromise<T>;
}

/**
 * Mini HTTP client using class for V8 hidden class optimization.
 */
class MiniClientImpl implements MiniClient {
  private readonly base: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly jsonHeaders: Record<string, string>;

  constructor(options: MiniClientOptions) {
    this.base = options.baseUrl.endsWith('/')
      ? options.baseUrl.slice(0, -1)
      : options.baseUrl;
    this.defaultHeaders = options.headers || {};
    this.jsonHeaders = { ...this.defaultHeaders, 'Content-Type': 'application/json' };
  }

  get<T>(path: string): MiniRequestPromise<T> {
    return new MiniRequestPromise<T>(fetch(this.base + path, { method: 'GET', headers: this.defaultHeaders }));
  }

  post<T>(path: string, body?: unknown): MiniRequestPromise<T> {
    return new MiniRequestPromise<T>(fetch(this.base + path, {
      method: 'POST',
      headers: this.jsonHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined
    }));
  }

  put<T>(path: string, body?: unknown): MiniRequestPromise<T> {
    return new MiniRequestPromise<T>(fetch(this.base + path, {
      method: 'PUT',
      headers: this.jsonHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined
    }));
  }

  patch<T>(path: string, body?: unknown): MiniRequestPromise<T> {
    return new MiniRequestPromise<T>(fetch(this.base + path, {
      method: 'PATCH',
      headers: this.jsonHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined
    }));
  }

  delete<T>(path: string): MiniRequestPromise<T> {
    return new MiniRequestPromise<T>(fetch(this.base + path, { method: 'DELETE', headers: this.defaultHeaders }));
  }

  head<T>(path: string): MiniRequestPromise<T> {
    return new MiniRequestPromise<T>(fetch(this.base + path, { method: 'HEAD', headers: this.defaultHeaders }));
  }

  options<T>(path: string): MiniRequestPromise<T> {
    return new MiniRequestPromise<T>(fetch(this.base + path, { method: 'OPTIONS', headers: this.defaultHeaders }));
  }

  request<T>(method: string, path: string, body?: unknown): MiniRequestPromise<T> {
    const hasBody = body !== undefined;
    return new MiniRequestPromise<T>(fetch(this.base + path, {
      method: method.toUpperCase(),
      headers: hasBody ? this.jsonHeaders : this.defaultHeaders,
      body: hasBody ? JSON.stringify(body) : undefined
    }));
  }
}

/**
 * Create a mini (zero-overhead) HTTP client for browser
 *
 * Features NOT included (for speed):
 * - No retry, cache, middleware, hooks
 * - No request/response transformation
 *
 * Features included:
 * - Base URL, default headers, JSON serialization
 * - All HTTP methods
 * - Chainable response methods (json/text/blob)
 */
export function createMiniClient(options: MiniClientOptions): MiniClient {
  return new MiniClientImpl(options);
}

/**
 * Direct function for single GET request
 */
export function miniGet<T = unknown>(
  url: string,
  headers?: Record<string, string>
): MiniRequestPromise<T> {
  return new MiniRequestPromise<T>(fetch(url, { method: 'GET', headers }));
}

/**
 * Direct function for single POST request
 */
export function miniPost<T = unknown>(
  url: string,
  body?: unknown,
  headers?: Record<string, string>
): MiniRequestPromise<T> {
  return new MiniRequestPromise<T>(fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined
  }));
}
