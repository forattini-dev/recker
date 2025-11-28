import { describe, it, expect } from 'vitest';
import { createClient } from '../src/index.js';
import { dedup } from '../src/plugins/dedup.js';
import { MockTransport } from './helpers/mock-transport.js';

describe('Dedup Plugin', () => {
  const baseUrl = 'https://api.example.com';

  it('should deduplicate simultaneous requests', async () => {
    const mockTransport = new MockTransport();

    // Should be called only once despite 3 parallel requests
    mockTransport.setMockResponse('GET', '/dedup', 200, { value: 'one' }, undefined, { delay: 50 });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [dedup()]
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
});
