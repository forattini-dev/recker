/**
 * Recker Browser - Slim Unified API
 *
 * Browser-compatible unified interface without AI, SEO, scrape, or presets.
 * Focused on core HTTP + browser-safe plugins.
 *
 * @example
 * ```typescript
 * import { recker } from 'recker/browser-slim';
 *
 * // HTTP
 * await recker.get('https://api.example.com/users').json();
 * await recker.post('https://api.example.com/users', { json: { name: 'John' } });
 *
 * // WebSocket (native browser)
 * const ws = recker.ws('wss://api.example.com/ws');
 * ```
 */

import { Client, createClient, type ExtendedClientOptions } from '../core/client.js';
import { type RequestPromise } from '../core/request-promise.js';
import type { RequestOptions } from '../types/index.js';
import { FetchTransport } from '../transport/fetch.js';
import { harRecorder } from '../plugins/har-recorder.js';
import { simulateNetwork } from '../plugins/network-simulation.js';

// NOTE: WebSocket uses native browser API
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

/**
 * PURGE request (CDN cache invalidation)
 * Note: Works in browsers - it's just a custom HTTP method
 */
export function purge(url: string, options?: RequestOptions): RequestPromise {
  return getDefaultClient().purge(url, options);
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
// Unified 'recker' namespace (browser slim version)
// ============================================================================

/**
 * The unified Recker interface (browser slim version).
 *
 * Available features:
 * - HTTP: recker.get(), recker.post(), etc.
 * - WebSocket: recker.ws() (native browser WebSocket)
 * - HAR: recker.har - record/export HAR files
 *
 * NOT available in browser slim:
 * - AI: recker.ai() - not included in slim bundle
 * - SEO: recker.seo() - not included in slim bundle
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
    'ai',
    'seo',
    'presets',
    'scrape',
  ] as const,
};

// Default export
export default recker;
