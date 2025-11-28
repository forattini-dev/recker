import { describe, it, expect } from 'vitest';
import { createClient } from '../src/index.js';
import { MockTransport } from './helpers/mock-transport.js';

describe('Configuration Driven Setup', () => {
  const baseUrl = 'https://api.example.com';

  it('should configure retry via options', async () => {
    const mockTransport = new MockTransport();

    // Fail once, succeed second time
    mockTransport.setMockResponse('GET', '/retry-config', 503, '', undefined, { times: 1 });
    mockTransport.setMockResponse('GET', '/retry-config', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      retry: { maxAttempts: 3, delay: 10 } // Config-driven
    });

    const res = await client.get('/retry-config').json();
    expect(res).toEqual({ ok: true });
  });

  it('should configure cache via options', async () => {
    const mockTransport = new MockTransport();

    // Should only be called once
    mockTransport.setMockResponse('GET', '/cache-config', 200, { count: 1 });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      cache: { driver: 'memory', ttl: 1000 } // Config-driven
    });

    await client.get('/cache-config');
    const res = await client.get('/cache-config').json<{count: number}>();
    expect(res.count).toBe(1);

    // Cache should have prevented second network call
    expect(mockTransport.getCallCount('GET', '/cache-config')).toBe(1);
  });

  it('should mix config and plugins', async () => {
    // Just ensuring no crash
    const client = createClient({
      baseUrl,
      retry: { maxAttempts: 1 },
      plugins: []
    });
    expect(client).toBeDefined();
  });
});
