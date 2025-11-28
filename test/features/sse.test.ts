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
});
