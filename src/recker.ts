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
import { type RequestPromise } from './core/request-promise.js';
import type { RequestOptions } from './types/index.js';
import { FetchTransport } from './transport/fetch.js';
import { createWebSocket, type WebSocketOptions, type ReckerWebSocket } from './websocket/client.js';
import { whois as whoisLookup, isDomainAvailable, createWhois, type WhoisResult, type WhoisOptions } from './utils/whois.js';
import { createDNS, type DNSClientOptions, type DNSClient } from './dns/index.js';
import { createAI, UnifiedAIClient } from './ai/index.js';
import type { AIClientConfig } from './types/ai.js';

// ============================================================================
// Singleton instances (lazy-loaded)
// ============================================================================

let _defaultClient: Client | null = null;
let _defaultDns: DNSClient | null = null;
let _defaultAi: UnifiedAIClient | null = null;

function getDefaultClient(): Client {
  if (!_defaultClient) {
    // Use FetchTransport for absolute URLs without requiring baseUrl
    _defaultClient = createClient({
      transport: new FetchTransport(),
    });
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

  // ========== AI ==========

  /** AI client namespace */
  ai: aiNamespace,

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
   * Reset default instances (useful for testing)
   */
  reset: () => {
    _defaultClient = null;
    _defaultDns = null;
    _defaultAi = null;
  },
};

// Default export
export default recker;
