import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSystemStorage } from '../../src/cache/file-storage.js';
import { MemoryStorage } from '../../src/cache/memory-storage.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';

describe('Storage Adapters', () => {
  describe('MemoryStorage', () => {
    it('should store and retrieve items', async () => {
      const storage = new MemoryStorage();
      await storage.set('key1', { body: 'val', status: 200, statusText: 'OK', headers: {}, timestamp: Date.now() });
      const item = await storage.get('key1');
      expect(item?.body).toBe('val');
    });

    it('should return undefined for missing keys', async () => {
      const storage = new MemoryStorage();
      const item = await storage.get('missing');
      expect(item).toBeUndefined();
    });

    it('should delete items', async () => {
      const storage = new MemoryStorage();
      await storage.set('key1', { body: 'val', status: 200, statusText: 'OK', headers: {}, timestamp: Date.now() });
      await storage.delete('key1');
      const item = await storage.get('key1');
      expect(item).toBeUndefined();
    });

    it('should respect TTL', async () => {
      const storage = new MemoryStorage();
      await storage.set('key1', { body: 'val', status: 200, statusText: 'OK', headers: {}, timestamp: Date.now() }, 10);
      await new Promise(r => setTimeout(r, 20));
      const item = await storage.get('key1');
      expect(item).toBeUndefined();
    });

    it('should clear all items', async () => {
        const storage = new MemoryStorage();
        await storage.set('k1', { body: 'v', status: 200, statusText: 'OK', headers: {}, timestamp: Date.now() });
        storage.clear();
        expect(await storage.get('k1')).toBeUndefined();
    });
  });

  describe('FileSystemStorage', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'recker-test-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('should store and retrieve items from disk', async () => {
      const storage = new FileSystemStorage({ path: tempDir, cleanupInterval: 0 });
      const entry = { body: 'val', status: 200, statusText: 'OK', headers: { 'x-foo': 'bar' }, timestamp: Date.now() };

      await storage.set('key1', entry);

      // New instance to verify persistence
      const storage2 = new FileSystemStorage({ path: tempDir, cleanupInterval: 0 });
      const item = await storage2.get('key1');

      expect(item?.body).toBe(entry.body);
      expect(item?.status).toBe(entry.status);
      storage.shutdown();
      storage2.shutdown();
    });

    it('should return undefined for missing keys', async () => {
      const storage = new FileSystemStorage({ path: tempDir, cleanupInterval: 0 });
      const item = await storage.get('missing');
      expect(item).toBeUndefined();
      storage.shutdown();
    });

    it('should delete items', async () => {
      const storage = new FileSystemStorage({ path: tempDir, cleanupInterval: 0 });
      await storage.set('key1', { body: 'val', status: 200, statusText: 'OK', headers: {}, timestamp: Date.now() });
      await storage.delete('key1');
      const item = await storage.get('key1');
      expect(item).toBeUndefined();
      storage.shutdown();
    });

    it('should handle clear', async () => {
        const storage = new FileSystemStorage({ path: tempDir, cleanupInterval: 0 });
        await storage.set('k1', { body: 'v', status: 200, statusText: 'OK', headers: {}, timestamp: Date.now() });
        await storage.clear();
        expect(await storage.get('k1')).toBeUndefined();
        storage.shutdown();
    });

    it('should handle corrupted files gracefully', async () => {
        const storage = new FileSystemStorage({ path: tempDir, cleanupInterval: 0 });
        // Write a corrupted JSON file directly
        const corruptedKey = Buffer.from('corrupted-key').toString('base64url');
        await writeFile(join(tempDir, corruptedKey + '.json'), 'not valid json{{{', 'utf8');

        // Should return undefined instead of throwing
        const item = await storage.get('corrupted-key');
        expect(item).toBeUndefined();
        storage.shutdown();
    });
  });
});
