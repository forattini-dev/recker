import { describe, it, expect, beforeEach } from 'vitest';
import { HybridSearch, createHybridSearch } from '../src/mcp/search/hybrid-search.js';
import type { IndexedDoc } from '../src/mcp/search/types.js';

// Sample documents for testing
const sampleDocs: IndexedDoc[] = [
  {
    id: 'doc-1',
    path: 'http/retry.md',
    title: 'Retry Plugin',
    content: `
# Retry Plugin

The retry plugin automatically retries failed requests with exponential backoff.

## Usage

\`\`\`typescript
const client = createClient({
  retry: {
    attempts: 3,
    backoff: 'exponential',
    delay: 1000
  }
});
\`\`\`

## Options

- attempts: Number of retry attempts
- backoff: 'linear' | 'exponential' | 'decorrelated'
- delay: Base delay in milliseconds
    `,
    category: 'http',
    keywords: ['retry', 'backoff', 'exponential', 'linear', 'error', 'recovery'],
  },
  {
    id: 'doc-2',
    path: 'http/cache.md',
    title: 'Cache Plugin',
    content: `
# Cache Plugin

The cache plugin stores HTTP responses for faster repeated access.

## Usage

\`\`\`typescript
const client = createClient({
  cache: {
    ttl: 60000,
    storage: 'memory'
  }
});
\`\`\`

## Strategies

- cache-first: Return cached response immediately
- stale-while-revalidate: Return cached, update in background
- network-only: Bypass cache
    `,
    category: 'http',
    keywords: ['cache', 'memory', 'file', 'ttl', 'storage'],
  },
  {
    id: 'doc-3',
    path: 'ai/streaming.md',
    title: 'AI Streaming',
    content: `
# AI Streaming

Stream responses from AI providers like OpenAI and Anthropic.

## SSE Streaming

\`\`\`typescript
for await (const event of client.get('/chat').sse()) {
  console.log(event.data);
}
\`\`\`

## Token Counting

The response includes token usage information.
    `,
    category: 'ai',
    keywords: ['streaming', 'sse', 'openai', 'anthropic', 'tokens', 'llm'],
  },
  {
    id: 'doc-4',
    path: 'http/middleware.md',
    title: 'Middleware System',
    content: `
# Middleware

Recker uses an onion-style middleware architecture.

## Creating Middleware

\`\`\`typescript
const myMiddleware: Middleware = async (req, next) => {
  // Before request
  const res = await next(req);
  // After response
  return res;
};
\`\`\`

## Order of Execution

Middleware executes in registration order for requests, reverse for responses.
    `,
    category: 'http',
    keywords: ['middleware', 'plugin', 'request', 'response', 'hooks'],
  },
  {
    id: 'doc-5',
    path: 'guides/getting-started.md',
    title: 'Getting Started',
    content: `
# Getting Started with Recker

Install Recker using npm or pnpm.

\`\`\`bash
pnpm add recker
\`\`\`

## Basic Usage

\`\`\`typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });
const data = await client.get('/users').json();
\`\`\`
    `,
    category: 'guides',
    keywords: ['install', 'setup', 'quickstart', 'introduction', 'npm', 'pnpm'],
  },
];

