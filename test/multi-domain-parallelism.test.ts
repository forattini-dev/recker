import { describe, it, expect } from 'vitest';
import { createClient } from '../src/core/client.js';

/**
 * Multi-Domain Parallelism Tests
 *
 * These tests verify the unified concurrency architecture using public API services
 * to ensure proper parallel execution across multiple domains.
 *
 * Public APIs used (API-friendly endpoints):
 * - GitHub API (https://api.github.com/zen)
 * - NPM Registry (https://registry.npmjs.org)
 * - HTTPBin (https://httpbin.org)
 * - JSONPlaceholder (https://jsonplaceholder.typicode.com)
 * - DummyJSON (https://dummyjson.com)
 * - Tetis.io (https://tetis.io)
 */

// Public endpoints that are stable and API-friendly
const PUBLIC_ENDPOINTS = {
  github: 'https://api.github.com/zen',
  npm: 'https://registry.npmjs.org/express',
  httpbin: 'https://httpbin.org/delay/0',
  jsonplaceholder: 'https://jsonplaceholder.typicode.com/posts/1',
  dummyjson: 'https://dummyjson.com/products/1',
  tetis: 'https://tetis.io',
};

describe('Multi-Domain Parallelism', () => {
  it('should execute multiple batches in parallel without global limit', async () => {
    const client = createClient({
      baseUrl: 'https://example.com',
      concurrency: {
        runner: { concurrency: 2 }, // Each batch limited to 2
        agent: {
          perDomainPooling: true
        }
      }
    });

    const batch1 = [
      { path: PUBLIC_ENDPOINTS.github },
      { path: PUBLIC_ENDPOINTS.npm },
    ];

    const batch2 = [
      { path: PUBLIC_ENDPOINTS.jsonplaceholder },
      { path: PUBLIC_ENDPOINTS.dummyjson },
    ];

    const start = Date.now();

    // Run 2 batches in parallel (4 total requests)
    const results = await Promise.all([
      client.batch(batch1, { concurrency: 2 }),
      client.batch(batch2, { concurrency: 2 }),
    ]);

    const duration = Date.now() - start;

    expect(results).toHaveLength(2);
    expect(results[0].results).toHaveLength(2);
    expect(results[1].results).toHaveLength(2);

    console.log(`[Multi-Domain Parallelism] 4 requests across 2 batches completed in ${duration}ms`);

    // At least 75% should be successful
    const successCount = results.reduce((sum, batch) =>
      sum + batch.results.filter(r => !(r instanceof Error)).length, 0
    );
    const successRate = successCount / 4;
    console.log(`Success rate: ${(successRate * 100).toFixed(1)}% (${successCount}/4)`);
    expect(successRate).toBeGreaterThanOrEqual(0.75);
  });

  it('should respect global concurrency limit across all batches', async () => {
    const client = createClient({
      baseUrl: 'https://example.com',
      concurrency: {
        max: 3, // Global limit: 3 concurrent total
        runner: { concurrency: 10 }, // Higher than global
        agent: {
          perDomainPooling: true
        }
      }
    });

    const batch1 = [
      { path: PUBLIC_ENDPOINTS.github },
      { path: PUBLIC_ENDPOINTS.npm },
    ];

    const batch2 = [
      { path: PUBLIC_ENDPOINTS.jsonplaceholder },
      { path: PUBLIC_ENDPOINTS.dummyjson },
    ];

    const start = Date.now();

    // Run 2 batches in parallel, but global limit is 3
    const results = await Promise.all([
      client.batch(batch1, { concurrency: 10 }),
      client.batch(batch2, { concurrency: 10 }),
    ]);

    const duration = Date.now() - start;

    expect(results).toHaveLength(2);

    console.log(`[Global Limit] 4 requests with max=3 completed in ${duration}ms`);

    // Should have results from both batches
    const totalResults = results[0].results.length + results[1].results.length;
    expect(totalResults).toBe(4);
  });

  it('should use per-domain connection pooling efficiently', async () => {
    const client = createClient({
      baseUrl: 'https://example.com',
      concurrency: {
        max: 6,
        agent: {
          connections: 'auto',
          perDomainPooling: true
        }
      }
    });

    // Multiple requests to the same domains
    const requests = [
      { path: PUBLIC_ENDPOINTS.github },
      { path: PUBLIC_ENDPOINTS.github },
      { path: PUBLIC_ENDPOINTS.npm },
      { path: PUBLIC_ENDPOINTS.npm },
      { path: PUBLIC_ENDPOINTS.jsonplaceholder },
      { path: PUBLIC_ENDPOINTS.jsonplaceholder },
    ];

    const start = Date.now();
    const { results, stats } = await client.batch(requests, { concurrency: 6 });
    const duration = Date.now() - start;

    expect(results).toHaveLength(6);

    console.log(`[Per-Domain Pooling] 6 requests across 3 domains completed in ${duration}ms`);
    console.log(`Stats:`, stats);

    // At least 4 out of 6 should succeed (67%)
    expect(stats.successful).toBeGreaterThanOrEqual(4);
  });

  it('should handle batch-only concurrency for maximum parallelism', async () => {
    const client = createClient({
      baseUrl: 'https://example.com',
      concurrency: {
        runner: { concurrency: 3 },
        agent: {
          perDomainPooling: true
        }
      }
      // Note: No 'max' specified → Infinity (no global limit)
    });

    const createBatch = (endpoints: string[]) =>
      endpoints.map(path => ({ path }));

    const start = Date.now();

    // Run 2 batches in parallel, each with 3 requests
    // Total: 6 concurrent requests (no global limit)
    const results = await Promise.all([
      client.batch(createBatch([
        PUBLIC_ENDPOINTS.github,
        PUBLIC_ENDPOINTS.npm,
        PUBLIC_ENDPOINTS.httpbin,
      ]), { concurrency: 3 }),
      client.batch(createBatch([
        PUBLIC_ENDPOINTS.jsonplaceholder,
        PUBLIC_ENDPOINTS.dummyjson,
        PUBLIC_ENDPOINTS.github,
      ]), { concurrency: 3 }),
    ]);

    const duration = Date.now() - start;

    expect(results).toHaveLength(2);

    const totalRequests = results.reduce((sum, batch) => sum + batch.results.length, 0);
    expect(totalRequests).toBe(6);

    console.log(`[Batch-Only Limit] 6 requests across 2 batches (3 each) completed in ${duration}ms`);

    // At least 75% success
    const successCount = results.reduce((sum, batch) => sum + batch.stats.successful, 0);
    expect(successCount).toBeGreaterThanOrEqual(4);
  });

  it('should handle rate limiting across multiple domains', async () => {
    const client = createClient({
      baseUrl: 'https://example.com',
      concurrency: {
        max: 5,
        requestsPerInterval: 2, // Max 2 requests START per second
        interval: 1000,
        agent: {
          perDomainPooling: true
        }
      }
    });

    const requests = [
      { path: PUBLIC_ENDPOINTS.github },
      { path: PUBLIC_ENDPOINTS.npm },
      { path: PUBLIC_ENDPOINTS.httpbin },
      { path: PUBLIC_ENDPOINTS.jsonplaceholder },
      { path: PUBLIC_ENDPOINTS.tetis },
    ];

    const start = Date.now();
    const { results, stats } = await client.batch(requests, { concurrency: 5 });
    const duration = Date.now() - start;

    expect(results).toHaveLength(5);

    // With rate limiting of 2 starts/sec, 5 requests should take at least 2 seconds
    // First 2 start at 0ms
    // Next 2 start at 1000ms
    // Last 1 starts at 2000ms
    console.log(`[Rate Limiting] 5 requests with 2 req/sec limit completed in ${duration}ms`);
    console.log(`Stats:`, stats);

    // Should take at least ~2 seconds due to rate limiting
    expect(duration).toBeGreaterThanOrEqual(1800);

    // At least 3 out of 5 should succeed
    expect(stats.successful).toBeGreaterThanOrEqual(3);
  });

  it('should override batch concurrency per batch', async () => {
    const client = createClient({
      baseUrl: 'https://example.com',
      concurrency: 10
    });

    const batch1 = [
      { path: PUBLIC_ENDPOINTS.github },
      { path: PUBLIC_ENDPOINTS.npm },
    ];

    const batch2 = [
      { path: PUBLIC_ENDPOINTS.jsonplaceholder },
      { path: PUBLIC_ENDPOINTS.dummyjson },
    ];

    const start = Date.now();

    const results = await Promise.all([
      client.batch(batch1, { concurrency: 2 }),
      client.batch(batch2, { concurrency: 2 }),
    ]);

    const duration = Date.now() - start;

    expect(results).toHaveLength(2);

    console.log(`[Batch Override] 4 requests with different batch concurrency completed in ${duration}ms`);

    // At least 75% success
    const successCount = results.reduce((sum, batch) => sum + batch.stats.successful, 0);
    expect(successCount).toBeGreaterThanOrEqual(3);
  });

  it('should handle mixed domain requests efficiently', async () => {
    const client = createClient({
      baseUrl: 'https://example.com',
      concurrency: {
        max: 8,
        agent: {
          connections: 'auto',
          perDomainPooling: true
        }
      }
    });

    // Mix of domains to test per-domain pooling
    const requests = [
      { path: PUBLIC_ENDPOINTS.github },
      { path: PUBLIC_ENDPOINTS.github },
      { path: PUBLIC_ENDPOINTS.npm },
      { path: PUBLIC_ENDPOINTS.npm },
      { path: PUBLIC_ENDPOINTS.jsonplaceholder },
      { path: PUBLIC_ENDPOINTS.jsonplaceholder },
      { path: PUBLIC_ENDPOINTS.dummyjson },
      { path: PUBLIC_ENDPOINTS.dummyjson },
      { path: PUBLIC_ENDPOINTS.tetis },
      { path: PUBLIC_ENDPOINTS.tetis },
    ];

    const start = Date.now();
    const { results, stats } = await client.batch(requests, { concurrency: 10 });
    const duration = Date.now() - start;

    expect(results).toHaveLength(10);

    console.log(`[Mixed Domains] 10 requests across 5 domains completed in ${duration}ms`);
    console.log(`Stats:`, stats);

    // At least 6 out of 10 should succeed (60% - lower threshold for more domains)
    expect(stats.successful).toBeGreaterThanOrEqual(6);
  });
});
