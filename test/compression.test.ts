import { describe, it, expect, vi } from 'vitest';
import { compression, createCompressionMiddleware } from '../src/plugins/compression.js';
import { gzip, deflate, brotliCompress } from 'node:zlib';
import { promisify } from 'node:util';
import type { ReckerRequest, ReckerResponse } from '../src/types/index.js';

const gzipAsync = promisify(gzip);
const deflateAsync = promisify(deflate);
const brotliAsync = promisify(brotliCompress);

describe('Compression Plugin', () => {
  // Helper to create a mock request
  const createRequest = (overrides: Partial<ReckerRequest> = {}): ReckerRequest => {
    return {
      url: 'https://api.example.com/data',
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: null,
      ...overrides
    } as ReckerRequest;
  };

  // Helper next function
  const mockNext = async (req: ReckerRequest): Promise<ReckerResponse> => {
    return {
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
      url: req.url,
      raw: new Response(),
      json: async () => ({}),
      text: async () => '',
      cleanText: async () => '',
      blob: async () => new Blob(),
      read: () => null,
      clone: () => ({} as any),
      sse: async function* () {},
      download: async function* () {},
      [Symbol.asyncIterator]: async function* () {}
    } as ReckerResponse;
  };

  describe('Basic Compression', () => {
    it('should compress POST request body with gzip by default', async () => {
      const middleware = compression();
      const body = JSON.stringify({ data: 'test'.repeat(500) }); // Large enough to compress
      const req = createRequest({ body });

      let compressedReq: ReckerRequest | null = null;
      const next = async (r: ReckerRequest) => {
        compressedReq = r;
        return mockNext(r);
      };

      await middleware(req, next);

      expect(compressedReq).toBeDefined();
      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
      expect(compressedReq!.body).toBeInstanceOf(Buffer);
    });

    it('should compress PUT request body', async () => {
      const middleware = compression();
      const body = JSON.stringify({ data: 'x'.repeat(2000) });
      const req = createRequest({ method: 'PUT', body });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should compress PATCH request body', async () => {
      const middleware = compression();
      const body = JSON.stringify({ data: 'y'.repeat(2000) });
      const req = createRequest({ method: 'PATCH', body });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should not compress GET requests by default', async () => {
      const middleware = compression();
      const req = createRequest({ method: 'GET', body: null });

      let nextReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        nextReq = r;
        return mockNext(r);
      });

      expect(nextReq!.headers.has('Content-Encoding')).toBe(false);
    });

    it('should not compress DELETE requests by default', async () => {
      const middleware = compression();
      const req = createRequest({ method: 'DELETE', body: null });

      let nextReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        nextReq = r;
        return mockNext(r);
      });

      expect(nextReq!.headers.has('Content-Encoding')).toBe(false);
    });
  });

  describe('Compression Algorithms', () => {
    it('should compress with deflate algorithm', async () => {
      const middleware = compression({ algorithm: 'deflate' });
      const body = JSON.stringify({ data: 'test'.repeat(500) });
      const req = createRequest({ body });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('deflate');
    });

    it('should compress with brotli algorithm', async () => {
      const middleware = compression({ algorithm: 'br' });
      const body = JSON.stringify({ data: 'test'.repeat(500) });
      const req = createRequest({ body });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('br');
    });
  });

  describe('Threshold Behavior', () => {
    it('should not compress bodies smaller than threshold', async () => {
      const middleware = compression({ threshold: 10000 }); // 10KB threshold
      const body = JSON.stringify({ data: 'small' }); // Small body
      const req = createRequest({ body });

      let nextReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        nextReq = r;
        return mockNext(r);
      });

      expect(nextReq!.headers.has('Content-Encoding')).toBe(false);
    });

    it('should compress bodies larger than threshold', async () => {
      const middleware = compression({ threshold: 100 }); // 100 bytes
      const body = JSON.stringify({ data: 'x'.repeat(200) }); // > 100 bytes
      const req = createRequest({ body });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should compress small bodies when force=true', async () => {
      const middleware = compression({ force: true, threshold: 10000 });
      const body = JSON.stringify({ data: 'tiny' }); // < threshold
      const req = createRequest({ body });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });
  });

  describe('Content Type Handling', () => {
    it('should compress application/json', async () => {
      const middleware = compression({ threshold: 0 });
      const body = JSON.stringify({ test: 'data'.repeat(100) }); // Larger body that compresses well
      const req = createRequest({
        body,
        headers: new Headers({ 'Content-Type': 'application/json' })
      });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should compress text/plain', async () => {
      const middleware = compression({ threshold: 0 });
      const body = 'text data'.repeat(50);
      const req = createRequest({
        body,
        headers: new Headers({ 'Content-Type': 'text/plain' })
      });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should compress application/xml', async () => {
      const middleware = compression({ threshold: 0 });
      const body = '<root>data</root>'.repeat(50);
      const req = createRequest({
        body,
        headers: new Headers({ 'Content-Type': 'application/xml' })
      });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should not compress image/png by default', async () => {
      const middleware = compression({ threshold: 0 });
      const body = Buffer.from([1, 2, 3, 4]);
      const req = createRequest({
        body,
        headers: new Headers({ 'Content-Type': 'image/png' })
      });

      let nextReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        nextReq = r;
        return mockNext(r);
      });

      expect(nextReq!.headers.has('Content-Encoding')).toBe(false);
    });

    it('should compress when no Content-Type is set', async () => {
      const middleware = compression({ threshold: 0 });
      const body = JSON.stringify({ test: 'data'.repeat(100) });
      const req = createRequest({
        body,
        headers: new Headers() // No Content-Type
      });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });
  });

  describe('Body Type Support', () => {
    it('should compress string body', async () => {
      const middleware = compression({ threshold: 0 });
      const body = 'test string'.repeat(100);
      const req = createRequest({ body });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
      expect(compressedReq!.body).toBeInstanceOf(Buffer);
    });

    it('should compress Buffer body', async () => {
      const middleware = compression({ threshold: 0 });
      const body = Buffer.from('test data'.repeat(100));
      const req = createRequest({ body });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should compress ArrayBuffer body', async () => {
      const middleware = compression({ threshold: 0 });
      const buffer = Buffer.from('test data'.repeat(100));
      const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      const req = createRequest({ body });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should compress object body (as JSON)', async () => {
      const middleware = compression({ threshold: 0 });
      const body = { data: 'test'.repeat(100), nested: { value: 'x'.repeat(50) } };
      const req = createRequest({ body });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should handle null body', async () => {
      const middleware = compression();
      const req = createRequest({ body: null });

      let nextReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        nextReq = r;
        return mockNext(r);
      });

      expect(nextReq).toBe(req); // Passed through unchanged
      expect(nextReq!.headers.has('Content-Encoding')).toBe(false);
    });

    it('should handle undefined body', async () => {
      const middleware = compression();
      const req = createRequest({ body: undefined as any });

      let nextReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        nextReq = r;
        return mockNext(r);
      });

      expect(nextReq!.headers.has('Content-Encoding')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should not re-compress already compressed requests', async () => {
      const middleware = compression({ threshold: 0 });
      const body = JSON.stringify({ test: 'data'.repeat(100) });
      const req = createRequest({
        body,
        headers: new Headers({ 'Content-Encoding': 'gzip' })
      });

      let nextReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        nextReq = r;
        return mockNext(r);
      });

      expect(nextReq).toBe(req); // Passed through unchanged
    });

    it('should only compress if result is smaller (unless force=true)', async () => {
      const middleware = compression({ threshold: 0 });
      // Very small body that won't compress well
      const body = 'ab';
      const req = createRequest({ body });

      let nextReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        nextReq = r;
        return mockNext(r);
      });

      // Should not compress because compressed version is larger
      expect(nextReq!.headers.has('Content-Encoding')).toBe(false);
    });

    it('should update Content-Length header', async () => {
      const middleware = compression({ threshold: 0 });
      const body = JSON.stringify({ data: 'test'.repeat(200) });
      const req = createRequest({ body });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.has('Content-Length')).toBe(true);
      const contentLength = parseInt(compressedReq!.headers.get('Content-Length')!);
      expect(contentLength).toBeGreaterThan(0);
      expect(contentLength).toBeLessThan(Buffer.byteLength(body));
    });

    it('should handle compression errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const middleware = compression({ threshold: 0 });
      const body = { data: 'test' };
      // Create request with circular reference to cause JSON.stringify error
      (body as any).circular = body;
      const req = createRequest({ body });

      let nextReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        nextReq = r;
        return mockNext(r);
      });

      // Should pass through uncompressed on error
      expect(nextReq).toBe(req);
      consoleSpy.mockRestore();
    });

    it('should handle custom methods option', async () => {
      const middleware = compression({ methods: ['POST'], threshold: 0 });

      // POST should be compressed
      const postReq = createRequest({
        method: 'POST',
        body: JSON.stringify({ data: 'x'.repeat(100) })
      });
      let compressedReq: ReckerRequest | null = null;
      await middleware(postReq, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });
      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');

      // PUT should NOT be compressed (not in methods list)
      const putReq = createRequest({
        method: 'PUT',
        body: JSON.stringify({ data: 'x'.repeat(100) })
      });
      let uncompressedReq: ReckerRequest | null = null;
      await middleware(putReq, async (r) => {
        uncompressedReq = r;
        return mockNext(r);
      });
      expect(uncompressedReq!.headers.has('Content-Encoding')).toBe(false);
    });
  });

  describe('createCompressionMiddleware Helper', () => {
    it('should return null when config is false', () => {
      const middleware = createCompressionMiddleware(false);
      expect(middleware).toBeNull();
    });

    it('should create middleware with defaults when config is true', () => {
      const middleware = createCompressionMiddleware(true);
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should create middleware with custom options', () => {
      const middleware = createCompressionMiddleware({
        algorithm: 'deflate',
        threshold: 2048
      });
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should work with created middleware', async () => {
      const middleware = createCompressionMiddleware({ threshold: 0 });
      expect(middleware).toBeDefined();

      const body = JSON.stringify({ test: 'data'.repeat(100) });
      const req = createRequest({ body });

      let compressedReq: ReckerRequest | null = null;
      await middleware!(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });
  });

  describe('Integration with Different Content Types', () => {
    it('should compress application/javascript', async () => {
      const middleware = compression({ threshold: 0 });
      const body = 'function test() { return true; }'.repeat(50);
      const req = createRequest({
        body,
        headers: new Headers({ 'Content-Type': 'application/javascript' })
      });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should compress application/x-www-form-urlencoded', async () => {
      const middleware = compression({ threshold: 0 });
      const body = 'key1=value1&key2=value2&key3=value3'.repeat(50);
      const req = createRequest({
        body,
        headers: new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' })
      });

      let compressedReq: ReckerRequest | null = null;
      await middleware(req, async (r) => {
        compressedReq = r;
        return mockNext(r);
      });

      expect(compressedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });
  });
});
