/**
 * Recker Browser - Unified API
 *
 * The browser-compatible version of the Recker unified interface.
 * Everything in one place, zero boilerplate.
 *
 * @example
 * ```typescript
 * import { recker } from 'recker/browser';
 *
 * // HTTP
 * await recker.get('https://api.example.com/users').json();
 * await recker.post('https://api.example.com/users', { json: { name: 'John' } });
 *
 * // WebSocket (native browser)
 * const ws = recker.ws('wss://api.example.com/ws');
 *
 * // AI
 * const response = await recker.ai.chat('Hello!');
 * ```
 *
 * @example Direct functions
 * ```typescript
 * import { get, post, ws } from 'recker/browser';
 *
 * await get('https://api.example.com/users').json();
 * ws('wss://api.example.com/ws');
 * ```
 *
 * NOTE: DNS and WHOIS are not available in browser builds
 * (they require raw socket access which browsers don't provide)
 */

import { Client, createClient, type ExtendedClientOptions } from '../core/client.js';
import { type RequestPromise } from '../core/request-promise.js';
import type { RequestOptions } from '../types/index.js';
import { FetchTransport } from '../transport/fetch.js';
import { analyzeSeo } from '../seo/analyzer.js';
import { createAI } from '../ai/index.js';
import { harRecorder } from '../plugins/har-recorder.js';
import { simulateNetwork } from '../plugins/network-simulation.js';
import { createRaffelClient } from 'raffel/client/browser';
import type { RaffelClientOptions, RaffelClient } from 'raffel/client/browser';

// NOTE: WebSocket uses native browser API
// Users can use native WebSocket API directly in the browser

// ============================================================================
// Singleton instances (lazy-loaded)
// ============================================================================

let _defaultClient: Client | null = null;
const REQUEST_OPTIONS_HINTS = new Set([
  'method',
  'headers',
  'body',
  'json',
  'form',
  'xml',
  'yaml',
  'csv',
  'timeout',
  'params',
  'searchParams',
  'retry',
  'hooks',
  'throwHttpErrors',
  'signal',
  'http2',
  'followRedirects',
  'maxRedirects',
  'beforeRedirect',
  'maxResponseSize',
  'useCurl',
  'proxy',
  'dns',
  'tls',
  'policySource',
  'policyTags',
  'traceId',
  'correlationId',
  'tenant',
  'retryOn404',
  'retryOn5xx',
]);

function isRequestOptions(value: unknown): value is RequestOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).some((key) => REQUEST_OPTIONS_HINTS.has(key));
}

function resolveRequestBodyAndOptions(
  bodyOrOptions?: unknown,
  options?: RequestOptions
): { body?: unknown; options: RequestOptions } {
  if (options === undefined && isRequestOptions(bodyOrOptions)) {
    return { body: undefined, options: bodyOrOptions };
  }
  return { body: bodyOrOptions, options: options || {} };
}

function getDefaultClient(): Client {
  if (!_defaultClient) {
    _defaultClient = createClient({
      transport: new FetchTransport(),
    });
  }
  return _defaultClient;
}

// ============================================================================
// Direct HTTP functions
// ============================================================================

/**
 * GET request
 * @example await get('https://api.example.com/users').json()
 */
export function get<T = unknown>(url: string, options?: RequestOptions): RequestPromise<T> {
  return getDefaultClient().get<T>(url, options);
}

/**
 * POST request
 * @example await post('https://api.example.com/users', { json: { name: 'John' } })
 */
export function post<T = unknown>(url: string, options?: RequestOptions): RequestPromise<T>;
export function post<T = unknown>(url: string, body?: unknown, options?: RequestOptions): RequestPromise<T>;
export function post<T = unknown>(url: string, bodyOrOptions?: unknown, options?: RequestOptions): RequestPromise<T> {
  const resolved = resolveRequestBodyAndOptions(bodyOrOptions, options);
  return getDefaultClient().post<T>(url, resolved.body, resolved.options);
}

/**
 * PUT request
 */
export function put<T = unknown>(url: string, options?: RequestOptions): RequestPromise<T>;
export function put<T = unknown>(url: string, body?: unknown, options?: RequestOptions): RequestPromise<T>;
export function put<T = unknown>(url: string, bodyOrOptions?: unknown, options?: RequestOptions): RequestPromise<T> {
  const resolved = resolveRequestBodyAndOptions(bodyOrOptions, options);
  return getDefaultClient().put<T>(url, resolved.body, resolved.options);
}

/**
 * PATCH request
 */
export function patch<T = unknown>(url: string, options?: RequestOptions): RequestPromise<T>;
export function patch<T = unknown>(url: string, body?: unknown, options?: RequestOptions): RequestPromise<T>;
export function patch<T = unknown>(url: string, bodyOrOptions?: unknown, options?: RequestOptions): RequestPromise<T> {
  const resolved = resolveRequestBodyAndOptions(bodyOrOptions, options);
  return getDefaultClient().patch<T>(url, resolved.body, resolved.options);
}

/**
 * DELETE request
 */
export function del<T = unknown>(url: string, options?: RequestOptions): RequestPromise<T> {
  return getDefaultClient().delete<T>(url, options);
}

/**
 * HEAD request
 */
export function head<T = unknown>(url: string, options?: RequestOptions): RequestPromise<T> {
  return getDefaultClient().head<T>(url, options);
}

/**
 * OPTIONS request
 */
