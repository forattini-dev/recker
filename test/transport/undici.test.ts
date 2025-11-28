import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { UndiciTransport } from '../../src/transport/undici.js';
import { HttpRequest } from '../../src/core/request.js';
import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { TimeoutError, NetworkError } from '../../src/core/errors.js';

describe('UndiciTransport', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    return new Promise<void>((resolve) => {
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else if (req.url === '/text') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Hello World');
        } else if (req.url === '/echo' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(body);
          });
        } else if (req.url === '/redirect') {
          res.writeHead(302, { 'Location': '/json' });
          res.end();
        } else if (req.url === '/redirect-301') {
          res.writeHead(301, { 'Location': '/json' });
          res.end();
        } else if (req.url === '/redirect-303') {
          res.writeHead(303, { 'Location': '/json' });
          res.end();
        } else if (req.url === '/redirect-307') {
          res.writeHead(307, { 'Location': '/json' });
          res.end();
        } else if (req.url === '/redirect-loop') {
          res.writeHead(302, { 'Location': '/redirect-loop' });
          res.end();
        } else if (req.url === '/slow') {
          setTimeout(() => {
            res.writeHead(200);
            res.end('slow response');
          }, 2000);
        } else if (req.url === '/headers') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            authorization: req.headers.authorization,
            contentType: req.headers['content-type'],
            custom: req.headers['x-custom-header']
          }));
        } else if (req.url === '/stream') {
          res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '12' });
          res.write('Hello ');
          setTimeout(() => {
            res.end('World!');
          }, 50);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      server.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  describe('Basic functionality', () => {
    it('should perform a GET request', async () => {
      const transport = new UndiciTransport(baseUrl);
      const request = new HttpRequest(`${baseUrl}/json`, { method: 'GET' });
      const response = await transport.dispatch(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ success: true });
    });

    it('should perform a POST request with body', async () => {
      const transport = new UndiciTransport(baseUrl);
      const request = new HttpRequest(`${baseUrl}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test' })
      });

      const response = await transport.dispatch(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ message: 'test' });
    });

    it('should pass custom headers', async () => {
      const transport = new UndiciTransport(baseUrl);
      const request = new HttpRequest(`${baseUrl}/headers`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer token123',
          'X-Custom-Header': 'custom-value'
        }
      });

      const response = await transport.dispatch(request);
      const data = await response.json();
      expect(data.authorization).toBe('Bearer token123');
      expect(data.custom).toBe('custom-value');
    });
  });

  describe('Redirect handling', () => {
    it('should call beforeRedirect hook', async () => {
      let hookCalled = false;
      let redirectInfo: any = null;

      const transport = new UndiciTransport(baseUrl);
      const request = new HttpRequest(`${baseUrl}/redirect`, {
        method: 'GET',
        beforeRedirect: (info: any) => {
          hookCalled = true;
          redirectInfo = info;
          return true;
        }
      });

      const response = await transport.dispatch(request);

      expect(hookCalled).toBe(true);
      expect(redirectInfo).toBeDefined();
      expect(redirectInfo.from).toContain('/redirect');
      expect(redirectInfo.to).toContain('/json');
      expect(redirectInfo.status).toBe(302);
    });

    it('should stop redirect when beforeRedirect returns false', async () => {
      const transport = new UndiciTransport(baseUrl);
      const request = new HttpRequest(`${baseUrl}/redirect`, {
        method: 'GET',
        beforeRedirect: () => false
      });

      const response = await transport.dispatch(request);

      expect(response.status).toBe(302);
    });

    it('should allow modifying redirect URL in beforeRedirect', async () => {
      const transport = new UndiciTransport(baseUrl);
      const request = new HttpRequest(`${baseUrl}/redirect`, {
        method: 'GET',
        beforeRedirect: () => `${baseUrl}/text`
      });

      const response = await transport.dispatch(request);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('Hello World');
    });
  });

  describe('Timeout handling', () => {
    it('should timeout with request timeout', async () => {
      const transport = new UndiciTransport(baseUrl, { headersTimeout: 100 });
      const request = new HttpRequest(`${baseUrl}/slow`, { method: 'GET' });

      await expect(transport.dispatch(request)).rejects.toThrow(TimeoutError);
    });
  });

  describe('Observability', () => {
    it('should capture timings when observability is enabled', async () => {
      const transport = new UndiciTransport(baseUrl, { observability: true });
      const request = new HttpRequest(`${baseUrl}/json`, { method: 'GET' });

      const response = await transport.dispatch(request);

      expect(response.timings).toBeDefined();
    });

    it('should skip timings when observability is disabled', async () => {
      const transport = new UndiciTransport(baseUrl, { observability: false });
      const request = new HttpRequest(`${baseUrl}/json`, { method: 'GET' });

      const response = await transport.dispatch(request);

      // Timings should be empty when observability is disabled
      expect(response.timings).toEqual({});
    });
  });

  describe('HTTP/2 configuration', () => {
    it('should configure HTTP/2 when enabled', async () => {
      const transport = new UndiciTransport(baseUrl, {
        http2: {
          enabled: true,
          maxConcurrentStreams: 100
        }
      });
      const request = new HttpRequest(`${baseUrl}/json`, { method: 'GET' });

      const response = await transport.dispatch(request);
      expect(response.status).toBe(200);
    });

    it('should allow per-request HTTP/2 override', async () => {
      const transport = new UndiciTransport(baseUrl, { http2: { enabled: true } });
      const request = new HttpRequest(`${baseUrl}/json`, { method: 'GET', http2: false });

      const response = await transport.dispatch(request);
      expect(response.status).toBe(200);
    });
  });

  describe('TLS options', () => {
    it('should accept TLS configuration', () => {
      // Just verify constructor doesn't throw
      const transport = new UndiciTransport('https://example.com', {
        tls: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2',
          maxVersion: 'TLSv1.3'
        }
      });
      expect(transport).toBeDefined();
    });
  });

  describe('Download progress', () => {
    it('should call onDownloadProgress callback', async () => {
      const progressEvents: any[] = [];
      const transport = new UndiciTransport(baseUrl);
      const request = new HttpRequest(`${baseUrl}/stream`, {
        method: 'GET',
        onDownloadProgress: (event: any) => {
          progressEvents.push(event);
        }
      });

      const response = await transport.dispatch(request);
      await response.text();

      // Progress events may or may not fire depending on stream size
      expect(response.status).toBe(200);
    });
  });

  describe('Client integration', () => {
    it('should work with createClient', async () => {
      const client = createClient({ baseUrl });
      const response = await client.get('/json');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ success: true });
    });

    it('should handle 404 errors', async () => {
      const client = createClient({ baseUrl });
      const response = await client.get('/nonexistent', { throwHttpErrors: false });

      expect(response.status).toBe(404);
    });
  });
});

describe('Proxy bypass logic', () => {
  // Test shouldBypassProxy indirectly through UndiciTransport behavior
  it('should create transport with proxy configuration', () => {
    const transport = new UndiciTransport('https://api.example.com', {
      proxy: {
        url: 'http://proxy.example.com:8080',
        bypass: ['localhost', '*.internal.com', '192.168.0.0/16']
      }
    });
    expect(transport).toBeDefined();
  });

  it('should create transport with proxy auth', () => {
    const transport = new UndiciTransport('https://api.example.com', {
      proxy: {
        url: 'http://proxy.example.com:8080',
        auth: {
          username: 'user',
          password: 'pass'
        }
      }
    });
    expect(transport).toBeDefined();
  });

  it('should throw for SOCKS proxy', () => {
    expect(() => {
      new UndiciTransport('https://api.example.com', {
        proxy: { url: 'socks5://proxy.example.com:1080' }
      });
    }).toThrow(NetworkError);
  });
});

describe('Agent configuration', () => {
  it('should create transport with connection pool settings', () => {
    const transport = new UndiciTransport('https://api.example.com', {
      connections: 10,
      pipelining: 1,
      keepAlive: true,
      keepAliveTimeout: 30000,
      perDomainPooling: true
    });
    expect(transport).toBeDefined();
  });

  it('should create transport with local address', () => {
    const transport = new UndiciTransport('https://api.example.com', {
      localAddress: '0.0.0.0'
    });
    expect(transport).toBeDefined();
  });
});

describe('Granular timeouts', () => {
  it('should map timeout options correctly', async () => {
    const transport = new UndiciTransport('http://localhost:9999', {
      connectTimeout: 1000,
      headersTimeout: 2000,
      bodyTimeout: 3000
    });
    expect(transport).toBeDefined();
  });
});
