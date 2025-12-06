import { describe, it, expect } from 'vitest';
import { createClient } from '../../src/index.js';
import { cache } from '../../src/plugins/cache.js';
import { MockTransport } from '../helpers/mock-transport.js';
import { MemoryStorage } from '../../src/cache/memory-storage.js';

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

  describe('Vary header support (RFC-7234)', () => {
    it.todo('should cache responses with different Accept-Encoding separately', async () => {
      const mockTransport = new MockTransport();

      // Setup different responses for different encodings
      mockTransport.setMockResponse('GET', '/vary-encoding', 200,
        { data: 'gzipped' },
        { 'Vary': 'Accept-Encoding', 'Content-Encoding': 'gzip' }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, ttl: 5000 })]
      });

      // Request with gzip encoding
      const res1 = await client.get('/vary-encoding', {
        headers: { 'Accept-Encoding': 'gzip' }
      }).json<{ data: string }>();
      expect(res1.data).toBe('gzipped');

      // Change mock to return different data for br encoding
      mockTransport.setMockResponse('GET', '/vary-encoding', 200,
        { data: 'brotli' },
        { 'Vary': 'Accept-Encoding', 'Content-Encoding': 'br' }
      );

      // Request with br encoding - should get fresh response (different cache key)
      const res2 = await client.get('/vary-encoding', {
        headers: { 'Accept-Encoding': 'br' }
      }).json<{ data: string }>();
      expect(res2.data).toBe('brotli');

      // Request again with gzip - should hit cache
      const res3 = await client.get('/vary-encoding', {
        headers: { 'Accept-Encoding': 'gzip' }
      }).json<{ data: string }>();
      expect(res3.data).toBe('gzipped');

      // Should have made 2 network calls (one for gzip, one for br, third was cache hit)
      expect(mockTransport.getCallCount('GET', '/vary-encoding')).toBe(2);
    });

    it.todo('should handle Vary: * by not caching', async () => {
      const mockTransport = new MockTransport();

      let callCount = 0;
      mockTransport.setMockResponse('GET', '/vary-star', 200,
        () => ({ call: ++callCount }),
        { 'Vary': '*' }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, ttl: 5000 })]
      });

      const res1 = await client.get('/vary-star').json<{ call: number }>();
      expect(res1.call).toBe(1);

      const res2 = await client.get('/vary-star').json<{ call: number }>();
      expect(res2.call).toBe(2); // Should be fresh fetch, not cached

      // Verify both calls hit network
      expect(mockTransport.getCallCount('GET', '/vary-star')).toBe(2);
    });

    it.todo('should handle multiple Vary headers', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/vary-multiple', 200,
        { lang: 'en', format: 'json' },
        { 'Vary': 'Accept-Language, Accept' }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, ttl: 5000 })]
      });

      // First request
      const res1 = await client.get('/vary-multiple', {
        headers: {
          'Accept-Language': 'en',
          'Accept': 'application/json'
        }
      }).json<{ lang: string; format: string }>();
      expect(res1.lang).toBe('en');

      // Same headers - should hit cache
      const res2 = await client.get('/vary-multiple', {
        headers: {
          'Accept-Language': 'en',
          'Accept': 'application/json'
        }
      }).json<{ lang: string; format: string }>();
      expect(res2.lang).toBe('en');

      // Change mock for different language
      mockTransport.setMockResponse('GET', '/vary-multiple', 200,
        { lang: 'fr', format: 'json' },
        { 'Vary': 'Accept-Language, Accept' }
      );

      // Different language - should be cache miss
      const res3 = await client.get('/vary-multiple', {
        headers: {
          'Accept-Language': 'fr',
          'Accept': 'application/json'
        }
      }).json<{ lang: string; format: string }>();
      expect(res3.lang).toBe('fr');

      // Verify 2 network calls (first, then cache hit, then third with different lang)
      expect(mockTransport.getCallCount('GET', '/vary-multiple')).toBe(2);
    });

    it.todo('should ignore Vary when respectVary is false', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/no-vary-respect', 200,
        { data: 'first' },
        { 'Vary': 'Accept-Encoding' }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, ttl: 5000, respectVary: false })]
      });

      const res1 = await client.get('/no-vary-respect', {
        headers: { 'Accept-Encoding': 'gzip' }
      }).json<{ data: string }>();
      expect(res1.data).toBe('first');

      // Different encoding, but should hit cache (ignoring Vary)
      const res2 = await client.get('/no-vary-respect', {
        headers: { 'Accept-Encoding': 'br' }
      }).json<{ data: string }>();
      expect(res2.data).toBe('first'); // Same as first (from cache)

      // Verify only 1 network call
      expect(mockTransport.getCallCount('GET', '/no-vary-respect')).toBe(1);
    });
  });

  describe('Expires header support (RFC-7234 legacy)', () => {
    it('should respect Expires header when max-age not present', async () => {
      const mockTransport = new MockTransport();

      // Set Expires 2 seconds in the future
      const futureDate = new Date(Date.now() + 2000);
      mockTransport.setMockResponse('GET', '/expires', 200,
        { data: 'fresh' },
        { 'Expires': futureDate.toUTCString() }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // First request
      const res1 = await client.get('/expires').json<{ data: string }>();
      expect(res1.data).toBe('fresh');

      // Second request within Expires time - should hit cache
      const res2 = await client.get('/expires').json<{ data: string }>();
      expect(res2.data).toBe('fresh');

      // Should only have made 1 network call
      expect(mockTransport.getCallCount('GET', '/expires')).toBe(1);
    });

    it('should treat expired Expires header as stale', async () => {
      const mockTransport = new MockTransport();

      // Set Expires in the past
      const pastDate = new Date(Date.now() - 1000);
      mockTransport.setMockResponse('GET', '/expired', 200,
        { data: 'old' },
        { 'Expires': pastDate.toUTCString() },
        { times: 1 }
      );

      mockTransport.setMockResponse('GET', '/expired', 200,
        { data: 'new' },
        undefined,
        { times: 1 }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // First request - cache with expired Expires
      const res1 = await client.get('/expired').json<{ data: string }>();
      expect(res1.data).toBe('old');

      // Second request - should revalidate due to expired Expires
      const res2 = await client.get('/expired').json<{ data: string }>();
      expect(res2.data).toBe('new');

      // Should have made 2 network calls (no ETag, so new fetch instead of 304)
      expect(mockTransport.getCallCount('GET', '/expired')).toBe(2);
    });

    it('should prefer max-age over Expires', async () => {
      const mockTransport = new MockTransport();

      // Expires says expired, but max-age=10 says fresh
      const pastDate = new Date(Date.now() - 1000);
      mockTransport.setMockResponse('GET', '/prefer-maxage', 200,
        { data: 'cached' },
        {
          'Cache-Control': 'max-age=10',
          'Expires': pastDate.toUTCString()
        }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // First request
      const res1 = await client.get('/prefer-maxage').json<{ data: string }>();
      expect(res1.data).toBe('cached');

      // Second request - should use cache despite expired Expires (max-age takes precedence)
      const res2 = await client.get('/prefer-maxage').json<{ data: string }>();
      expect(res2.data).toBe('cached');

      // Should only have made 1 network call (max-age overrides Expires)
      expect(mockTransport.getCallCount('GET', '/prefer-maxage')).toBe(1);
    });
  });

  describe('Pragma: no-cache support (HTTP/1.0 legacy)', () => {
    it('should bypass cache when request has Pragma: no-cache', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/pragma', 200, { count: 1 }, undefined, { times: 1 });
      mockTransport.setMockResponse('GET', '/pragma', 200, { count: 2 }, undefined, { times: 1 });

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, ttl: 5000 })]
      });

      // First request without Pragma - should cache
      const res1 = await client.get('/pragma').json<{ count: number }>();
      expect(res1.count).toBe(1);

      // Second request without Pragma - should hit cache
      const res2 = await client.get('/pragma').json<{ count: number }>();
      expect(res2.count).toBe(1); // Same value from cache

      // Third request with Pragma: no-cache - should bypass cache
      const res3 = await client.get('/pragma', {
        headers: { 'Pragma': 'no-cache' }
      }).json<{ count: number }>();
      expect(res3.count).toBe(2); // Fresh value

      // Should have made 2 network calls (first and third, second was cached)
      expect(mockTransport.getCallCount('GET', '/pragma')).toBe(2);
    });
  });

  describe('Warning headers (RFC-7234)', () => {
    it('should add Warning 110 for stale-while-revalidate responses', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/swr-warning', 200, { data: 'cached' });

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'stale-while-revalidate', ttl: 5000 })]
      });

      // First request - cache it
      await client.get('/swr-warning');

      // Second request - returns stale immediately with Warning 110
      const res2 = await client.get('/swr-warning');
      const warning = res2.headers.get('Warning');

      expect(warning).toBeTruthy();
      expect(warning).toContain('110');
      expect(warning).toContain('Response is Stale');

      // Also check that X-Cache header confirms it's from cache
      expect(res2.headers.get('X-Cache')).toBe('stale');
    });

    it.todo('should add Warning 111 for failed revalidation', async () => {
      // TODO: Implement test for Warning 111 when revalidation fails
      // This requires simulating network errors in the mock transport
    });
  });

  describe('Heuristic freshness (RFC-7234 Section 4.2.2)', () => {
    it('should calculate freshness using Last-Modified heuristic', async () => {
      const mockTransport = new MockTransport();

      // Response with Last-Modified but no Cache-Control or Expires
      const lastModified = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
      mockTransport.setMockResponse('GET', '/heuristic', 200,
        { data: 'cached' },
        {
          'Last-Modified': lastModified.toUTCString(),
          'Date': new Date().toUTCString()
        }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // First request - should cache with heuristic freshness (10% of 100 days = 10 days)
      const res1 = await client.get('/heuristic').json<{ data: string }>();
      expect(res1.data).toBe('cached');

      // Second request immediately - should hit cache (within 10 day freshness)
      const res2 = await client.get('/heuristic').json<{ data: string }>();
      expect(res2.data).toBe('cached');
      expect(mockTransport.getCallCount('GET', '/heuristic')).toBe(1);
    });

    it('should prefer explicit max-age over heuristic', async () => {
      const mockTransport = new MockTransport();

      // Response with both Last-Modified and Cache-Control
      const lastModified = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      mockTransport.setMockResponse('GET', '/explicit-wins', 200,
        { data: 'first' },
        {
          'Last-Modified': lastModified.toUTCString(),
          'Cache-Control': 'max-age=1' // 1 second
        },
        { times: 1 }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant', ttl: 10000 })]
      });

      // First request
      await client.get('/explicit-wins');

      // Wait for max-age to expire (2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should revalidate (max-age=1 overrides heuristic)
      mockTransport.setMockResponse('GET', '/explicit-wins', 200, { data: 'second' });
      const res = await client.get('/explicit-wins').json<{ data: string }>();
      expect(res.data).toBe('second');
      expect(mockTransport.getCallCount('GET', '/explicit-wins')).toBe(2);
    });

    it('should consider entry stale when no freshness info available', async () => {
      const mockTransport = new MockTransport();

      // Response with NO freshness indicators
      mockTransport.setMockResponse('GET', '/no-freshness', 200,
        { data: 'first' },
        {}, // No Cache-Control, Expires, or Last-Modified
        { times: 1 }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant', ttl: 10000 })]
      });

      // First request
      await client.get('/no-freshness');

      // Second request - should revalidate (no freshness info = stale)
      mockTransport.setMockResponse('GET', '/no-freshness', 200, { data: 'second' });
      const res = await client.get('/no-freshness').json<{ data: string }>();
      expect(res.data).toBe('second');
      expect(mockTransport.getCallCount('GET', '/no-freshness')).toBe(2);
    });
  });

  describe('Request Cache-Control directives (RFC-7234 Section 5.2)', () => {
    it('should respect max-age request directive', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/maxage', 200,
        { data: 'cached' },
        { 'Cache-Control': 'max-age=60' }, // Response valid for 60s
        { times: 1 }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // First request - cache with 60s max-age
      await client.get('/maxage');

      // Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Request with max-age=1 (only accept responses < 1s old)
      // Should reject cached response and fetch fresh
      mockTransport.setMockResponse('GET', '/maxage', 200, { data: 'fresh' });

      const res = await client.get('/maxage', {
        headers: { 'Cache-Control': 'max-age=1' }
      }).json<{ data: string }>();

      expect(res.data).toBe('fresh');
      expect(mockTransport.getCallCount('GET', '/maxage')).toBe(2);
    });

    it('should respect min-fresh request directive', async () => {
      const mockTransport = new MockTransport();

      // Response cached with 5s max-age
      mockTransport.setMockResponse('GET', '/minfresh', 200,
        { data: 'cached' },
        { 'Cache-Control': 'max-age=5' },
        { times: 1 }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // First request
      await client.get('/minfresh');

      // Wait 2 seconds (cached response is 2s old, still fresh for 3s)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Request with min-fresh=5 (need response fresh for at least 5s more)
      // Should reject cached response (only 3s freshness remaining)
      mockTransport.setMockResponse('GET', '/minfresh', 200, { data: 'fresh' });

      const res = await client.get('/minfresh', {
        headers: { 'Cache-Control': 'min-fresh=5' }
      }).json<{ data: string }>();

      expect(res.data).toBe('fresh');
      expect(mockTransport.getCallCount('GET', '/minfresh')).toBe(2);
    });

    it('should respect max-stale request directive', async () => {
      const mockTransport = new MockTransport();

      // Pre-populate cache with a stale entry
      const storage = new MemoryStorage();
      const baseUrl = 'https://api.example.com';
      const cacheKey = `GET:${baseUrl}/maxstale`;

      // Create a stale entry (2 seconds old with 1 second max-age)
      const staleEntry = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({ data: 'stale' }),
        timestamp: Date.now() - 2000, // 2 seconds ago
        maxAge: 1 // 1 second max-age (so it's stale by 1 second)
      };
      await storage.set(cacheKey, staleEntry, 10000); // 10s storage TTL

      // Add mock response in case it hits network (it shouldn't, but prevents crash)
      // mockTransport.setMockResponse('GET', '/maxstale', 200, { data: 'fresh' });

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // Request with max-stale=10 (accept stale up to 10s old)
      // Should use cached stale response without revalidation
      const response = await client.get('/maxstale', {
        headers: { 'Cache-Control': 'max-stale=10' }
      });

      const data = await response.json<{ data: string }>();
      expect(data.data).toBe('stale');
      expect(response.headers.get('X-Cache')).toBe('stale'); // Stale entry served via max-stale

      // Should have made 0 network calls (served from cache without revalidation)
      expect(mockTransport.getCallCount('GET', '/maxstale')).toBe(0);
    });

    it('should reject stale response exceeding max-stale limit', async () => {
      const mockTransport = new MockTransport();

      // Pre-populate cache with a very stale entry
      const storage = new MemoryStorage();
      const baseUrl = 'https://api.example.com';
      const cacheKey = `GET:${baseUrl}/maxstale-limit`;

      // Create a very stale entry (3 seconds old with 1 second max-age = 2s stale)
      const staleEntry = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({ data: 'stale' }),
        timestamp: Date.now() - 3000, // 3 seconds ago
        maxAge: 1 // 1 second max-age (so it's stale by 2 seconds)
      };
      await storage.set(cacheKey, staleEntry, 10000); // 10s storage TTL

      // Setup fresh response
      mockTransport.setMockResponse('GET', '/maxstale-limit', 200, { data: 'fresh' });

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // Request with max-stale=1 (only accept stale up to 1s)
      // Response is 2s stale, should fetch fresh
      const res = await client.get('/maxstale-limit', {
        headers: { 'Cache-Control': 'max-stale=1' }
      }).json<{ data: string }>();

      expect(res.data).toBe('fresh');
      expect(mockTransport.getCallCount('GET', '/maxstale-limit')).toBe(1);
    });

    it('should handle only-if-cached directive', async () => {
      const mockTransport = new MockTransport();
      const storage = new MemoryStorage();

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // Request with only-if-cached but no cache entry
      // Should return 504 Gateway Timeout (not an error, just a valid status)
      const res1 = await client.get('/only-cached', {
        headers: { 'Cache-Control': 'only-if-cached' },
        throwHttpErrors: false // 504 is a valid response for only-if-cached
      });

      expect(res1.status).toBe(504);
      expect(res1.statusText).toBe('Gateway Timeout');

      // Now populate cache
      mockTransport.setMockResponse('GET', '/only-cached', 200, { data: 'cached' });
      await client.get('/only-cached');

      // Request with only-if-cached - should return cached without network
      const res2 = await client.get('/only-cached', {
        headers: { 'Cache-Control': 'only-if-cached' }
      }).json<{ data: string }>();

      expect(res2.data).toBe('cached');
      expect(mockTransport.getCallCount('GET', '/only-cached')).toBe(1); // Only first request
    });

    it('should force revalidation with no-cache request directive', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/req-nocache', 200,
        { data: 'first' },
        { 'Cache-Control': 'max-age=60' },
        { times: 1 }
      );

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // First request - cache it
      const res1 = await client.get('/req-nocache').json<{ data: string }>();
      expect(res1.data).toBe('first');

      // Second request normally - should hit cache
      const res2 = await client.get('/req-nocache').json<{ data: string }>();
      expect(res2.data).toBe('first');
      expect(mockTransport.getCallCount('GET', '/req-nocache')).toBe(1);

      // Third request with no-cache - should revalidate
      mockTransport.setMockResponse('GET', '/req-nocache', 200, { data: 'revalidated' });

      const res3 = await client.get('/req-nocache', {
        headers: { 'Cache-Control': 'no-cache' }
      }).json<{ data: string }>();

      expect(res3.data).toBe('revalidated');
      expect(mockTransport.getCallCount('GET', '/req-nocache')).toBe(2);
    });
  });

  describe('network-first strategy', () => {
    it('should fetch from network first and cache the response', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/network-first', 200, { data: 'from-network' });

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, ttl: 60000, strategy: 'network-first' })]
      });

      // First request - hits network
      const res1 = await client.get('/network-first').json<{ data: string }>();
      expect(res1.data).toBe('from-network');
      expect(mockTransport.getCallCount('GET', '/network-first')).toBe(1);

      // Second request - also hits network (network-first)
      const res2 = await client.get('/network-first').json<{ data: string }>();
      expect(res2.data).toBe('from-network');
      expect(mockTransport.getCallCount('GET', '/network-first')).toBe(2);
    });

    it('should fallback to cache when network fails', async () => {
      const mockTransport = new MockTransport();

      // First request succeeds
      mockTransport.setMockResponse('GET', '/network-fail', 200, { data: 'cached-value' }, undefined, { times: 1 });

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, ttl: 60000, strategy: 'network-first' })]
      });

      // First request - hits network and caches
      const res1 = await client.get('/network-fail').json<{ data: string }>();
      expect(res1.data).toBe('cached-value');
      expect(mockTransport.getCallCount('GET', '/network-fail')).toBe(1);

      // Setup network failure for second request
      mockTransport.setMockError('GET', '/network-fail', new Error('Network error'));

      // Second request - network fails, should fallback to cache
      const res2 = await client.get('/network-fail').json<{ data: string }>();
      expect(res2.data).toBe('cached-value');
    });

    it('should throw error when network fails and no cache available', async () => {
      const mockTransport = new MockTransport();

      // Setup network failure
      mockTransport.setMockError('GET', '/no-cache-fail', new Error('Network error'));

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, ttl: 60000, strategy: 'network-first' })]
      });

      // Request without cache - should throw
      await expect(client.get('/no-cache-fail')).rejects.toThrow('Network error');
    });

    it('should cache network response even if not accessed again', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/cache-store', 200, { data: 'stored' });

      const storage = new MemoryStorage();
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [cache({ storage, ttl: 60000, strategy: 'network-first' })]
      });

      // Request to store in cache
      const res1 = await client.get('/cache-store').json<{ data: string }>();
      expect(res1.data).toBe('stored');

      // Verify it was stored in cache
      const keys = await storage.keys?.() || [];
      expect(keys.length).toBeGreaterThan(0);
    });
  });
});
