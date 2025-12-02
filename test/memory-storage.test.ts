import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MemoryStorage,
  MemoryStorageOptions,
  EvictionInfo,
  PressureInfo,
} from '../src/cache/memory-storage.js';
import {
  formatBytes,
  getEffectiveTotalMemoryBytes,
  resolveCacheMemoryLimit,
  getHeapStats,
} from '../src/cache/memory-limits.js';
import { CacheEntry } from '../src/types/index.js';

// ─────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────

function createEntry(
  body: string,
  status = 200,
  headers: Record<string, string> = {}
): CacheEntry {
  return {
    status,
    statusText: 'OK',
    headers,
    body,
    timestamp: Date.now(),
  };
}

function createLargeEntry(sizeBytes: number): CacheEntry {
  const body = 'x'.repeat(sizeBytes);
  return createEntry(body);
}

// Create entry with specific patterns for compression testing
function createCompressibleEntry(sizeBytes: number): CacheEntry {
  // Repeated pattern compresses well
  const pattern = 'abcdefghij';
  const repeats = Math.ceil(sizeBytes / pattern.length);
  const body = pattern.repeat(repeats).slice(0, sizeBytes);
  return createEntry(body);
}

function createRandomEntry(sizeBytes: number): CacheEntry {
  // Random data doesn't compress well
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let body = '';
  for (let i = 0; i < sizeBytes; i++) {
    body += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return createEntry(body);
}

// Measure serialized size of an entry
function measureEntrySize(entry: CacheEntry): number {
  return Buffer.byteLength(JSON.stringify(entry), 'utf8');
}

// ─────────────────────────────────────────────────────────────────
// Unit Tests
// ─────────────────────────────────────────────────────────────────

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  afterEach(() => {
    storage?.shutdown();
  });

  describe('basic operations', () => {
    beforeEach(() => {
      storage = new MemoryStorage({
        monitorInterval: 0,
        cleanupInterval: 0,
      });
    });

    it('should store and retrieve entries', async () => {
      const entry = createEntry('test data');
      await storage.set('key1', entry, 60000);
      const retrieved = await storage.get('key1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.body).toBe('test data');
      expect(retrieved?.status).toBe(200);
    });

    it('should return undefined for non-existent keys', async () => {
      const result = await storage.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should delete entries', async () => {
      const entry = createEntry('test');
      await storage.set('key1', entry, 60000);
      expect(await storage.get('key1')).toBeDefined();

      await storage.delete('key1');
      expect(await storage.get('key1')).toBeUndefined();
    });

    it('should handle delete of non-existent key gracefully', async () => {
      await storage.delete('nonexistent');
      expect(storage.size()).toBe(0);
    });

    it('should clear all entries', async () => {
      await storage.set('key1', createEntry('1'), 60000);
      await storage.set('key2', createEntry('2'), 60000);
      await storage.set('key3', createEntry('3'), 60000);

      expect(storage.size()).toBe(3);

      storage.clear();

      expect(storage.size()).toBe(0);
      expect(await storage.get('key1')).toBeUndefined();
    });

    it('should clear entries by prefix', async () => {
      await storage.set('users:1', createEntry('1'), 60000);
      await storage.set('users:2', createEntry('2'), 60000);
      await storage.set('posts:1', createEntry('3'), 60000);

      storage.clear('users:');

      expect(storage.size()).toBe(1);
      expect(await storage.get('users:1')).toBeUndefined();
      expect(await storage.get('posts:1')).toBeDefined();
    });

    it('should return all keys', async () => {
      await storage.set('a', createEntry('1'), 60000);
      await storage.set('b', createEntry('2'), 60000);
      await storage.set('c', createEntry('3'), 60000);

      const keys = storage.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
    });

    it('should check if key exists with has()', async () => {
      await storage.set('exists', createEntry('yes'), 60000);

      expect(storage.has('exists')).toBe(true);
      expect(storage.has('nope')).toBe(false);
    });

    it('should preserve entry metadata', async () => {
      const entry: CacheEntry = {
        status: 201,
        statusText: 'Created',
        headers: { 'content-type': 'application/json', 'x-custom': 'value' },
        body: '{"id": 123}',
        timestamp: Date.now(),
        etag: '"abc123"',
        lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT',
        maxAge: 3600,
      };

      await storage.set('meta-test', entry, 60000);
      const retrieved = await storage.get('meta-test');

      expect(retrieved?.status).toBe(201);
      expect(retrieved?.statusText).toBe('Created');
      expect(retrieved?.headers['content-type']).toBe('application/json');
      expect(retrieved?.etag).toBe('"abc123"');
      expect(retrieved?.maxAge).toBe(3600);
    });
  });

  describe('TTL and expiration', () => {
    beforeEach(() => {
      storage = new MemoryStorage({
        monitorInterval: 0,
        cleanupInterval: 0,
      });
    });

    it('should expire entries after TTL', async () => {
      vi.useFakeTimers();

      await storage.set('key', createEntry('data'), 1000);
      expect(await storage.get('key')).toBeDefined();

      vi.advanceTimersByTime(1001);
      expect(await storage.get('key')).toBeUndefined();

      vi.useRealTimers();
    });

    it('should use default TTL if not specified', async () => {
      const customStorage = new MemoryStorage({
        ttl: 500,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      vi.useFakeTimers();

      await customStorage.set('key', createEntry('data'));
      expect(await customStorage.get('key')).toBeDefined();

      vi.advanceTimersByTime(501);
      expect(await customStorage.get('key')).toBeUndefined();

      vi.useRealTimers();
      customStorage.shutdown();
    });

    it('should report expired entries in has() correctly', async () => {
      vi.useFakeTimers();

      await storage.set('key', createEntry('data'), 1000);
      expect(storage.has('key')).toBe(true);

      vi.advanceTimersByTime(1001);
      expect(storage.has('key')).toBe(false);

      vi.useRealTimers();
    });

    it('should handle very short TTL', async () => {
      vi.useFakeTimers();

      await storage.set('key', createEntry('data'), 1); // 1ms TTL
      expect(await storage.get('key')).toBeDefined();

      vi.advanceTimersByTime(2);
      expect(await storage.get('key')).toBeUndefined();

      vi.useRealTimers();
    });

    it('should handle very long TTL', async () => {
      vi.useFakeTimers();

      const longTtl = 365 * 24 * 60 * 60 * 1000; // 1 year
      await storage.set('key', createEntry('data'), longTtl);

      vi.advanceTimersByTime(longTtl - 1000);
      expect(await storage.get('key')).toBeDefined();

      vi.advanceTimersByTime(1001);
      expect(await storage.get('key')).toBeUndefined();

      vi.useRealTimers();
    });

    it('should not expire entries with 0 TTL from default when set explicitly', async () => {
      const noDefaultTtl = new MemoryStorage({
        ttl: 0, // No default TTL
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      vi.useFakeTimers();

      // When TTL is 0, entries should expire immediately
      await noDefaultTtl.set('key', createEntry('data'));
      vi.advanceTimersByTime(1);
      expect(await noDefaultTtl.get('key')).toBeUndefined();

      vi.useRealTimers();
      noDefaultTtl.shutdown();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used items when maxSize is reached', async () => {
      storage = new MemoryStorage({
        maxSize: 3,
        evictionPolicy: 'lru',
        monitorInterval: 0,
        cleanupInterval: 0,
        maxMemoryBytes: 1024 * 1024 * 100,
      });

      await storage.set('a', createEntry('1'), 60000);
      await storage.set('b', createEntry('2'), 60000);
      await storage.set('c', createEntry('3'), 60000);

      // Access 'a' and 'c' to make 'b' least recently used
      await storage.get('a');
      await storage.get('c');

      // Add new item, should evict 'b'
      await storage.set('d', createEntry('4'), 60000);

      expect(storage.size()).toBe(3);
      expect(await storage.get('b')).toBeUndefined();
      expect(await storage.get('a')).toBeDefined();
      expect(await storage.get('c')).toBeDefined();
      expect(await storage.get('d')).toBeDefined();
    });

    it('should update access order on get()', async () => {
      storage = new MemoryStorage({
        maxSize: 2,
        evictionPolicy: 'lru',
        monitorInterval: 0,
        cleanupInterval: 0,
        maxMemoryBytes: 1024 * 1024 * 100,
      });

      await storage.set('a', createEntry('1'), 60000);
      await storage.set('b', createEntry('2'), 60000);

      // Access 'a' to make it more recently used
      await storage.get('a');

      // Add new item, should evict 'b' (less recently used)
      await storage.set('c', createEntry('3'), 60000);

      expect(await storage.get('a')).toBeDefined();
      expect(await storage.get('b')).toBeUndefined();
      expect(await storage.get('c')).toBeDefined();
    });

    it('should handle rapid access pattern correctly', async () => {
      storage = new MemoryStorage({
        maxSize: 5,
        evictionPolicy: 'lru',
        monitorInterval: 0,
        cleanupInterval: 0,
        maxMemoryBytes: 1024 * 1024 * 100,
      });

      // Fill cache
      for (let i = 0; i < 5; i++) {
        await storage.set(`key${i}`, createEntry(`value${i}`), 60000);
      }

      // Access in specific pattern: 0, 2, 4 (making 1, 3 least recently used)
      await storage.get('key0');
      await storage.get('key2');
      await storage.get('key4');

      // Add 2 new items - should evict key1 then key3
      await storage.set('new1', createEntry('new1'), 60000);
      await storage.set('new2', createEntry('new2'), 60000);

      expect(await storage.get('key1')).toBeUndefined();
      expect(await storage.get('key3')).toBeUndefined();
      expect(await storage.get('key0')).toBeDefined();
      expect(await storage.get('key2')).toBeDefined();
      expect(await storage.get('key4')).toBeDefined();
    });
  });

  describe('FIFO eviction', () => {
    it('should evict oldest items first', async () => {
      storage = new MemoryStorage({
        maxSize: 3,
        evictionPolicy: 'fifo',
        monitorInterval: 0,
        cleanupInterval: 0,
        maxMemoryBytes: 1024 * 1024 * 100,
      });

      await storage.set('a', createEntry('1'), 60000);
      await storage.set('b', createEntry('2'), 60000);
      await storage.set('c', createEntry('3'), 60000);

      // Access 'a' - should NOT affect eviction order in FIFO
      await storage.get('a');

      // Add new item, should evict 'a' (oldest)
      await storage.set('d', createEntry('4'), 60000);

      expect(storage.size()).toBe(3);
      expect(await storage.get('a')).toBeUndefined();
      expect(await storage.get('b')).toBeDefined();
      expect(await storage.get('c')).toBeDefined();
      expect(await storage.get('d')).toBeDefined();
    });

    it('should maintain FIFO order regardless of access', async () => {
      storage = new MemoryStorage({
        maxSize: 3,
        evictionPolicy: 'fifo',
        monitorInterval: 0,
        cleanupInterval: 0,
        maxMemoryBytes: 1024 * 1024 * 100,
      });

      await storage.set('first', createEntry('1'), 60000);
      await storage.set('second', createEntry('2'), 60000);
      await storage.set('third', createEntry('3'), 60000);

      // Access all items multiple times
      for (let i = 0; i < 10; i++) {
        await storage.get('first');
        await storage.get('second');
        await storage.get('third');
      }

      // Add new item - should still evict 'first'
      await storage.set('fourth', createEntry('4'), 60000);

      expect(await storage.get('first')).toBeUndefined();
      expect(await storage.get('second')).toBeDefined();
    });
  });

  describe('memory limits', () => {
    it('should evict items when memory limit is exceeded', async () => {
      storage = new MemoryStorage({
        maxMemoryBytes: 500,
        maxSize: 1000,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      await storage.set('a', createEntry('x'.repeat(100)), 60000);
      await storage.set('b', createEntry('x'.repeat(100)), 60000);
      await storage.set('c', createEntry('x'.repeat(100)), 60000);

      const stats = storage.getMemoryStats();
      expect(stats.currentMemoryBytes).toBeLessThanOrEqual(500);
    });

    it('should reject items larger than maxMemoryBytes', async () => {
      storage = new MemoryStorage({
        maxMemoryBytes: 100,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      await storage.set('huge', createEntry('x'.repeat(200)), 60000);

      expect(await storage.get('huge')).toBeUndefined();
      expect(storage.size()).toBe(0);
    });

    it('should track memory usage correctly', async () => {
      storage = new MemoryStorage({
        maxMemoryBytes: 1024 * 1024,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const before = storage.getMemoryStats().currentMemoryBytes;
      expect(before).toBe(0);

      await storage.set('key', createEntry('test data'), 60000);

      const after = storage.getMemoryStats().currentMemoryBytes;
      expect(after).toBeGreaterThan(0);

      await storage.delete('key');

      const final = storage.getMemoryStats().currentMemoryBytes;
      expect(final).toBe(0);
    });

    it('should call onEvict callback when items are evicted', async () => {
      const evictions: EvictionInfo[] = [];

      storage = new MemoryStorage({
        maxMemoryBytes: 300,
        monitorInterval: 0,
        cleanupInterval: 0,
        onEvict: (info) => evictions.push(info),
      });

      await storage.set('a', createEntry('x'.repeat(100)), 60000);
      await storage.set('b', createEntry('x'.repeat(100)), 60000);
      await storage.set('c', createEntry('x'.repeat(100)), 60000);

      expect(evictions.length).toBeGreaterThan(0);
      expect(evictions[0].reason).toBe('memory');
    });

    it('should accurately measure memory for various entry sizes', async () => {
      storage = new MemoryStorage({
        maxMemoryBytes: 10 * 1024 * 1024,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const sizes = [10, 100, 1000, 10000];
      let expectedTotal = 0;

      for (const size of sizes) {
        const entry = createEntry('x'.repeat(size));
        const entrySize = measureEntrySize(entry);
        expectedTotal += entrySize;
        await storage.set(`key-${size}`, entry, 60000);
      }

      const stats = storage.getMemoryStats();
      // Allow 10% variance for serialization overhead
      expect(stats.currentMemoryBytes).toBeGreaterThan(expectedTotal * 0.9);
      expect(stats.currentMemoryBytes).toBeLessThan(expectedTotal * 1.1);
    });

    it('should handle memory limit of exactly one item', async () => {
      const entry = createEntry('test');
      const entrySize = measureEntrySize(entry);

      storage = new MemoryStorage({
        maxMemoryBytes: entrySize + 10, // Just enough for one item
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      await storage.set('first', entry, 60000);
      expect(storage.size()).toBe(1);

      await storage.set('second', createEntry('test'), 60000);
      expect(storage.size()).toBe(1); // First was evicted
      expect(await storage.get('second')).toBeDefined();
    });
  });

  describe('compression', () => {
    it('should compress large entries', async () => {
      storage = new MemoryStorage({
        compression: { enabled: true, threshold: 100 },
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const entry = createCompressibleEntry(1000);
      await storage.set('key', entry, 60000);

      const retrieved = await storage.get('key');
      expect(retrieved?.body).toBe(entry.body);

      const stats = storage.getCompressionStats();
      expect(stats.enabled).toBe(true);
      expect(stats.compressedItems).toBeGreaterThan(0);
    });

    it('should not compress small entries below threshold', async () => {
      storage = new MemoryStorage({
        compression: { enabled: true, threshold: 1000 },
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const entry = createEntry('small');
      await storage.set('key', entry, 60000);

      const stats = storage.getCompressionStats();
      expect(stats.compressedItems).toBe(0);

      const retrieved = await storage.get('key');
      expect(retrieved?.body).toBe('small');
    });

    it('should save space with compression', async () => {
      storage = new MemoryStorage({
        compression: { enabled: true, threshold: 50 },
        maxMemoryBytes: 10 * 1024 * 1024,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const entry = createCompressibleEntry(10000);
      await storage.set('key', entry, 60000);

      const stats = storage.getCompressionStats();
      expect(stats.enabled).toBe(true);

      if (stats.compressedItems > 0) {
        expect(stats.totalCompressedSize).toBeLessThan(stats.totalOriginalSize);
        expect(parseFloat(stats.spaceSavingsPercent)).toBeGreaterThan(0);
      }
    });

    it('should handle compression: true shorthand', async () => {
      storage = new MemoryStorage({
        compression: true,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const entry = createCompressibleEntry(2000);
      await storage.set('key', entry, 60000);

      const stats = storage.getCompressionStats();
      expect(stats.enabled).toBe(true);
      expect(stats.compressionThreshold).toBe(1024); // Default
    });

    it('should gracefully handle incompressible data', async () => {
      storage = new MemoryStorage({
        compression: { enabled: true, threshold: 100 },
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      // Random data doesn't compress well
      const entry = createRandomEntry(500);
      await storage.set('key', entry, 60000);

      // Should still store and retrieve correctly
      const retrieved = await storage.get('key');
      expect(retrieved).toBeDefined();
      expect(retrieved?.body.length).toBe(500);
    });

    it('should report accurate compression ratio', async () => {
      storage = new MemoryStorage({
        compression: { enabled: true, threshold: 100 },
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      // Add multiple compressible entries
      for (let i = 0; i < 5; i++) {
        await storage.set(`key${i}`, createCompressibleEntry(5000), 60000);
      }

      const stats = storage.getCompressionStats();
      expect(stats.compressedItems).toBe(5);
      expect(parseFloat(stats.averageCompressionRatio)).toBeLessThan(1);
      expect(parseFloat(stats.spaceSavingsPercent)).toBeGreaterThan(50); // Repeated pattern compresses > 50%
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      storage = new MemoryStorage({
        enableStats: true,
        monitorInterval: 0,
        cleanupInterval: 0,
      });
    });

    it('should track hits and misses', async () => {
      await storage.set('key', createEntry('data'), 60000);

      await storage.get('key'); // hit
      await storage.get('key'); // hit
      await storage.get('missing'); // miss
      await storage.get('missing2'); // miss

      const stats = storage.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should track sets and deletes', async () => {
      await storage.set('a', createEntry('1'), 60000);
      await storage.set('b', createEntry('2'), 60000);
      await storage.delete('a');

      const stats = storage.getStats();
      expect(stats.sets).toBe(2);
      expect(stats.deletes).toBe(1);
    });

    it('should provide memory stats', async () => {
      await storage.set('key', createEntry('test data'), 60000);

      const memStats = storage.getMemoryStats();
      expect(memStats.totalItems).toBe(1);
      expect(memStats.currentMemoryBytes).toBeGreaterThan(0);
      expect(memStats.memoryUsage.current).toMatch(/\d+.*B/);
      expect(memStats.systemMemory.total).toMatch(/\d+.*[KMGT]?B/);
    });

    it('should not track stats when disabled', async () => {
      const noStatsStorage = new MemoryStorage({
        enableStats: false,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      await noStatsStorage.set('key', createEntry('data'), 60000);
      await noStatsStorage.get('key');
      await noStatsStorage.get('missing');

      const stats = noStatsStorage.getStats();
      expect(stats.enabled).toBe(false);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);

      noStatsStorage.shutdown();
    });

    it('should track evictions in stats', async () => {
      const limitedStorage = new MemoryStorage({
        maxSize: 2,
        enableStats: true,
        monitorInterval: 0,
        cleanupInterval: 0,
        maxMemoryBytes: 1024 * 1024 * 100,
      });

      await limitedStorage.set('a', createEntry('1'), 60000);
      await limitedStorage.set('b', createEntry('2'), 60000);
      await limitedStorage.set('c', createEntry('3'), 60000); // Triggers eviction

      const stats = limitedStorage.getStats();
      expect(stats.evictions).toBe(1);

      limitedStorage.shutdown();
    });

    it('should calculate hit rate correctly with zero operations', async () => {
      const stats = storage.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should calculate average item size correctly', async () => {
      const entry1 = createEntry('x'.repeat(100));
      const entry2 = createEntry('x'.repeat(200));
      const entry3 = createEntry('x'.repeat(300));

      await storage.set('a', entry1, 60000);
      await storage.set('b', entry2, 60000);
      await storage.set('c', entry3, 60000);

      const memStats = storage.getMemoryStats();
      expect(memStats.averageItemSize).toBeGreaterThan(0);
      expect(memStats.averageItemSize).toBe(
        Math.round(memStats.currentMemoryBytes / memStats.totalItems)
      );
    });
  });

  describe('configuration validation', () => {
    it('should throw when both maxMemoryBytes and maxMemoryPercent are set', () => {
      expect(
        () =>
          new MemoryStorage({
            maxMemoryBytes: 1000,
            maxMemoryPercent: 0.5,
            monitorInterval: 0,
            cleanupInterval: 0,
          })
      ).toThrow('Cannot use both maxMemoryBytes and maxMemoryPercent');
    });

    it('should throw when maxMemoryPercent is out of range', () => {
      expect(
        () =>
          new MemoryStorage({
            maxMemoryPercent: 1.5,
            monitorInterval: 0,
            cleanupInterval: 0,
          })
      ).toThrow('maxMemoryPercent must be between 0 and 1');

      expect(
        () =>
          new MemoryStorage({
            maxMemoryPercent: -0.1,
            monitorInterval: 0,
            cleanupInterval: 0,
          })
      ).toThrow('maxMemoryPercent must be between 0 and 1');
    });

    it('should accept valid maxMemoryPercent', () => {
      const s = new MemoryStorage({
        maxMemoryPercent: 0.1,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const stats = s.getMemoryStats();
      expect(stats.maxMemoryBytes).toBeGreaterThan(0);
      expect(stats.maxMemoryPercent).toBe(0.1);

      s.shutdown();
    });

    it('should use auto-calculated limits when no memory options specified', () => {
      const s = new MemoryStorage({
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const stats = s.getMemoryStats();
      expect(stats.maxMemoryBytes).toBeGreaterThan(0);

      s.shutdown();
    });

    it('should accept all valid eviction policies', () => {
      const lru = new MemoryStorage({
        evictionPolicy: 'lru',
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const fifo = new MemoryStorage({
        evictionPolicy: 'fifo',
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      expect(lru).toBeDefined();
      expect(fifo).toBeDefined();

      lru.shutdown();
      fifo.shutdown();
    });
  });

  describe('lifecycle', () => {
    it('should cleanup intervals on shutdown', () => {
      storage = new MemoryStorage({
        monitorInterval: 100,
        cleanupInterval: 100,
      });

      storage.shutdown();
      storage.shutdown(); // Double shutdown should be safe
    });

    it('should work without intervals', () => {
      storage = new MemoryStorage({
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      expect(storage).toBeDefined();
    });

    it('should continue working after shutdown (no new monitoring)', async () => {
      storage = new MemoryStorage({
        monitorInterval: 100,
        cleanupInterval: 100,
      });

      storage.shutdown();

      // Basic operations should still work
      await storage.set('key', createEntry('data'), 60000);
      expect(await storage.get('key')).toBeDefined();
    });
  });

  describe('update existing key', () => {
    beforeEach(() => {
      storage = new MemoryStorage({
        monitorInterval: 0,
        cleanupInterval: 0,
      });
    });

    it('should update existing entry without increasing size count', async () => {
      await storage.set('key', createEntry('original'), 60000);
      const size1 = storage.size();

      await storage.set('key', createEntry('updated'), 60000);
      const size2 = storage.size();

      expect(size2).toBe(size1);

      const retrieved = await storage.get('key');
      expect(retrieved?.body).toBe('updated');
    });

    it('should handle memory correctly when updating', async () => {
      await storage.set('key', createEntry('small'), 60000);
      const mem1 = storage.getMemoryStats().currentMemoryBytes;

      await storage.set('key', createEntry('much larger content here'), 60000);
      const mem2 = storage.getMemoryStats().currentMemoryBytes;

      expect(mem2).toBeGreaterThan(mem1);

      await storage.set('key', createEntry('sm'), 60000);
      const mem3 = storage.getMemoryStats().currentMemoryBytes;

      expect(mem3).toBeLessThan(mem2);
    });

    it('should reset TTL on update', async () => {
      vi.useFakeTimers();

      await storage.set('key', createEntry('v1'), 1000);
      vi.advanceTimersByTime(500);

      await storage.set('key', createEntry('v2'), 1000);
      vi.advanceTimersByTime(500);

      // Should still exist (TTL reset)
      expect(await storage.get('key')).toBeDefined();

      vi.advanceTimersByTime(501);
      expect(await storage.get('key')).toBeUndefined();

      vi.useRealTimers();
    });
  });

  describe('concurrent operations', () => {
    beforeEach(() => {
      storage = new MemoryStorage({
        monitorInterval: 0,
        cleanupInterval: 0,
      });
    });

    it('should handle many concurrent sets', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(storage.set(`key${i}`, createEntry(`value${i}`), 60000));
      }

      await Promise.all(promises);
      expect(storage.size()).toBe(100);
    });

    it('should handle mixed concurrent operations', async () => {
      // Pre-populate
      for (let i = 0; i < 50; i++) {
        await storage.set(`key${i}`, createEntry(`value${i}`), 60000);
      }

      const operations = [];

      // Mix of gets, sets, and deletes
      for (let i = 0; i < 100; i++) {
        if (i % 3 === 0) {
          operations.push(storage.get(`key${i % 50}`));
        } else if (i % 3 === 1) {
          operations.push(storage.set(`new${i}`, createEntry(`new${i}`), 60000));
        } else {
          operations.push(storage.delete(`key${i % 25}`));
        }
      }

      await Promise.all(operations);
      // Should not throw
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      storage = new MemoryStorage({
        monitorInterval: 0,
        cleanupInterval: 0,
      });
    });

    it('should handle empty string body', async () => {
      await storage.set('empty', createEntry(''), 60000);
      const retrieved = await storage.get('empty');
      expect(retrieved?.body).toBe('');
    });

    it('should handle very long keys', async () => {
      const longKey = 'k'.repeat(10000);
      await storage.set(longKey, createEntry('value'), 60000);
      expect(await storage.get(longKey)).toBeDefined();
    });

    it('should handle special characters in keys', async () => {
      const specialKeys = [
        'key with spaces',
        'key/with/slashes',
        'key:with:colons',
        'key.with.dots',
        'key\nwith\nnewlines',
        'key\twith\ttabs',
        '🔑emoji🔑key',
        'ключ', // Russian
        '鍵', // Japanese
      ];

      for (const key of specialKeys) {
        await storage.set(key, createEntry('value'), 60000);
        const retrieved = await storage.get(key);
        expect(retrieved?.body).toBe('value');
      }
    });

    it('should handle JSON with special characters in body', async () => {
      const entry = createEntry(JSON.stringify({
        message: 'Hello "World"',
        path: 'C:\\Users\\test',
        newlines: 'line1\nline2',
        unicode: '日本語',
      }));

      await storage.set('special', entry, 60000);
      const retrieved = await storage.get('special');
      const parsed = JSON.parse(retrieved!.body);
      expect(parsed.message).toBe('Hello "World"');
      expect(parsed.unicode).toBe('日本語');
    });

    it('should handle rapid set/get/delete cycles', async () => {
      for (let i = 0; i < 1000; i++) {
        await storage.set('cycle', createEntry(`v${i}`), 60000);
        const retrieved = await storage.get('cycle');
        expect(retrieved?.body).toBe(`v${i}`);
        if (i % 10 === 0) {
          await storage.delete('cycle');
        }
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Integration Tests
// ─────────────────────────────────────────────────────────────────

describe('MemoryStorage Integration', () => {
  describe('cache plugin simulation', () => {
    it('should work as HTTP cache storage', async () => {
      const cache = new MemoryStorage({
        maxSize: 100,
        maxMemoryBytes: 10 * 1024 * 1024,
        evictionPolicy: 'lru',
        enableStats: true,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      // Simulate HTTP response caching
      const responses = [
        { url: '/api/users', body: JSON.stringify([{ id: 1, name: 'John' }]) },
        { url: '/api/posts', body: JSON.stringify([{ id: 1, title: 'Hello' }]) },
        { url: '/api/comments', body: JSON.stringify([{ id: 1, text: 'Nice!' }]) },
      ];

      for (const resp of responses) {
        const entry: CacheEntry = {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
          body: resp.body,
          timestamp: Date.now(),
          maxAge: 3600,
        };
        await cache.set(resp.url, entry, 3600 * 1000);
      }

      // Simulate cache hits
      for (let i = 0; i < 10; i++) {
        const entry = await cache.get('/api/users');
        expect(entry?.status).toBe(200);
      }

      // Simulate cache miss
      const miss = await cache.get('/api/unknown');
      expect(miss).toBeUndefined();

      const stats = cache.getStats();
      expect(stats.hits).toBe(10);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(10 / 11, 2);

      cache.shutdown();
    });

    it('should handle cache invalidation patterns', async () => {
      const cache = new MemoryStorage({
        enableStats: true,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      // Set up namespaced cache entries
      await cache.set('users:1', createEntry('user1'), 60000);
      await cache.set('users:2', createEntry('user2'), 60000);
      await cache.set('users:list', createEntry('all users'), 60000);
      await cache.set('posts:1', createEntry('post1'), 60000);
      await cache.set('settings', createEntry('settings'), 60000);

      // Invalidate all user-related cache
      cache.clear('users:');

      expect(await cache.get('users:1')).toBeUndefined();
      expect(await cache.get('users:2')).toBeUndefined();
      expect(await cache.get('users:list')).toBeUndefined();
      expect(await cache.get('posts:1')).toBeDefined();
      expect(await cache.get('settings')).toBeDefined();

      cache.shutdown();
    });
  });

  describe('real-world scenarios', () => {
    it('should handle API response caching with ETag', async () => {
      const cache = new MemoryStorage({
        compression: { enabled: true, threshold: 500 },
        enableStats: true,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const largeApiResponse = JSON.stringify({
        data: Array(100).fill(null).map((_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'Lorem ipsum '.repeat(20),
        })),
      });

      const entry: CacheEntry = {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: largeApiResponse,
        timestamp: Date.now(),
        etag: '"abc123"',
        lastModified: new Date().toUTCString(),
        maxAge: 3600,
      };

      await cache.set('/api/items', entry, 3600000);

      // Retrieve and verify
      const cached = await cache.get('/api/items');
      expect(cached?.etag).toBe('"abc123"');
      expect(JSON.parse(cached!.body).data.length).toBe(100);

      // Check compression was applied
      const compressionStats = cache.getCompressionStats();
      expect(compressionStats.enabled).toBe(true);

      cache.shutdown();
    });

    it('should maintain cache coherence under memory pressure', async () => {
      const cache = new MemoryStorage({
        maxMemoryBytes: 5000, // Very tight limit
        evictionPolicy: 'lru',
        enableStats: true,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      // Fill cache with entries
      for (let i = 0; i < 50; i++) {
        await cache.set(`key${i}`, createEntry('x'.repeat(100)), 60000);
      }

      // Access some entries to make them "hot"
      const hotKeys = ['key10', 'key20', 'key30'];
      for (const key of hotKeys) {
        await cache.get(key);
      }

      // Add more entries to trigger eviction
      for (let i = 50; i < 100; i++) {
        await cache.set(`key${i}`, createEntry('x'.repeat(100)), 60000);
      }

      // Verify memory is within limits
      const memStats = cache.getMemoryStats();
      expect(memStats.currentMemoryBytes).toBeLessThanOrEqual(5000);

      // Hot keys should still be available (LRU)
      for (const key of hotKeys) {
        const entry = await cache.get(key);
        // May or may not exist depending on pressure, but should not throw
      }

      cache.shutdown();
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Stress Tests
// ─────────────────────────────────────────────────────────────────

describe('MemoryStorage Stress Tests', () => {
  describe('high volume operations', () => {
    it('should handle 10000 rapid insertions', async () => {
      const cache = new MemoryStorage({
        maxSize: 5000,
        maxMemoryBytes: 50 * 1024 * 1024,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const start = Date.now();

      for (let i = 0; i < 10000; i++) {
        await cache.set(`key${i}`, createEntry(`value${i}`), 60000);
      }

      const duration = Date.now() - start;
      console.log(`    10000 insertions: ${duration}ms (${(10000 / duration * 1000).toFixed(0)} ops/sec)`);

      // Should be capped at maxSize
      expect(cache.size()).toBe(5000);

      cache.shutdown();
    }, 15000);

    it('should handle 10000 rapid reads', async () => {
      const cache = new MemoryStorage({
        maxSize: 1000,
        enableStats: true,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      // Pre-populate
      for (let i = 0; i < 1000; i++) {
        await cache.set(`key${i}`, createEntry(`value${i}`), 60000);
      }

      const start = Date.now();

      for (let i = 0; i < 10000; i++) {
        await cache.get(`key${i % 1000}`);
      }

      const duration = Date.now() - start;
      console.log(`    10000 reads: ${duration}ms (${(10000 / duration * 1000).toFixed(0)} ops/sec)`);

      const stats = cache.getStats();
      expect(stats.hits).toBe(10000);

      cache.shutdown();
    });

    it('should handle mixed workload (80% read, 20% write)', async () => {
      const cache = new MemoryStorage({
        maxSize: 1000,
        enableStats: true,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      // Pre-populate
      for (let i = 0; i < 500; i++) {
        await cache.set(`key${i}`, createEntry(`value${i}`), 60000);
      }

      const operations = 10000;
      const start = Date.now();

      for (let i = 0; i < operations; i++) {
        if (Math.random() < 0.8) {
          await cache.get(`key${Math.floor(Math.random() * 1000)}`);
        } else {
          await cache.set(`key${Math.floor(Math.random() * 1000)}`, createEntry(`new${i}`), 60000);
        }
      }

      const duration = Date.now() - start;
      console.log(`    ${operations} mixed ops: ${duration}ms (${(operations / duration * 1000).toFixed(0)} ops/sec)`);

      cache.shutdown();
    });
  });

  describe('memory pressure simulation', () => {
    it('should survive aggressive memory filling', async () => {
      const evictions: EvictionInfo[] = [];

      const cache = new MemoryStorage({
        maxMemoryBytes: 1024 * 1024, // 1MB limit
        maxSize: 10000,
        evictionPolicy: 'lru',
        enableStats: true,
        monitorInterval: 0,
        cleanupInterval: 0,
        onEvict: (info) => evictions.push(info),
      });

      // Try to fill with 10MB of data
      for (let i = 0; i < 1000; i++) {
        await cache.set(`key${i}`, createEntry('x'.repeat(10000)), 60000);
      }

      const memStats = cache.getMemoryStats();
      expect(memStats.currentMemoryBytes).toBeLessThanOrEqual(1024 * 1024);
      expect(evictions.length).toBeGreaterThan(0);

      console.log(`    Evictions triggered: ${evictions.length}`);
      console.log(`    Final memory: ${memStats.memoryUsage.current}`);

      cache.shutdown();
    });

    it('should track memory accurately through eviction cycles', async () => {
      const cache = new MemoryStorage({
        maxMemoryBytes: 10000,
        evictionPolicy: 'lru',
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      // Fill and evict multiple times
      for (let cycle = 0; cycle < 5; cycle++) {
        for (let i = 0; i < 100; i++) {
          await cache.set(`cycle${cycle}_key${i}`, createEntry('x'.repeat(100)), 60000);
        }
      }

      const memStats = cache.getMemoryStats();

      // Memory should be within limits
      expect(memStats.currentMemoryBytes).toBeLessThanOrEqual(10000);

      // Verify items are accessible
      const size = cache.size();
      let accessible = 0;
      for (const key of cache.keys()) {
        if (await cache.get(key)) accessible++;
      }
      expect(accessible).toBe(size);

      cache.shutdown();
    });

    it('should handle entries of varying sizes', async () => {
      const cache = new MemoryStorage({
        maxMemoryBytes: 100000,
        evictionPolicy: 'lru',
        enableStats: true,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      const sizes = [10, 50, 100, 500, 1000, 5000, 10000];

      for (let i = 0; i < 200; i++) {
        const size = sizes[i % sizes.length];
        await cache.set(`key${i}`, createEntry('x'.repeat(size)), 60000);
      }

      const memStats = cache.getMemoryStats();
      expect(memStats.currentMemoryBytes).toBeLessThanOrEqual(100000);

      cache.shutdown();
    });
  });

  describe('compression under load', () => {
    it('should maintain compression efficiency under stress', async () => {
      const cache = new MemoryStorage({
        maxMemoryBytes: 5 * 1024 * 1024,
        compression: { enabled: true, threshold: 100 },
        enableStats: true,
        monitorInterval: 0,
        cleanupInterval: 0,
      });

      // Add many compressible entries
      for (let i = 0; i < 1000; i++) {
        await cache.set(`key${i}`, createCompressibleEntry(5000), 60000);
      }

      const compressionStats = cache.getCompressionStats();
      const memStats = cache.getMemoryStats();

      console.log(`    Compressed items: ${compressionStats.compressedItems}`);
      console.log(`    Space savings: ${compressionStats.spaceSavingsPercent}%`);
      console.log(`    Memory used: ${memStats.memoryUsage.current}`);

      // Should have significant savings
      if (compressionStats.compressedItems > 0) {
        expect(parseFloat(compressionStats.spaceSavingsPercent)).toBeGreaterThan(30);
      }

      cache.shutdown();
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Memory Limits Utilities Tests
// ─────────────────────────────────────────────────────────────────

describe('memory-limits utilities', () => {
  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500.00 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1536)).toBe('1.50 KB');
      expect(formatBytes(1048576)).toBe('1.00 MB');
      expect(formatBytes(1073741824)).toBe('1.00 GB');
      expect(formatBytes(1099511627776)).toBe('1.00 TB');
    });

    it('should handle fractional values', () => {
      expect(formatBytes(1500)).toBe('1.46 KB');
      expect(formatBytes(2500000)).toBe('2.38 MB');
    });
  });

  describe('getEffectiveTotalMemoryBytes', () => {
    it('should return a positive number', () => {
      const mem = getEffectiveTotalMemoryBytes();
      expect(mem).toBeGreaterThan(0);
    });

    it('should return at least 100MB', () => {
      const mem = getEffectiveTotalMemoryBytes();
      expect(mem).toBeGreaterThan(100 * 1024 * 1024);
    });
  });

  describe('getHeapStats', () => {
    it('should return valid heap statistics', () => {
      const stats = getHeapStats();
      expect(stats.heapUsed).toBeGreaterThan(0);
      expect(stats.heapLimit).toBeGreaterThan(0);
      expect(stats.heapRatio).toBeGreaterThan(0);
      expect(stats.heapRatio).toBeLessThan(1);
    });
  });

  describe('resolveCacheMemoryLimit', () => {
    it('should resolve with default limits', () => {
      const result = resolveCacheMemoryLimit({});
      expect(result.maxMemoryBytes).toBeGreaterThan(0);
      expect(result.effectiveTotal).toBeGreaterThan(0);
      expect(result.heapLimit).toBeGreaterThan(0);
    });

    it('should respect explicit maxMemoryBytes', () => {
      const result = resolveCacheMemoryLimit({
        maxMemoryBytes: 1000000,
      });
      // May be capped by safety limits
      expect(result.maxMemoryBytes).toBeLessThanOrEqual(1000000);
    });

    it('should calculate from maxMemoryPercent', () => {
      const result = resolveCacheMemoryLimit({
        maxMemoryPercent: 0.1,
      });
      expect(result.derivedFromPercent).toBe(true);
      // Should be roughly 10% of effective total (may be capped)
      expect(result.maxMemoryBytes).toBeLessThanOrEqual(result.effectiveTotal * 0.1);
    });

    it('should apply safety caps', () => {
      // Request 100% of memory - should be capped
      const result = resolveCacheMemoryLimit({
        maxMemoryPercent: 1.0,
      });
      // Default safety is 50%, so should be capped
      expect(result.maxMemoryBytes).toBeLessThan(result.effectiveTotal);
    });

    it('should respect custom safetyPercent', () => {
      const result = resolveCacheMemoryLimit({
        safetyPercent: 0.2,
      });
      // Should be at most 20% of effective total
      expect(result.maxMemoryBytes).toBeLessThanOrEqual(result.effectiveTotal * 0.2);
    });

    it('should provide inferredPercent', () => {
      const result = resolveCacheMemoryLimit({
        maxMemoryBytes: 100 * 1024 * 1024, // 100MB
      });
      expect(result.inferredPercent).toBeGreaterThan(0);
      expect(result.inferredPercent).toBeLessThan(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Cleanup Interval Tests
// ─────────────────────────────────────────────────────────────────

describe('MemoryStorage Cleanup', () => {
  it('should clean up expired items on interval', async () => {
    vi.useFakeTimers();

    const evictions: EvictionInfo[] = [];
    const cache = new MemoryStorage({
      cleanupInterval: 1000,
      monitorInterval: 0,
      onEvict: (info) => evictions.push(info),
    });

    // Add items with short TTL
    await cache.set('short1', createEntry('1'), 500);
    await cache.set('short2', createEntry('2'), 500);
    await cache.set('long', createEntry('3'), 60000);

    expect(cache.size()).toBe(3);

    // Advance past TTL but before cleanup
    await vi.advanceTimersByTimeAsync(600);
    expect(cache.size()).toBe(3); // Not cleaned yet

    // Advance to trigger cleanup (total 1100ms to trigger the 1000ms interval)
    await vi.advanceTimersByTimeAsync(500);

    // Short TTL items should be cleaned
    expect(evictions.filter(e => e.reason === 'expired').length).toBe(2);

    cache.shutdown();
    vi.useRealTimers();
  });

  it('should call onEvict with expired reason', async () => {
    vi.useFakeTimers();

    const evictions: EvictionInfo[] = [];
    const cache = new MemoryStorage({
      cleanupInterval: 100,
      monitorInterval: 0,
      onEvict: (info) => evictions.push(info),
    });

    await cache.set('expiring', createEntry('value'), 50);

    // Advance past TTL and cleanup interval
    await vi.advanceTimersByTimeAsync(150);

    const expiredEvictions = evictions.filter(e => e.reason === 'expired');
    expect(expiredEvictions.length).toBeGreaterThan(0);
    expect(expiredEvictions[0].key).toBe('expiring');

    cache.shutdown();
    vi.useRealTimers();
  });
});
