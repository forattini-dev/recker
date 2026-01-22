/**
 * Mini Client - Maximum Performance Mode
 *
 * Zero-overhead HTTP client that wraps undici directly.
 * Use when you need raw speed and don't need middleware/plugins.
 *
 * @example
 * ```typescript
 * import { createMiniClient } from 'recker/mini';
 *
 * const client = createMiniClient({ baseUrl: 'https://api.example.com' });
 * const data = await client.get('/users').json();
 * ```
 */

import { Client, request as undiciRequest } from 'undici';

export interface MiniClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

export interface MiniResponse<T = unknown> {
  status: number;
  headers: Headers;
  json(): Promise<T>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<Blob>;
}

export interface MiniClient {
  get<T = unknown>(path: string): Promise<MiniResponse<T>>;
  post<T = unknown>(path: string, body?: unknown): Promise<MiniResponse<T>>;
  put<T = unknown>(path: string, body?: unknown): Promise<MiniResponse<T>>;
  patch<T = unknown>(path: string, body?: unknown): Promise<MiniResponse<T>>;
  delete<T = unknown>(path: string): Promise<MiniResponse<T>>;
  head<T = unknown>(path: string): Promise<MiniResponse<T>>;
  options<T = unknown>(path: string): Promise<MiniResponse<T>>;
  trace<T = unknown>(path: string): Promise<MiniResponse<T>>;
  connect<T = unknown>(path: string): Promise<MiniResponse<T>>;
  purge<T = unknown>(path: string): Promise<MiniResponse<T>>;
  /** Generic request method for any HTTP method */
  request<T = unknown>(method: string, path: string, body?: unknown): Promise<MiniResponse<T>>;
  /** Close the underlying connection pool */
  close(): Promise<void>;
}

/**
 * Create a mini (zero-overhead) HTTP client
 *
 * Features NOT included (for speed):
 * - No retry
 * - No cache
 * - No middleware
 * - No hooks
 * - No request/response transformation
 * - No timeout handling (use AbortController manually)
 *
 * Features included:
 * - Base URL
 * - Default headers
 * - JSON serialization
 * - All HTTP methods (including custom like PURGE)
 */
export function createMiniClient(options: MiniClientOptions): MiniClient {
  // Pre-compute base URL (remove trailing slash)
  const base = options.baseUrl.endsWith('/')
    ? options.baseUrl.slice(0, -1)
    : options.baseUrl;

  // Create undici Client for custom method support
  const undiciClient = new Client(base);

  // Pre-create headers object for reuse
  const defaultHeaders = options.headers || {};
  const jsonHeaders = {
    ...defaultHeaders,
    'Content-Type': 'application/json'
  };

  // Shared response wrapper factory (inlined for speed)
  const wrapResponse = <T>(statusCode: number, headers: any, body: any): MiniResponse<T> => ({
    status: statusCode,
    headers: new Headers(Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])
    )),
    json: () => body.json() as Promise<T>,
    text: () => body.text(),
    arrayBuffer: () => body.arrayBuffer(),
    blob: async () => new Blob([await body.arrayBuffer()])
  });

  // Generic request function using Client (supports all methods)
  const doRequest = async <T>(method: string, path: string, body?: unknown, useJsonHeaders = false): Promise<MiniResponse<T>> => {
    const { statusCode, headers, body: resBody } = await undiciClient.request({
      path,
      method,
      headers: useJsonHeaders ? jsonHeaders : defaultHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    return wrapResponse<T>(statusCode, headers, resBody);
  };

  return {
    async get<T>(path: string): Promise<MiniResponse<T>> {
      return doRequest<T>('GET', path);
    },

    async post<T>(path: string, data?: unknown): Promise<MiniResponse<T>> {
      return doRequest<T>('POST', path, data, true);
    },

    async put<T>(path: string, data?: unknown): Promise<MiniResponse<T>> {
      return doRequest<T>('PUT', path, data, true);
    },

    async patch<T>(path: string, data?: unknown): Promise<MiniResponse<T>> {
      return doRequest<T>('PATCH', path, data, true);
    },

    async delete<T>(path: string): Promise<MiniResponse<T>> {
      return doRequest<T>('DELETE', path);
    },

    async head<T>(path: string): Promise<MiniResponse<T>> {
      return doRequest<T>('HEAD', path);
    },

    async options<T>(path: string): Promise<MiniResponse<T>> {
      return doRequest<T>('OPTIONS', path);
    },

    async trace<T>(path: string): Promise<MiniResponse<T>> {
      return doRequest<T>('TRACE', path);
    },

    async connect<T>(path: string): Promise<MiniResponse<T>> {
      return doRequest<T>('CONNECT', path);
    },

    async purge<T>(path: string): Promise<MiniResponse<T>> {
      return doRequest<T>('PURGE', path);
    },

    async request<T>(method: string, path: string, body?: unknown): Promise<MiniResponse<T>> {
      return doRequest<T>(method.toUpperCase(), path, body, body !== undefined);
    },

    async close(): Promise<void> {
      await undiciClient.close();
    }
  };
}

/**
 * Even faster: Direct function calls without client object
 *
 * @example
 * ```typescript
 * import { miniGet, miniPost } from 'recker/mini';
 *
 * const data = await miniGet('https://api.example.com/users').json();
 * const created = await miniPost('https://api.example.com/users', { name: 'John' }).json();
 * ```
 */
export async function miniGet<T = unknown>(url: string, headers?: Record<string, string>): Promise<MiniResponse<T>> {
  const { statusCode, headers: resHeaders, body } = await undiciRequest(url, {
    method: 'GET',
    headers
  });
  return {
    status: statusCode,
    headers: new Headers(Object.fromEntries(
      Object.entries(resHeaders).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])
    )),
    json: () => body.json() as Promise<T>,
    text: () => body.text(),
    arrayBuffer: () => body.arrayBuffer(),
    blob: async () => new Blob([await body.arrayBuffer()])
  };
}

export async function miniPost<T = unknown>(url: string, data?: unknown, headers?: Record<string, string>): Promise<MiniResponse<T>> {
  const { statusCode, headers: resHeaders, body } = await undiciRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: data !== undefined ? JSON.stringify(data) : undefined
  });
  return {
    status: statusCode,
    headers: new Headers(Object.fromEntries(
      Object.entries(resHeaders).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])
    )),
    json: () => body.json() as Promise<T>,
    text: () => body.text(),
    arrayBuffer: () => body.arrayBuffer(),
    blob: async () => new Blob([await body.arrayBuffer()])
  };
}
