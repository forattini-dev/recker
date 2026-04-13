/**
 * Recker - Unified API
 *
 * The "Swiss Army Knife" interface for Recker.
 * Everything in one place, zero boilerplate.
 *
 * @example
 * ```typescript
 * import { recker } from 'recker';
 *
 * // HTTP
 * await recker.get('https://api.example.com/users').json();
 * await recker.post('https://api.example.com/users', { json: { name: 'John' } });
 *
 * // WHOIS
 * const whois = await recker.whois('example.com');
 * const available = await recker.whoisAvailable('my-domain.com');
 *
 * // DNS
 * const ips = await recker.dns('example.com');
 * const security = await recker.dnsSecurity('example.com');
 *
 * // WebSocket
 * const ws = recker.ws('wss://api.example.com/ws');
 *
 * // AI
 * const response = await recker.ai.chat('Hello!');
 * ```
 *
 * @example Direct functions (even less boilerplate)
 * ```typescript
 * import { get, post, whois, dns, ws } from 'recker';
 *
 * await get('https://api.example.com/users').json();
 * await whois('example.com');
 * await dns('example.com');
 * ws('wss://api.example.com/ws');
 * ```
 */

import { Client, createClient, type ExtendedClientOptions } from './core/client.js';
import { getVersion, getVersionSync, getVersionInfo, type VersionInfo } from './version.js';
import { type RequestPromise } from './core/request-promise.js';
import type { RequestOptions } from './types/index.js';
import { createWebSocket, type WebSocketOptions, type ReckerWebSocket } from './websocket/client.js';
import { createRaffelClient, type RaffelClient } from './raffel/client.js';
import type { RaffelClientOptions } from './raffel/types.js';
import { whois as whoisLookup, isDomainAvailable, createWhois, type WhoisResult, type WhoisOptions } from './utils/whois.js';
import { createDNS, type DNSClientOptions, type DNSClient } from './dns/index.js';
import { createAI, UnifiedAIClient } from './ai/index.js';
import type { AIClientConfig } from './types/ai.js';
import { harRecorder } from './plugins/har-recorder.js';
import { uploadFile } from './utils/upload.js';
import { createVideoBuilder, VideoBuilder } from './video/builder.js';
import { extract, extractors, isSupported, getExtractorName, listExtractors } from './extractors/index.js';
import type { ExtractorResult } from './extractors/base.js';
import { searchGoogleAdvanced, type GoogleSearchAdvancedOptions, type GoogleSearchResponse } from './search/index.js';
import { createRedDbClient, type RedDbClient, type RedDbClientOptions } from './clients/reddb.js';

// ============================================================================
// Singleton instances (lazy-loaded)
// ============================================================================

let _defaultClient: Client | null = null;
let _defaultDns: DNSClient | null = null;
let _defaultAi: UnifiedAIClient | null = null;
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
  'baseUrl',
  'base',
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
    _defaultClient = createClient();
  }
  return _defaultClient;
}

function getDefaultDns(): DNSClient {
  if (!_defaultDns) {
    _defaultDns = createDNS();
  }
  return _defaultDns;
}

