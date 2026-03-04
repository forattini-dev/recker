import { describe, it, expect, afterEach, vi } from 'vitest';
import { createServer as createHttpServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createTcpServer, type Server as TcpServer, type Socket } from 'node:net';
import { createSocket, type Socket as DgramSocket } from 'node:dgram';
import { MockWebSocket } from '../helpers/mock-websocket.js';

// Mock undici WebSocket while preserving real HTTP functionality
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal() as any;
  const { MockWebSocket } = await import('../helpers/mock-websocket.js');
  return { ...actual, WebSocket: MockWebSocket };
});

import { RaffelClient, createRaffelClient } from '../../src/raffel/client.js';
import { RaffelError } from '../../src/raffel/types.js';
import { detectTransportType } from '../../src/raffel/transport-factory.js';
import { TransportCapability, hasCapability } from '../../src/raffel/transport.js';

// ============================================================================
// URL detection
// ============================================================================

describe('detectTransportType', () => {
  it('should detect websocket from ws:// and wss://', () => {
    expect(detectTransportType('ws://localhost:9999')).toBe('websocket');
    expect(detectTransportType('wss://api.example.com')).toBe('websocket');
  });

  it('should detect http from http:// and https://', () => {
    expect(detectTransportType('http://localhost:3000')).toBe('http');
    expect(detectTransportType('https://api.example.com')).toBe('http');
  });

  it('should detect jsonrpc from http URL with /rpc path', () => {
    expect(detectTransportType('http://localhost:3000/rpc')).toBe('jsonrpc');
    expect(detectTransportType('https://api.example.com/api/rpc')).toBe('jsonrpc');
  });

  it('should detect tcp from tcp://', () => {
    expect(detectTransportType('tcp://localhost:9000')).toBe('tcp');
  });

  it('should detect udp from udp://', () => {
    expect(detectTransportType('udp://localhost:9000')).toBe('udp');
  });

  it('should respect explicit transport option', () => {
    expect(detectTransportType('http://localhost:3000', { transport: 'websocket' })).toBe('websocket');
    expect(detectTransportType('ws://localhost:9999', { transport: 'http' })).toBe('http');
  });
});

// ============================================================================
// Integration: RaffelClient with WebSocket
// ============================================================================

describe('RaffelClient + WebSocket', () => {
  let client: RaffelClient;

  afterEach(() => {
    if (client) client.close();
  });

  it('should call and receive response over WS', async () => {
    client = createRaffelClient('ws://localhost:9999');
    await client.connect();
    await new Promise((r) => setTimeout(r, 20));

    const callPromise = client.call('test.echo', { msg: 'hello' });

    // Get mock ws and simulate response
    const mockWs = (client.rawWs as any).ws as MockWebSocket;
    const sent = JSON.parse(mockWs.getSentMessages().slice(-1)[0]);
    mockWs.receive(JSON.stringify({
      id: `${sent.id}:response`,
      procedure: 'test.echo',
      type: 'response',
      payload: { echo: 'hello' },
    }));

    const result = await callPromise;
    expect(result).toEqual({ echo: 'hello' });
  });

  it('should have rawWs for WS transport', async () => {
    client = createRaffelClient('ws://localhost:9999');
    await client.connect();
    expect(client.rawWs).not.toBeNull();
  });
});

// ============================================================================
// Integration: RaffelClient with HTTP
// ============================================================================

describe('RaffelClient + HTTP', () => {
  let server: HttpServer;
  let port: number;
  let client: RaffelClient;

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((r) => { let d = ''; req.on('data', (c: Buffer) => { d += c; }); req.on('end', () => r(d)); });
  }

  afterEach(async () => {
    if (client) client.close();
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  it('should call over HTTP', async () => {
    await new Promise<void>((resolve) => {
      server = createHttpServer(async (req, res) => {
        const body = JSON.parse(await readBody(req));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ echo: body }));
      });
      server.listen(0, () => { port = (server.address() as any).port; resolve(); });
    });

    client = createRaffelClient(`http://localhost:${port}`);
    await client.connect();

    const result = await client.call('test.echo', { msg: 'hello' });
    expect(result).toEqual({ echo: { msg: 'hello' } });
  });

  it('should have null rawWs for HTTP transport', async () => {
    await new Promise<void>((resolve) => {
      server = createHttpServer((_, res) => { res.end('{}'); });
      server.listen(0, () => { port = (server.address() as any).port; resolve(); });
    });

    client = createRaffelClient(`http://localhost:${port}`);
    await client.connect();
    expect(client.rawWs).toBeNull();
  });

  it('should throw UnsupportedError for subscribe over HTTP', async () => {
    await new Promise<void>((resolve) => {
      server = createHttpServer((_, res) => { res.end('{}'); });
      server.listen(0, () => { port = (server.address() as any).port; resolve(); });
    });

    client = createRaffelClient(`http://localhost:${port}`);
    await client.connect();

    expect(() => client.subscribe('channel')).toThrow(/not supported/);
  });

  it('should throw UnsupportedError for publish over HTTP', async () => {
    await new Promise<void>((resolve) => {
      server = createHttpServer((_, res) => { res.end('{}'); });
      server.listen(0, () => { port = (server.address() as any).port; resolve(); });
    });

    client = createRaffelClient(`http://localhost:${port}`);
    await client.connect();

    expect(() => client.publish('channel', 'event')).toThrow(/not supported/);
  });
});

