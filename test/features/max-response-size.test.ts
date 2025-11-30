import { describe, it, expect, beforeEach } from 'vitest';
import { Client, MaxSizeExceededError } from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('maxResponseSize', () => {
  let mockTransport: MockTransport;
  let client: Client;

  beforeEach(() => {
    mockTransport = new MockTransport();
  });

  describe('Content-Length header present', () => {
    it('should allow response within size limit', async () => {
      const maxSize = 1024; // 1 KB
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: maxSize
      });

      // Mock response with 500 bytes
      mockTransport.setMockResponse('GET', '/small', 200, {
        data: 'Small response'
      }, {
        'Content-Length': '500'
      });

      const response = await client.get('/small');
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toEqual({ data: 'Small response' });
    });

    it('should throw MaxSizeExceededError when Content-Length exceeds limit', async () => {
      const maxSize = 100; // 100 bytes
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: maxSize
      });

      // Mock response claiming to be 500 bytes (exceeds limit)
      mockTransport.setMockResponse('GET', '/large', 200, {
        data: 'x'.repeat(500)
      }, {
        'Content-Length': '500'
      });

      await expect(client.get('/large')).rejects.toThrow(MaxSizeExceededError);
    });

    it('should include size details in error', async () => {
      const maxSize = 100;
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: maxSize
      });

      mockTransport.setMockResponse('GET', '/large', 200, {
        data: 'Large response'
      }, {
        'Content-Length': '5000'
      });

      try {
        await client.get('/large');
        expect.fail('Should have thrown MaxSizeExceededError');
      } catch (error) {
        expect(error).toBeInstanceOf(MaxSizeExceededError);
        const err = error as MaxSizeExceededError;
        expect(err.maxSize).toBe(100);
        expect(err.actualSize).toBe(5000);
        expect(err.message).toContain('5000 bytes');
        expect(err.message).toContain('max: 100 bytes');
      }
    });

    it('should work with different size limits', async () => {
      // Test with 10 MB limit
      const largeLimit = 10 * 1024 * 1024;
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: largeLimit
      });

      mockTransport.setMockResponse('GET', '/ok', 200, { data: 'ok' }, {
        'Content-Length': String(5 * 1024 * 1024) // 5 MB
      });

      const response = await client.get('/ok');
      expect(response.ok).toBe(true);
    });

    it('should handle exact size match (should pass)', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 100
      });

      // Exactly at limit
      mockTransport.setMockResponse('GET', '/exact', 200, {
        data: 'x'.repeat(100)
      }, {
        'Content-Length': '100'
      });

      const response = await client.get('/exact');
      expect(response.ok).toBe(true);
    });

    it('should fail when size is limit + 1', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 100
      });

      mockTransport.setMockResponse('GET', '/oversize', 200, {
        data: 'x'.repeat(101)
      }, {
        'Content-Length': '101'
      });

      await expect(client.get('/oversize')).rejects.toThrow(MaxSizeExceededError);
    });
  });

  describe('No Content-Length header', () => {
    it('should allow response without Content-Length (cannot check)', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 100
      });

      // No Content-Length header - check will be skipped
      mockTransport.setMockResponse('GET', '/streaming', 200, {
        data: 'x'.repeat(500) // Actually large, but we can't detect
      });

      // Should pass (no Content-Length to check)
      // TODO: Future enhancement - monitor stream bytes
      const response = await client.get('/streaming');
      expect(response.ok).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should not check size when maxResponseSize is not set', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
        // No maxResponseSize
      });

      mockTransport.setMockResponse('GET', '/huge', 200, {
        data: 'x'.repeat(10000)
      }, {
        'Content-Length': '10000'
      });

      // Should not throw even though size is large
      const response = await client.get('/huge');
      expect(response.ok).toBe(true);
    });

    it('should support setting maxResponseSize to 0 (block all responses)', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 0
      });

      mockTransport.setMockResponse('GET', '/any', 200, { data: 'x' }, {
        'Content-Length': '1'
      });

      await expect(client.get('/any')).rejects.toThrow(MaxSizeExceededError);
    });

    it('should support very large limits', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 1024 * 1024 * 1024 // 1 GB
      });

      mockTransport.setMockResponse('GET', '/big', 200, { data: 'ok' }, {
        'Content-Length': String(500 * 1024 * 1024) // 500 MB
      });

      const response = await client.get('/big');
      expect(response.ok).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid Content-Length gracefully', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 100
      });

      mockTransport.setMockResponse('GET', '/invalid', 200, { data: 'ok' }, {
        'Content-Length': 'not-a-number'
      });

      // Should not throw on invalid Content-Length (skip check)
      const response = await client.get('/invalid');
      expect(response.ok).toBe(true);
    });

    it('should preserve request information in error', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 100
      });

      mockTransport.setMockResponse('GET', '/large', 200, { data: 'large' }, {
        'Content-Length': '1000'
      });

      try {
        await client.get('/large');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MaxSizeExceededError);
        const err = error as MaxSizeExceededError;
        expect(err.request).toBeDefined();
        expect(err.request?.url).toContain('/large');
        expect(err.request?.method).toBe('GET');
      }
    });
  });

  describe('Integration with other features', () => {
    it('should work with retry plugin', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 100,
        retry: {
          maxAttempts: 3
        }
      });

      mockTransport.setMockResponse('GET', '/large', 200, { data: 'large' }, {
        'Content-Length': '1000'
      }, { times: 3 });

      // Should not retry on MaxSizeExceededError (not a network error)
      await expect(client.get('/large')).rejects.toThrow(MaxSizeExceededError);
    });

    it('should work with custom headers', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 100,
        headers: {
          'X-Custom': 'value'
        }
      });

      mockTransport.setMockResponse('GET', '/small', 200, { data: 'ok' }, {
        'Content-Length': '50'
      });

      const response = await client.get('/small');
      expect(response.ok).toBe(true);
    });
  });

  describe('Different HTTP methods', () => {
    it('should check size for POST responses', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 100
      });

      mockTransport.setMockResponse('POST', '/api', 200, { result: 'ok' }, {
        'Content-Length': '1000'
      });

      await expect(client.post('/api', { json: { data: 'test' } }))
        .rejects.toThrow(MaxSizeExceededError);
    });

    it('should check size for PUT responses', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 100
      });

      mockTransport.setMockResponse('PUT', '/api/1', 200, { result: 'ok' }, {
        'Content-Length': '1000'
      });

      await expect(client.put('/api/1', { json: { data: 'test' } }))
        .rejects.toThrow(MaxSizeExceededError);
    });

    it('should check size for DELETE responses', async () => {
      client = new Client({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        maxResponseSize: 100
      });

      mockTransport.setMockResponse('DELETE', '/api/1', 200, { result: 'ok' }, {
        'Content-Length': '1000'
      });

      await expect(client.delete('/api/1'))
        .rejects.toThrow(MaxSizeExceededError);
    });
  });
});
