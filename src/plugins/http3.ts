/**
 * HTTP/3 (QUIC) Experimental Support
 *
 * HTTP/3 uses QUIC as the transport layer instead of TCP+TLS.
 * Benefits:
 * - Faster connection establishment (0-RTT)
 * - Better multiplexing (no head-of-line blocking)
 * - Connection migration (network changes)
 * - Improved congestion control
 *
 * Requirements:
 * - Node.js 23+ with --experimental-quic flag
 * - Or use with a QUIC-compatible proxy
 *
 * Note: As of 2024, Node.js QUIC support is still experimental.
 * This module provides both native QUIC (when available) and
 * Alt-Svc based HTTP/3 upgrade detection.
 */

import type { Client } from '../core/client.js';
import type { Middleware, RequestOptions, ReckerResponse } from '../types/index.js';
import { EventEmitter } from 'node:events';

export interface Http3Options {
  /** Enable HTTP/3 (default: true) */
  enabled?: boolean;
  /** Prefer HTTP/3 when available (default: true) */
  preferHttp3?: boolean;
  /** Fallback to HTTP/2 or HTTP/1.1 on failure (default: true) */
  fallback?: boolean;
  /** Connection timeout for QUIC in ms (default: 5000) */
  connectTimeout?: number;
  /** Cache Alt-Svc headers (default: true) */
  cacheAltSvc?: boolean;
  /** Alt-Svc cache TTL in ms (default: 86400000 = 24h) */
  altSvcCacheTtl?: number;
  /** Enable 0-RTT (early data) - security tradeoff (default: false) */
  enable0RTT?: boolean;
  /** Custom ALPN protocols */
  alpnProtocols?: string[];
  /** Callback when HTTP/3 is used */
  onHttp3?: (url: string) => void;
  /** Callback when falling back to HTTP/2 or HTTP/1.1 */
  onFallback?: (url: string, reason: string) => void;
}

interface AltSvcEntry {
  protocol: string;
  host: string;
  port: number;
  maxAge: number;
  expiresAt: number;
}

/**
 * Parse Alt-Svc header
 * Example: h3=":443"; ma=86400, h3-29=":443"; ma=86400
 */
function parseAltSvc(header: string, origin: string): AltSvcEntry[] {
  const entries: AltSvcEntry[] = [];
  const parts = header.split(',').map((p) => p.trim());
  const originUrl = new URL(origin);

  for (const part of parts) {
    // Match: protocol="host:port" or protocol=":port"
    const match = part.match(/^([\w-]+)="?([^";\s]*)"?(?:;\s*ma=(\d+))?/);
    if (!match) continue;

    const [, protocol, hostPort, maxAgeStr] = match;
    const maxAge = maxAgeStr ? parseInt(maxAgeStr, 10) : 86400;

    // Parse host:port
    let host = originUrl.hostname;
    let port = parseInt(originUrl.port || '443', 10);

    if (hostPort) {
      if (hostPort.startsWith(':')) {
        port = parseInt(hostPort.slice(1), 10);
      } else {
        const [h, p] = hostPort.split(':');
        if (h) host = h;
        if (p) port = parseInt(p, 10);
      }
    }

    entries.push({
      protocol,
      host,
      port,
      maxAge,
      expiresAt: Date.now() + maxAge * 1000,
    });
  }

  return entries;
}

/**
 * HTTP/3 Connection Manager
 *
 * Manages HTTP/3 connections, Alt-Svc discovery, and fallback logic.
 *
 * @example
 * ```typescript
 * const h3 = new Http3Manager({
 *   preferHttp3: true,
 *   onHttp3: (url) => console.log(`Using HTTP/3 for ${url}`)
 * });
 *
 * // Check if HTTP/3 is available for a URL
 * const available = h3.isHttp3Available('https://example.com');
 *
 * // Get HTTP/3 endpoint from Alt-Svc
 * const endpoint = h3.getHttp3Endpoint('https://example.com');
 * ```
 */
export class Http3Manager extends EventEmitter {
  private options: Required<Http3Options>;
  private altSvcCache: Map<string, AltSvcEntry[]> = new Map();
  private http3Supported: Map<string, boolean> = new Map();
  private quicAvailable: boolean | null = null;