function getDefaultAi(): UnifiedAIClient {
  if (!_defaultAi) {
    _defaultAi = createAI() as UnifiedAIClient;
  }
  return _defaultAi;
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

// ============================================================================
// Direct Protocol functions
// ============================================================================

/**
 * WHOIS lookup
 * @example const result = await whois('example.com')
 */
export async function whois(query: string, options?: WhoisOptions): Promise<WhoisResult> {
  return whoisLookup(query, options);
}

/**
 * Check domain availability
 * @example const available = await whoisAvailable('my-domain.com')
 */
export async function whoisAvailable(domain: string): Promise<boolean> {
  return isDomainAvailable(domain);
}

/**
 * DNS resolve
 * @example const ips = await dns('example.com')
 */
export async function dns(hostname: string, type: 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME' = 'A'): Promise<string[]> {
  return getDefaultDns().resolve(hostname, type);
}

/**
 * DNS security records (SPF, DMARC, CAA)
 * @example const security = await dnsSecurity('example.com')
 */
export async function dnsSecurity(domain: string) {
  return getDefaultDns().getSecurityRecords(domain);
}

/**
 * WebSocket connection
 * @example const ws = ws('wss://api.example.com/ws')
 */
export function ws(url: string, options?: WebSocketOptions): ReckerWebSocket {
  return createWebSocket(url, options);
}

/**
 * Video extraction and download
 * @example await video('https://chaturbate.com/user/').download('./video.ts')
 */
export function video(url: string): VideoBuilder {
  return createVideoBuilder(url, getDefaultClient());
}

/**
 * Check if URL is supported by video extractors
 * @example await isVideoSupported('https://chaturbate.com/user/') // true
 */
export async function isVideoSupported(url: string): Promise<boolean> {
  return isSupported(url);
}

/**
 * Extract video information without downloading
 * @example const info = await extractVideo('https://chaturbate.com/user/')
 */
export async function extractVideo(url: string): Promise<ExtractorResult> {
  return extract(url, getDefaultClient());
}

/**
 * Advanced Google Search
 * @example await searchGoogle('recker network sdk', { asSitesearch: 'github.com', num: 10, transport: 'auto' })
 */
export function searchGoogle(
  query: string,
  options?: GoogleSearchAdvancedOptions
): Promise<GoogleSearchResponse> {
  return searchGoogleAdvanced(query, options);
}

// ============================================================================
// Unified 'recker' namespace
// ============================================================================

/**
 * AI namespace with lazy-loaded client
 */
const aiNamespace = {
  /**
   * Chat completion
   * @example await recker.ai.chat('Hello!')
   */
  chat: (...args: Parameters<UnifiedAIClient['chat']>) => getDefaultAi().chat(...args),

  /**
   * Streaming chat
   * @example for await (const event of recker.ai.stream({ messages: [...] })) { ... }
   */
  stream: (...args: Parameters<UnifiedAIClient['stream']>) => getDefaultAi().stream(...args),

  /**
   * Embeddings
   */
  embed: (...args: Parameters<UnifiedAIClient['embed']>) => getDefaultAi().embed(...args),

  /**
   * Create extended AI client
   */
  extend: (...args: Parameters<UnifiedAIClient['extend']>) => getDefaultAi().extend(...args),

  /**
   * Get metrics
   */
  get metrics() {
    return getDefaultAi().metrics;
  },
};

/**
 * The unified Recker interface.
 *
 * Everything in one place:
 * - HTTP: recker.get(), recker.post(), etc.
 * - WHOIS: recker.whois(), recker.whoisAvailable()
 * - DNS: recker.dns(), recker.dnsSecurity()
 * - WebSocket: recker.ws()
 * - AI: recker.ai.chat(), recker.ai.stream()
 *
 * @example
 * ```typescript
 * import { recker } from 'recker';
 *
 * // All-in-one, zero config
 * const users = await recker.get('https://api.example.com/users').json();
 * const whois = await recker.whois('github.com');
 * const ips = await recker.dns('google.com');
 * const ws = recker.ws('wss://api.example.com/ws');
 * const response = await recker.ai.chat('Hello!');
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

  // ========== WHOIS ==========

  /** WHOIS lookup */
  whois,
  /** Check domain availability */
  whoisAvailable,

  // ========== DNS ==========

  /** DNS resolve */
  dns,
  /** DNS security records */
  dnsSecurity,

  // ========== WebSocket ==========

  /** WebSocket connection */
  ws,

  // ========== Raffel ==========

  /**
   * Create a Raffel envelope protocol client over WebSocket
   * @example const client = recker.raffel('ws://game:9999', { channels: ['game'] })
   */
  raffel: (url: string, options?: RaffelClientOptions): RaffelClient => createRaffelClient(url, options),

  // ========== Video ==========

  /**
   * Video extraction and download
   * @example await recker.video('https://chaturbate.com/user/').download('./video.ts')
   */
  video,

  /**
   * Check if URL is supported by video extractors
   */
  isVideoSupported,

  /**
   * Extract video information without downloading
   */
  extractVideo,

  /**
   * Named extractors for direct access
   * @example new recker.extractors.Chaturbate(client).extract(url)
   */
  extractors,

  /**
   * Google search (advanced filters + optional transport fallback)
   */
  searchGoogle,

  /**
   * List all available extractor names
   */
  listExtractors,

  /**
   * Get extractor name for a URL
   */
  getExtractorName,

  // ========== AI ==========

  /** AI client namespace */
  ai: aiNamespace,

  /** 
   * HAR Recorder (Universal)
   * @example recker.har.start(); await recker.get('/api'); recker.har.save('log.har');
   */
  har: harRecorder,

  /**
   * Uploads a file from disk (Node.js only)
   * @example await recker.upload('./file.txt', 'https://api.example.com/upload');
   */
  upload: uploadFile,

  // ========== Configuration ==========

  /**
   * Create a configured HTTP client
   * Use this when you need custom settings (baseUrl, headers, retry, etc.)
   */
  client: (options?: ExtendedClientOptions) => createClient(options),

  /**
   * Create a configured DNS client
   */
  dnsClient: (options?: DNSClientOptions) => createDNS(options),

  /**
   * Create a configured WHOIS client
   */
  whoisClient: createWhois,

  /**
   * Create a configured AI client
   */
  aiClient: (options?: AIClientConfig) => createAI(options),

  /**
   * Create a configured RedDB client
   */
  reddb: (options?: RedDbClientOptions): RedDbClient => createRedDbClient(options),

  /**
   * Reset default instances (useful for testing)
   */
  reset: () => {
    _defaultClient = null;
    _defaultDns = null;
    _defaultAi = null;
  },

  // ========== Version ==========

  /**
   * Get version synchronously (may return '0.0.0' if not loaded yet)
   * For guaranteed accuracy, use recker.getVersion()
   */
  get version(): string {
    return getVersionSync();
  },

  /**
   * Get version (async, guaranteed accurate)
   */
  getVersion,

  /**
   * Get detailed version information
   */
  getVersionInfo,
};

// Default export
export default recker;
