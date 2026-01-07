/**
 * Protocol Negotiation Cache
 *
 * Tracks which protocol each origin supports (HTTP/2 vs HTTP/1.1).
 * Enables adaptive pooling and avoids repeated ALPN negotiation overhead.
 *
 * @example
 * ```typescript
 * const cache = new ProtocolCache();
 *
 * // After first request, protocol is detected
 * cache.set('https://api.example.com', 'h2');
 *
 * // Future requests can check before connecting
 * const protocol = cache.get('https://api.example.com'); // 'h2'
 * ```
 */

export type DetectedProtocol = 'h2' | 'http/1.1' | 'h3';

export interface ProtocolCacheEntry {
  /** Detected protocol */
  protocol: DetectedProtocol;

  /** When the protocol was detected */
  detectedAt: number;

  /** Number of successful requests with this protocol */
  successCount: number;

  /** Number of failed requests (for adaptive fallback) */
  failureCount: number;

  /** Whether HTTP/2 was explicitly rejected by server */
  http2Rejected?: boolean;
}

export interface ProtocolCacheOptions {
  /**
   * TTL for cache entries in milliseconds
   * @default 3600000 (1 hour)
   */
  ttl?: number;

  /**
   * Maximum number of origins to cache
   * @default 1000
   */
  maxSize?: number;

  /**
   * Failure threshold before marking origin as problematic
   * @default 3
   */
  failureThreshold?: number;
}

/**
 * Extract origin from URL (protocol + host + port)
 */
export function extractOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}

/**
 * Normalize protocol string to DetectedProtocol
 */
export function normalizeProtocol(protocol: string | undefined): DetectedProtocol | undefined {
  if (!protocol) return undefined;

  const lower = protocol.toLowerCase();
  if (lower === 'h2' || lower === 'http/2' || lower === 'http/2.0') {
    return 'h2';
  }
  if (lower === 'h3' || lower.startsWith('h3-')) {
    return 'h3';
  }
  if (lower === 'http/1.1' || lower === 'http/1.0' || lower === 'http') {
    return 'http/1.1';
  }
  return undefined;
}

/**
 * Protocol Negotiation Cache
 *
 * Thread-safe cache for storing detected protocols per origin.
 * Uses LRU eviction when max size is reached.
 */
export class ProtocolCache {
  private cache: Map<string, ProtocolCacheEntry>;
  private options: Required<ProtocolCacheOptions>;

  constructor(options: ProtocolCacheOptions = {}) {
    this.cache = new Map();
    this.options = {
      ttl: options.ttl ?? 60 * 60 * 1000, // 1 hour
      maxSize: options.maxSize ?? 1000,
      failureThreshold: options.failureThreshold ?? 3,
    };
  }

  /**
   * Get cached protocol for an origin
   * Returns undefined if not cached or expired
   */
  get(urlOrOrigin: string): DetectedProtocol | undefined {
    const origin = extractOrigin(urlOrOrigin);
    const entry = this.cache.get(origin);

    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.detectedAt > this.options.ttl) {
      this.cache.delete(origin);
      return undefined;
    }