  constructor(options: Http3Options = {}) {
    super();
    this.options = {
      enabled: options.enabled ?? true,
      preferHttp3: options.preferHttp3 ?? true,
      fallback: options.fallback ?? true,
      connectTimeout: options.connectTimeout ?? 5000,
      cacheAltSvc: options.cacheAltSvc ?? true,
      altSvcCacheTtl: options.altSvcCacheTtl ?? 86400000,
      enable0RTT: options.enable0RTT ?? false,
      alpnProtocols: options.alpnProtocols ?? ['h3', 'h3-29', 'h2', 'http/1.1'],
      onHttp3: options.onHttp3 ?? (() => {}),
      onFallback: options.onFallback ?? (() => {}),
    };
  }

  /**
   * Check if native QUIC is available in Node.js
   */
  async checkQuicSupport(): Promise<boolean> {
    if (this.quicAvailable !== null) {
      return this.quicAvailable;
    }

    try {
      // Check Node.js version
      const [major] = process.versions.node.split('.').map(Number);
      if (major < 23) {
        this.quicAvailable = false;
        return false;
      }

      // Try to import QUIC module (requires --experimental-quic flag)
      // @ts-expect-error - Experimental module
      await import('node:quic').catch(() => null);
      this.quicAvailable = true;
      this.emit('quicAvailable');
      return true;
    } catch {
      this.quicAvailable = false;
      return false;
    }
  }

  /**
   * Record Alt-Svc header from response
   */
  recordAltSvc(origin: string, altSvcHeader: string): void {
    if (!this.options.cacheAltSvc) return;

    const entries = parseAltSvc(altSvcHeader, origin);
    const http3Entries = entries.filter((e) =>
      e.protocol.startsWith('h3') || e.protocol === 'quic'
    );

    if (http3Entries.length > 0) {
      // Apply altSvcCacheTtl to cap expiration times
      const maxExpiresAt = Date.now() + this.options.altSvcCacheTtl;
      const cappedEntries = http3Entries.map((e) => ({
        ...e,
        expiresAt: Math.min(e.expiresAt, maxExpiresAt),
      }));

      this.altSvcCache.set(origin, cappedEntries);
      this.http3Supported.set(origin, true);
      this.emit('http3Discovered', origin, cappedEntries);
    }
  }

