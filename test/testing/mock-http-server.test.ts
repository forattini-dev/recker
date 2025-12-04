import { describe, it, expect, afterEach } from 'vitest';
import { MockHttpServer, createMockHttpServer } from '../../src/testing/mock-http-server.js';

describe('MockHttpServer', () => {
  let server: MockHttpServer;

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop', async () => {
      server = new MockHttpServer();
      await server.start();
      expect(server.isRunning).toBe(true);
      expect(server.port).toBeGreaterThan(0);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should not start if already running', async () => {
      server = await MockHttpServer.create();
      await expect(server.start()).rejects.toThrow('already started');
    });

    it('should provide URL', async () => {
      server = await MockHttpServer.create({ host: '127.0.0.1' });
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    });
  });

  describe('Route Definition', () => {
    it('should register GET route', async () => {
      server = await MockHttpServer.create();
      server.get('/users', { status: 200, body: [{ id: 1 }] });

      const response = await fetch(`${server.url}/users`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([{ id: 1 }]);
    });

    it('should register POST route', async () => {
      server = await MockHttpServer.create();
      server.post('/users', { status: 201, body: { id: 1, created: true } });

      const response = await fetch(`${server.url}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John' }),
      });

      expect(response.status).toBe(201);
    });

    it('should register PUT route', async () => {
      server = await MockHttpServer.create();
      server.put('/users/:id', { status: 200, body: { updated: true } });

      const response = await fetch(`${server.url}/users/1`, { method: 'PUT' });

      expect(response.status).toBe(200);
    });

    it('should register DELETE route', async () => {
      server = await MockHttpServer.create();
      server.delete('/users/:id', { status: 204 });

      const response = await fetch(`${server.url}/users/1`, { method: 'DELETE' });

      expect(response.status).toBe(204);
    });

    it('should register PATCH route', async () => {
      server = await MockHttpServer.create();
      server.patch('/users/:id', { status: 200, body: { patched: true } });

      const response = await fetch(`${server.url}/users/1`, { method: 'PATCH' });

      expect(response.status).toBe(200);
    });

    it('should match any method with any()', async () => {
      server = await MockHttpServer.create();
      server.any('/wildcard', { status: 200, body: { ok: true } });

      const getResponse = await fetch(`${server.url}/wildcard`);
      const postResponse = await fetch(`${server.url}/wildcard`, { method: 'POST' });

      expect(getResponse.status).toBe(200);
      expect(postResponse.status).toBe(200);
    });

    it('should return 404 for unmatched routes', async () => {
      server = await MockHttpServer.create();

      const response = await fetch(`${server.url}/nonexistent`);

      expect(response.status).toBe(404);
    });
  });

  describe('Handler Functions', () => {
    it('should call handler function', async () => {
      server = await MockHttpServer.create();
      server.post('/echo', (req) => ({
        status: 200,
        body: { received: req.body },
      }));

      const response = await fetch(`${server.url}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      });

      const data = await response.json();
      expect(data.received).toEqual({ message: 'hello' });
    });

    it('should provide query parameters', async () => {
      server = await MockHttpServer.create();
      server.get('/search', (req) => ({
        status: 200,
        body: { query: req.query },
      }));

      const response = await fetch(`${server.url}/search?q=test&page=1`);
      const data = await response.json();

      expect(data.query).toEqual({ q: 'test', page: '1' });
    });

    it('should provide headers', async () => {
      server = await MockHttpServer.create();
      server.get('/headers', (req) => ({
        status: 200,
        body: { auth: req.headers.authorization },
      }));

      const response = await fetch(`${server.url}/headers`, {
        headers: { Authorization: 'Bearer token123' },
      });

      const data = await response.json();
      expect(data.auth).toBe('Bearer token123');
    });

    it('should support async handlers', async () => {
      server = await MockHttpServer.create();
      server.get('/async', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { status: 200, body: { async: true } };
      });

      const response = await fetch(`${server.url}/async`);
      const data = await response.json();

      expect(data.async).toBe(true);
    });
  });

  describe('Path Parameters', () => {
    it('should match path parameters', async () => {
      server = await MockHttpServer.create();
      server.get('/users/:id', { status: 200, body: { id: 'matched' } });

      const response = await fetch(`${server.url}/users/123`);

      expect(response.status).toBe(200);
    });

    it('should match multiple path parameters', async () => {
      server = await MockHttpServer.create();
      server.get('/users/:userId/posts/:postId', {
        status: 200,
        body: { matched: true },
      });

      const response = await fetch(`${server.url}/users/1/posts/42`);

      expect(response.status).toBe(200);
    });
  });

  describe('Response Features', () => {
    it('should set custom headers', async () => {
      server = await MockHttpServer.create();
      server.get('/custom', {
        status: 200,
        body: 'ok',
        headers: { 'X-Custom-Header': 'value' },
      });

      const response = await fetch(`${server.url}/custom`);

      expect(response.headers.get('X-Custom-Header')).toBe('value');
    });

    it('should add delay to response', async () => {
      server = await MockHttpServer.create();
      server.get('/slow', { status: 200, body: 'ok', delay: 50 });

      const start = Date.now();
      await fetch(`${server.url}/slow`);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(50);
    });

    it('should use global delay', async () => {
      server = await MockHttpServer.create({ delay: 50 });
      server.get('/test', { status: 200, body: 'ok' });

      const start = Date.now();
      await fetch(`${server.url}/test`);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(50);
    });

    it('should stream response', async () => {
      server = await MockHttpServer.create();
      server.get('/stream', {
        status: 200,
        stream: {
          chunks: ['chunk1', 'chunk2', 'chunk3'],
          interval: 10,
        },
      });

      const response = await fetch(`${server.url}/stream`);
      const text = await response.text();

      expect(text).toBe('chunk1chunk2chunk3');
    });

    it('should return text content', async () => {
      server = await MockHttpServer.create();
      server.get('/text', {
        status: 200,
        body: 'Hello, World!',
        headers: { 'Content-Type': 'text/plain' },
      });

      const response = await fetch(`${server.url}/text`);
      const text = await response.text();

      expect(text).toBe('Hello, World!');
      expect(response.headers.get('Content-Type')).toBe('text/plain');
    });
  });

  describe('Times Limit', () => {
    it('should limit route to specific number of calls', async () => {
      server = await MockHttpServer.create();
      server.get('/limited', { status: 200, body: 'ok' }, { times: 2 });

      const response1 = await fetch(`${server.url}/limited`);
      const response2 = await fetch(`${server.url}/limited`);
      const response3 = await fetch(`${server.url}/limited`);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response3.status).toBe(404); // Falls back to default
    });

    it('should track call count', async () => {
      server = await MockHttpServer.create();
      server.get('/counted', { status: 200, body: 'ok' });

      await fetch(`${server.url}/counted`);
      await fetch(`${server.url}/counted`);

      expect(server.getCallCount('GET', '/counted')).toBe(2);
    });
  });

  describe('CORS', () => {
    it('should handle CORS preflight', async () => {
      server = await MockHttpServer.create({ cors: true });

      const response = await fetch(`${server.url}/anything`, {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });

    it('should add CORS headers to responses', async () => {
      server = await MockHttpServer.create({ cors: true });
      server.get('/api', { status: 200, body: 'ok' });

      const response = await fetch(`${server.url}/api`);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should use custom CORS origin', async () => {
      server = await MockHttpServer.create({ cors: true, corsOrigin: 'https://example.com' });
      server.get('/api', { status: 200, body: 'ok' });

      const response = await fetch(`${server.url}/api`);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    });
  });

  describe('Statistics', () => {
    it('should track request statistics', async () => {
      server = await MockHttpServer.create();
      server.get('/a', { status: 200, body: 'ok' });
      server.post('/b', { status: 200, body: 'ok' });

      await fetch(`${server.url}/a`);
      await fetch(`${server.url}/a`);
      await fetch(`${server.url}/b`, { method: 'POST' });

      const stats = server.statistics;
      expect(stats.totalRequests).toBe(3);
      expect(stats.requestsByMethod['GET']).toBe(2);
      expect(stats.requestsByMethod['POST']).toBe(1);
      expect(stats.requestsByPath['/a']).toBe(2);
      expect(stats.requestsByPath['/b']).toBe(1);
    });

    it('should log requests', async () => {
      server = await MockHttpServer.create();
      server.get('/test', { status: 200, body: 'ok' });

      await fetch(`${server.url}/test`);

      const stats = server.statistics;
      expect(stats.requestLog.length).toBe(1);
      expect(stats.requestLog[0].method).toBe('GET');
      expect(stats.requestLog[0].path).toBe('/test');
      expect(stats.requestLog[0].status).toBe(200);
    });

    it('should wait for requests', async () => {
      server = await MockHttpServer.create();
      server.get('/test', { status: 200, body: 'ok' });

      setTimeout(() => {
        fetch(`${server.url}/test`);
        fetch(`${server.url}/test`);
      }, 10);

      await server.waitForRequests(2);

      expect(server.statistics.totalRequests).toBe(2);
    });
  });

  describe('Route Management', () => {
    it('should remove route', async () => {
      server = await MockHttpServer.create();
      server.get('/removable', { status: 200, body: 'ok' });

      const response1 = await fetch(`${server.url}/removable`);
      expect(response1.status).toBe(200);

      server.removeRoute('GET', '/removable');

      const response2 = await fetch(`${server.url}/removable`);
      expect(response2.status).toBe(404);
    });

    it('should clear all routes', async () => {
      server = await MockHttpServer.create();
      server.get('/a', { status: 200, body: 'ok' });
      server.get('/b', { status: 200, body: 'ok' });

      server.clearRoutes();

      expect(server.routeCount).toBe(0);

      const response = await fetch(`${server.url}/a`);
      expect(response.status).toBe(404);
    });
  });

  describe('Reset', () => {
    it('should reset server state', async () => {
      server = await MockHttpServer.create();
      server.get('/test', { status: 200, body: 'ok' });

      await fetch(`${server.url}/test`);

      server.reset();

      expect(server.routeCount).toBe(0);
      expect(server.statistics.totalRequests).toBe(0);
    });
  });

  describe('Events', () => {
    it('should emit request event', async () => {
      server = await MockHttpServer.create();
      server.get('/test', { status: 200, body: 'ok' });

      const requestPromise = new Promise<any>((resolve) => {
        server.on('request', resolve);
      });

      fetch(`${server.url}/test`);

      const req = await requestPromise;
      expect(req.method).toBe('GET');
      expect(req.path).toBe('/test');
    });

    it('should emit response event', async () => {
      server = await MockHttpServer.create();
      server.get('/test', { status: 200, body: 'ok' });

      const responsePromise = new Promise<any>((resolve) => {
        server.on('response', (req, res, duration) => resolve({ req, res, duration }));
      });

      await fetch(`${server.url}/test`);

      const { req, res, duration } = await responsePromise;
      expect(req.path).toBe('/test');
      expect(res.status).toBe(200);
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Helper Functions', () => {
    it('createMockHttpServer should create configured server', async () => {
      server = await createMockHttpServer({
        '/users': { status: 200, body: [{ id: 1 }] },
        'POST /users': { status: 201, body: { created: true } },
      });

      expect(server.isRunning).toBe(true);

      const getResponse = await fetch(`${server.url}/users`);
      expect(getResponse.status).toBe(200);

      const postResponse = await fetch(`${server.url}/users`, { method: 'POST' });
      expect(postResponse.status).toBe(201);
    });
  });
});
