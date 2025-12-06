import { describe, it, expect } from 'vitest';
import { createClient } from '../../src/index.js';
import { dedupPlugin } from '../../src/plugins/dedup.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('Dedup Plugin', () => {
  const baseUrl = 'https://api.example.com';

  it('should deduplicate simultaneous requests', async () => {
    const mockTransport = new MockTransport();

    // Should be called only once despite 3 parallel requests
    mockTransport.setMockResponse('GET', '/dedup', 200, { value: 'one' }, undefined, { delay: 50 });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [dedupPlugin()]
    });

    // Launch 3 requests at once
    const [res1, res2, res3] = await Promise.all([
      client.get('/dedup').json<{value: string}>(),
      client.get('/dedup').json<{value: string}>(),
      client.get('/dedup').json<{value: string}>()
    ]);

    expect(res1.value).toBe('one');
    expect(res2.value).toBe('one');
    expect(res3.value).toBe('one');

    // Dedup plugin should have made only 1 actual request
    expect(mockTransport.getCallCount('GET', '/dedup')).toBe(1);
  });

  it('should not deduplicate POST requests', async () => {
    const mockTransport = new MockTransport();

    // Each POST should go through
    mockTransport.setMockResponse('POST', '/data', 201, { id: 1 }, undefined, { delay: 50, times: 3 });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [dedupPlugin()]
    });

    // Launch 3 POST requests at once
    const results = await Promise.all([
      client.post('/data', { json: { name: 'a' } }).json(),
      client.post('/data', { json: { name: 'b' } }).json(),
      client.post('/data', { json: { name: 'c' } }).json()
    ]);

    expect(results.length).toBe(3);
    // All 3 requests should have been made
    expect(mockTransport.getCallCount('POST', '/data')).toBe(3);
  });

  it('should propagate errors correctly', async () => {
    const mockTransport = new MockTransport();

    // Make the request fail
    mockTransport.setMockResponse('GET', '/error', 500, { error: 'Server Error' });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [dedupPlugin()],
      throwHttpErrors: true
    });

    // Should throw error
    await expect(client.get('/error').json()).rejects.toThrow();
  });

  it('should deduplicate HEAD requests', async () => {
    const mockTransport = new MockTransport();

    mockTransport.setMockResponse('HEAD', '/check', 200, null, undefined, { delay: 30 });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [dedupPlugin()]
    });

    // Launch 2 HEAD requests at once
    await Promise.all([
      client.head('/check'),
      client.head('/check')
    ]);

    // Should be deduplicated
    expect(mockTransport.getCallCount('HEAD', '/check')).toBe(1);
  });
});
