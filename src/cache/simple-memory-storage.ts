import type { CacheEntry, CacheStorage } from '../types/index.js';

type StoredEntry = {
  value: CacheEntry;
  expiresAt: number;
};

/**
 * Minimal in-memory cache storage for browser-safe defaults.
 * Uses TTL-based eviction only (no size limits or compression).
 */
export class SimpleMemoryStorage implements CacheStorage {
  private store = new Map<string, StoredEntry>();

  async get(key: string): Promise<CacheEntry | undefined | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt > 0 && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: CacheEntry, ttl: number): Promise<void> {
    if (!Number.isFinite(ttl) || ttl <= 0) {
      this.store.delete(key);
      return;
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
