/**
 * Bare Client - Maximum Performance Mode
 *
 * Zero-overhead HTTP client that wraps undici directly.
 * Use when you need raw speed and don't need middleware/plugins.
 *
 * @example
 * ```typescript
 * import { createBareClient } from 'recker/bare';
 *
 * const client = createBareClient({ baseUrl: 'https://api.example.com' });
 * const data = await client.get('/users').json();
 * ```
 */

import { request as undiciRequest } from 'undici';

export interface BareClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

export interface BareResponse<T = unknown> {
  status: number;
  headers: Headers;
  json(): Promise<T>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<Blob>;
}

export interface BareClient {
  get<T = unknown>(path: string): Promise<BareResponse<T>>;
  post<T = unknown>(path: string, body?: unknown): Promise<BareResponse<T>>;
  put<T = unknown>(path: string, body?: unknown): Promise<BareResponse<T>>;
  patch<T = unknown>(path: string, body?: unknown): Promise<BareResponse<T>>;
  delete<T = unknown>(path: string): Promise<BareResponse<T>>;
}

/**
 * Create a bare (zero-overhead) HTTP client
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
 */
export function createBareClient(options: BareClientOptions): BareClient {
  // Pre-compute base URL (remove trailing slash)
  const base = options.baseUrl.endsWith('/')
    ? options.baseUrl.slice(0, -1)
    : options.baseUrl;

  // Pre-create headers object for reuse
  const defaultHeaders = options.headers || {};
  const jsonHeaders = {
    ...defaultHeaders,
    'Content-Type': 'application/json'
  };

  // Shared response wrapper factory (inlined for speed)
  const wrapResponse = <T>(statusCode: number, headers: any, body: any): BareResponse<T> => ({
    status: statusCode,
    headers: new Headers(Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])
    )),
    json: () => body.json() as Promise<T>,
    text: () => body.text(),
    arrayBuffer: () => body.arrayBuffer(),
    blob: async () => new Blob([await body.arrayBuffer()])
  });

  return {
    async get<T>(path: string): Promise<BareResponse<T>> {
      const { statusCode, headers, body } = await undiciRequest(base + path, {
        method: 'GET',
        headers: defaultHeaders
      });
      return wrapResponse<T>(statusCode, headers, body);
    },

    async post<T>(path: string, data?: unknown): Promise<BareResponse<T>> {
      const { statusCode, headers, body } = await undiciRequest(base + path, {
        method: 'POST',
        headers: jsonHeaders,
        body: data !== undefined ? JSON.stringify(data) : undefined
      });
      return wrapResponse<T>(statusCode, headers, body);
    },

    async put<T>(path: string, data?: unknown): Promise<BareResponse<T>> {
      const { statusCode, headers, body } = await undiciRequest(base + path, {
        method: 'PUT',
        headers: jsonHeaders,
        body: data !== undefined ? JSON.stringify(data) : undefined
      });
      return wrapResponse<T>(statusCode, headers, body);
    },

    async patch<T>(path: string, data?: unknown): Promise<BareResponse<T>> {
      const { statusCode, headers, body } = await undiciRequest(base + path, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: data !== undefined ? JSON.stringify(data) : undefined
      });
      return wrapResponse<T>(statusCode, headers, body);
    },

    async delete<T>(path: string): Promise<BareResponse<T>> {
      const { statusCode, headers, body } = await undiciRequest(base + path, {
        method: 'DELETE',
        headers: defaultHeaders
      });
      return wrapResponse<T>(statusCode, headers, body);
    }
  };
}

/**
 * Even faster: Direct function calls without client object
 *
 * @example
 * ```typescript
 * import { bareGet, barePost } from 'recker/bare';
 *
 * const data = await bareGet('https://api.example.com/users').json();
 * const created = await barePost('https://api.example.com/users', { name: 'John' }).json();
 * ```
 */
export async function bareGet<T = unknown>(url: string, headers?: Record<string, string>): Promise<BareResponse<T>> {
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

export async function barePost<T = unknown>(url: string, data?: unknown, headers?: Record<string, string>): Promise<BareResponse<T>> {
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
