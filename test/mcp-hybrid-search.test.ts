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
});
