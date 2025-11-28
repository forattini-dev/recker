import { describe, it, expect } from 'vitest';
import { createClient } from '../src/index.js';
import { MockTransport } from './helpers/mock-transport.js';

describe('URL Templating', () => {
  const baseUrl = 'https://api.example.com';

  it('should replace path parameters', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/users/123/posts/456', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport
    });

    const response = await client.get('/users/:userId/posts/:postId', {
      params: {
        userId: 123,
        postId: '456'
      }
    });

    expect(response.status).toBe(200);
  });

  it('should handle mixed path and query parameters', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/search/widgets?q=blue', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport
    });

    const response = await client.get('/search/:category', {
      params: {
        category: 'widgets',
        q: 'blue' // Not in path, should go to query string
      }
    });

    expect(response.status).toBe(200);
  });

  it('should throw error for missing path parameters', async () => {
    const client = createClient({ baseUrl });

    expect(() => client.get('/users/:id', {
      params: { other: 'stuff' }
    })).toThrow(/Missing required path parameter: id/);
  });

  it('should allow default params via client options', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/v1/status', 200, { ok: true });

    // Initialize client with default params
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      defaults: {
        params: { version: 'v1' }
      }
    });

    // Usage
    const response = await client.get('/:version/status');
    expect(response.status).toBe(200);
  });
});
