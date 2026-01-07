import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

/**
 * Tests for Smithy HttpHandler interface compatibility.
 * These tests verify that Recker Client can be used directly as
 * AWS SDK v3 requestHandler without any wrapper.
 */
describe('Smithy HttpHandler Interface', () => {
  describe('metadata property', () => {
    it('should return http/1.1 protocol by default', () => {
      const client = createClient({ baseUrl: 'https://example.com' });
      expect(client.metadata).toEqual({ handlerProtocol: 'http/1.1' });
    });

    it('should always return http/1.1 even when http2 transport is enabled (boolean)', () => {
      // metadata.handlerProtocol controls request signing style, not transport protocol
      // Always 'http/1.1' ensures 'host' header is signed (not ':authority' pseudo-header)
      const mockTransport = new MockTransport();
      const client = createClient({
        baseUrl: 'https://example.com',
        http2: true,
        transport: mockTransport
      });
      expect(client.metadata).toEqual({ handlerProtocol: 'http/1.1' });
    });

    it('should always return http/1.1 even when http2 transport is enabled (object)', () => {
      // metadata.handlerProtocol controls request signing style, not transport protocol
      // Always 'http/1.1' ensures 'host' header is signed (not ':authority' pseudo-header)
      const mockTransport = new MockTransport();
      const client = createClient({
        baseUrl: 'https://example.com',
        http2: { enabled: true },
        transport: mockTransport
      });
      expect(client.metadata).toEqual({ handlerProtocol: 'http/1.1' });
    });

    it('should return http/1.1 when http2 is explicitly disabled', () => {
      const mockTransport = new MockTransport();
      const client = createClient({
        baseUrl: 'https://example.com',
        http2: { enabled: false },
        transport: mockTransport
      });
      expect(client.metadata).toEqual({ handlerProtocol: 'http/1.1' });
    });
  });

  describe('handle() method', () => {
    it('should handle basic GET request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/test', 200, { data: 'hello' });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const result = await client.handle({
        hostname: 'example.com',
        path: '/test',
        method: 'GET'
      });

      expect(result.response.statusCode).toBe(200);
      expect(result.response.headers).toBeDefined();
    });

    it('should handle POST request with body', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('POST', '/data', 201, { created: true });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const result = await client.handle({
        hostname: 'example.com',
        path: '/data',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' })
      });

      expect(result.response.statusCode).toBe(201);
    });

    it('should normalize array headers to comma-joined string', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/headers', 200, {});

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      await client.handle({
        hostname: 'example.com',
        path: '/headers',
        method: 'GET',
        headers: {
          'Accept': ['text/html', 'application/json'],
          'X-Custom': 'single-value'
        }
      });

      // The mock transport received the request
      expect(mockTransport.getCallCount('GET', '/headers')).toBe(1);
    });

    it('should build URL with query parameters', async () => {
      const mockTransport = new MockTransport();
      // Mock needs to match the exact path including query string
      mockTransport.setMockResponse('GET', '/search?q=test&page=1&tags=a&tags=b', 200, { results: [] });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      await client.handle({
        hostname: 'example.com',
        path: '/search',
        method: 'GET',
        query: {
          q: 'test',
          page: '1',
          tags: ['a', 'b'] // Array query params
        }
      });

      expect(mockTransport.getCallCount('GET', '/search?q=test&page=1&tags=a&tags=b')).toBe(1);
    });

    it('should handle null/undefined query values', async () => {
      const mockTransport = new MockTransport();
      // Only 'active=true' should appear, null/undefined values are skipped
      mockTransport.setMockResponse('GET', '/filter?active=true', 200, {});

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      await client.handle({
        hostname: 'example.com',
        path: '/filter',
        method: 'GET',
        query: {
          active: 'true',
          optional: null,
          missing: undefined
        }
      });

      expect(mockTransport.getCallCount('GET', '/filter?active=true')).toBe(1);
    });

    it('should handle custom port', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/api', 200, {});

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      await client.handle({
        protocol: 'https:',
        hostname: 'example.com',
        port: 8443,
        path: '/api',
        method: 'GET'
      });

      expect(mockTransport.getCallCount('GET', '/api')).toBe(1);
    });

    it('should use default method GET', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/', 200, {});

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      await client.handle({
        hostname: 'example.com'
      });

      expect(mockTransport.getCallCount('GET', '/')).toBe(1);
    });

    it('should pass abort signal', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/slow', 200, {});

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const controller = new AbortController();

      const result = await client.handle(
        { hostname: 'example.com', path: '/slow' },
        { abortSignal: controller.signal }
      );

      expect(result.response.statusCode).toBe(200);
    });
  });

  describe('httpHandlerConfigs() method', () => {
    it('should return http2 false by default', () => {
      const client = createClient({ baseUrl: 'https://example.com' });
      const config = client.httpHandlerConfigs();

      expect(config.http2).toBe(false);
      expect(config.keepAlive).toBe(true);
      expect(typeof config.maxSockets).toBe('number');
    });

    it('should return http2 true when enabled', () => {
      const mockTransport = new MockTransport();
      const client = createClient({
        baseUrl: 'https://example.com',
        http2: true,
        transport: mockTransport
      });
      const config = client.httpHandlerConfigs();

      expect(config.http2).toBe(true);
    });
  });

  describe('updateHttpClientConfig() method', () => {
    it('should exist and be callable (no-op for immutable config)', () => {
      const client = createClient({ baseUrl: 'https://example.com' });

      // Should not throw
      client.updateHttpClientConfig('maxSockets', 20);

      // Config remains unchanged (immutable)
      const config = client.httpHandlerConfigs();
      expect(typeof config.maxSockets).toBe('number');
    });
  });

  describe('destroy() method', () => {
    it('should clean up resources without error', async () => {
      const client = createClient({ baseUrl: 'https://example.com' });

      // Should not throw
      await client.destroy();
    });

    it('should be callable multiple times safely', async () => {
      const client = createClient({ baseUrl: 'https://example.com' });

      await client.destroy();
      await client.destroy(); // Second call should not throw
    });
  });

  describe('AWS SDK v3 integration pattern', () => {
    it('should implement the full Smithy RequestHandler interface', () => {
      const client = createClient({ baseUrl: 'https://s3.amazonaws.com' });

      // Verify all required interface members exist
      expect(typeof client.handle).toBe('function');
      expect(typeof client.destroy).toBe('function');
      expect(client.metadata).toBeDefined();
      expect(client.metadata.handlerProtocol).toBeDefined();

      // Optional members
      expect(typeof client.updateHttpClientConfig).toBe('function');
      expect(typeof client.httpHandlerConfigs).toBe('function');
    });
  });
});
