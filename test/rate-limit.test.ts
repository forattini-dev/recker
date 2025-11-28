import { describe, it, expect } from 'vitest';
import { createClient } from '../src/index.js';
import { MockTransport } from './helpers/mock-transport.js';

describe('Rate limiting via task pool', () => {
  const baseUrl = 'https://rate-limit.test';

  it('queues requests to honor rate limits', async () => {
    const mockTransport = new MockTransport();
    // Add delay to simulate network latency and allow rate limiter to work
    mockTransport.setMockResponse('GET', '/limited', 200, 'ok', undefined, { delay: 50 });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      rateLimit: { concurrency: 1, requestsPerInterval: 1, interval: 60 }
    });

    const start = Date.now();
    const [a, b] = await Promise.all([
      client.get('/limited').text(),
      client.get('/limited').text()
    ]);
    const elapsed = Date.now() - start;

    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(elapsed).toBeGreaterThanOrEqual(50);
    expect(mockTransport.getCallCount('GET', '/limited')).toBe(2);
  });
});
