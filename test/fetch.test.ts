import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '../src/core/client.js';
import { FetchTransport } from '../src/transport/fetch.js';
import { createServer } from 'node:http';

// We can't easily mock global fetch in Node without a polyfill or using undici's fetch implementation directly,
// but in Node 18+ global fetch exists.
// We will spin up a real local server to test the FetchTransport integration.

describe('Fetch Transport', () => {
  let server: any;
  let url: string;

  beforeAll(async () => {
    return new Promise<void>((resolve) => {
        server = createServer((req, res) => {
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
                    res.writeHead(200);
                    res.end(body);
                });
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        server.listen(0, () => {
            const addr = server.address();
            url = `http://localhost:${(addr as any).port}`;
            resolve();
        });
    });
  });

  afterAll(() => {
      server.close();
  });

  it('should perform a GET JSON request using Fetch', async () => {
      const client = createClient({
          baseUrl: url,
          transport: new FetchTransport() // Explicitly use Fetch
      });

      const res = await client.get('/json').json<{success: boolean}>();
      expect(res.success).toBe(true);
  });

  it('should perform a POST request with body', async () => {
    const client = createClient({
        baseUrl: url,
        transport: new FetchTransport()
    });

    const payload = { data: 'test' };
    const res = await client.post('/echo', payload).json();
    expect(res).toEqual(payload);
  });
});