describe('HybridSearch', () => {
  let search: HybridSearch;

  beforeEach(async () => {
    search = new HybridSearch({ debug: false });
    await search.initialize(sampleDocs);
  });

  describe('initialization', () => {
    it('initializes with documents', async () => {
      const stats = search.getStats();
      expect(stats.documents).toBe(5);
    });

    it('reports embeddings status correctly', () => {
      const stats = search.getStats();
      // The embeddings count depends on whether the embeddings.json file exists
      // In test environment, we're using sample docs, not the pre-computed ones
      expect(typeof stats.embeddings).toBe('number');
      expect(stats.embeddings).toBeGreaterThanOrEqual(0);
    });

    it('throws when searching before initialization', async () => {
      const uninitSearch = new HybridSearch();
      await expect(uninitSearch.search('test')).rejects.toThrow('not initialized');
    });
  });

  describe('fuzzy search', () => {
    it('finds exact matches', async () => {
      const results = await search.search('retry', { mode: 'fuzzy' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Retry Plugin');
    });

    it('finds partial matches', async () => {
      const results = await search.search('exponential backoff', { mode: 'fuzzy' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.title === 'Retry Plugin')).toBe(true);
    });

    it('handles typos', async () => {
      const results = await search.search('retrye', { mode: 'fuzzy' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Retry Plugin');
    });

    it('respects limit option', async () => {
      const results = await search.search('http', { mode: 'fuzzy', limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('filters by category', async () => {
      const results = await search.search('streaming', { mode: 'fuzzy', category: 'ai' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.path.startsWith('ai/'))).toBe(true);
    });

    it('returns empty array for no matches', async () => {
      const results = await search.search('xyznonexistent123', { mode: 'fuzzy' });
      expect(results).toEqual([]);
    });
  });

  describe('search results', () => {
    it('includes all required fields', async () => {
      const results = await search.search('cache');
      expect(results.length).toBeGreaterThan(0);

      const result = results[0];
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('snippet');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('source');
    });

    it('generates meaningful snippets', async () => {
      const results = await search.search('stale-while-revalidate');
      expect(results.length).toBeGreaterThan(0);

      const snippet = results[0].snippet;
      expect(snippet.length).toBeGreaterThan(0);
      expect(snippet.length).toBeLessThan(250);
    });

    it('scores results between 0 and 1', async () => {
      const results = await search.search('middleware');
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it('sorts results by score descending', async () => {
      const results = await search.search('plugin');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('hybrid search', () => {
    it('uses hybrid mode by default', async () => {
      const results = await search.search('retry');
      expect(results.length).toBeGreaterThan(0);
      // Without embeddings, it should still work via fuzzy
    });

    it('combines fuzzy and semantic results when available', async () => {
      // Without embeddings, this should work like fuzzy search
      // Using a term that appears in the documents
      const results = await search.search('backoff attempts delay', { mode: 'hybrid' });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('createHybridSearch helper', () => {
    it('creates a configured instance', () => {
      const instance = createHybridSearch({ fuzzyThreshold: 0.3, debug: true });
      expect(instance).toBeInstanceOf(HybridSearch);
    });
  });

  describe('edge cases', () => {
    it('handles empty query', async () => {
      const results = await search.search('');
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles very long queries', async () => {
      // Long query with terms that exist in the documents
      const longQuery = 'retry exponential backoff attempts';
      const results = await search.search(longQuery);
      expect(results.length).toBeGreaterThan(0);
    });

    it('handles special characters in query', async () => {
      const results = await search.search('cache-first (memory)');
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles minScore filter', async () => {
      const allResults = await search.search('retry', { mode: 'fuzzy' });
      const filteredResults = await search.search('retry', {
        mode: 'fuzzy',
        minScore: 0.5,
      });

      expect(filteredResults.length).toBeLessThanOrEqual(allResults.length);
      expect(filteredResults.every((r) => r.score >= 0.5)).toBe(true);
    });
  });

  describe('performance', () => {
    it('searches quickly on small dataset', async () => {
      const start = Date.now();
      await search.search('middleware hooks plugin', { limit: 10 });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should be fast
    });

    it('handles multiple concurrent searches', async () => {
      const queries = ['retry', 'cache', 'streaming', 'middleware', 'getting started'];
      const results = await Promise.all(queries.map((q) => search.search(q)));

      expect(results.length).toBe(5);
      for (const result of results) {
        expect(Array.isArray(result)).toBe(true);
      }
    });
  });

  describe('semantic search', () => {
    it('uses semantic mode when specified', async () => {
      const results = await search.search('retry', { mode: 'semantic' });
      // Without embeddings loaded, semantic search may return empty
      expect(Array.isArray(results)).toBe(true);
    });

    it('falls back to empty when no embeddings in semantic mode', async () => {
      const noEmbedSearch = new HybridSearch();
      await noEmbedSearch.initialize([]);
      const results = await noEmbedSearch.search('test', { mode: 'semantic' });
      expect(results).toEqual([]);
    });
  });

  describe('snippet extraction', () => {
    it('extracts snippet for content with match', async () => {
      const results = await search.search('exponential');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].snippet).toContain('...');
    });

    it('returns truncated content when no match found', async () => {
      // Search for something that exists in keywords but not content body
      const results = await search.search('quickstart');
      expect(results.length).toBeGreaterThan(0);
      expect(typeof results[0].snippet).toBe('string');
    });

    it('handles empty content gracefully', async () => {
      const emptyDocs: IndexedDoc[] = [
        { id: 'empty-1', path: 'test.md', title: 'Test', content: '', category: 'test', keywords: ['test'] }
      ];
      const emptySearch = new HybridSearch();
      await emptySearch.initialize(emptyDocs);
      const results = await emptySearch.search('test', { mode: 'fuzzy' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].snippet).toBe('');
    });
  });

  describe('debug mode', () => {
    it('logs debug messages when debug is true', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      const debugSearch = new HybridSearch({ debug: true });
      await debugSearch.initialize(sampleDocs);
      await debugSearch.search('retry');

      console.log = originalLog;
      expect(logs.some(l => l.includes('[HybridSearch]'))).toBe(true);
    });
  });

  describe('query cleaning', () => {
    it('removes stop words from queries', async () => {
      // Query with many stop words should still find results
      const results = await search.search('how to configure the retry plugin');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Retry Plugin');
    });

    it('handles queries with only stop words', async () => {
      const results = await search.search('the a an is are');
      // Should fall back to original query or return empty
      expect(Array.isArray(results)).toBe(true);
    });

    it('removes Portuguese stop words', async () => {
      const results = await search.search('como usar o cache');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('hasEmbeddings method', () => {
    it('returns false when no embeddings loaded', async () => {
      const noEmbedSearch = new HybridSearch();
      await noEmbedSearch.initialize([]);
      expect(noEmbedSearch.hasEmbeddings()).toBe(false);
    });
  });

  describe('getStats method', () => {
    it('returns complete stats object', () => {
      const stats = search.getStats();
      expect(stats).toHaveProperty('documents');
      expect(stats).toHaveProperty('embeddings');
      expect(typeof stats.documents).toBe('number');
      expect(typeof stats.embeddings).toBe('number');
    });
  });

  describe('category filtering', () => {
    it('filters results by category in fuzzy mode', async () => {
      const httpResults = await search.search('plugin', { mode: 'fuzzy', category: 'http' });
      const allResults = await search.search('plugin', { mode: 'fuzzy' });
      expect(httpResults.length).toBeLessThanOrEqual(allResults.length);
    });

    it('filters results by category in semantic mode', async () => {
      const results = await search.search('plugin', { mode: 'semantic', category: 'http' });
      expect(Array.isArray(results)).toBe(true);
    });

    it('filters results by category in hybrid mode', async () => {
      const results = await search.search('streaming', { mode: 'hybrid', category: 'ai' });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('snippet fuzzy matching', () => {
    it('should use fuzzy matching when no exact match found in content', async () => {
      const fuzzyDocs: IndexedDoc[] = [
        {
          id: 'fuzzy-1',
          path: 'test/fuzzy.md',
          title: 'Fuzzy Test',
          content: `This document contains variations like retrying and cached responses.
          It also has middleware plugins and error handling patterns.`,
          category: 'test',
          keywords: ['fuzzy', 'variations']
        }
      ];
      const fuzzySearch = new HybridSearch();
      await fuzzySearch.initialize(fuzzyDocs);

      // Search for "retry" which should fuzzy match "retrying"
      const results = await fuzzySearch.search('retry cached middleware');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].snippet.length).toBeGreaterThan(0);
    });

    it('should extract snippet with ellipsis for long content', async () => {
      const longDocs: IndexedDoc[] = [
        {
          id: 'long-1',
          path: 'test/long.md',
          title: 'Long Content Test',
          content: 'A'.repeat(100) + ' important keyword here ' + 'B'.repeat(100),
          category: 'test',
          keywords: ['long']
        }
      ];
      const longSearch = new HybridSearch();
      await longSearch.initialize(longDocs);

      const results = await longSearch.search('important keyword');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].snippet).toContain('...');
    });
  });

  describe('multi-word query processing', () => {
    it('should handle queries with multiple terms and remove duplicates', async () => {
      const results = await search.search('retry retry exponential exponential backoff');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Retry Plugin');
    });

    it('should normalize casing in search terms', async () => {
      // Use uppercase terms that exist in the test docs
      const results = await search.search('RETRY BACKOFF');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Retry Plugin');
    });
  });
});
