import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { JsonRpcTransport } from '../../src/raffel/transport-jsonrpc.js';
import { TransportCapability, hasCapability, hasExecute } from '../../src/raffel/transport.js';
import { RaffelError } from '../../src/raffel/types.js';

let server: Server;
let port: number;
let transport: JsonRpcTransport;

function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<void> {
  return new Promise((resolve) => {
    server = createServer(handler);
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
  });
}

afterEach(async () => {
  if (transport) transport.close();
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

describe('JsonRpcTransport', () => {
  it('should have CALL and NOTIFY capabilities only', () => {
    transport = new JsonRpcTransport('http://localhost:3000/rpc');
    expect(hasCapability(transport, TransportCapability.CALL)).toBe(true);
    expect(hasCapability(transport, TransportCapability.NOTIFY)).toBe(true);
    expect(hasCapability(transport, TransportCapability.SUBSCRIBE)).toBe(false);
    expect(hasCapability(transport, TransportCapability.STREAM)).toBe(false);
  });

  it('should be an executable transport', () => {
    transport = new JsonRpcTransport('http://localhost:3000/rpc');
    expect(hasExecute(transport)).toBe(true);
  });

  describe('execute() - call', () => {
    it('should send JSON-RPC 2.0 request and return result', async () => {
      let receivedBody: any;

      await startServer(async (req, res) => {
        receivedBody = JSON.parse(await readBody(req));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          result: { players: 42 },
          id: receivedBody.id,
        }));
      });

      transport = new JsonRpcTransport(`http://localhost:${port}/rpc`);
      await transport.connect();

      const result = await transport.execute({
        id: 'req-1',
        procedure: 'game.status',
        type: 'request',
        payload: { map: 'forest' },
      });

      expect(receivedBody.jsonrpc).toBe('2.0');
      expect(receivedBody.method).toBe('game.status');
      expect(receivedBody.params).toEqual({ map: 'forest' });
      expect(receivedBody.id).toBeDefined();
      expect(result).toEqual({ players: 42 });
    });

    it('should throw RaffelError on JSON-RPC error response', async () => {
      await startServer(async (req, res) => {
        const body = JSON.parse(await readBody(req));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Method not found' },
          id: body.id,
        }));
      });

      transport = new JsonRpcTransport(`http://localhost:${port}/rpc`);
      await transport.connect();

      await expect(
        transport.execute({
          id: 'req-1',
          procedure: 'unknown.method',
          type: 'request',
          payload: {},
        })
      ).rejects.toThrow(RaffelError);

      try {
        await transport.execute({
          id: 'req-2',
          procedure: 'unknown.method',
          type: 'request',
          payload: {},
        });
      } catch (err: any) {
        expect(err.code).toBe('NOT_FOUND');
        expect(err.status).toBe(404);
      }
    });
  });

  describe('execute() - notification', () => {
    it('should send JSON-RPC notification (no id field)', async () => {
      let receivedBody: any;

      await startServer(async (req, res) => {
        receivedBody = JSON.parse(await readBody(req));
        res.writeHead(200);
        res.end();
      });

      transport = new JsonRpcTransport(`http://localhost:${port}/rpc`);
      await transport.connect();

      await transport.execute({
        id: 'req-1',
        procedure: 'log.event',
        type: 'notify',
        payload: { message: 'hello' },
      });

      expect(receivedBody.jsonrpc).toBe('2.0');
      expect(receivedBody.method).toBe('log.event');
      expect(receivedBody.params).toEqual({ message: 'hello' });
      expect(receivedBody.id).toBeUndefined();
    });
  });

  describe('path handling', () => {
    it('should post to configured rpc path', async () => {
      let receivedUrl = '';

      await startServer(async (req, res) => {
        receivedUrl = req.url!;
        const body = JSON.parse(await readBody(req));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', result: 'ok', id: body.id }));
      });

      transport = new JsonRpcTransport(`http://localhost:${port}/rpc`);
      await transport.connect();

      await transport.execute({
        id: 'req-1',
        procedure: 'test',
        type: 'request',
        payload: {},
      });

      expect(receivedUrl).toBe('/rpc');
    });
  });
});