    return entry.protocol;
  }

  /**
   * Get full cache entry for an origin
   */
  getEntry(urlOrOrigin: string): ProtocolCacheEntry | undefined {
    const origin = extractOrigin(urlOrOrigin);
    const entry = this.cache.get(origin);

    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.detectedAt > this.options.ttl) {
      this.cache.delete(origin);
      return undefined;
    }

    return entry;
  }

  /**
   * Set detected protocol for an origin
   */
  set(urlOrOrigin: string, protocol: DetectedProtocol | string): void {
    const origin = extractOrigin(urlOrOrigin);
    const normalized = normalizeProtocol(protocol as string) ?? (protocol as DetectedProtocol);

    // LRU eviction if at max size
    if (this.cache.size >= this.options.maxSize && !this.cache.has(origin)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const existing = this.cache.get(origin);

    this.cache.set(origin, {
      protocol: normalized,
      detectedAt: Date.now(),
      successCount: (existing?.successCount ?? 0) + 1,
      failureCount: existing?.failureCount ?? 0,
      http2Rejected: existing?.http2Rejected,
    });

    // Move to end for LRU (delete and re-add)
    this.cache.delete(origin);
    this.cache.set(origin, this.cache.get(origin) ?? {
      protocol: normalized,
      detectedAt: Date.now(),
      successCount: 1,
      failureCount: 0,
    });
  }

  /**
   * Record a successful request for an origin
   */
  recordSuccess(urlOrOrigin: string): void {
    const origin = extractOrigin(urlOrOrigin);
    const entry = this.cache.get(origin);

    if (entry) {
      entry.successCount++;
      entry.failureCount = Math.max(0, entry.failureCount - 1); // Decay failures on success
    }
  }

  /**
   * Record a failed request for an origin
   * Returns true if the origin should be marked as problematic
   */
  recordFailure(urlOrOrigin: string, isHttp2Error: boolean = false): boolean {
    const origin = extractOrigin(urlOrOrigin);
    const entry = this.cache.get(origin);

    if (entry) {
      entry.failureCount++;

      if (isHttp2Error) {
        entry.http2Rejected = true;
      }

      return entry.failureCount >= this.options.failureThreshold;
    }

    return false;
  }

  /**
   * Check if an origin has been marked as having HTTP/2 issues
   */
  hasHttp2Issues(urlOrOrigin: string): boolean {
    const entry = this.getEntry(urlOrOrigin);
    if (!entry) return false;

    return entry.http2Rejected === true ||
      (entry.protocol === 'http/1.1' && entry.failureCount >= this.options.failureThreshold);
  }

  /**
   * Check if we should try HTTP/2 for an origin
   * Returns false if the origin has known HTTP/2 issues
   */
  shouldTryHttp2(urlOrOrigin: string): boolean {
    const entry = this.getEntry(urlOrOrigin);

    // No entry = try HTTP/2 (optimistic)
    if (!entry) return true;

    // Known HTTP/2 issues = don't try
    if (entry.http2Rejected) return false;

    // Already using HTTP/2 successfully = yes
    if (entry.protocol === 'h2' || entry.protocol === 'h3') return true;

    // Using HTTP/1.1 with failures = don't upgrade
    if (entry.failureCount >= this.options.failureThreshold) return false;

    // Default: try HTTP/2
    return true;
  }

  /**
   * Delete cached protocol for an origin
   */
  delete(urlOrOrigin: string): boolean {
    const origin = extractOrigin(urlOrOrigin);
    return this.cache.delete(origin);
  }

  /**
   * Clear all cached protocols
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    origins: string[];
    http2Origins: string[];
    http1Origins: string[];
    problematicOrigins: string[];
  } {
    const http2Origins: string[] = [];
    const http1Origins: string[] = [];
    const problematicOrigins: string[] = [];

    for (const [origin, entry] of this.cache.entries()) {
      if (entry.protocol === 'h2' || entry.protocol === 'h3') {
        http2Origins.push(origin);
      } else {
        http1Origins.push(origin);
      }

      if (entry.http2Rejected || entry.failureCount >= this.options.failureThreshold) {
        problematicOrigins.push(origin);
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      origins: Array.from(this.cache.keys()),
      http2Origins,
      http1Origins,
      problematicOrigins,
    };
  }

  /**
   * Export cache as JSON (for persistence)
   */
  toJSON(): Record<string, ProtocolCacheEntry> {
    const result: Record<string, ProtocolCacheEntry> = {};
    for (const [origin, entry] of this.cache.entries()) {
      result[origin] = entry;
    }
    return result;
  }

  /**
   * Import cache from JSON (for persistence)
   */
  fromJSON(data: Record<string, ProtocolCacheEntry>): void {
    const now = Date.now();
    for (const [origin, entry] of Object.entries(data)) {
      // Skip expired entries
      if (now - entry.detectedAt <= this.options.ttl) {
        this.cache.set(origin, entry);
      }
    }
  }
}

/**
 * Global shared protocol cache instance
 * Used by default when no custom cache is provided
 */
let globalProtocolCache: ProtocolCache | null = null;

/**
 * Get the global protocol cache instance
 */
export function getGlobalProtocolCache(): ProtocolCache {
  if (!globalProtocolCache) {
    globalProtocolCache = new ProtocolCache();
  }
  return globalProtocolCache;
}

/**
 * Reset the global protocol cache (useful for testing)
 */
export function resetGlobalProtocolCache(): void {
  globalProtocolCache = null;
}
