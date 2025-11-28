import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpResponse } from '../../src/core/response.js';
import { Readable, PassThrough } from 'node:stream';

describe('HttpResponse', () => {
  describe('constructor', () => {
    it('should create response from Web Response', () => {
      const webResponse = new Response('{"data": "test"}', {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });

      const response = new HttpResponse(webResponse);

      expect(response.status).toBe(200);
      expect(response.statusText).toBe('OK');
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('application/json');
    });

    it('should create response from Dispatcher.ResponseData', () => {
      const dispatcherResponse = {
        statusCode: 201,
        headers: { 'x-custom': 'value' },
        body: null
      };

      const response = new HttpResponse(dispatcherResponse as any);

      expect(response.status).toBe(201);
      expect(response.headers.get('x-custom')).toBe('value');
    });

    it('should store timings and connection info', () => {
      const webResponse = new Response('test');
      const timings = { total: 100, dns: 10, tcp: 20, tls: 30, firstByte: 40 };
      const connection = { remoteAddress: '127.0.0.1', protocol: 'HTTP/1.1' };

      const response = new HttpResponse(webResponse, { timings, connection } as any);

      expect(response.timings).toEqual(timings);
      expect(response.connection).toEqual(connection);
    });
  });

  describe('getters', () => {
    it('should expose url', () => {
      const webResponse = new Response('test', { status: 200 });
      const response = new HttpResponse(webResponse);

      // URL is empty for Response created without a request
      expect(response.url).toBe('');
    });
  });

  describe('body methods', () => {
    it('should parse json', async () => {
      const webResponse = new Response('{"key": "value"}', {
        headers: { 'Content-Type': 'application/json' }
      });

      const response = new HttpResponse(webResponse);
      const data = await response.json<{ key: string }>();

      expect(data.key).toBe('value');
    });

    it('should return text', async () => {
      const webResponse = new Response('Hello World');
      const response = new HttpResponse(webResponse);

      const text = await response.text();
      expect(text).toBe('Hello World');
    });

    it('should return cleanText (strip HTML)', async () => {
      const webResponse = new Response('<html><body><p>Hello</p></body></html>');
      const response = new HttpResponse(webResponse);

      const text = await response.cleanText();
      expect(text).toContain('Hello');
      expect(text).not.toContain('<p>');
    });

    it('should return blob', async () => {
      const webResponse = new Response('binary data');
      const response = new HttpResponse(webResponse);

      const blob = await response.blob();
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBe(11);
    });

    it('should return ReadableStream from read()', () => {
      const webResponse = new Response('test data');
      const response = new HttpResponse(webResponse);

      const stream = response.read();
      expect(stream).not.toBeNull();
    });

    it('should return null from read() when no body', () => {
      const webResponse = new Response(null, { status: 204 });
      const response = new HttpResponse(webResponse);

      const stream = response.read();
      expect(stream).toBeNull();
    });
  });

  describe('header parsing', () => {
    it('should parse cache headers', () => {
      const webResponse = new Response('test', {
        headers: {
          'Cache-Control': 'max-age=3600',
          'X-Cache': 'HIT'
        }
      });

      const response = new HttpResponse(webResponse);
      const cache = response.cache;

      expect(cache).toBeDefined();
    });

    it('should parse rate limit headers', () => {
      const webResponse = new Response('test', {
        headers: {
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '99',
          'X-RateLimit-Reset': '1700000000'
        }
      });

      const response = new HttpResponse(webResponse);
      const rateLimit = response.rateLimit;

      expect(rateLimit.limit).toBe(100);
      expect(rateLimit.remaining).toBe(99);
    });

    it('should parse links', () => {
      const webResponse = new Response('test', {
        headers: {
          'Link': '</api/users?page=2>; rel="next", </api/users?page=10>; rel="last"'
        }
      });

      const response = new HttpResponse(webResponse);
      const links = response.links();

      expect(links).not.toBeNull();
      expect(links?.hasNext()).toBe(true);
    });

    it('should return null for links when no Link header', () => {
      const webResponse = new Response('test');
      const response = new HttpResponse(webResponse);

      const links = response.links();
      expect(links).toBeNull();
    });

    it('should return complete headerInfo', () => {
      const webResponse = new Response('test', {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      const response = new HttpResponse(webResponse);
      const info = response.headerInfo;

      expect(info).toBeDefined();
      expect(info.cache).toBeDefined();
      expect(info.rateLimit).toBeDefined();
    });
  });

  describe('toNodeStream', () => {
    it('should convert to Node.js Readable stream', () => {
      const webResponse = new Response('test data');
      const response = new HttpResponse(webResponse);

      const nodeStream = response.toNodeStream();
      expect(nodeStream).not.toBeNull();
    });

    it('should return null when no body', () => {
      const webResponse = new Response(null, { status: 204 });
      const response = new HttpResponse(webResponse);

      const nodeStream = response.toNodeStream();
      expect(nodeStream).toBeNull();
    });
  });

  describe('pipe', () => {
    it('should pipe response to writable stream', async () => {
      const webResponse = new Response('test data');
      const response = new HttpResponse(webResponse);

      const chunks: Buffer[] = [];
      const writable = new PassThrough();
      writable.on('data', (chunk) => chunks.push(chunk));

      await response.pipe(writable);

      const result = Buffer.concat(chunks).toString();
      expect(result).toBe('test data');
    });

    it('should throw error when no body to pipe', async () => {
      const webResponse = new Response(null, { status: 204 });
      const response = new HttpResponse(webResponse);

      const writable = new PassThrough();

      await expect(response.pipe(writable)).rejects.toThrow('Response has no body to pipe');
    });
  });

  describe('clone', () => {
    it('should clone response with timings and connection', async () => {
      const webResponse = new Response('cloneable data');
      const timings = { total: 100 };
      const connection = { protocol: 'HTTP/2' };
      const response = new HttpResponse(webResponse, { timings, connection } as any);

      const cloned = response.clone();

      expect(cloned.timings).toEqual(timings);
      expect(cloned.connection).toEqual(connection);

      // Both should be readable
      const originalText = await response.text();
      const clonedText = await cloned.text();
      expect(originalText).toBe('cloneable data');
      expect(clonedText).toBe('cloneable data');
    });
  });

  describe('sse', () => {
    it('should return SSE async generator', async () => {
      const sseData = 'event: message\ndata: {"text": "hello"}\n\n';
      const webResponse = new Response(sseData, {
        headers: { 'Content-Type': 'text/event-stream' }
      });

      const response = new HttpResponse(webResponse);
      const events: any[] = [];

      for await (const event of response.sse()) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('download progress', () => {
    it('should yield progress events during download', async () => {
      // Create a response with content-length
      const data = 'x'.repeat(1000);
      const webResponse = new Response(data, {
        headers: { 'Content-Length': '1000' }
      });

      const response = new HttpResponse(webResponse);
      const progressEvents: any[] = [];

      for await (const progress of response.download()) {
        progressEvents.push(progress);
      }

      expect(progressEvents.length).toBeGreaterThan(0);

      // Final event should be 100%
      const finalEvent = progressEvents[progressEvents.length - 1];
      expect(finalEvent.percent).toBe(100);
      expect(finalEvent.direction).toBe('download');
    });

    it('should handle download without content-length', async () => {
      const webResponse = new Response('test data'); // No content-length
      const response = new HttpResponse(webResponse);

      const progressEvents: any[] = [];
      for await (const progress of response.download()) {
        progressEvents.push(progress);
      }

      expect(progressEvents.length).toBeGreaterThan(0);
      // Without content-length, percent is undefined
      expect(progressEvents[0].total).toBeUndefined();
    });

    it('should return early when no body', async () => {
      const webResponse = new Response(null, { status: 204 });
      const response = new HttpResponse(webResponse);

      const progressEvents: any[] = [];
      for await (const progress of response.download()) {
        progressEvents.push(progress);
      }

      expect(progressEvents.length).toBe(0);
    });
  });

  describe('async iterator', () => {
    it('should iterate over response chunks', async () => {
      const webResponse = new Response('hello world');
      const response = new HttpResponse(webResponse);

      const chunks: Uint8Array[] = [];
      for await (const chunk of response) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      const text = new TextDecoder().decode(Buffer.concat(chunks.map(c => Buffer.from(c))));
      expect(text).toBe('hello world');
    });

    it('should handle empty body', async () => {
      const webResponse = new Response(null, { status: 204 });
      const response = new HttpResponse(webResponse);

      const chunks: Uint8Array[] = [];
      for await (const chunk of response) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(0);
    });
  });
});
