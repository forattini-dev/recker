import type { CacheStorage, CacheEntry } from '../types/index.js';

const DB_NAME = 'recker-cache';
const STORE_NAME = 'entries';
const DB_VERSION = 1;

interface StoredItem {
  key: string;
  value: CacheEntry;
  expiresAt: number;
}

/**
 * IndexedDB storage driver for persistent browser caching.
 * Zero-dependency implementation using native API.
 */
export class IndexedDBStorage implements CacheStorage {
  private dbPromise: Promise<IDBDatabase>;

  constructor(dbName: string = DB_NAME) {
    this.dbPromise = this.openDB(dbName);
  }

  private openDB(dbName: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not supported in this environment'));
        return;
      }

      const request = indexedDB.open(dbName, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Create object store with 'key' as primary key
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  async get(key: string): Promise<CacheEntry | undefined | null> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result as StoredItem | undefined;
        if (!result) {
          resolve(null);
          return;
        }

        // Check expiration
        if (result.expiresAt && Date.now() > result.expiresAt) {
          // Lazy delete expired item
          this.delete(key).catch(() => {});
          resolve(null);
          return;
        }

        resolve(result.value);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async set(key: string, value: CacheEntry, ttl: number): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const expiresAt = Date.now() + ttl;
      
      const item: StoredItem = {
        key,
        value,
        expiresAt
      };

      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all entries from the cache
   */
  async clear(): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