export function options<T = unknown>(url: string, options?: RequestOptions): RequestPromise<T> {
  return getDefaultClient().options<T>(url, options);
}

/**
 * PURGE request (CDN cache invalidation)
 * Note: Works in browsers - it's just a custom HTTP method
 */
export function purge<T = unknown>(url: string, options?: RequestOptions): RequestPromise<T> {
  return getDefaultClient().purge<T>(url, options);
}

// NOTE: TRACE and CONNECT are blocked by the Fetch specification (forbidden methods)
// - TRACE: Security risk (XST attacks)
// - CONNECT: Used for HTTP tunneling/proxying
// If you need these, use the full Client: recker.client().trace() / .connect()
// They may throw errors depending on the browser

// ============================================================================
// WebSocket (use native browser WebSocket API)
// ============================================================================

/**
 * Create a native WebSocket connection
 * @example const socket = ws('wss://api.example.com/ws')
 */
export function ws(url: string, protocols?: string | string[]): WebSocket {
  return new WebSocket(url, protocols);
}

// ============================================================================
// Unified 'recker' namespace (browser version)
// ============================================================================

/**
 * The unified Recker interface (browser version).
 *
 * Available features:
 * - HTTP: recker.get(), recker.post(), etc.
 * - WebSocket: recker.ws() (native browser WebSocket)
 * - Raffel: recker.raffel() - full Raffel protocol client (RPC, streams, channels)
 * - AI: recker.ai() - full AI layer support
 * - SEO: recker.seo() - SEO analysis
 * - HAR: recker.har - record/export HAR files
 *
 * NOT available in browser (Node.js only):
 * - WHOIS: recker.whois() - requires raw sockets
 * - DNS: recker.dns() - requires Node.js dns module
 *
 * @example
 * ```typescript
 * import { recker } from 'recker/browser';
 *
 * // HTTP
 * const users = await recker.get('https://api.example.com/users').json();
 *
 * // WebSocket (native browser API)
 * const socket = recker.ws('wss://api.example.com/ws');
 * socket.onmessage = (event) => console.log(event.data);
 *
 * // Raffel (RPC + channels + streams over WebSocket)
 * const client = recker.raffel('wss://api.example.com/ws', { token: 'xxx' });
 * const user = await client.call('users.get', { id: '123' });
 * const channel = client.subscribe('orders');
 * channel.on('created', (data) => console.log(data));
 *
 * // AI
 * const ai = recker.ai({ defaultProvider: 'openai', providers: { openai: { apiKey: '...' } } });
 * const response = await ai.chat('Hello!');
 * ```
 */
export const recker = {
  // ========== HTTP Methods ==========

  /** GET request */
  get,
  /** POST request */
  post,
  /** PUT request */
  put,
  /** PATCH request */
  patch,
  /** DELETE request */
  delete: del,
  /** HEAD request */
  head,
  /** OPTIONS request */
  options,
  /** PURGE request (CDN cache invalidation) */
  purge,
  // NOTE: TRACE and CONNECT are blocked by fetch spec (use recker.client().trace() if needed)

  // ========== WebSocket ==========

  /** WebSocket connection (native browser API) */
  ws,

  // ========== Raffel Protocol ==========

  /**
   * Create a Raffel protocol client (RPC, streams, channels over WebSocket)
   *
   * @example
   * ```typescript
   * const client = recker.raffel('wss://api.example.com/ws', { token: 'xxx' })
   * const user = await client.call('users.get', { id: '123' })
   *
   * const channel = client.subscribe('orders')
   * channel.on('created', (data) => console.log(data))
   *
   * for await (const chunk of client.stream('logs.tail')) {
   *   console.log(chunk)
   * }
   * ```
   */
  raffel: (url: string, options?: Omit<RaffelClientOptions, 'url'>): RaffelClient =>
    createRaffelClient({ ...options, url }),

  // ========== SEO ==========

  /** 
   * Analyze SEO for HTML content 
   * @example const report = await recker.seo(html, { baseUrl: 'https://example.com' })
   */
  seo: analyzeSeo,

  // ========== AI ==========

  /**
   * Create an AI client
   * @example const ai = recker.ai({ defaultProvider: 'openai', providers: { openai: { apiKey: '...' } } })
   */
  ai: createAI,

  // ========== Debugging ==========

  /**
   * Browser HAR Recorder
   * @example
   * recker.har.start();
   * await recker.get('/api');
   * recker.har.download();
   */
  har: harRecorder,

  /**
   * Simulate poor network conditions
   * @example recker.client({ plugins: [recker.simulateNetwork({ latency: 1000 })] })
   */
  simulateNetwork,

  // ========== Configuration ==========

  /**
   * Create a configured HTTP client
   * Use this when you need custom settings (baseUrl, headers, retry, etc.)
   */
  client: (opts?: ExtendedClientOptions) =>
    createClient({ ...opts, transport: new FetchTransport() }),

  /**
   * Reset default instances (useful for testing)
   */
  reset: () => {
    _defaultClient = null;
  },

  // ========== Browser-specific info ==========

  /**
   * Indicates this is the browser build
   */
  isBrowser: true as const,

  /**
   * Features not available in browser
   */
  unavailable: [
    'whois',
    'whoisAvailable',
    'dns',
    'dnsSecurity',
    'dnsClient',
    'whoisClient',
  ] as const,
};

// Default export
export default recker;
