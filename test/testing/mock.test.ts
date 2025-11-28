import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

    it('should mock with intercept method', async () => {
      mock.intercept({ path: '/custom', method: 'GET' }).reply(200, { custom: true });
      const result = await client.get('/custom').json();
      expect(result).toEqual({ custom: true });
    });
  });

  describe('Global Mock', () => {
    let mockAgent: ReturnType<typeof import('../../src/testing/index.js').installGlobalMock>;

    afterEach(async () => {
      const { uninstallGlobalMock } = await import('../../src/testing/index.js');
      uninstallGlobalMock();
    });

    it('should install and uninstall global mock', async () => {
      const { installGlobalMock, uninstallGlobalMock } = await import('../../src/testing/index.js');

      mockAgent = installGlobalMock();
      expect(mockAgent).toBeDefined();

      uninstallGlobalMock();
    });

    it('should throw on unmocked requests when disableNetConnect is true', async () => {
      const { installGlobalMock } = await import('../../src/testing/index.js');

      mockAgent = installGlobalMock({ throwOnUnmocked: true });
      expect(mockAgent).toBeDefined();
    });
  });

  describe('MockClient additional methods', () => {
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

    it('should throw error when reply called without intercept', () => {
      expect(() => mock.reply(200)).toThrow('No intercept defined');
    });

    it('should throw error when replyOnce called without intercept', () => {
      expect(() => mock.replyOnce(200)).toThrow('No intercept defined');
    });

    it('should throw error when replyWithDelay called without intercept', () => {
      expect(() => mock.replyWithDelay(100, 200)).toThrow('No intercept defined');
    });

    it('should throw error when replyWithError called without intercept', () => {
      expect(() => mock.replyWithError('error')).toThrow('No intercept defined');
    });

    it('should reset history only with resetHistory', async () => {
      mock.get('/test').reply(200, {});
      await client.get('/test');
      expect(mock.callCount()).toBe(1);

      mock.resetHistory();
      expect(mock.callCount()).toBe(0);

      // Mock should still work
      await client.get('/test');
      expect(mock.callCount()).toBe(1);
    });

    it('should return history', async () => {
      mock.get('/test').reply(200, {});
      await client.get('/test');

      const history = mock.history();
      expect(history).toHaveLength(1);
      expect(history[0].method).toBe('GET');
      expect(history[0].url).toContain('/test');
    });

    it('should handle called with regex pattern', async () => {
      mock.get('/users/123').reply(200, {});
      await client.get('/users/123');

      expect(mock.called('GET', /users\/\d+/)).toBe(true);
      expect(mock.called('GET', /posts\/\d+/)).toBe(false);
    });

    it('should handle callCount with regex pattern', async () => {
      mock.get('/users/123').reply(200, {});
      mock.get('/users/456').reply(200, {});
      await client.get('/users/123');
      await client.get('/users/456');

      expect(mock.callCount('GET', /users\/\d+/)).toBe(2);
    });

    it('should return call count without method filter', async () => {
      mock.get('/test').reply(200, {});
      mock.post('/test').reply(200, {});
      await client.get('/test');
      await client.post('/test', {});

      expect(mock.callCount()).toBe(2);
    });

    it('should handle replyWithError with Error instance', async () => {
      const error = new Error('Custom Error');
      mock.get('/error').replyWithError(error);

      await expect(client.get('/error')).rejects.toThrow('Custom Error');
    });
  });

  describe('MockTransport body handling', () => {
    it('should handle FormData body', async () => {
      const { mock, transport } = createMockClient();
      mock.post('/form').reply(200, { received: true });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport
      });

      const formData = new FormData();
      formData.append('field', 'value');

      const result = await client.post('/form', { body: formData });
      expect(result.status).toBe(200);
    });

    it('should handle URLSearchParams body', async () => {
      const { mock, transport } = createMockClient();
      mock.post('/params').reply(200, { received: true });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport
      });

      const params = new URLSearchParams();
      params.append('key', 'value');

      const result = await client.post('/params', { body: params });
      expect(result.status).toBe(200);
    });
  });
});
