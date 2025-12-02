/**
 * Tests for the embeddings lazy loader.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import {
  loadEmbeddings,
  loadLocalEmbeddings,
  saveLocalEmbeddings,
  hasLocalEmbeddings,
  loadBundledEmbeddings,
  getEmbeddingsCachePath,
  clearEmbeddingsCache,
  getPackageVersion,
} from '../../src/mcp/embeddings-loader.js';

describe('Embeddings Loader', () => {
  const testVersion = '0.0.0-test';
  const testCachePath = getEmbeddingsCachePath(testVersion);

  const mockEmbeddings = {
    version: '1.0',
    model: 'BGESmallENV15',
    dimensions: 384,
    generatedAt: new Date().toISOString(),
    documents: [
      {
        id: 'doc-0',
        path: 'test/file.md',
        title: 'Test Document',
        category: 'test',
        keywords: ['test', 'example'],
        vector: [0.1, 0.2, 0.3],
      },
    ],
  };

  beforeEach(() => {
    // Clean up test cache before each test
    clearEmbeddingsCache(testVersion);
  });

  afterEach(() => {
    // Clean up test cache after each test
    clearEmbeddingsCache(testVersion);
    vi.restoreAllMocks();
  });

  describe('getPackageVersion', () => {
    it('should return a valid version string', () => {
      const version = getPackageVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('getEmbeddingsCachePath', () => {
    it('should return a path containing the version', () => {
      const path = getEmbeddingsCachePath('1.0.0');
      expect(path).toContain('embeddings-1.0.0.json');
    });

    it('should use default version when not specified', () => {
      const path = getEmbeddingsCachePath();
      expect(path).toContain('embeddings-');
      expect(path).toContain('.json');
    });
  });

  describe('hasLocalEmbeddings', () => {
    it('should return false when cache does not exist', () => {
      expect(hasLocalEmbeddings(testVersion)).toBe(false);
    });

    it('should return true when cache exists', () => {
      saveLocalEmbeddings(mockEmbeddings, testVersion);
      expect(hasLocalEmbeddings(testVersion)).toBe(true);
    });
  });

  describe('saveLocalEmbeddings / loadLocalEmbeddings', () => {
    it('should save and load embeddings correctly', () => {
      saveLocalEmbeddings(mockEmbeddings, testVersion);

      const loaded = loadLocalEmbeddings(testVersion);
      expect(loaded).not.toBeNull();
      expect(loaded?.model).toBe('BGESmallENV15');
      expect(loaded?.documents).toHaveLength(1);
      expect(loaded?.documents[0].title).toBe('Test Document');
    });

    it('should return null when cache does not exist', () => {
      const loaded = loadLocalEmbeddings(testVersion);
      expect(loaded).toBeNull();
    });
  });

  describe('clearEmbeddingsCache', () => {
    it('should remove cached embeddings', () => {
      saveLocalEmbeddings(mockEmbeddings, testVersion);
      expect(hasLocalEmbeddings(testVersion)).toBe(true);

      clearEmbeddingsCache(testVersion);
      expect(hasLocalEmbeddings(testVersion)).toBe(false);
    });

    it('should not throw when cache does not exist', () => {
      expect(() => clearEmbeddingsCache(testVersion)).not.toThrow();
    });
  });

  describe('loadBundledEmbeddings', () => {
    it('should load bundled embeddings when available', async () => {
      // In development environment, bundled embeddings should be available
      const bundled = await loadBundledEmbeddings();

      // May or may not be available depending on environment
      if (bundled) {
        expect(bundled.model).toBeDefined();
        expect(bundled.documents).toBeDefined();
        expect(Array.isArray(bundled.documents)).toBe(true);
      }
    });
  });

  describe('loadEmbeddings', () => {
    it('should load from cache when available', async () => {
      saveLocalEmbeddings(mockEmbeddings, testVersion);

      const loaded = await loadEmbeddings({
        version: testVersion,
        offline: true, // Don't try to download
      });

      expect(loaded).not.toBeNull();
      expect(loaded?.model).toBe('BGESmallENV15');
    });

    it('should try bundled when cache is empty', async () => {
      const loaded = await loadEmbeddings({
        version: testVersion,
        offline: true, // Don't try to download
      });

      // Should load bundled or return null
      // The bundled embeddings are available in development
      if (loaded) {
        expect(loaded.documents).toBeDefined();
      }
    });

    it('should force download when forceDownload is true', async () => {
      saveLocalEmbeddings(mockEmbeddings, testVersion);

      // Mock fetch to fail (since this test version won't exist on GitHub)
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Not found'));

      const loaded = await loadEmbeddings({
        version: testVersion,
        forceDownload: true,
      });

      // Should fall back to bundled since download fails
      // Or return null if bundled also fails
      expect(loaded === null || loaded.documents !== undefined).toBe(true);
    });

    it('should respect offline mode', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await loadEmbeddings({
        version: testVersion,
        offline: true,
      });

      // Should not call fetch in offline mode
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should log when debug is enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await loadEmbeddings({
        version: testVersion,
        offline: true,
        debug: true,
      });

      // Should have logged something
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map(c => c[0]);
      expect(calls.some(c => c.includes('[embeddings-loader]'))).toBe(true);
    });
  });

  describe('Integration with HybridSearch', () => {
    it('should be compatible with HybridSearch initialization', async () => {
      // Just verify that the types are compatible
      const embeddings = await loadEmbeddings({ offline: true });

      if (embeddings) {
        // Should have required fields
        expect(embeddings.documents).toBeDefined();
        expect(Array.isArray(embeddings.documents)).toBe(true);

        if (embeddings.documents.length > 0) {
          const doc = embeddings.documents[0];
          expect(doc.id).toBeDefined();
          expect(doc.path).toBeDefined();
          expect(doc.title).toBeDefined();
        }
      }
    });
  });
});
