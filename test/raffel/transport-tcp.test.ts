import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { TcpTransport } from '../../src/raffel/transport-tcp.js';
import { TransportCapability, hasCapability } from '../../src/raffel/transport.js';

let server: Server;
let port: number;
let transport: TcpTransport;
let serverConnections: Socket[] = [];

function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = createServer((socket) => {
      serverConnections.push(socket);
    });
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
}

/** Send a length-prefixed JSON frame to a socket */
function sendFrame(socket: Socket, data: unknown): void {
  const json = JSON.stringify(data);
  const payload = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  socket.write(Buffer.concat([header, payload]));
}

/** Parse sent frames from buffer chunks */
function parseFrames(data: Buffer): any[] {
  const frames: any[] = [];
  let offset = 0;
  while (offset + 4 <= data.length) {
    const len = data.readUInt32BE(offset);
    if (offset + 4 + len > data.length) break;
    const json = data.subarray(offset + 4, offset + 4 + len).toString('utf8');
    frames.push(JSON.parse(json));
    offset += 4 + len;
  }
  return frames;
}

afterEach(async () => {
  if (transport) transport.close();
  for (const conn of serverConnections) conn.destroy();
  serverConnections = [];
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

describe('TcpTransport', () => {
  it('should have all capabilities', () => {
    transport = new TcpTransport('tcp://localhost:9000', { reconnect: false });
    expect(hasCapability(transport, TransportCapability.CALL)).toBe(true);
    expect(hasCapability(transport, TransportCapability.NOTIFY)).toBe(true);
    expect(hasCapability(transport, TransportCapability.SUBSCRIBE)).toBe(true);
    expect(hasCapability(transport, TransportCapability.PUBLISH)).toBe(true);
    expect(hasCapability(transport, TransportCapability.CANCEL)).toBe(true);
    expect(hasCapability(transport, TransportCapability.STREAM)).toBe(true);
  });

  it('should connect to TCP server and emit connected', async () => {
    await startServer();

    transport = new TcpTransport(`tcp://localhost:${port}`, { reconnect: false });
    const connected = new Promise<void>((r) => transport.on('connected', r));

    await transport.connect();
    await connected;
    expect(transport.isConnected).toBe(true);
  });

  it('should send length-prefixed JSON frames', async () => {
    await startServer();

    transport = new TcpTransport(`tcp://localhost:${port}`, { reconnect: false });
    await transport.connect();
    await new Promise((r) => setTimeout(r, 20));

    transport.send({ id: 'req-1', type: 'request', procedure: 'test', payload: {} });

    // Wait for data to arrive at server
    await new Promise((r) => setTimeout(r, 50));

    const conn = serverConnections[0];
    const received: any[] = [];

    // Set up to collect frames
    return new Promise<void>((resolve) => {
      // Data may already be buffered, let's read what's available
      conn.once('readable', () => {
        const data = conn.read();
        if (data) {
          const frames = parseFrames(data);
          expect(frames).toHaveLength(1);
          expect(frames[0]).toEqual({ id: 'req-1', type: 'request', procedure: 'test', payload: {} });
        }
        resolve();
      });

      // Trigger readable if data is already there
      const existing = conn.read();
      if (existing) {
        const frames = parseFrames(existing);
        expect(frames).toHaveLength(1);
        expect(frames[0]).toEqual({ id: 'req-1', type: 'request', procedure: 'test', payload: {} });
        resolve();
      }
    });
  });

  it('should receive and parse length-prefixed frames from server', async () => {
    await startServer();

    transport = new TcpTransport(`tcp://localhost:${port}`, { reconnect: false });
    await transport.connect();
    await new Promise((r) => setTimeout(r, 20));

    const messages: any[] = [];
    transport.on('message', (data) => messages.push(data));

    // Server sends a frame
    const conn = serverConnections[0];
    sendFrame(conn, { id: 'res-1', type: 'response', payload: { result: 'ok' } });

    await new Promise((r) => setTimeout(r, 50));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ id: 'res-1', type: 'response', payload: { result: 'ok' } });
  });

  it('should handle multiple frames in a single chunk', async () => {
    await startServer();

    transport = new TcpTransport(`tcp://localhost:${port}`, { reconnect: false });
    await transport.connect();
    await new Promise((r) => setTimeout(r, 20));

    const messages: any[] = [];
    transport.on('message', (data) => messages.push(data));

    const conn = serverConnections[0];

    // Send two frames at once
    const json1 = JSON.stringify({ id: '1', type: 'response', payload: 'a' });
    const json2 = JSON.stringify({ id: '2', type: 'response', payload: 'b' });
    const buf1 = Buffer.from(json1, 'utf8');
    const buf2 = Buffer.from(json2, 'utf8');
    const header1 = Buffer.alloc(4);
    header1.writeUInt32BE(buf1.length, 0);
    const header2 = Buffer.alloc(4);
    header2.writeUInt32BE(buf2.length, 0);

    conn.write(Buffer.concat([header1, buf1, header2, buf2]));

    await new Promise((r) => setTimeout(r, 50));
    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe('1');
    expect(messages[1].id).toBe('2');
  });

  it('should emit disconnected on close', async () => {
    await startServer();

    transport = new TcpTransport(`tcp://localhost:${port}`, { reconnect: false });
    await transport.connect();
    await new Promise((r) => setTimeout(r, 20));

    const disconnected = new Promise<void>((r) => transport.on('disconnected', r));

    transport.close();
    await disconnected;
    expect(transport.isConnected).toBe(false);
  });

  it('should reject send when not connected', () => {
    transport = new TcpTransport('tcp://localhost:9999', { reconnect: false });
    expect(() => transport.send({ test: true })).toThrow(/not connected/);
  });
});
