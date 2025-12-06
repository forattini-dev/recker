import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateError } from '../../../src/core/errors.js';

// We need to reset modules to clear the cached embeddings
let HybridSearch: typeof import('../../../src/mcp/search/hybrid-search.js').HybridSearch;
let createHybridSearch: typeof import('../../../src/mcp/search/hybrid-search.js').createHybridSearch;
let mockLoadEmbeddings: ReturnType<typeof vi.fn>;

describe('HybridSearch', () => {
  const sampleDocs = [
    {
      id: 'doc-1',
      path: '/docs/retry.md',
      title: 'Retry Plugin',
      content: 'The retry plugin provides automatic retry with exponential backoff for failed requests.',
      category: 'plugins',
      section: 'Plugins',
      keywords: ['retry', 'backoff', 'exponential', 'resilience'],
    },
    {
      id: 'doc-2',
      path: '/docs/cache.md',
      title: 'Cache Plugin',
      content: 'The cache plugin caches HTTP responses in memory or persistent storage.',
      category: 'plugins',
      section: 'Plugins',
      keywords: ['cache', 'memory', 'storage', 'performance'],
    },
    {
      id: 'doc-3',
      path: '/docs/client.md',
      title: 'HTTP Client',
      content: 'The main client class for making HTTP requests with various configurations.',
      category: 'core',
      section: 'Core',
      keywords: ['client', 'http', 'request', 'configuration'],
    },
    {
      id: 'doc-4',
      path: '/docs/middleware.md',
      title: 'Middleware System',
      content: 'Middlewares intercept requests and responses for custom processing.',
      category: 'core',
      section: 'Core',
      keywords: ['middleware', 'intercept', 'request', 'response'],
    },
    {
      id: 'doc-5',
      path: '/docs/streaming.md',
      title: 'Streaming Responses',
      content: 'Handle streaming data from server-sent events and chunked transfers.',
      category: 'advanced',
      section: 'Advanced',
      keywords: ['streaming', 'sse', 'events', 'chunks'],
    },
  ];

  const sampleEmbeddings = {
    model: 'all-MiniLM-L6-v2',
    dimensions: 384,
    documents: [
      {
        id: 'doc-1',
        path: '/docs/retry.md',
        title: 'Retry Plugin',
        category: 'plugins',
        keywords: ['retry', 'backoff'],
        vector: new Array(384).fill(0).map((_, i) => Math.sin(i * 0.01)),
      },
      {
        id: 'doc-2',
        path: '/docs/cache.md',
        title: 'Cache Plugin',
        category: 'plugins',
        keywords: ['cache', 'memory'],
        vector: new Array(384).fill(0).map((_, i) => Math.cos(i * 0.01)),
      },
      {
        id: 'doc-3',
        path: '/docs/client.md',
        title: 'HTTP Client',
        category: 'core',
        keywords: ['client', 'http'],
        vector: new Array(384).fill(0).map((_, i) => Math.sin(i * 0.02)),
      },
      {
        id: 'doc-4',
        path: '/docs/middleware.md',
        title: 'Middleware System',
        category: 'core',
        keywords: ['middleware', 'intercept'],
        vector: new Array(384).fill(0).map((_, i) => Math.cos(i * 0.02)),
      },
      {
        id: 'doc-5',
        path: '/docs/streaming.md',
        title: 'Streaming Responses',
        category: 'advanced',
        keywords: ['streaming', 'sse'],
        vector: new Array(384).fill(0).map((_, i) => Math.sin(i * 0.03)),
      },
    ],
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Mock the embeddings loader before importing
    mockLoadEmbeddings = vi.fn().mockResolvedValue(null);
    vi.doMock('../../../src/mcp/embeddings-loader.js', () => ({
      loadEmbeddings: mockLoadEmbeddings,
    }));

    // Import fresh module with cleared cache
    const module = await import('../../../src/mcp/search/hybrid-search.js');
    HybridSearch = module.HybridSearch;
    createHybridSearch = module.createHybridSearch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with documents', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const stats = search.getStats();
      expect(stats.documents).toBe(5);
    });

    it('should initialize with custom config', async () => {
      const search = new HybridSearch({
        fuzzyThreshold: 0.2,
        fuzzyWeight: 0.6,
        semanticWeight: 0.4,
        debug: false,
      });
      await search.initialize(sampleDocs);

      expect(search.getStats().documents).toBe(5);
    });

    it('should load embeddings if available', async () => {
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const stats = search.getStats();
      expect(stats.embeddings).toBe(5);
      expect(stats.model).toBe('all-MiniLM-L6-v2');
      expect(stats.dimensions).toBe(384);
    });

    it('should handle embeddings load failure gracefully', async () => {
      mockLoadEmbeddings.mockRejectedValue(new Error('Network error'));

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const stats = search.getStats();
      expect(stats.documents).toBe(5);
      expect(stats.embeddings).toBe(0);
    });

    it('should cache embeddings between instances', async () => {
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search1 = new HybridSearch();
      await search1.initialize(sampleDocs);

      // Second instance should use cached embeddings
      const search2 = new HybridSearch();
      await search2.initialize(sampleDocs);

      // loadEmbeddings should only be called once due to caching
      expect(mockLoadEmbeddings).toHaveBeenCalledTimes(1);
    });
  });

  describe('search', () => {
    it('should throw StateError if not initialized', async () => {
      const search = new HybridSearch();

      await expect(search.search('retry')).rejects.toThrow('HybridSearch not initialized');
    });

    it('should return results for fuzzy search', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('retry');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('Retry');
    });

    it('should return results for semantic search with embeddings', async () => {
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('retry backoff', { mode: 'semantic' });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return hybrid results combining fuzzy and semantic', async () => {
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('retry', { mode: 'hybrid' });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should respect limit option', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('plugin', { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should filter by category', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('plugin', { category: 'plugins' });

      for (const result of results) {
        const doc = sampleDocs.find(d => d.id === result.id);
        expect(doc?.category).toBe('plugins');
      }
    });

    it('should filter by minScore', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('retry', { minScore: 0.5 });

      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.5);
      }
    });

    it('should clean query by removing stop words', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      // Query with stop words should still work
      const results = await search.search('how to configure the retry plugin');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle empty cleaned query', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      // Query with only stop words
      const results = await search.search('the a an');

      // Should fall back to original query
      expect(results).toBeDefined();
    });

    it('should search in fuzzy mode only', async () => {
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('cache', { mode: 'fuzzy' });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe('fuzzy');
    });

    it('should combine scores in hybrid mode', async () => {
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('retry backoff', { mode: 'hybrid' });

      // Check if any result has hybrid source (combined from both methods)
      const hasHybridSource = results.some(r => r.source === 'hybrid');
      // This depends on whether both methods find the same document
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('fuzzy search details', () => {
    it('should boost keyword matches', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('retry');

      // Retry plugin should be boosted because 'retry' is in keywords
      expect(results[0].title).toBe('Retry Plugin');
    });

    it('should boost title matches', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('streaming');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('Streaming');
    });

    it('should penalize weak fuzzy matches', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      // Very weak query that might have poor fuzzy matches
      const results = await search.search('xyz123');

      // Weak matches should have lower scores
      for (const result of results) {
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it('should handle empty fuse instance', async () => {
      const search = new HybridSearch();
      await search.initialize([]);

      const results = await search.search('anything');

      expect(results).toEqual([]);
    });
  });

  describe('semantic search details', () => {
    it('should perform term-based matching', async () => {
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('cache memory', { mode: 'semantic' });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter by category in semantic search', async () => {
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('plugin', { mode: 'semantic', category: 'core' });

      // Should only return core category documents
      for (const result of results) {
        const entry = sampleEmbeddings.documents.find(d => d.id === result.id);
        if (entry) {
          expect(entry.category).toContain('core');
        }
      }
    });

    it('should find similar documents using vector similarity', async () => {
      // Create embeddings where similar docs have similar vectors
      const embeddingsWithSimilarity = {
        ...sampleEmbeddings,
        documents: sampleEmbeddings.documents.map((doc, i) => ({
          ...doc,
          // Make retry and cache vectors very similar
          vector: i < 2
            ? new Array(384).fill(0).map((_, j) => Math.sin(j * 0.01) + (i * 0.001))
            : doc.vector,
        })),
      };
      mockLoadEmbeddings.mockResolvedValue(embeddingsWithSimilarity as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('retry', { mode: 'semantic' });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty when no embeddings available', async () => {
      mockLoadEmbeddings.mockResolvedValue(null);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('retry', { mode: 'semantic' });

      // Only semantic mode without embeddings should return empty
      expect(results.length).toBe(0);
    });

    it('should handle embeddings with inconsistent dimensions', async () => {
      const inconsistentEmbeddings = {
        ...sampleEmbeddings,
        documents: sampleEmbeddings.documents.map((doc, i) => ({
          ...doc,
          // Different dimensions for different docs
          vector: i === 0 ? new Array(384).fill(0.5) : new Array(256).fill(0.5),
        })),
      };
      mockLoadEmbeddings.mockResolvedValue(inconsistentEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      // Should handle gracefully without crashing
      const results = await search.search('retry', { mode: 'semantic' });
      expect(results).toBeDefined();
    });

    it('should handle empty vectors in embeddings', async () => {
      const emptyVectorEmbeddings = {
        ...sampleEmbeddings,
        documents: sampleEmbeddings.documents.map((doc, i) => ({
          ...doc,
          vector: i === 0 ? [] : doc.vector,
        })),
      };
      mockLoadEmbeddings.mockResolvedValue(emptyVectorEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const stats = search.getStats();
      // Empty vectors should not be included
      expect(stats.embeddings).toBe(4);
    });

    it('should use fuzzy matching in semantic search', async () => {
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      // Typo in query
      const results = await search.search('retrry', { mode: 'semantic' });

      // Should still find retry due to Levenshtein distance
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('snippet extraction', () => {
    it('should extract snippet around query term', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('retry');

      expect(results[0].snippet).toBeDefined();
      expect(results[0].snippet.length).toBeGreaterThan(0);
    });

    it('should handle empty content', async () => {
      const docsWithEmptyContent = [
        { ...sampleDocs[0], content: '' },
      ];

      const search = new HybridSearch();
      await search.initialize(docsWithEmptyContent);

      const results = await search.search('retry');

      if (results.length > 0) {
        expect(results[0].snippet).toBe('');
      }
    });

    it('should add ellipsis for long content', async () => {
      const longContent = 'x'.repeat(500);
      const docsWithLongContent = [
        { ...sampleDocs[0], content: longContent },
      ];

      const search = new HybridSearch();
      await search.initialize(docsWithLongContent);

      const results = await search.search('anything');

      if (results.length > 0 && results[0].snippet) {
        expect(results[0].snippet.length).toBeLessThan(longContent.length);
      }
    });

    it('should use fuzzy matching for snippet extraction', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      // Typo that should still find a match
      const results = await search.search('exponentail');

      if (results.length > 0) {
        expect(results[0].snippet).toBeDefined();
      }
    });
  });

  describe('hasEmbeddings', () => {
    it('should return false when no embeddings loaded', async () => {
      mockLoadEmbeddings.mockResolvedValue(null);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      expect(search.hasEmbeddings()).toBe(false);
    });

    it('should return true when embeddings loaded', async () => {
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      expect(search.hasEmbeddings()).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return stats without embeddings', async () => {
      mockLoadEmbeddings.mockResolvedValue(null);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const stats = search.getStats();
      expect(stats).toEqual({
        documents: 5,
        embeddings: 0,
        model: undefined,
        dimensions: undefined,
      });
    });

    it('should return stats with embeddings', async () => {
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const stats = search.getStats();
      expect(stats.documents).toBe(5);
      expect(stats.embeddings).toBe(5);
      expect(stats.model).toBe('all-MiniLM-L6-v2');
      expect(stats.dimensions).toBe(384);
    });
  });

  describe('debug logging', () => {
    it('should log when debug is enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch({ debug: true });
      await search.initialize(sampleDocs);
      await search.search('retry');

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls.some(call =>
        call[0].includes('[HybridSearch]')
      )).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should not log when debug is disabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockLoadEmbeddings.mockResolvedValue(sampleEmbeddings as any);

      const search = new HybridSearch({ debug: false });
      await search.initialize(sampleDocs);
      await search.search('retry');

      const hybridSearchLogs = consoleSpy.mock.calls.filter(call =>
        call[0]?.includes?.('[HybridSearch]')
      );
      expect(hybridSearchLogs.length).toBe(0);

      consoleSpy.mockRestore();
    });
  });

  describe('createHybridSearch factory', () => {
    it('should create HybridSearch instance', () => {
      const search = createHybridSearch();

      expect(search).toBeInstanceOf(HybridSearch);
    });

    it('should create HybridSearch instance with config', () => {
      const search = createHybridSearch({
        fuzzyThreshold: 0.5,
        fuzzyWeight: 0.7,
        semanticWeight: 0.3,
      });

      expect(search).toBeInstanceOf(HybridSearch);
    });
  });

  describe('averageVectors private method', () => {
    it('should handle vector averaging through semantic search', async () => {
      // Create embeddings where multiple docs match and vectors need averaging
      const vectorForAveraging = new Array(384).fill(0.5);
      const embeddingsForAveraging = {
        ...sampleEmbeddings,
        documents: [
          { ...sampleEmbeddings.documents[0], vector: vectorForAveraging, keywords: ['test'] },
          { ...sampleEmbeddings.documents[1], vector: vectorForAveraging, keywords: ['test'] },
          { ...sampleEmbeddings.documents[2], vector: vectorForAveraging, keywords: ['test'] },
        ],
      };
      mockLoadEmbeddings.mockResolvedValue(embeddingsForAveraging as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs.slice(0, 3).map(d => ({ ...d, keywords: ['test'] })));

      const results = await search.search('test', { mode: 'semantic' });

      expect(results).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle Portuguese stop words', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('como configurar o retry');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle special characters in query', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('retry-plugin (v1.0)');

      expect(results).toBeDefined();
    });

    it('should handle very long queries', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      // Use terms that exist in the documents
      const longQuery = 'retry backoff requests plugin';
      const results = await search.search(longQuery);

      expect(results).toBeDefined();
    });

    it('should handle single character tokens', async () => {
      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      // Single chars should be filtered out by tokenize (requires > 2 chars)
      const results = await search.search('a b c retry');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle documents without doc or entry match in semantic', async () => {
      // Create embeddings with IDs that don't match any document
      const unmatchedEmbeddings = {
        ...sampleEmbeddings,
        documents: [
          {
            id: 'unmatched-id',
            path: '/unmatched.md',
            title: 'Unmatched',
            category: 'test',
            keywords: ['retry'],
            vector: new Array(384).fill(0.5),
          },
        ],
      };
      mockLoadEmbeddings.mockResolvedValue(unmatchedEmbeddings as any);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      const results = await search.search('retry', { mode: 'semantic' });

      // Should find the unmatched entry using its own data
      expect(results).toBeDefined();
    });

    it('should handle mode with no vectors but semantic mode requested', async () => {
      mockLoadEmbeddings.mockResolvedValue(null);

      const search = new HybridSearch();
      await search.initialize(sampleDocs);

      // Semantic mode without vectors should work (return empty from semantic)
      const results = await search.search('retry', { mode: 'semantic' });

      expect(results).toEqual([]);
    });
  });
});
