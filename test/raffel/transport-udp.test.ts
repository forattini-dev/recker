import { describe, it, expect, afterEach } from 'vitest';
import { createSocket, type Socket as DgramSocket } from 'node:dgram';
import { UdpTransport } from '../../src/raffel/transport-udp.js';
import { TransportCapability, hasCapability } from '../../src/raffel/transport.js';

let server: DgramSocket;
let port: number;
let transport: UdpTransport;

function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = createSocket('udp4');
    server.bind(0, () => {
      port = server.address().port;
      resolve();
    });
  });
}

afterEach(async () => {
  if (transport) transport.close();
  if (server) await new Promise<void>((r) => { try { server.close(() => r()); } catch { r(); } });
});

describe('UdpTransport', () => {
  it('should have CALL and NOTIFY capabilities only', () => {
    transport = new UdpTransport('udp://localhost:9000');
    expect(hasCapability(transport, TransportCapability.CALL)).toBe(true);
    expect(hasCapability(transport, TransportCapability.NOTIFY)).toBe(true);
    expect(hasCapability(transport, TransportCapability.SUBSCRIBE)).toBe(false);
    expect(hasCapability(transport, TransportCapability.PUBLISH)).toBe(false);
    expect(hasCapability(transport, TransportCapability.CANCEL)).toBe(false);
    expect(hasCapability(transport, TransportCapability.STREAM)).toBe(false);
  });

  it('should connect (bind ephemeral port) and emit connected', async () => {
    transport = new UdpTransport('udp://localhost:9000');
    const connected = new Promise<void>((r) => transport.on('connected', r));

    await transport.connect();
    await connected;
    expect(transport.isConnected).toBe(true);
  });

  it('should send JSON datagrams to server', async () => {
    await startServer();

    transport = new UdpTransport(`udp://localhost:${port}`);
    await transport.connect();

    const received = new Promise<any>((resolve) => {
      server.on('message', (msg) => {
        resolve(JSON.parse(msg.toString()));
      });
    });

    transport.send({ id: 'req-1', type: 'request', procedure: 'test', payload: {} });

    const data = await received;
    expect(data).toEqual({ id: 'req-1', type: 'request', procedure: 'test', payload: {} });
  });

  it('should receive and parse JSON datagrams from server', async () => {
    await startServer();

    transport = new UdpTransport(`udp://localhost:${port}`);
    await transport.connect();

    const messages: any[] = [];
    transport.on('message', (data) => messages.push(data));

    // We need to know the transport's bound port to send to it
    // The transport binds to an ephemeral port. We get it from the message response.
    const received = new Promise<{ port: number; address: string }>((resolve) => {
      server.on('message', (_msg, rinfo) => {
        resolve(rinfo);
      });
    });

    // Send something to trigger rinfo capture
    transport.send({ id: 'ping', type: 'request' });
    const rinfo = await received;

    // Server sends response back to transport
    const responseJson = JSON.stringify({ id: 'res-1', type: 'response', payload: { ok: true } });
    server.send(Buffer.from(responseJson), rinfo.port, rinfo.address);

    await new Promise((r) => setTimeout(r, 50));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ id: 'res-1', type: 'response', payload: { ok: true } });
  });

  it('should emit disconnected on close', async () => {
    transport = new UdpTransport('udp://localhost:9000');
    await transport.connect();

    const disconnected = new Promise<void>((r) => transport.on('disconnected', r));
    transport.close();
    await disconnected;
    expect(transport.isConnected).toBe(false);
  });

  it('should reject send when not connected', () => {
    transport = new UdpTransport('udp://localhost:9000');
    expect(() => transport.send({ test: true })).toThrow(/not connected/);
  });

  it('should reject oversized datagrams', async () => {
    await startServer();

    transport = new UdpTransport(`udp://localhost:${port}`);
    await transport.connect();

    const huge = { data: 'x'.repeat(70_000) };
    expect(() => transport.send(huge)).toThrow(/exceeds maximum/);
  });
});
