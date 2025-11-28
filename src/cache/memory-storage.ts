import { CacheEntry, CacheStorage } from '../types/index.js';

export class MemoryStorage implements CacheStorage {
  private storage = new Map<string, CacheEntry>();
  private ttls = new Map<string, number>();

  async get(key: string): Promise<CacheEntry | undefined> {
    const entry = this.storage.get(key);
    if (!entry) return undefined;

    const expiry = this.ttls.get(key);
    if (expiry && Date.now() > expiry) {
      this.delete(key);
      return undefined;
    }

    return entry;
  }

  async set(key: string, entry: CacheEntry, ttl?: number): Promise<void> {
    this.storage.set(key, entry);
    if (ttl) {
      this.ttls.set(key, Date.now() + ttl);
    }
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
    this.ttls.delete(key);
  }
  
  // Helper for testing
  clear() {
    this.storage.clear();
    this.ttls.clear();
  }
}
