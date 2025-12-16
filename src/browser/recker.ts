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

// NOTE: TRACE and CONNECT are NOT supported in browsers
// - TRACE: Blocked for security (XST attacks)
// - CONNECT: Blocked for security (HTTP tunneling)
// - PURGE: Non-standard CDN method, may be rejected

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
  // NOTE: TRACE and CONNECT are NOT available in browsers (security restrictions)

  // ========== WebSocket ==========

  /** WebSocket connection (native browser API) */
  ws,

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