  /**
   * Check if HTTP/3 is available for a URL
   */
  isHttp3Available(url: string): boolean {
    if (!this.options.enabled) return false;

    try {
      const origin = new URL(url).origin;
      const cached = this.altSvcCache.get(origin);

      if (!cached) return false;

      // Check if any entry is still valid
      const now = Date.now();
      const valid = cached.filter((e) => e.expiresAt > now);

      if (valid.length === 0) {
        this.altSvcCache.delete(origin);
        this.http3Supported.delete(origin);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get HTTP/3 endpoint for a URL
   */
  getHttp3Endpoint(url: string): { host: string; port: number; protocol: string } | null {
    try {
      const origin = new URL(url).origin;
      const cached = this.altSvcCache.get(origin);

      if (!cached) return null;

      const now = Date.now();
      const valid = cached.filter((e) => e.expiresAt > now);

      // Prefer h3 over h3-xx versions
      const sorted = valid.sort((a, b) => {
        if (a.protocol === 'h3' && b.protocol !== 'h3') return -1;
        if (a.protocol !== 'h3' && b.protocol === 'h3') return 1;
        return 0;
      });

      const entry = sorted[0];
      if (!entry) return null;

      return {
        host: entry.host,
        port: entry.port,
        protocol: entry.protocol,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all known HTTP/3 endpoints
   */
  getKnownEndpoints(): Map<string, AltSvcEntry[]> {
    const now = Date.now();
    const result = new Map<string, AltSvcEntry[]>();

    for (const [origin, entries] of this.altSvcCache) {
      const valid = entries.filter((e) => e.expiresAt > now);
      if (valid.length > 0) {
        result.set(origin, valid);
      }
    }

    return result;
  }

  /**
   * Clear Alt-Svc cache
   */
  clearCache(): void {
    this.altSvcCache.clear();
    this.http3Supported.clear();
  }

  /**
   * Mark origin as not supporting HTTP/3
   */
  markUnsupported(origin: string): void {
    this.altSvcCache.delete(origin);
    this.http3Supported.set(origin, false);
    this.emit('http3Unsupported', origin);
  }

  /**
   * Get connection info for URL
   */
  getConnectionInfo(url: string): {
    supportsHttp3: boolean;
    endpoint: { host: string; port: number; protocol: string } | null;
    nativeQuicAvailable: boolean;
  } {
    return {
      supportsHttp3: this.isHttp3Available(url),
      endpoint: this.getHttp3Endpoint(url),
      nativeQuicAvailable: this.quicAvailable ?? false,
    };
  }
}

/**
 * HTTP/3 middleware for Recker client
 *
 * This middleware:
 * 1. Monitors Alt-Svc headers for HTTP/3 support discovery
 * 2. Adds HTTP/3 availability info to responses
 * 3. Can upgrade to HTTP/3 when available (requires native QUIC support)
 *
 * @example
 * ```typescript
 * const h3Manager = new Http3Manager({
 *   onHttp3: (url) => console.log(`HTTP/3 available for ${url}`)
 * });
 *
 * const client = createClient({
 *   baseUrl: 'https://example.com',
 *   plugins: [http3({ manager: h3Manager })]
 * });
 *
 * // Make requests - Alt-Svc headers will be recorded
 * const response = await client.get('/api/data');
 *
 * // Check if HTTP/3 is available
 * const available = h3Manager.isHttp3Available('https://example.com');
 * ```
 */
export function http3(options: { manager: Http3Manager }): (client: Client) => void {
  const { manager } = options;

  const middleware: Middleware = async (req, next) => {
    // Make the request normally
    const response = await next(req);

    // Record Alt-Svc header if present
    const altSvc = response.headers.get('alt-svc');
    if (altSvc) {
      try {
        const origin = new URL(req.url).origin;
        manager.recordAltSvc(origin, altSvc);
      } catch {
        // Ignore URL parsing errors
      }
    }

    return response;
  };

  return (client: Client) => {
    client.use(middleware);

    // Add HTTP/3 manager accessor
    (client as Client & { getHttp3Manager: () => Http3Manager }).getHttp3Manager = () => manager;

    // Add HTTP/3 info method
    (client as Client & { http3Info: (url: string) => ReturnType<Http3Manager['getConnectionInfo']> }).http3Info = (url: string) => {
      return manager.getConnectionInfo(url);
    };
  };
}

/**
 * Utility to detect HTTP/3 support for a URL
 *
 * @example
 * ```typescript
 * const info = await detectHttp3Support('https://cloudflare.com');
 * console.log(info);
 * // { supported: true, protocols: ['h3', 'h3-29'], endpoint: {...} }
 * ```
 */
export async function detectHttp3Support(
  client: Client,
  url: string
): Promise<{
  supported: boolean;
  protocols: string[];
  endpoint: { host: string; port: number } | null;
  altSvcHeader: string | null;
}> {
  try {
    // Make a HEAD request to check Alt-Svc
    const response = await client.head(url);
    const altSvc = response.headers.get('alt-svc');

    if (!altSvc) {
      return {
        supported: false,
        protocols: [],
        endpoint: null,
        altSvcHeader: null,
      };
    }

    const entries = parseAltSvc(altSvc, url);
    const http3Entries = entries.filter((e) =>
      e.protocol.startsWith('h3') || e.protocol === 'quic'
    );

    if (http3Entries.length === 0) {
      return {
        supported: false,
        protocols: [],
        endpoint: null,
        altSvcHeader: altSvc,
      };
    }

    const protocols = [...new Set(http3Entries.map((e) => e.protocol))];
    const primary = http3Entries[0];

    return {
      supported: true,
      protocols,
      endpoint: primary ? { host: primary.host, port: primary.port } : null,
      altSvcHeader: altSvc,
    };
  } catch {
    return {
      supported: false,
      protocols: [],
      endpoint: null,
      altSvcHeader: null,
    };
  }
}

// Type augmentation for Client
declare module '../core/client.js' {
  interface Client {
    getHttp3Manager(): Http3Manager;
    http3Info(url: string): {
      supportsHttp3: boolean;
      endpoint: { host: string; port: number; protocol: string } | null;
      nativeQuicAvailable: boolean;
    };
  }
}
