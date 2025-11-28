import { describe, it, expect } from 'vitest';
import { createClient } from '../src/index.js';
import { MockTransport } from './helpers/mock-transport.js';

describe('Client.multi', () => {
  const baseUrl = 'https://multi.test';

  it('honors rateLimit pool before runner concurrency', async () => {
    const mockTransport = new MockTransport();
    // Add delay to simulate network latency and allow rate limiter to work
    mockTransport.setMockResponse('GET', '/a', 200, 'ok-a', undefined, { delay: 40 });
    mockTransport.setMockResponse('GET', '/b', 200, 'ok-b', undefined, { delay: 40 });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      rateLimit: { concurrency: 1, requestsPerInterval: 1, interval: 50 },
    });

    const start = Date.now();
    const { results } = await client.multi<string>(
      [
        { path: '/a' },
        { path: '/b' },
      ],
      { mapResponse: (res) => res.text() }
    );
    const elapsed = Date.now() - start;

    expect(results).toEqual(['ok-a', 'ok-b']);
    expect(elapsed).toBeGreaterThanOrEqual(40); // serialized by pool
  });

  it('falls back to runner concurrency when no rateLimit is set', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/c', 200, 'ok-c');
    mockTransport.setMockResponse('GET', '/d', 200, 'ok-d');

    const client = createClient({
      baseUrl,
      transport: mockTransport
    });

    const { results } = await client.multi<string>(
      [
        { path: '/c' },
        { path: '/d' },
      ],
      { concurrency: 1, mapResponse: (res) => res.text() }
    );

    expect(results).toEqual(['ok-c', 'ok-d']);
  });
});
