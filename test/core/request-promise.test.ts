import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';
import { RequestPromise } from '../../src/core/request-promise.js';
import { HttpResponse } from '../../src/core/response.js';
import { z } from 'zod';
import { join } from 'node:path';
import { unlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

describe('RequestPromise', () => {
  let mockTransport: MockTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
    vi.clearAllMocks();
  });

  describe('Promise interface', () => {
    it('should have correct toStringTag', () => {
      const mockResponse = new Response('test');
      const httpResponse = new HttpResponse(mockResponse);
      const promise = new RequestPromise(Promise.resolve(httpResponse));

      expect(promise[Symbol.toStringTag]).toBe('RequestPromise');
    });

    it('should support then()', async () => {
      mockTransport.setMockResponse('GET', '/test', 200, { message: 'hello' });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const result = await client.get('/test').then(res => res.json());
      expect(result).toEqual({ message: 'hello' });
    });

    it('should support catch()', async () => {
      mockTransport.setMockResponse('GET', '/error', 500, 'Server Error');

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      // Test that catch receives the HTTP error thrown by the client
      const error = await client.get('/error').catch(e => e);

      expect(error).toBeDefined();
      expect(error.message).toContain('500');
    });

    it('should support finally()', async () => {
      mockTransport.setMockResponse('GET', '/test', 200, { ok: true });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      let finallyCalled = false;
      await client.get('/test').finally(() => {
        finallyCalled = true;
      });

      expect(finallyCalled).toBe(true);
    });
  });

  describe('json()', () => {
    it('should return parsed JSON', async () => {
      mockTransport.setMockResponse('GET', '/users', 200, { id: 1, name: 'John' });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const data = await client.get('/users').json<{ id: number; name: string }>();
      expect(data).toEqual({ id: 1, name: 'John' });
    });

    it('should work with array response', async () => {
      mockTransport.setMockResponse('GET', '/items', 200, [1, 2, 3]);

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const data = await client.get('/items').json<number[]>();
      expect(data).toEqual([1, 2, 3]);
    });
  });

  describe('text()', () => {
    it('should return text content', async () => {
      mockTransport.setMockResponse('GET', '/text', 200, 'Hello World');

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const text = await client.get('/text').text();
      expect(text).toBe('Hello World');
    });
  });

  describe('cleanText()', () => {
    it('should strip HTML tags', async () => {
      mockTransport.setMockResponse('GET', '/html', 200, '<html><body><p>Clean text</p></body></html>');

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const text = await client.get('/html').cleanText();
      expect(text).toContain('Clean text');
      expect(text).not.toContain('<p>');
    });
  });

  describe('blob()', () => {
    it('should return blob', async () => {
      mockTransport.setMockResponse('GET', '/file', 200, 'file content');

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const blob = await client.get('/file').blob();
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBe(12); // 'file content' length
    });
  });

  describe('read()', () => {
    it('should return ReadableStream', async () => {
      mockTransport.setMockResponse('GET', '/stream', 200, 'stream data');

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const stream = await client.get('/stream').read();
      expect(stream).not.toBeNull();
    });

    it('should return null for empty body', async () => {
      mockTransport.setMockResponse('HEAD', '/empty', 204, null);

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const stream = await client.head('/empty').read();
      expect(stream).toBeNull();
    });
  });

  describe('write()', () => {
    it('should write response to file', async () => {
      const content = 'File content to write';
      mockTransport.setMockResponse('GET', '/download', 200, content);

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const filePath = join(tmpdir(), `test-write-${Date.now()}.txt`);

      try {
        await client.get('/download').write(filePath);
        const written = await readFile(filePath, 'utf-8');
        expect(written).toBe(content);
      } finally {
        try { await unlink(filePath); } catch { /* ignore */ }
      }
    });

    it('should throw when no body to write', async () => {
      mockTransport.setMockResponse('HEAD', '/nofile', 204, null);

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const filePath = join(tmpdir(), `test-write-error-${Date.now()}.txt`);

      await expect(client.head('/nofile').write(filePath))
        .rejects.toThrow('Response has no body to write');
    });
  });

  describe('parse()', () => {
    it('should parse with Zod schema', async () => {
      const UserSchema = z.object({
        id: z.number(),
        name: z.string(),
        email: z.string().email()
      });

      mockTransport.setMockResponse('GET', '/user', 200, {
        id: 1,
        name: 'John',
        email: 'john@example.com'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const user = await client.get('/user').parse(UserSchema);
      expect(user.id).toBe(1);
      expect(user.name).toBe('John');
      expect(user.email).toBe('john@example.com');
    });

    it('should throw on invalid data', async () => {
      const UserSchema = z.object({
        id: z.number(),
        email: z.string().email()
      });

      mockTransport.setMockResponse('GET', '/user', 200, {
        id: 'not-a-number',  // Invalid
        email: 'invalid'  // Invalid email
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      await expect(client.get('/user').parse(UserSchema))
        .rejects.toThrow();
    });
  });

  describe('safe()', () => {
    it('should return tuple on success', async () => {
      mockTransport.setMockResponse('GET', '/data', 200, { value: 42 });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const [success, error, data] = await client.get('/data').safe();

      expect(success).toBe(true);
      expect(error).toBeNull();
      expect(data).toEqual({ value: 42 });
    });

    it('should return error tuple on invalid JSON', async () => {
      // MockTransport always returns valid JSON, so we need a different approach
      // This tests the wrapper functionality
      const mockResponse = new Response('not json', { status: 200 });
      const httpResponse = new HttpResponse(mockResponse);
      const promise = new RequestPromise(Promise.resolve(httpResponse));

      const [success, error, data] = await promise.safe();

      expect(success).toBe(false);
      expect(error).not.toBeNull();
      expect(data).toBeUndefined();
    });
  });

  describe('cancel()', () => {
    it('should abort the request', () => {
      const abortController = new AbortController();
      const mockResponse = new Response('test');
      const httpResponse = new HttpResponse(mockResponse);
      const promise = new RequestPromise(Promise.resolve(httpResponse), abortController);

      expect(abortController.signal.aborted).toBe(false);
      promise.cancel();
      expect(abortController.signal.aborted).toBe(true);
    });

    it('should handle missing abort controller', () => {
      const mockResponse = new Response('test');
      const httpResponse = new HttpResponse(mockResponse);
      const promise = new RequestPromise(Promise.resolve(httpResponse));

      // Should not throw
      expect(() => promise.cancel()).not.toThrow();
    });
  });

  describe('sse()', () => {
    it('should yield SSE events', async () => {
      const sseData = 'event: message\ndata: {"text": "hello"}\n\n';
      mockTransport.setMockResponse('GET', '/events', 200, sseData, {
        'Content-Type': 'text/event-stream'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const events: any[] = [];
      for await (const event of client.get('/events').sse()) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('download()', () => {
    it('should yield progress events', async () => {
      const data = 'x'.repeat(100);
      mockTransport.setMockResponse('GET', '/file', 200, data, {
        'Content-Length': '100'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const progressEvents: any[] = [];
      for await (const progress of client.get('/file').download()) {
        progressEvents.push(progress);
      }

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[progressEvents.length - 1].percent).toBe(100);
    });
  });

  describe('async iterator', () => {
    it('should iterate over response chunks', async () => {
      mockTransport.setMockResponse('GET', '/chunked', 200, 'chunk data');

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const chunks: Uint8Array[] = [];
      for await (const chunk of client.get('/chunked')) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      const text = new TextDecoder().decode(Buffer.concat(chunks.map(c => Buffer.from(c))));
      expect(text).toBe('chunk data');
    });
  });
});
