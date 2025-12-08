import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexedDBStorage } from '../../src/browser/cache.js';

// Skip IndexedDB tests in environments that don't support it (like happy-dom)
const hasIndexedDB = typeof globalThis.indexedDB !== 'undefined';

describe.skipIf(!hasIndexedDB)('IndexedDBStorage', () => {
  let storage: IndexedDBStorage;

  beforeEach(async () => {
    storage = new IndexedDBStorage({
      dbName: 'recker-test-cache',
      maxEntries: 100,
      ttl: 60000,
    });
    await storage.init();
  });

  afterEach(async () => {
    await storage.clear();
    await storage.destroy();
  });

  describe('basic operations', () => {
    it('should store and retrieve values', async () => {
      await storage.set('key1', { data: 'value1' });
      const result = await storage.get('key1');
      expect(result?.data).toBe('value1');
    });

    it('should return null for non-existent keys', async () => {
      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should check if key exists', async () => {
      await storage.set('exists', { data: 'test' });
      expect(await storage.has('exists')).toBe(true);
      expect(await storage.has('missing')).toBe(false);
    });

    it('should delete keys', async () => {
      await storage.set('toDelete', { data: 'test' });
      expect(await storage.has('toDelete')).toBe(true);

      await storage.delete('toDelete');
      expect(await storage.has('toDelete')).toBe(false);
    });

    it('should clear all entries', async () => {
      await storage.set('key1', { data: 'value1' });
      await storage.set('key2', { data: 'value2' });

      await storage.clear();

      expect(await storage.has('key1')).toBe(false);
      expect(await storage.has('key2')).toBe(false);
    });
  });

  describe('TTL', () => {
    it('should expire entries after TTL', async () => {
      const shortTTLStorage = new IndexedDBStorage({
        dbName: 'recker-test-cache-ttl',
        ttl: 50, // 50ms TTL
      });
      await shortTTLStorage.init();

      await shortTTLStorage.set('expiring', { data: 'test' });

      // Should exist immediately
      expect(await shortTTLStorage.has('expiring')).toBe(true);

      // Wait for TTL to pass
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should be expired now
      expect(await shortTTLStorage.get('expiring')).toBeNull();

      await shortTTLStorage.destroy();
    });
  });

  describe('keys and size', () => {
    it('should return all keys', async () => {
      await storage.set('a', { data: '1' });
      await storage.set('b', { data: '2' });
      await storage.set('c', { data: '3' });

      const keys = await storage.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
    });

    it('should return correct size', async () => {
      expect(await storage.size()).toBe(0);

      await storage.set('a', { data: '1' });
      expect(await storage.size()).toBe(1);

      await storage.set('b', { data: '2' });
      expect(await storage.size()).toBe(2);
    });
  });
});
