import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileSystemStorage } from '../../src/cache/file-storage.js';
import { join } from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';

describe('FileSystemStorage', () => {
  const testCacheDir = join(tmpdir(), `recker-test-cache-${Math.random().toString(36).substring(2, 9)}`);
  let storage: FileSystemStorage;

  beforeEach(async () => {
    // Clean up directory before each test
    await fs.rm(testCacheDir, { recursive: true, force: true });
    await fs.mkdir(testCacheDir, { recursive: true });
    storage = new FileSystemStorage({ path: testCacheDir, cleanupInterval: 0 }); // Disable cleanup for predictable tests
  });

  afterEach(async () => {
    storage.shutdown();
    await fs.rm(testCacheDir, { recursive: true, force: true });
  });

  it('should set and get a cache entry', async () => {
    const key = 'test-key';
    const value = { status: 200, statusText: 'OK', headers: {}, body: 'hello', timestamp: Date.now() };
    await storage.set(key, value, 10000);

    const retrieved = await storage.get(key);
    expect(retrieved).toEqual(value);
  });

  it('should return undefined for a non-existent key', async () => {
    const retrieved = await storage.get('non-existent-key');
    expect(retrieved).toBeUndefined();
  });

  it('should delete a cache entry', async () => {
    const key = 'delete-key';
    const value = { status: 200, statusText: 'OK', headers: {}, body: 'data', timestamp: Date.now() };
    await storage.set(key, value, 10000);

    let retrieved = await storage.get(key);
    expect(retrieved).toBeDefined();

    await storage.delete(key);
    retrieved = await storage.get(key);
    expect(retrieved).toBeUndefined();
  });

  it('should clear all cache entries', async () => {
    await storage.set('key1', { status: 200, statusText: 'OK', headers: {}, body: '1', timestamp: Date.now() }, 10000);
    await storage.set('key2', { status: 200, statusText: 'OK', headers: {}, body: '2', timestamp: Date.now() }, 10000);

    expect(await storage.size()).toBe(2);

    await storage.clear();
    expect(await storage.size()).toBe(0);
  });

  it('should clear cache entries with a prefix', async () => {
    await storage.set('prefix-key1', { status: 200, statusText: 'OK', headers: {}, body: '1', timestamp: Date.now() }, 10000);
    await storage.set('prefix-key2', { status: 200, statusText: 'OK', headers: {}, body: '2', timestamp: Date.now() }, 10000);
    await storage.set('other-key', { status: 200, statusText: 'OK', headers: {}, body: '3', timestamp: Date.now() }, 10000);

    expect(await storage.size()).toBe(3);

    await storage.clear('prefix-');
    expect(await storage.size()).toBe(1);
    expect(await storage.get('other-key')).toBeDefined();
    expect(await storage.get('prefix-key1')).toBeUndefined();
  });

  it('should expire entries based on CacheEntry.expires', async () => {
    vi.useFakeTimers();
    const key = 'expired-key';
    const value = { status: 200, statusText: 'OK', headers: {}, body: 'expired', timestamp: Date.now(), expires: Date.now() + 100 }; // Expires in 100ms
    await storage.set(key, value, 100);

    vi.advanceTimersByTime(50);
    expect(await storage.get(key)).toBeDefined();

    vi.advanceTimersByTime(100); // 150ms total
    expect(await storage.get(key)).toBeUndefined(); // Should be expired

    vi.useRealTimers();
  });

  it('should expire entries based on defaultTtl and file mtime if CacheEntry.expires is not set', async () => {
    vi.useFakeTimers();
    const storageWithDefaultTtl = new FileSystemStorage({ path: testCacheDir, cleanupInterval: 0, ttl: 100 });
    const key = 'default-ttl-key';
    const value = { status: 200, statusText: 'OK', headers: {}, body: 'default', timestamp: Date.now() };
    await storageWithDefaultTtl.set(key, value); // No explicit TTL, uses default

    vi.advanceTimersByTime(50);
    expect(await storageWithDefaultTtl.get(key)).toBeDefined();

    vi.advanceTimersByTime(100); // 150ms total
    expect(await storageWithDefaultTtl.get(key)).toBeUndefined(); // Should be expired

    vi.useRealTimers();
    storageWithDefaultTtl.shutdown();
  });


  it('should evict oldest entries when maxSize is exceeded', async () => {
    const limitedStorage = new FileSystemStorage({ path: testCacheDir, cleanupInterval: 0, maxSize: 2 });
    await limitedStorage.set('key1', { status: 200, statusText: 'OK', headers: {}, body: '1', timestamp: Date.now() }, 10000);
    await limitedStorage.set('key2', { status: 200, statusText: 'OK', headers: {}, body: '2', timestamp: Date.now() }, 10000);
    
    expect(await limitedStorage.size()).toBe(2);

    // Add a third entry, should evict key1 (oldest)
    await limitedStorage.set('key3', { status: 200, statusText: 'OK', headers: {}, body: '3', timestamp: Date.now() }, 10000);

    expect(await limitedStorage.size()).toBe(2);
    expect(await limitedStorage.get('key1')).toBeUndefined();
    expect(await limitedStorage.get('key2')).toBeDefined();
    expect(await limitedStorage.get('key3')).toBeDefined();

    limitedStorage.shutdown();
  });

  it('should handle corrupted cache files gracefully', async () => {
    const key = 'corrupted-key';
    const filePath = storage.getFilePath(key);
    await fs.writeFile(filePath, 'this is not valid json', 'utf8');

    const retrieved = await storage.get(key);
    expect(retrieved).toBeUndefined(); // Should return undefined and delete the file
    expect(await storage.size()).toBe(0);
  });

  it('should clean up expired entries periodically', async () => {
    vi.useFakeTimers();
    const cleanupStorage = new FileSystemStorage({ path: testCacheDir, cleanupInterval: 50, ttl: 100 });
    const key = 'cleanup-key';
    const value = { status: 200, statusText: 'OK', headers: {}, body: 'cleanme', timestamp: Date.now(), expires: Date.now() + 50 };
    await cleanupStorage.set(key, value);

    expect(await cleanupStorage.get(key)).toBeDefined();

    vi.advanceTimersByTime(60); // Pass expiration, and cleanup interval
    // The cleanup is async, so we need to wait a tick
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync(); // Run again for the cleanup to potentially finish async ops

    expect(await cleanupStorage.get(key)).toBeUndefined(); // Should be cleaned up

    vi.useRealTimers();
    cleanupStorage.shutdown();
  });
});
