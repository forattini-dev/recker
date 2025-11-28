import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { ReckerRequest } from '../../src/types/index.js';

// Simple Mock Transport
class LocalMockTransport {
    async dispatch(req: ReckerRequest) {
        await new Promise(r => setTimeout(r, 50)); // 50ms delay
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: req.url,
            json: async () => ({ id: req.url }),
            text: async () => '',
            raw: {} as any,
            clone: () => this as any
        } as any;
    }
}

describe('Concurrency: Batch vs RateLimit', () => {
  it('should execute batch requests concurrently', async () => {
    const client = createClient({
      baseUrl: 'http://test.com',
      transport: new LocalMockTransport()
    });

    const start = Date.now();
    const { results } = await client.batch([
        { path: '/1' },
        { path: '/2' },
        { path: '/3' },
        { path: '/4' }
    ], { concurrency: 4 });
    const duration = Date.now() - start;

    expect(results.length).toBe(4);
    // Should take roughly 50ms (parallel) not 200ms (sequential)
    expect(duration).toBeLessThan(150);
  });

  it('should respect global concurrency limit even with batch', async () => {
    const client = createClient({
      baseUrl: 'http://test.com',
      transport: new LocalMockTransport(),
      concurrency: {
        max: 2 // Global Limit: 2 concurrent
      }
    });

    const start = Date.now();
    // We batch 4 requests.
    // 1 & 2 start immediately (0ms) -> finish at 50ms
    // 3 & 4 start at 50ms -> finish at 100ms
    // Total time ~100ms
    const { results } = await client.batch([
        { path: '/1' },
        { path: '/2' },
        { path: '/3' },
        { path: '/4' }
    ], { concurrency: 4 }); // User TRIES to do 4 parallel

    const duration = Date.now() - start;

    expect(results.length).toBe(4);
    // Should be slower than unrestricted parallel
    // 50ms * 2 batches = 100ms approx
    expect(duration).toBeGreaterThanOrEqual(90);
  });

  it('should allow unlimited parallelism when no global limit is set', async () => {
    const client = createClient({
      baseUrl: 'http://test.com',
      transport: new LocalMockTransport(),
      concurrency: {
        runner: { concurrency: 10 } // Batch-only limit, no global
      }
    });

    const start = Date.now();
    // Run 2 batches in parallel (8 total requests)
    // Each batch with 4 requests, concurrency: 4
    const results = await Promise.all([
      client.batch([
        { path: '/1' },
        { path: '/2' },
        { path: '/3' },
        { path: '/4' }
      ], { concurrency: 4 }),
      client.batch([
        { path: '/5' },
        { path: '/6' },
        { path: '/7' },
        { path: '/8' }
      ], { concurrency: 4 })
    ]);

    const duration = Date.now() - start;

    expect(results.length).toBe(2);
    expect(results[0].results.length).toBe(4);
    expect(results[1].results.length).toBe(4);

    // With no global limit, both batches run fully in parallel
    // Should take ~50ms (parallel) not ~100ms (limited to 2)
    expect(duration).toBeLessThan(100);
  });
});
