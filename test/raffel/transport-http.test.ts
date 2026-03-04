import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { HttpTransport } from '../../src/raffel/transport-http.js';
import { TransportCapability, hasCapability, hasExecute } from '../../src/raffel/transport.js';
import { RaffelError } from '../../src/raffel/types.js';

let server: Server;
let port: number;
let transport: HttpTransport;

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

describe('HttpTransport', () => {
  it('should have CALL, NOTIFY, STREAM capabilities', () => {
    transport = new HttpTransport('http://localhost:3000');
    expect(hasCapability(transport, TransportCapability.CALL)).toBe(true);
    expect(hasCapability(transport, TransportCapability.NOTIFY)).toBe(true);
    expect(hasCapability(transport, TransportCapability.STREAM)).toBe(true);
    expect(hasCapability(transport, TransportCapability.SUBSCRIBE)).toBe(false);
    expect(hasCapability(transport, TransportCapability.PUBLISH)).toBe(false);
    expect(hasCapability(transport, TransportCapability.CANCEL)).toBe(false);
  });

  it('should be an executable transport', () => {
    transport = new HttpTransport('http://localhost:3000');
    expect(hasExecute(transport)).toBe(true);
  });

  describe('execute() - call', () => {
    it('should POST to /{procedure} and return result', async () => {
      let receivedUrl = '';
      let receivedBody = '';

      await startServer(async (req, res) => {
        receivedUrl = req.url!;
        receivedBody = await readBody(req);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ players: 42 }));
      });

      transport = new HttpTransport(`http://localhost:${port}`);
      await transport.connect();

      const result = await transport.execute({
        id: 'req-1',
        procedure: 'game.status',
        type: 'request',
        payload: { map: 'forest' },
        metadata: {},
      });

      expect(receivedUrl).toBe('/game.status');
      expect(JSON.parse(receivedBody)).toEqual({ map: 'forest' });
      expect(result).toEqual({ players: 42 });
    });

    it('should throw RaffelError on error response', async () => {
      await startServer(async (req, res) => {
        await readBody(req);
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          error: { code: 'FORBIDDEN', status: 403, message: 'Not allowed' },
        }));
      });

      transport = new HttpTransport(`http://localhost:${port}`);
      await transport.connect();

      await expect(
        transport.execute({
          id: 'req-1',
          procedure: 'admin.action',
          type: 'request',
          payload: {},
        })
      ).rejects.toThrow(RaffelError);
    });
  });

  describe('execute() - notify', () => {
    it('should POST to /events/{procedure}', async () => {
      let receivedUrl = '';

      await startServer(async (req, res) => {
        receivedUrl = req.url!;
        await readBody(req);
        res.writeHead(202);
        res.end();
      });

      transport = new HttpTransport(`http://localhost:${port}`);
      await transport.connect();

      await transport.execute({
        id: 'req-1',
        procedure: 'game.ping',
        type: 'notify',
        payload: { ts: 123 },
      });

      expect(receivedUrl).toBe('/events/game.ping');
    });
  });

  describe('executeStream() - SSE', () => {
    it('should parse SSE stream and yield data events', async () => {
      await startServer(async (req, res) => {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
        });

        res.write('event: data\ndata: {"n":1}\n\n');
        res.write('event: data\ndata: {"n":2}\n\n');
        res.write('event: data\ndata: {"n":3}\n\n');
        res.write('event: end\ndata: {}\n\n');
        res.end();
      });

      transport = new HttpTransport(`http://localhost:${port}`);
      await transport.connect();

      const results: any[] = [];
      for await (const item of transport.executeStream!({
        id: 'req-1',
        procedure: 'counter.watch',
        type: 'stream:start',
        payload: {},
      })) {
        results.push(item);
      }

      expect(results).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    });

    it('should throw on SSE error event', async () => {
      await startServer(async (req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('event: data\ndata: {"n":1}\n\n');
        res.write('event: error\ndata: {"code":"INTERNAL_ERROR","message":"boom","status":500}\n\n');
        res.end();
      });

      transport = new HttpTransport(`http://localhost:${port}`);
      await transport.connect();

      const results: any[] = [];
      await expect(async () => {
        for await (const item of transport.executeStream!({
          id: 'req-1',
          procedure: 'broken.stream',
          type: 'stream:start',
          payload: {},
        })) {
          results.push(item);
        }
      }).rejects.toThrow(RaffelError);

      expect(results).toEqual([{ n: 1 }]);
    });
  });

  describe('connection state', () => {
    it('should track connected state', async () => {
      transport = new HttpTransport('http://localhost:3000');
      expect(transport.isConnected).toBe(false);

      await transport.connect();
      expect(transport.isConnected).toBe(true);

      transport.close();
      expect(transport.isConnected).toBe(false);
    });

    it('should emit connected/disconnected events', async () => {
      transport = new HttpTransport('http://localhost:3000');

      const events: string[] = [];
      transport.on('connected', () => events.push('connected'));
      transport.on('disconnected', () => events.push('disconnected'));

      await transport.connect();
      transport.close();

      expect(events).toEqual(['connected', 'disconnected']);
    });
  });
});
