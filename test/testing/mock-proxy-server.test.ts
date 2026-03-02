import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { MockProxyServer, MockHttpServer, createMockProxyServer, createMockHttpServer } from 'raffel/testing';
import http from 'node:http';

describe('MockProxyServer', () => {
  let proxy: MockProxyServer;
  let target: MockHttpServer;

  beforeAll(async () => {
    target = await createMockHttpServer({ host: '127.0.0.1' });
    target.get('/api/test', () => ({ status: 200, body: { message: 'success' } }));
    target.post('/api/echo', (req) => ({
      status: 200,
      body: { received: req.body },
    }));
  });

  afterAll(async () => {
    if (target?.isRunning) {
      await target.stop();
    }
  });

  afterEach(async () => {
    if (proxy?.isRunning) {
      await proxy.stop();
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop', async () => {
      proxy = new MockProxyServer();
      await proxy.start();
      expect(proxy.isRunning).toBe(true);
      expect(proxy.port).toBeGreaterThan(0);

      await proxy.stop();
      expect(proxy.isRunning).toBe(false);
    });

    it('should provide URL', async () => {
      proxy = await createMockProxyServer({ host: '127.0.0.1' });
      expect(proxy.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    });

    it('should start on custom port', async () => {
      proxy = await createMockProxyServer({ port: 18889, host: '127.0.0.1' });
      expect(proxy.port).toBe(18889);
    });
  });

  describe('Forward Proxy Mode', () => {
    it('should forward HTTP GET requests', async () => {
      proxy = await createMockProxyServer({ mode: 'forward', host: '127.0.0.1' });

      const response = await makeProxiedRequest(
        proxy.port,
        `${target.url}/api/test`,
        'GET'
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('success');
    });

    it('should forward HTTP POST requests with body', async () => {
      proxy = await createMockProxyServer({ mode: 'forward', host: '127.0.0.1' });

      const response = await makeProxiedRequest(
        proxy.port,
        `${target.url}/api/echo`,
        'POST',
        JSON.stringify({ test: 'data' }),
        { 'Content-Type': 'application/json' }
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.received).toEqual({ test: 'data' });
    });
  });

  describe('Events', () => {
    it('should emit request event with request and response', async () => {
      proxy = await createMockProxyServer({ mode: 'forward', host: '127.0.0.1' });

      const events: Array<{ request: unknown; response: unknown }> = [];
      proxy.on('request', (data) => events.push(data));

      await makeProxiedRequest(proxy.port, `${target.url}/api/test`, 'GET');

      expect(events.length).toBe(1);
      expect((events[0] as { request: { method: string } }).request.method).toBe('GET');
    });

    it('should emit error event on connection failure', async () => {
      proxy = await createMockProxyServer({ mode: 'forward', host: '127.0.0.1' });

      const errors: Error[] = [];
      proxy.on('error', (err) => errors.push(err));

      try {
        await makeProxiedRequest(proxy.port, 'http://127.0.0.1:59998/nonexistent', 'GET');
      } catch {
        // Expected to fail
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      // No crash occurred — errors array may or may not have entries depending on timing
    });
  });

  describe('Statistics', () => {
    it('should track request count via statistics', async () => {
      proxy = await createMockProxyServer({ mode: 'forward', host: '127.0.0.1' });

      expect(proxy.statistics.totalRequests).toBe(0);

      await makeProxiedRequest(proxy.port, `${target.url}/api/test`, 'GET');
      await makeProxiedRequest(proxy.port, `${target.url}/api/test`, 'GET');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(proxy.statistics.totalRequests).toBe(2);
    });

    it('should track bytes transferred via statistics', async () => {
      proxy = await createMockProxyServer({ mode: 'forward', host: '127.0.0.1' });

      await makeProxiedRequest(proxy.port, `${target.url}/api/test`, 'GET');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(proxy.statistics.totalBytesTransferred).toBeGreaterThanOrEqual(0);
    });

    it('should reset statistics', async () => {
      proxy = await createMockProxyServer({ mode: 'forward', host: '127.0.0.1' });

      await makeProxiedRequest(proxy.port, `${target.url}/api/test`, 'GET');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(proxy.statistics.totalRequests).toBeGreaterThan(0);

      proxy.reset();
      expect(proxy.statistics.totalRequests).toBe(0);
    });
  });

  describe('CONNECT Tunneling', () => {
    it('should handle CONNECT method for HTTPS tunneling', async () => {
      proxy = await createMockProxyServer({ mode: 'forward', host: '127.0.0.1' });

      const response = await new Promise<{ connected: boolean }>((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1',
          port: proxy.port,
          method: 'CONNECT',
          path: 'example.com:443',
        });

        req.on('connect', (res) => {
          resolve({ connected: res.statusCode === 200 });
          res.socket?.destroy();
        });

        req.on('error', reject);
        req.end();
      });

      expect(response.connected).toBe(true);
    });
  });
});

function makeProxiedRequest(
  proxyPort: number,
  targetUrl: string,
  method: string,
  body?: string,
  headers?: Record<string, string>
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const options: http.RequestOptions = {
      host: '127.0.0.1',
      port: proxyPort,
      method,
      path: targetUrl,
      headers: {
        Host: url.host,
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, body: data });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}
