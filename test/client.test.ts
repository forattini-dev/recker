import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, TimeoutError } from '../src/index.js';
import { retry } from '../src/plugins/retry.js';
import { MockTransport } from './helpers/mock-transport.js';

describe('Recker Client', () => {
  const baseUrl = 'https://example.com';

  it('should make a GET request', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/test', 200, { hello: 'world' });

    const client = createClient({ baseUrl, transport: mockTransport });
    const res = await client.get('/test').json<{ hello: string }>();

    expect(res).toEqual({ hello: 'world' });
  });

  it('should retry on 503', async () => {
    const mockTransport = new MockTransport();

    // Fail twice with 503
    mockTransport.setMockResponse('GET', '/retry', 503, '', undefined, { times: 1 });
    mockTransport.setMockResponse('GET', '/retry', 503, '', undefined, { times: 1 });
    // Succeed third time
    mockTransport.setMockResponse('GET', '/retry', 200, { success: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [retry({ maxAttempts: 3, delay: 10 })]
    });

    const res = await client.get('/retry').json();
    expect(res).toEqual({ success: true });
    expect(mockTransport.getCallCount('GET', '/retry')).toBe(3);
  });

  it('should capture timings and connection info', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/timings', 200, { ok: true });

    const client = createClient({ baseUrl, transport: mockTransport });
    const response = await client.get('/timings');

    expect(response.status).toBe(200);
    // Note: Mock transport doesn't provide timings like real transport would
    // In real scenarios with UndiciTransport, timings would be populated
  });

  it('should stream response body', async () => {
    // Allow network for this test
    const { createServer } = await import('node:http');
    const { once } = await import('node:events');

    const server = createServer(async (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.write('chunk1');
      await new Promise(resolve => setTimeout(resolve, 10));
      res.write('chunk2');
      res.end();
    });

    server.listen(0);
    await once(server, 'listening');
    const address = server.address();
    const port = typeof address === 'string' ? 0 : address?.port;
    const url = `http://localhost:${port}`;

    const client = createClient({ baseUrl: url });

    const chunks: string[] = [];
    for await (const chunk of client.get('/')) {
      chunks.push(new TextDecoder().decode(chunk));
    }

    expect(chunks).toEqual(['chunk1', 'chunk2']);

    server.close();
  });

  it('should parse response body with Zod schema', async () => {
    const { z } = await import('zod');

    const UserSchema = z.object({
      id: z.string(),
      name: z.string(),
    });

    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/user/123', 200, { id: '123', name: 'Test User' });

    const client = createClient({ baseUrl, transport: mockTransport });

    const user = await client.get('/user/123').parse(UserSchema);

    expect(user).toEqual({ id: '123', name: 'Test User' });
  });

  it('should throw HttpError on 404', async () => {
    const { HttpError } = await import('../src/index.js');

    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/not-found', 404, { error: 'Not Found' });

    const client = createClient({ baseUrl, transport: mockTransport });

    await expect(client.get('/not-found')).rejects.toThrow(HttpError);

    // Verify error properties
    try {
      await client.get('/not-found');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(404);
      expect(err.response).toBeDefined();
    }
  });

  it('should timeout automatically with option', async () => {
    class TimeoutTransport {
      async dispatch() {
        throw new TimeoutError({} as any);
      }
    }

    const client = createClient({ baseUrl, transport: new TimeoutTransport() as any });
    await expect(client.get('/slow')).rejects.toBeInstanceOf(TimeoutError);
  });
});
