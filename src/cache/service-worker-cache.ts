import type { CacheStorage, CacheEntry } from '../types/index.js';

const CACHE_NAME = 'recker-cache-v1';

interface StoredCacheItem {
  entry: CacheEntry;
  expiresAt: number;
}

/**
 * Service Worker Cache API storage driver.
 *
 * Uses the browser's Cache API for persistent HTTP caching.
 * This cache survives page reloads and browser restarts.
 *
 * @example
 * ```typescript
 * import { ServiceWorkerCache } from 'recker/browser';
 * import { cache } from 'recker/plugins';
 *
 * const storage = new ServiceWorkerCache({ cacheName: 'my-app-cache' });
 * client.use(cache({ storage }));
 * ```
 *
 * @note This API works in browsers and Service Workers.
 *       Does NOT require an active Service Worker to function.
 */
export class ServiceWorkerCache implements CacheStorage {
  private cacheName: string;
  private cachePromise: Promise<Cache> | null = null;

  constructor(options: { cacheName?: string } = {}) {
    this.cacheName = options.cacheName || CACHE_NAME;
  }

  /**
   * Check if Cache API is available in this environment
   */
  static isSupported(): boolean {
    return typeof caches !== 'undefined';
  }

  private async getCache(): Promise<Cache> {
    if (!this.cachePromise) {
      if (!ServiceWorkerCache.isSupported()) {
        throw new Error('Cache API is not supported in this environment');
      }
      this.cachePromise = caches.open(this.cacheName);
    }
    return this.cachePromise;
  }

  /**
   * Create a synthetic URL for the cache key
   * Cache API requires Request/Response objects
   */
  private keyToUrl(key: string): string {
    // Use a data URL scheme to avoid potential conflicts with real URLs
    return `https://recker-cache.local/${encodeURIComponent(key)}`;
  }

  async get(key: string): Promise<CacheEntry | undefined | null> {
    try {
      const cache = await this.getCache();
      const url = this.keyToUrl(key);
      const response = await cache.match(url);

      if (!response) {
        return null;
      }

      const data: StoredCacheItem = await response.json();

      // Check expiration
      if (data.expiresAt && Date.now() > data.expiresAt) {
        // Lazy delete expired item
        this.delete(key).catch(() => {});
        return null;
      }

      return data.entry;
    } catch {
      return null;
    }
  }

  async set(key: string, value: CacheEntry, ttl: number): Promise<void> {
    const cache = await this.getCache();
    const url = this.keyToUrl(key);

    const item: StoredCacheItem = {
      entry: value,
      expiresAt: Date.now() + ttl,
    };

    // Create a synthetic Response to store in the cache
    const response = new Response(JSON.stringify(item), {
      headers: {
        'Content-Type': 'application/json',
        'X-Recker-Cache': 'true',
        'X-Recker-Expires': String(item.expiresAt),
      },
    });

    await cache.put(url, response);
  }

  async delete(key: string): Promise<void> {
    const cache = await this.getCache();
    const url = this.keyToUrl(key);
    await cache.delete(url);
  }

  /**
   * Clear all entries from this cache
   */
  async clear(): Promise<void> {
    await caches.delete(this.cacheName);
    // Reset the cache promise so it will be recreated on next access
    this.cachePromise = null;
  }

  /**
   * Get all cached keys (useful for debugging)
   */
  async keys(): Promise<string[]> {
    const cache = await this.getCache();
    const requests = await cache.keys();

    return requests
      .map((req) => {
        const url = new URL(req.url);
        return decodeURIComponent(url.pathname.slice(1));
      })
      .filter((key) => key.length > 0);
  }

  /**
   * Get cache size estimate (number of entries)
   */
  async size(): Promise<number> {
    const keys = await this.keys();
    return keys.length;
  }

  /**
   * Remove expired entries (manual garbage collection)
   */
  async prune(): Promise<number> {
    const cache = await this.getCache();
    const requests = await cache.keys();
    let removed = 0;

    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        try {
          const data: StoredCacheItem = await response.json();
          if (data.expiresAt && Date.now() > data.expiresAt) {
            await cache.delete(request);
            removed++;
          }
        } catch {
          // Invalid entry, remove it
          await cache.delete(request);
          removed++;
        }
      }
    }

    return removed;
  }
}
