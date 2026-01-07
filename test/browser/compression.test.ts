import { describe, it, expect } from 'vitest';
import {
  compression,
  decompress,
  isCompressionSupported,
  BrowserCompressionAlgorithm,
} from '../../src/browser/compression.js';

// Skip compression tests in environments that don't support CompressionStream
const hasCompressionStream = typeof globalThis.CompressionStream !== 'undefined';

describe('Browser Compression - Feature Detection', () => {
  it('should detect CompressionStream availability', () => {
    expect(typeof isCompressionSupported()).toBe('boolean');
    expect(isCompressionSupported()).toBe(hasCompressionStream);
  });
});

describe.skipIf(!hasCompressionStream)('Browser Compression', () => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  describe('compress and decompress', () => {
    const algorithms: BrowserCompressionAlgorithm[] = ['gzip', 'deflate'];

    for (const algorithm of algorithms) {
      it(`should compress and decompress with ${algorithm}`, async () => {
        const originalText = 'Hello, World! '.repeat(100);
        const originalData = encoder.encode(originalText);

        // Create compression middleware and use internal compress function via decompress test
        const middleware = compression({ algorithm });

        // Test the decompress function directly
        const stream = new CompressionStream(algorithm);
        const writer = stream.writable.getWriter();
        writer.write(originalData);
        writer.close();

        const reader = stream.readable.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const compressed = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          compressed.set(chunk, offset);
          offset += chunk.length;
        }

        // Compressed should be smaller for repetitive data
        expect(compressed.length).toBeLessThan(originalData.length);

        // Decompress
        const decompressed = await decompress(compressed, algorithm);
        const decompressedText = decoder.decode(decompressed);

        expect(decompressedText).toBe(originalText);
      });
    }
  });

  describe('compression middleware', () => {
    it('should not compress small payloads by default', async () => {
      const middleware = compression({ threshold: 1024 });

      const smallBody = JSON.stringify({ small: 'data' });
      const req = {
        method: 'POST',
        url: 'https://example.com/api',
        body: smallBody,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      };

      let passedReq: typeof req | null = null;
      const next = async (r: typeof req) => {
        passedReq = r;
        return new Response('ok');
      };

      await middleware(req as any, next as any);

      // Should not add Content-Encoding for small payloads
      expect(passedReq!.headers.has('Content-Encoding')).toBe(false);
    });

    it('should compress large payloads', async () => {
      const middleware = compression({ algorithm: 'gzip', threshold: 100 });

      const largeBody = JSON.stringify({ data: 'x'.repeat(1000) });
      const req = {
        method: 'POST',
        url: 'https://example.com/api',
        body: largeBody,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      };

      let passedReq: typeof req | null = null;
      const next = async (r: typeof req) => {
        passedReq = r;
        return new Response('ok');
      };

      await middleware(req as any, next as any);

      // Should add Content-Encoding for large payloads
      expect(passedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should skip GET requests', async () => {
      const middleware = compression({ threshold: 0 });

      const req = {
        method: 'GET',
        url: 'https://example.com/api',
        body: null,
        headers: new Headers(),
      };

      let passedReq: typeof req | null = null;
      const next = async (r: typeof req) => {
        passedReq = r;
        return new Response('ok');
      };

      await middleware(req as any, next as any);

      expect(passedReq!.headers.has('Content-Encoding')).toBe(false);
    });

    it('should skip already compressed requests', async () => {
      const middleware = compression({ threshold: 0 });

      const req = {
        method: 'POST',
        url: 'https://example.com/api',
        body: 'data',
        headers: new Headers({ 'Content-Encoding': 'br' }),
      };

      let passedReq: typeof req | null = null;
      const next = async (r: typeof req) => {
        passedReq = r;
        return new Response('ok');
      };

      await middleware(req as any, next as any);

      // Should keep original Content-Encoding
      expect(passedReq!.headers.get('Content-Encoding')).toBe('br');
    });

    it('should force compression even for small payloads when force=true', async () => {
      const middleware = compression({
        algorithm: 'gzip',
        threshold: 10000,
        force: true,
      });

      const smallBody = 'tiny';
      const req = {
        method: 'POST',
        url: 'https://example.com/api',
        body: smallBody,
        headers: new Headers({ 'Content-Type': 'text/plain' }),
      };

      let passedReq: typeof req | null = null;
      const next = async (r: typeof req) => {
        passedReq = r;
        return new Response('ok');
      };

      await middleware(req as any, next as any);

      // Should compress even small payload when forced
      expect(passedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('should handle object bodies (JSON)', async () => {
      const middleware = compression({ algorithm: 'gzip', threshold: 0 });

      const req = {
        method: 'POST',
        url: 'https://example.com/api',
        body: { key: 'value'.repeat(100) },
        headers: new Headers({ 'Content-Type': 'application/json' }),
      };

      let passedReq: typeof req | null = null;
      const next = async (r: typeof req) => {
        passedReq = r;
        return new Response('ok');
      };

      await middleware(req as any, next as any);

      expect(passedReq!.headers.get('Content-Encoding')).toBe('gzip');
    });
  });

  describe('error handling', () => {
    it('should throw for unsupported algorithm', () => {
      expect(() => {
        compression({ algorithm: 'br' as any });
      }).toThrow(/only supports 'gzip' and 'deflate'/);
    });
  });
});
