import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, cache, parseCacheControl, MemoryStorage } from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('RFC-Compliant Cache', () => {
  let mockTransport: MockTransport;
  let storage: MemoryStorage;

  beforeEach(() => {
    mockTransport = new MockTransport();
    storage = new MemoryStorage();
    vi.clearAllMocks();
  });

  describe('parseCacheControl', () => {
    it('should parse max-age directive', () => {
      const result = parseCacheControl('max-age=3600');
      expect(result.maxAge).toBe(3600);
    });

    it('should parse s-maxage directive', () => {
      const result = parseCacheControl('s-maxage=7200');
      expect(result.sMaxAge).toBe(7200);
    });

    it('should parse multiple directives', () => {
      const result = parseCacheControl('public, max-age=3600, stale-while-revalidate=60');
      expect(result.isPublic).toBe(true);
      expect(result.maxAge).toBe(3600);
      expect(result.staleWhileRevalidate).toBe(60);
    });

    it('should parse no-cache and no-store', () => {
      const result = parseCacheControl('no-cache, no-store');
      expect(result.noCache).toBe(true);
      expect(result.noStore).toBe(true);
    });

    it('should parse must-revalidate', () => {
      const result = parseCacheControl('must-revalidate, max-age=0');
      expect(result.mustRevalidate).toBe(true);
      expect(result.maxAge).toBe(0);
    });

    it('should return empty object for null header', () => {
      const result = parseCacheControl(null);
      expect(result).toEqual({});
    });
  });

  describe('revalidate strategy', () => {
    it('should add ETag from response to cache', async () => {
      mockTransport.setMockResponse('GET', '/api/data', 200, { data: 'test' }, {
        'ETag': '"abc123"',
        'Cache-Control': 'max-age=0'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'revalidate' })]
      });

      // First request - caches with ETag
      await client.get('/api/data').json();

      // Check cache entry has ETag
      const entry = await storage.get('GET:https://api.example.com/api/data');
      expect(entry?.etag).toBe('"abc123"');
    });

    it('should send If-None-Match on revalidation', async () => {
      // First response with ETag (limited to 1 use)
      mockTransport.setMockResponse('GET', '/api/data', 200, { data: 'v1' }, {
        'ETag': '"v1-hash"',
        'Cache-Control': 'max-age=0'  // Always revalidate
      }, { times: 1 });

      // 304 response for revalidation (unlimited)
      mockTransport.setMockResponse('GET', '/api/data', 304, '', {});

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'revalidate' })]
      });

      // First request - gets 200
      await client.get('/api/data').json();

      // Second request - should get 304 and return cached
      const response = await client.get('/api/data');

      // Should return cached data with revalidated status
      expect(response.headers.get('X-Cache')).toBe('revalidated');
    });

    it('should handle 304 Not Modified', async () => {
      // First response (limited to 1 use)
      mockTransport.setMockResponse('GET', '/api/data', 200, { data: 'original' }, {
        'ETag': '"hash1"',
        'Cache-Control': 'max-age=0'
      }, { times: 1 });

      // 304 response for revalidation
      mockTransport.setMockResponse('GET', '/api/data', 304, '', {});

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'revalidate' })]
      });

      // First request
      const result1 = await client.get('/api/data').json();
      expect(result1).toEqual({ data: 'original' });

      // Second request - server returns 304
      const response = await client.get('/api/data');
      const result2 = await response.json();

      // Should return original cached data
      expect(result2).toEqual({ data: 'original' });
      expect(response.headers.get('X-Cache')).toBe('revalidated');
    });

    it('should create Response with headers correctly', () => {
      const headers = { 'X-Cache': 'test' };
      const r = new Response('body', { headers });
      expect(r.headers.get('X-Cache')).toBe('test');
    });

    it('should update cache on new response after 304', async () => {
      // First response (limited to 1 use)
      mockTransport.setMockResponse('GET', '/api/data', 200, { version: 1 }, {
        'ETag': '"v1"',
        'Cache-Control': 'max-age=0'
      }, { times: 1 });

      // New version (unlimited)
      mockTransport.setMockResponse('GET', '/api/data', 200, { version: 2 }, {
        'ETag': '"v2"',
        'Cache-Control': 'max-age=0'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'revalidate' })]
      });

      await client.get('/api/data').json();

      const result = await client.get('/api/data').json();
      expect(result).toEqual({ version: 2 });

      // Cache should have new version
      const entry = await storage.get('GET:https://api.example.com/api/data');
      expect(entry?.etag).toBe('"v2"');
    });
  });

  describe('rfc-compliant strategy', () => {
    it('should return fresh cached response without network call', async () => {
      mockTransport.setMockResponse('GET', '/api/data', 200, { fresh: true }, {
        'Cache-Control': 'max-age=3600'  // 1 hour
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // First request
      await client.get('/api/data').json();
      expect(mockTransport.getCallCount('GET', '/api/data')).toBe(1);

      // Second request - should be from cache
      const response = await client.get('/api/data');
      expect(response.headers.get('X-Cache')).toBe('hit');
      expect(mockTransport.getCallCount('GET', '/api/data')).toBe(1); // No new request
    });

    it('should respect Cache-Control: no-store', async () => {
      mockTransport.setMockResponse('GET', '/api/private', 200, { secret: 'data' }, {
        'Cache-Control': 'no-store'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      await client.get('/api/private').json();

      // Should not be cached (undefined means not found)
      const entry = await storage.get('GET:https://api.example.com/api/private');
      expect(entry).toBeUndefined();
    });

    it('should skip cache when request has no-store', async () => {
      mockTransport.setMockResponse('GET', '/api/data', 200, { data: 'test' });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      // Request with no-store
      await client.get('/api/data', {
        headers: { 'Cache-Control': 'no-store' }
      }).json();

      // Second request - should make network call
      await client.get('/api/data').json();

      // Both requests should hit network (first was no-store, second not cached)
      expect(mockTransport.getCallCount('GET', '/api/data')).toBe(2);
    });

    it('should add X-Cache-Age header', async () => {
      mockTransport.setMockResponse('GET', '/api/data', 200, { data: 'test' }, {
        'Cache-Control': 'max-age=3600'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant' })]
      });

      await client.get('/api/data').json();

      // Second request after small delay
      await new Promise(r => setTimeout(r, 10));
      const response = await client.get('/api/data');

      expect(response.headers.has('X-Cache-Age')).toBe(true);
    });
  });

  describe('forceRevalidate option', () => {
    it('should always revalidate when forceRevalidate is true', async () => {
      // First response (limited to 1 use)
      mockTransport.setMockResponse('GET', '/api/data', 200, { data: 'v1' }, {
        'ETag': '"v1"',
        'Cache-Control': 'max-age=3600'  // Fresh for 1 hour
      }, { times: 1 });

      // 304 response for revalidation
      mockTransport.setMockResponse('GET', '/api/data', 304, '', {});

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'rfc-compliant', forceRevalidate: true })]
      });

      await client.get('/api/data').json();

      // Second request - should revalidate even though fresh
      const response = await client.get('/api/data');
      expect(response.headers.get('X-Cache')).toBe('revalidated');

      // Both requests hit network
      expect(mockTransport.getCallCount('GET', '/api/data')).toBe(2);
    });
  });

  describe('Last-Modified support', () => {
    it('should use If-Modified-Since for revalidation', async () => {
      const lastMod = 'Tue, 15 Nov 2024 12:45:26 GMT';

      // First response (limited to 1 use)
      mockTransport.setMockResponse('GET', '/api/data', 200, { data: 'test' }, {
        'Last-Modified': lastMod,
        'Cache-Control': 'max-age=0'
      }, { times: 1 });

      // 304 response for revalidation
      mockTransport.setMockResponse('GET', '/api/data', 304, '', {});

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'revalidate' })]
      });

      await client.get('/api/data').json();

      // Check cache has Last-Modified
      const entry = await storage.get('GET:https://api.example.com/api/data');
      expect(entry?.lastModified).toBe(lastMod);

      // Second request
      const response = await client.get('/api/data');
      expect(response.headers.get('X-Cache')).toBe('revalidated');
    });
  });

  describe('stale-while-revalidate with conditional requests', () => {
    it('should use conditional request in background revalidation', async () => {
      mockTransport.setMockResponse('GET', '/api/data', 200, { data: 'v1' }, {
        'ETag': '"v1"'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [cache({ storage, strategy: 'stale-while-revalidate' })]
      });

      // First request
      await client.get('/api/data').json();

      // Setup 304 for background revalidation
      mockTransport.setMockResponse('GET', '/api/data', 304, '', {});

      // Second request - returns stale immediately
      const response = await client.get('/api/data');
      expect(response.headers.get('X-Cache')).toBe('stale');

      // Wait for background revalidation
      await new Promise(r => setTimeout(r, 50));

      // Should have made conditional request
      expect(mockTransport.getCallCount('GET', '/api/data')).toBe(2);
    });
  });
});