// ============================================================================
// Integration: RaffelClient with TCP
// ============================================================================

describe('RaffelClient + TCP', () => {
  let server: TcpServer;
  let port: number;
  let client: RaffelClient;
  let connections: Socket[] = [];

  function sendFrame(socket: Socket, data: unknown): void {
    const json = JSON.stringify(data);
    const payload = Buffer.from(json, 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);
    socket.write(Buffer.concat([header, payload]));
  }

  afterEach(async () => {
    if (client) client.close();
    for (const c of connections) c.destroy();
    connections = [];
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  it('should call over TCP with length-prefixed framing', async () => {
    await new Promise<void>((resolve) => {
      server = createTcpServer((socket) => {
        connections.push(socket);
        let buf = Buffer.alloc(0);
        socket.on('data', (chunk: Buffer) => {
          buf = Buffer.concat([buf, chunk]);
          while (buf.length >= 4) {
            const len = buf.readUInt32BE(0);
            if (buf.length < 4 + len) break;
            const json = buf.subarray(4, 4 + len).toString('utf8');
            buf = buf.subarray(4 + len);
            const msg = JSON.parse(json);
            // Echo response
            sendFrame(socket, {
              id: `${msg.id}:response`,
              procedure: msg.procedure,
              type: 'response',
              payload: { echo: msg.payload },
            });
          }
        });
      });
      server.listen(0, () => { port = (server.address() as any).port; resolve(); });
    });

    client = createRaffelClient(`tcp://localhost:${port}`, { tcp: { reconnect: false } });
    await client.connect();

    const result = await client.call('test.echo', { msg: 'hello' });
    expect(result).toEqual({ echo: { msg: 'hello' } });
  });
});

// ============================================================================
// Integration: RaffelClient with UDP
// ============================================================================

describe('RaffelClient + UDP', () => {
  let server: DgramSocket;
  let port: number;
  let client: RaffelClient;

  afterEach(async () => {
    if (client) client.close();
    if (server) await new Promise<void>((r) => { try { server.close(() => r()); } catch { r(); } });
  });

  it('should call over UDP with raw JSON datagrams', async () => {
    await new Promise<void>((resolve) => {
      server = createSocket('udp4');
      server.on('message', (msg, rinfo) => {
        const data = JSON.parse(msg.toString());
        const response = JSON.stringify({
          id: `${data.id}:response`,
          procedure: data.procedure,
          type: 'response',
          payload: { echo: data.payload },
        });
        server.send(Buffer.from(response), rinfo.port, rinfo.address);
      });
      server.bind(0, () => { port = server.address().port; resolve(); });
    });

    client = createRaffelClient(`udp://localhost:${port}`);
    await client.connect();

    const result = await client.call('test.echo', { msg: 'hello' });
    expect(result).toEqual({ echo: { msg: 'hello' } });
  });
});

// ============================================================================
// Integration: RaffelClient with JSON-RPC
// ============================================================================

describe('RaffelClient + JSON-RPC', () => {
  let server: HttpServer;
  let port: number;
  let client: RaffelClient;

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((r) => { let d = ''; req.on('data', (c: Buffer) => { d += c; }); req.on('end', () => r(d)); });
  }

  afterEach(async () => {
    if (client) client.close();
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  it('should call over JSON-RPC 2.0', async () => {
    await new Promise<void>((resolve) => {
      server = createHttpServer(async (req, res) => {
        const body = JSON.parse(await readBody(req));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          result: { echo: body.params },
          id: body.id,
        }));
      });
      server.listen(0, () => { port = (server.address() as any).port; resolve(); });
    });

    client = createRaffelClient(`http://localhost:${port}/rpc`);
    await client.connect();

    const result = await client.call('test.echo', { msg: 'hello' });
    expect(result).toEqual({ echo: { msg: 'hello' } });
  });

  it('should throw UnsupportedError for subscribe over JSON-RPC', async () => {
    await new Promise<void>((resolve) => {
      server = createHttpServer((_, res) => { res.end('{}'); });
      server.listen(0, () => { port = (server.address() as any).port; resolve(); });
    });

    client = createRaffelClient(`http://localhost:${port}/rpc`);
    await client.connect();

    expect(() => client.subscribe('channel')).toThrow(/not supported/);
  });
});
