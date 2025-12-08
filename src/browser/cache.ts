/**
 * Browser Cache Storage using IndexedDB
 *
 * Provides persistent caching in the browser using IndexedDB.
 * Compatible with the CacheStorage interface used by Recker plugins.
 */

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt?: number;
  etag?: string;
  lastModified?: string;
}

export interface BrowserCacheOptions {
  /** Database name (default: 'recker-cache') */
  dbName?: string;
  /** Object store name (default: 'responses') */
  storeName?: string;
  /** Default TTL in milliseconds */
  defaultTTL?: number;
  /** Maximum entries to store */
  maxEntries?: number;
}

/**
 * IndexedDB-based cache storage for browsers
 *
 * @example
 * ```typescript
 * const cache = new IndexedDBStorage({ dbName: 'my-app-cache' });
 * await cache.init();
 *
 * // Store a value
 * await cache.set('user:123', { name: 'John' }, 60000); // 60s TTL
 *
 * // Retrieve a value
 * const user = await cache.get('user:123');
 *
 * // Delete a value
 * await cache.delete('user:123');
 *
 * // Clear all
 * await cache.clear();
 * ```
 */
export class IndexedDBStorage {
  private dbName: string;
  private storeName: string;
  private defaultTTL: number;
  private maxEntries: number;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: BrowserCacheOptions = {}) {
    this.dbName = options.dbName ?? 'recker-cache';
    this.storeName = options.storeName ?? 'responses';
    this.defaultTTL = options.defaultTTL ?? 5 * 60 * 1000; // 5 minutes
    this.maxEntries = options.maxEntries ?? 1000;
  }

  /**
   * Initialize the IndexedDB connection
   * Call this before using other methods
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store with key path
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          // Create index for expiration cleanup
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Get a cached entry by key
   */
  async get<T = unknown>(key: string): Promise<CacheEntry<T> | null> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = request.result as CacheEntry<T> | undefined;

        if (!entry) {
          resolve(null);
          return;
        }

        // Check if expired
        if (entry.expiresAt && entry.expiresAt < Date.now()) {
          // Entry expired, delete it asynchronously
          this.delete(key).catch(() => {});
          resolve(null);
          return;
        }

        resolve(entry);
      };
    });
  }

  /**
   * Store a value in the cache
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in milliseconds (optional, uses defaultTTL if not provided)
   */
  async set<T = unknown>(
    key: string,
    value: T,
    ttl?: number,
    metadata?: { etag?: string; lastModified?: string }
  ): Promise<void> {
    await this.init();

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: ttl !== undefined ? Date.now() + ttl : undefined,
      etag: metadata?.etag,
      lastModified: metadata?.lastModified,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();

      // Enforce max entries limit
      transaction.oncomplete = () => {
        this.enforceMaxEntries().catch(() => {});
      };
    });
  }

  /**
   * Delete a cached entry
   */
  async delete(key: string): Promise<boolean> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
    });
  }

  /**
   * Check if a key exists in cache
   */
  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null;
  }

  /**
   * Clear all cached entries
   */
  async clear(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get all keys in the cache
   */
  async keys(): Promise<string[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as string[]);
    });
  }

  /**
   * Get the number of entries in the cache
   */
  async size(): Promise<number> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Remove expired entries
   */
  async cleanup(): Promise<number> {
    await this.init();
    const now = Date.now();
    let removed = 0;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('expiresAt');

      // Get all entries that have expired (expiresAt < now)
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          removed++;
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve(removed);
    });
  }

  /**
   * Enforce maximum entries limit (LRU-like eviction)
   */
  private async enforceMaxEntries(): Promise<void> {
    const currentSize = await this.size();

    if (currentSize <= this.maxEntries) return;

    const toRemove = currentSize - this.maxEntries;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('expiresAt');
      let removed = 0;

      const request = index.openCursor();

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && removed < toRemove) {
          cursor.delete();
          removed++;
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }

  /**
   * Delete the entire database
   */
  async destroy(): Promise<void> {
    this.close();

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

/**
 * Check if IndexedDB is available in the current environment
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Get the best available cache storage for the current environment
 */
export function getBrowserCacheStorage(
  options?: BrowserCacheOptions
): IndexedDBStorage | null {
  if (isIndexedDBAvailable()) {
    return new IndexedDBStorage(options);
  }
  return null;
}
