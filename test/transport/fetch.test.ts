import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { FetchTransport } from '../../src/transport/fetch.js';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { HttpRequest } from '../../src/core/request.js';

// We can't easily mock global fetch in Node without a polyfill or using undici's fetch implementation directly,
// but in Node 18+ global fetch exists.
// We will spin up a real local server to test the FetchTransport integration.

describe('Fetch Transport', () => {
  let server: any;
  let url: string;

  beforeAll(async () => {
    return new Promise<void>((resolve) => {
        server = createServer((req: IncomingMessage, res: ServerResponse) => {
            if (req.url === '/json') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } else if (req.url === '/text') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Hello World');
            } else if (req.url === '/html') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><h1>Title</h1><p>Content</p></body></html>');
            } else if (req.url === '/echo' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(body);
                });
            } else if (req.url === '/stream') {
                res.writeHead(200, {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': '15'
                });
                res.write('chunk1');
                res.write('chunk2');
                res.end('chunk3');
            } else if (req.url === '/sse') {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache'
                });
                res.write('data: event1\n\n');
                res.write('data: event2\n\n');
                res.write('data: event3\n\n');
                res.end();
            } else if (req.url === '/blob') {
                res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
                res.end(Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f])); // "Hello"
            } else if (req.url === '/empty') {
                res.writeHead(204);
                res.end();
            } else if (req.url === '/redirect') {
                res.writeHead(302, { 'Location': `${url}/json` });
                res.end();
            } else if (req.url === '/error') {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Server Error' }));
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

  describe('FetchTransport', () => {
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

      it('should get text response', async () => {
          const client = createClient({
              baseUrl: url,
              transport: new FetchTransport()
          });

          const res = await client.get('/text').text();
          expect(res).toBe('Hello World');
      });

      it('should get clean text from HTML', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/html`, { method: 'GET' });
          const response = await transport.dispatch(request);

          const cleanText = await response.cleanText();
          expect(cleanText).toContain('Title');
          expect(cleanText).toContain('Content');
          expect(cleanText).not.toContain('<h1>');
          expect(cleanText).not.toContain('<p>');
      });

      it('should get blob response', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/blob`, { method: 'GET' });
          const response = await transport.dispatch(request);

          const blob = await response.blob();
          expect(blob).toBeInstanceOf(Blob);
          expect(blob.size).toBe(5);
      });

      it('should have timings', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/json`, { method: 'GET' });
          const response = await transport.dispatch(request);

          expect(response.timings).toBeDefined();
          expect(response.timings?.total).toBeGreaterThan(0);
      });

      it('should return response metadata', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/json`, { method: 'GET' });
          const response = await transport.dispatch(request);

          expect(response.status).toBe(200);
          expect(response.statusText).toBe('OK');
          expect(response.ok).toBe(true);
          expect(response.url).toContain('/json');
          expect(response.headers).toBeDefined();
      });

      it('should return raw response', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/json`, { method: 'GET' });
          const response = await transport.dispatch(request);

          expect(response.raw).toBeInstanceOf(Response);
      });

      it('should clone response', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/json`, { method: 'GET' });
          const response = await transport.dispatch(request);

          const cloned = response.clone();
          expect(cloned).toBeDefined();
          expect(cloned.status).toBe(200);

          // Both should be readable
          const original = await response.json();
          const clonedJson = await cloned.json();
          expect(original).toEqual({ success: true });
          expect(clonedJson).toEqual({ success: true });
      });

      it('should support async iteration', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/stream`, { method: 'GET' });
          const response = await transport.dispatch(request);

          const chunks: Uint8Array[] = [];
          for await (const chunk of response) {
              chunks.push(chunk);
          }

          expect(chunks.length).toBeGreaterThan(0);
          const combined = new TextDecoder().decode(Buffer.concat(chunks));
          expect(combined).toContain('chunk');
      });

      it('should read stream', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/stream`, { method: 'GET' });
          const response = await transport.dispatch(request);

          const stream = response.read();
          expect(stream).toBeDefined();
          expect(stream).toBeInstanceOf(ReadableStream);
      });

      it('should track download progress', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/stream`, { method: 'GET' });
          const response = await transport.dispatch(request);

          const progressEvents: any[] = [];
          for await (const event of response.download()) {
              progressEvents.push(event);
          }

          expect(progressEvents.length).toBeGreaterThan(0);
          expect(progressEvents[0].direction).toBe('download');
          expect(progressEvents[progressEvents.length - 1].loaded).toBeGreaterThan(0);
      });

      it('should parse SSE events', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/sse`, { method: 'GET' });
          const response = await transport.dispatch(request);

          const events: any[] = [];
          for await (const event of response.sse()) {
              events.push(event);
          }

          expect(events.length).toBeGreaterThan(0);
      });

      it('should handle non-OK responses', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/error`, { method: 'GET' });
          const response = await transport.dispatch(request);

          expect(response.status).toBe(500);
          expect(response.ok).toBe(false);

          const body = await response.json();
          expect(body.error).toBe('Server Error');
      });

      it('should handle empty responses', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/empty`, { method: 'GET' });
          const response = await transport.dispatch(request);

          expect(response.status).toBe(204);
      });
  });

  describe('FetchResponseWrapper', () => {
      it('should have connection property', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/json`, { method: 'GET' });
          const response = await transport.dispatch(request);
          const cloned = response.clone();

          // FetchResponseWrapper has connection but it's empty for fetch
          expect(cloned.connection).toBeDefined();
      });

      it('should cleanText via wrapper', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/html`, { method: 'GET' });
          const response = await transport.dispatch(request);
          const cloned = response.clone();

          const cleanText = await cloned.cleanText();
          expect(cleanText).not.toContain('<');
      });

      it('should handle body-less response in SSE', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/empty`, { method: 'GET' });
          const response = await transport.dispatch(request);
          const cloned = response.clone();

          // Should not throw when body is null
          const events: any[] = [];
          for await (const event of cloned.sse()) {
              events.push(event);
          }
          expect(events).toEqual([]);
      });

      it('should handle body-less response in download', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/empty`, { method: 'GET' });
          const response = await transport.dispatch(request);
          const cloned = response.clone();

          const events: any[] = [];
          for await (const event of cloned.download()) {
              events.push(event);
          }
          expect(events).toEqual([]);
      });

      it('should handle body-less response in async iterator', async () => {
          const transport = new FetchTransport();
          const request = new HttpRequest(`${url}/empty`, { method: 'GET' });
          const response = await transport.dispatch(request);
          const cloned = response.clone();

          const chunks: any[] = [];
          for await (const chunk of cloned) {
              chunks.push(chunk);
          }
          expect(chunks).toEqual([]);
      });
  });
});
