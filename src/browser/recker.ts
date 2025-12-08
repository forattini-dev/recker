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

// NOTE: WebSocket and AI are excluded from browser build due to Node.js dependencies
// Users can use native WebSocket API directly in the browser

// ============================================================================
// Singleton instances (lazy-loaded)
// ============================================================================

let _defaultClient: Client | null = null;

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
export function get(url: string, options?: RequestOptions): RequestPromise {
  return getDefaultClient().get(url, options);
}

/**
 * POST request
 * @example await post('https://api.example.com/users', { json: { name: 'John' } })
 */
export function post(url: string, options?: RequestOptions): RequestPromise {
  return getDefaultClient().post(url, options);
}

/**
 * PUT request
 */
export function put(url: string, options?: RequestOptions): RequestPromise {
  return getDefaultClient().put(url, options);
}

/**
 * PATCH request
 */
export function patch(url: string, options?: RequestOptions): RequestPromise {
  return getDefaultClient().patch(url, options);
}

/**
 * DELETE request
 */
export function del(url: string, options?: RequestOptions): RequestPromise {
  return getDefaultClient().delete(url, options);
}

/**
 * HEAD request
 */
export function head(url: string, options?: RequestOptions): RequestPromise {
  return getDefaultClient().head(url, options);
}

/**
 * OPTIONS request
 */
export function options(url: string, options?: RequestOptions): RequestPromise {
  return getDefaultClient().options(url, options);
}

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
 *
 * NOT available in browser (Node.js only):
 * - WHOIS: recker.whois() - requires raw sockets
 * - DNS: recker.dns() - requires Node.js dns module
 * - AI: recker.ai - requires Node.js for some providers
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

  // ========== WebSocket ==========

  /** WebSocket connection (native browser API) */
  ws,

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
    'ai',
    'aiClient',
  ] as const,
};

// Default export
export default recker;
