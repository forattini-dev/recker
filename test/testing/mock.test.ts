import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { createMockClient, MockClient, MockTransport } from '../../src/testing/index.js';

describe('Testing Utilities', () => {
  describe('createMockClient', () => {
    it('should create mock and transport', () => {
      const { mock, transport } = createMockClient();
      expect(mock).toBeInstanceOf(MockClient);
      expect(transport).toBeInstanceOf(MockTransport);
    });

    it('should mock GET requests', async () => {
      const { mock, transport } = createMockClient();

      mock.get('/users').reply(200, [{ id: 1, name: 'John' }]);

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport
      });

      const users = await client.get('/users').json();
      expect(users).toEqual([{ id: 1, name: 'John' }]);
    });

    it('should mock POST requests', async () => {
      const { mock, transport } = createMockClient();

      mock.post('/users').reply(201, { id: 2, name: 'Jane' });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport
      });

      const user = await client.post('/users', { name: 'Jane' }).json();
      expect(user).toEqual({ id: 2, name: 'Jane' });
    });

    it('should track call history', async () => {
      const { mock, transport } = createMockClient();

      mock.get('/users').reply(200, []);
      mock.get('/posts').reply(200, []);

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport
      });

      await client.get('/users');
      await client.get('/posts');

      expect(mock.callCount()).toBe(2);
      expect(mock.called('GET', '/users')).toBe(true);
      expect(mock.called('GET', '/posts')).toBe(true);
      expect(mock.called('POST', '/users')).toBe(false);
    });

    it('should support sequential responses with replyOnce', async () => {
      const { mock, transport } = createMockClient();

      mock.get('/data')
        .replyOnce(500, { error: 'Server Error' })
        .replyOnce(200, { data: 'success' });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport,
        retry: { maxAttempts: 1 } // Disable retry for this test
      });

      // First call returns 500
      const res1 = await client.get('/data', { throwHttpErrors: false });
      expect(res1.status).toBe(500);

      // Second call returns 200
      const res2 = await client.get('/data');
      expect(res2.status).toBe(200);
    });

    it('should support regex path matching', async () => {
      const { mock, transport } = createMockClient();

      mock.get(/\/users\/\d+/).reply(200, { id: 1 });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport
      });

      const user = await client.get('/users/123').json();
      expect(user).toEqual({ id: 1 });
    });

    it('should reset mocks and history', async () => {
      const { mock, transport } = createMockClient();

      mock.get('/test').reply(200, {});

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport
      });

      await client.get('/test');
      expect(mock.callCount()).toBe(1);

      mock.reset();
      expect(mock.callCount()).toBe(0);
      expect(mock.history()).toHaveLength(0);
    });
  });

  describe('MockTransport', () => {
    it('should throw error for unmocked requests', async () => {
      const transport = new MockTransport();

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport
      });

      await expect(client.get('/unmocked')).rejects.toThrow('No mock response');
    });

    it('should handle delayed responses', async () => {
      const { mock, transport } = createMockClient();

      mock.get('/slow').replyWithDelay(100, 200, { data: 'slow' });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport
      });

      const start = Date.now();
      await client.get('/slow');
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(90);
    });

    it('should handle error responses', async () => {
      const { mock, transport } = createMockClient();

      mock.get('/error').replyWithError('Network failure');

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport
      });

      await expect(client.get('/error')).rejects.toThrow('Network failure');
    });
  });

  describe('HTTP methods', () => {
    let mock: MockClient;
    let client: ReturnType<typeof createClient>;

    beforeEach(() => {
      const result = createMockClient();
      mock = result.mock;
      client = createClient({
        baseUrl: 'https://api.example.com',
        transport: result.transport
      });
    });

    it('should mock PUT requests', async () => {
      mock.put('/users/1').reply(200, { updated: true });
      const result = await client.put('/users/1', {}).json();
      expect(result).toEqual({ updated: true });
    });

    it('should mock PATCH requests', async () => {
      mock.patch('/users/1').reply(200, { patched: true });
      const result = await client.patch('/users/1', {}).json();
      expect(result).toEqual({ patched: true });
    });

    it('should mock DELETE requests', async () => {
      mock.delete('/users/1').reply(204);
      const result = await client.delete('/users/1');
      expect(result.status).toBe(204);
    });
  });
});
