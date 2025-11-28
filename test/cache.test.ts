import { describe, it, expect } from 'vitest';
import { createClient } from '../src/index.js';
import { cache } from '../src/plugins/cache.js';
import { MockTransport } from './helpers/mock-transport.js';
import { MemoryStorage } from '../src/cache/memory-storage.js';

describe('Cache Plugin', () => {
  const baseUrl = 'https://api.example.com';

  it('should cache GET requests', async () => {
    const mockTransport = new MockTransport();

    // Should be called only once
    mockTransport.setMockResponse('GET', '/data', 200, { value: 'fresh' });

    const storage = new MemoryStorage();
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [cache({ storage, ttl: 1000 })]
    });

    // First request: Network
    const res1 = await client.get('/data').json<{ value: string }>();
    expect(res1.value).toBe('fresh');

    // Second request: Cache (should not hit network)
    const res2 = await client.get('/data').json<{ value: string }>();
    expect(res2.value).toBe('fresh');

    // Verify only 1 network call was made
    expect(mockTransport.getCallCount('GET', '/data')).toBe(1);
  });

  it('should respect TTL', async () => {
    const mockTransport = new MockTransport();

    mockTransport.setMockResponse('GET', '/ttl', 200, { v: 1 }, undefined, { times: 1 });
    mockTransport.setMockResponse('GET', '/ttl', 200, { v: 2 }, undefined, { times: 1 });

    const storage = new MemoryStorage();
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [cache({ storage, ttl: 100 })] // 100ms TTL
    });

    await client.get('/ttl'); // v: 1

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    const res2 = await client.get('/ttl').json<{ v: number }>();
    expect(res2.v).toBe(2); // Should be fresh

    // Verify 2 network calls (cache expired)
    expect(mockTransport.getCallCount('GET', '/ttl')).toBe(2);
  });

  it('should support stale-while-revalidate', async () => {
    const mockTransport = new MockTransport();

    // Network has fresher value (v:2)
    mockTransport.setMockResponse('GET', '/swr', 200, { v: 2 });

    const storage = new MemoryStorage();

    // Pre-populate cache to simulate stale entry (v:1)
    await storage.set(`GET:${baseUrl}/swr`, {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: JSON.stringify({ v: 1 }),
      timestamp: Date.now() - 1000 // Old timestamp
    }, 5000); // Long TTL

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [cache({ storage, strategy: 'stale-while-revalidate', ttl: 5000 })]
    });

    // Should return stale value (v:1) immediately
    const res1 = await client.get('/swr').json<{ v: number }>();
    expect(res1.v).toBe(1);

    // Wait for background fetch to update storage
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check storage directly to see if it was updated to v:2
    const entry = await storage.get(`GET:${baseUrl}/swr`);
    expect(JSON.parse(entry!.body).v).toBe(2);

    // Verify network call happened in background
    expect(mockTransport.getCallCount('GET', '/swr')).toBe(1);
  });
});
