import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '../../src/index.js';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';

describe('SSE Helper', () => {
  let mockAgent: MockAgent;
  let originalDispatcher: any;
  const baseUrl = 'https://api.example.com';

  beforeAll(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterAll(() => {
    setGlobalDispatcher(originalDispatcher);
    mockAgent.close();
  });

  it('should parse simple SSE stream', async () => {
    // Use network enable hack for Node HTTP stream simulation or async generator
    mockAgent.enableNetConnect();
    const { createServer } = await import('node:http');
    const { once } = await import('node:events');
    
    const server = createServer(async (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: hello\n\n');
      await new Promise(r => setTimeout(r, 10));
      res.write('data: world\n\n');
      res.end();
    });

    server.listen(0);
    await once(server, 'listening');
    const port = (server.address() as any).port;
    const url = `http://localhost:${port}`;

    const client = createClient({ baseUrl: url });
    
    const events = [];
    for await (const event of client.get('/').sse()) {
        events.push(event);
    }

    expect(events).toEqual([
        { data: 'hello' },
        { data: 'world' }
    ]);

    server.close();
    mockAgent.disableNetConnect();
  });

  it('should parse SSE with id and event', async () => {
    mockAgent.enableNetConnect();
    const { createServer } = await import('node:http');
    const { once } = await import('node:events');
    
    const server = createServer(async (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`id: 1\nevent: update\ndata: {"v":1}\n\n`);
      res.end();
    });

    server.listen(0);
    await once(server, 'listening');
    const port = (server.address() as any).port;
    const url = `http://localhost:${port}`;

    const client = createClient({ baseUrl: url });
    
    const events = [];
    for await (const event of client.get('/').sse()) {
        events.push(event);
    }

    expect(events).toEqual([
        { id: '1', event: 'update', data: '{"v":1}' }
    ]);

    server.close();
    mockAgent.disableNetConnect();
  });

  it('should parse SSE with retry field', async () => {
    mockAgent.enableNetConnect();
    const { createServer } = await import('node:http');
    const { once } = await import('node:events');

    const server = createServer(async (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`retry: 3000\ndata: reconnect info\n\n`);
      res.end();
    });

    server.listen(0);
    await once(server, 'listening');
    const port = (server.address() as any).port;
    const url = `http://localhost:${port}`;

    const client = createClient({ baseUrl: url });

    const events = [];
    for await (const event of client.get('/').sse()) {
        events.push(event);
    }

    expect(events).toEqual([
        { retry: 3000, data: 'reconnect info' }
    ]);

    server.close();
    mockAgent.disableNetConnect();
  });

  it('should handle invalid retry field gracefully', async () => {
    mockAgent.enableNetConnect();
    const { createServer } = await import('node:http');
    const { once } = await import('node:events');

    const server = createServer(async (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`retry: invalid\ndata: test\n\n`);
      res.end();
    });

    server.listen(0);
    await once(server, 'listening');
    const port = (server.address() as any).port;
    const url = `http://localhost:${port}`;

    const client = createClient({ baseUrl: url });

    const events = [];
    for await (const event of client.get('/').sse()) {
        events.push(event);
    }

    // retry should be undefined for invalid value
    expect(events).toEqual([
        { data: 'test' }
    ]);

    server.close();
    mockAgent.disableNetConnect();
  });

  it('should throw error for response without body', async () => {
    const { parseSSE } = await import('../../src/utils/sse.js');

    // Create a mock response without body
    const mockResponse = {
      body: null
    } as Response;

    const generator = parseSSE(mockResponse);
    await expect(generator.next()).rejects.toThrow('Response body is empty');
  });

  it('should handle field with no colon', async () => {
    mockAgent.enableNetConnect();
    const { createServer } = await import('node:http');
    const { once } = await import('node:events');

    const server = createServer(async (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // :comment line (starts with colon, no field name)
      res.write(`:this is a comment\ndata: actual data\n\n`);
      res.end();
    });

    server.listen(0);
    await once(server, 'listening');
    const port = (server.address() as any).port;
    const url = `http://localhost:${port}`;

    const client = createClient({ baseUrl: url });

    const events = [];
    for await (const event of client.get('/').sse()) {
        events.push(event);
    }

    expect(events).toEqual([
        { data: 'actual data' }
    ]);

    server.close();
    mockAgent.disableNetConnect();
  });

  it('should handle multiline data', async () => {
    mockAgent.enableNetConnect();
    const { createServer } = await import('node:http');
    const { once } = await import('node:events');

    const server = createServer(async (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: line1\ndata: line2\ndata: line3\n\n`);
      res.end();
    });

    server.listen(0);
    await once(server, 'listening');
    const port = (server.address() as any).port;
    const url = `http://localhost:${port}`;

    const client = createClient({ baseUrl: url });

    const events = [];
    for await (const event of client.get('/').sse()) {
        events.push(event);
    }

    expect(events).toEqual([
        { data: 'line1\nline2\nline3' }
    ]);

    server.close();
    mockAgent.disableNetConnect();
  });
});
