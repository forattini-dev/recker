/**
 * UDP Transport Tests
 *
 * Tests for the UDP transport implementation including:
 * - Basic send/receive
 * - Timeout handling
 * - Retransmission
 * - Broadcast
 * - Multicast
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import dgram from 'node:dgram';
import { UDPClient, udp, createUDP } from '../../src/transport/udp.js';
import { UDPResponseWrapper, StreamingUDPResponse } from '../../src/transport/udp-response.js';

describe('UDPTransport', () => {
  let server: dgram.Socket;
  let serverPort: number;

  beforeEach(async () => {
    // Create a UDP echo server for testing
    server = dgram.createSocket('udp4');

    await new Promise<void>((resolve) => {
      server.on('message', (msg, rinfo) => {
        // Echo the message back
        server.send(msg, rinfo.port, rinfo.address);
      });

      server.bind(0, '127.0.0.1', () => {
        const address = server.address();
        serverPort = typeof address === 'string' ? 0 : address.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Basic Operations', () => {
    it('should send and receive UDP packet', async () => {
      const transport = new UDPClient(`udp://127.0.0.1:${serverPort}`);

      try {
        const response = await transport.dispatch({
          url: '/test',
          method: 'GET',
          headers: new Headers(),
          body: 'Hello UDP',
          withHeader: () => ({} as any),
          withBody: () => ({} as any),
        });

        const text = await response.text();
        expect(text).toBe('Hello UDP');
        expect(response.status).toBe(200);
        expect(response.ok).toBe(true);
      } finally {
        await transport.close();
      }
    });

    it('should handle Buffer body', async () => {
      const transport = new UDPClient(`udp://127.0.0.1:${serverPort}`);

      try {
        const response = await transport.dispatch({
          url: '/test',
          method: 'GET',
          headers: new Headers(),
          body: Buffer.from([0x01, 0x02, 0x03]),
          withHeader: () => ({} as any),
          withBody: () => ({} as any),
        });

        const buffer = await response.buffer();
        expect(buffer).toEqual(Buffer.from([0x01, 0x02, 0x03]));
      } finally {
        await transport.close();
      }
    });

    it('should handle JSON body', async () => {
      const transport = new UDPClient(`udp://127.0.0.1:${serverPort}`);

      try {
        const response = await transport.dispatch({
          url: '/test',
          method: 'POST',
          headers: new Headers(),
          body: JSON.stringify({ hello: 'world' }),
          withHeader: () => ({} as any),
          withBody: () => ({} as any),
        });

        const json = await response.json();
        expect(json).toEqual({ hello: 'world' });
      } finally {
        await transport.close();
      }
    });

    it('should send path as body for GET without body', async () => {
      const transport = new UDPClient(`udp://127.0.0.1:${serverPort}`);

      try {
        const response = await transport.dispatch({
          url: '/status',
          method: 'GET',
          headers: new Headers(),
          body: null,
          withHeader: () => ({} as any),
          withBody: () => ({} as any),
        });

        const text = await response.text();
        expect(text).toBe('/status');
      } finally {
        await transport.close();
      }
    });
  });

  describe('Timings and Connection', () => {
    it('should collect timing information', async () => {
      const transport = new UDPClient(`udp://127.0.0.1:${serverPort}`, {
        observability: true,
      });

      try {
        const response = await transport.dispatch({
          url: '/test',
          method: 'GET',
          headers: new Headers(),
          body: 'ping',
          withHeader: () => ({} as any),
          withBody: () => ({} as any),
        });

        expect(response.timings).toBeDefined();
        expect(response.timings.total).toBeGreaterThanOrEqual(0);
        expect(response.timings.retransmissions).toBe(0);
      } finally {
        await transport.close();
      }
    });

    it('should collect connection information', async () => {
      const transport = new UDPClient(`udp://127.0.0.1:${serverPort}`, {
        observability: true,
      });

      try {
        const response = await transport.dispatch({
          url: '/test',
          method: 'GET',
          headers: new Headers(),
          body: 'ping',
          withHeader: () => ({} as any),
          withBody: () => ({} as any),
        });

        expect(response.connection).toBeDefined();
        expect(response.connection.protocol).toBe('udp');
        expect(response.connection.remoteAddress).toBe('127.0.0.1');
        expect(response.connection.remotePort).toBe(serverPort);
      } finally {
        await transport.close();
      }
    });

    it('should skip observability when disabled', async () => {
      const transport = new UDPClient(`udp://127.0.0.1:${serverPort}`, {
        observability: false,
      });

      try {
        const response = await transport.dispatch({
          url: '/test',
          method: 'GET',
          headers: new Headers(),
          body: 'ping',
          withHeader: () => ({} as any),
          withBody: () => ({} as any),
        });

        expect(response.timings.total).toBe(0);
      } finally {
        await transport.close();
      }
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout when no response received', async () => {
      // Create a server that doesn't respond
      const silentServer = dgram.createSocket('udp4');
      await new Promise<void>((resolve) => {
        silentServer.bind(0, '127.0.0.1', () => resolve());
      });
      const silentPort = (silentServer.address() as dgram.AddressInfo).port;

      const transport = new UDPClient(`udp://127.0.0.1:${silentPort}`, {
        timeout: 100,
        retransmissions: 0,
      });

      try {
        await expect(
          transport.dispatch({
            url: '/test',
            method: 'GET',
            headers: new Headers(),
            body: 'ping',
            withHeader: () => ({} as any),
            withBody: () => ({} as any),
          })
        ).rejects.toThrow(/timed out/i);
      } finally {
        await transport.close();
        silentServer.close();
      }
    });

    it('should retry on timeout', async () => {
      // Create a server that responds after a delay (second attempt)
      let attempts = 0;
      const delayServer = dgram.createSocket('udp4');
      delayServer.on('message', (msg, rinfo) => {
        attempts++;
        if (attempts >= 2) {
          // Only respond on second attempt
          delayServer.send(msg, rinfo.port, rinfo.address);
        }
      });

      await new Promise<void>((resolve) => {
        delayServer.bind(0, '127.0.0.1', () => resolve());
      });
      const delayPort = (delayServer.address() as dgram.AddressInfo).port;

      const transport = new UDPClient(`udp://127.0.0.1:${delayPort}`, {
        timeout: 100,
        retransmissions: 2,
      });

      try {
        const response = await transport.dispatch({
          url: '/test',
          method: 'GET',
          headers: new Headers(),
          body: 'ping',
          withHeader: () => ({} as any),
          withBody: () => ({} as any),
        });

        // Server received 2 attempts - we got response on second attempt
        expect(attempts).toBe(2);
        expect(await response.text()).toBe('ping');
      } finally {
        await transport.close();
        delayServer.close();
      }
    });
  });

  describe('Fire and Forget', () => {
    it('should send without waiting for response', async () => {
      let received = false;
      const listener = dgram.createSocket('udp4');
      listener.on('message', () => {
        received = true;
      });

      await new Promise<void>((resolve) => {
        listener.bind(0, '127.0.0.1', () => resolve());
      });
      const listenerPort = (listener.address() as dgram.AddressInfo).port;

      const transport = new UDPClient('');

      try {
        await transport.send('127.0.0.1', listenerPort, Buffer.from('fire-and-forget'));

        // Wait a bit for the message to arrive
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(received).toBe(true);
      } finally {
        await transport.close();
        listener.close();
      }
    });
  });

  describe('Packet Validation', () => {
    it('should reject packets larger than maxPacketSize', async () => {
      const transport = new UDPClient(`udp://127.0.0.1:${serverPort}`, {
        maxPacketSize: 100,
      });

      try {
        await expect(
          transport.dispatch({
            url: '/test',
            method: 'GET',
            headers: new Headers(),
            body: Buffer.alloc(200), // Larger than maxPacketSize
            withHeader: () => ({} as any),
            withBody: () => ({} as any),
          })
        ).rejects.toThrow(/exceeds maximum/i);
      } finally {
        await transport.close();
      }
    });
  });
});

describe('UDPResponse', () => {
  describe('Data Access', () => {
    it('should return buffer', async () => {
      const response = new UDPResponseWrapper(Buffer.from('hello'));
      const buffer = await response.buffer();
      expect(buffer.toString()).toBe('hello');
    });

    it('should return text', async () => {
      const response = new UDPResponseWrapper(Buffer.from('hello world'));
      const text = await response.text();
      expect(text).toBe('hello world');
    });

    it('should return JSON', async () => {
      const response = new UDPResponseWrapper(Buffer.from('{"foo":"bar"}'));
      const json = await response.json();
      expect(json).toEqual({ foo: 'bar' });
    });

    it('should return clean text', async () => {
      const response = new UDPResponseWrapper(Buffer.from('hello\x00world\n\t'));
      const clean = await response.cleanText();
      expect(clean).toBe('hello world');
    });

    it('should return blob', async () => {
      const response = new UDPResponseWrapper(Buffer.from('blob data'));
      const blob = await response.blob();
      expect(blob.size).toBe(9);
    });
  });

  describe('Streaming', () => {
    it('should return readable stream', () => {
      const response = new UDPResponseWrapper(Buffer.from('stream data'));
      const stream = response.read();
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it('should async iterate', async () => {
      const response = new UDPResponseWrapper(Buffer.from('iterate'));
      const chunks: Uint8Array[] = [];

      for await (const chunk of response) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(1);
      expect(Buffer.from(chunks[0]).toString()).toBe('iterate');
    });

    it('should iterate packets', async () => {
      const response = new UDPResponseWrapper(Buffer.from('packet'));
      const packets: Buffer[] = [];

      for await (const packet of response.packets()) {
        packets.push(packet);
      }

      expect(packets.length).toBe(1);
      expect(packets[0].toString()).toBe('packet');
    });
  });

  describe('Clone', () => {
    it('should clone response', async () => {
      const response = new UDPResponseWrapper(Buffer.from('original'), {
        timings: { queued: 1, send: 2, receive: 3, retransmissions: 0, total: 6 },
        connection: {
          protocol: 'udp',
          localAddress: '127.0.0.1',
          localPort: 12345,
          remoteAddress: '192.168.1.1',
          remotePort: 5000,
        },
      });

      const cloned = response.clone();

      expect(await cloned.text()).toBe('original');
      expect(cloned.timings).toEqual(response.timings);
      expect(cloned.connection).toEqual(response.connection);
    });
  });

  describe('SSE Error', () => {
    it('should throw when calling sse()', async () => {
      const response = new UDPResponseWrapper(Buffer.from('data'));
      await expect(async () => {
        for await (const _ of response.sse()) { /* empty */ }
      }).rejects.toThrow('SSE is not supported for UDP responses');
    });
  });

  describe('read() after body used', () => {
    it('should return null when body was already used', async () => {
      const response = new UDPResponseWrapper(Buffer.from('already used'));
      await response.text(); // Use the body
      const stream = response.read();
      expect(stream).toBeNull();
    });
  });

  describe('Download Progress', () => {
    it('should emit download progress', async () => {
      const response = new UDPResponseWrapper(Buffer.from('progress test'));
      const events: any[] = [];

      for await (const event of response.download()) {
        events.push(event);
      }

      expect(events.length).toBe(1);
      expect(events[0].percent).toBe(100);
      expect(events[0].loaded).toBe(13);
    });
  });
});

describe('StreamingUDPResponse', () => {
  it('should handle streaming packets', async () => {
    const response = new StreamingUDPResponse();

    // Push packets asynchronously
    setTimeout(() => response.pushPacket(Buffer.from('chunk1')), 10);
    setTimeout(() => response.pushPacket(Buffer.from('chunk2')), 20);
    setTimeout(() => response.complete(), 30);

    const packets: Buffer[] = [];
    for await (const packet of response.packets()) {
      packets.push(packet);
    }

    expect(packets.length).toBe(2);
    expect(packets[0].toString()).toBe('chunk1');
    expect(packets[1].toString()).toBe('chunk2');
  });

  it('should combine packets into buffer', async () => {
    const response = new StreamingUDPResponse();

    response.pushPacket(Buffer.from('hello'));
    response.pushPacket(Buffer.from(' '));
    response.pushPacket(Buffer.from('world'));
    response.complete();

    const buffer = await response.buffer();
    expect(buffer.toString()).toBe('hello world');
  });

  it('should return JSON from streaming response', async () => {
    const response = new StreamingUDPResponse();
    response.pushPacket(Buffer.from('{"foo":'));
    response.pushPacket(Buffer.from('"bar"}'));
    response.complete();

    const json = await response.json();
    expect(json).toEqual({ foo: 'bar' });
  });

  it('should return text from streaming response', async () => {
    const response = new StreamingUDPResponse();
    response.pushPacket(Buffer.from('hello '));
    response.pushPacket(Buffer.from('world'));
    response.complete();

    const text = await response.text();
    expect(text).toBe('hello world');
  });

  it('should return clean text from streaming response', async () => {
    const response = new StreamingUDPResponse();
    response.pushPacket(Buffer.from('hello\x00'));
    response.pushPacket(Buffer.from('world\n\t'));
    response.complete();

    const clean = await response.cleanText();
    expect(clean).toBe('hello world');
  });

  it('should return blob from streaming response', async () => {
    const response = new StreamingUDPResponse();
    response.pushPacket(Buffer.from('blob'));
    response.pushPacket(Buffer.from(' data'));
    response.complete();

    const blob = await response.blob();
    expect(blob.size).toBe(9);
  });

  it('should return readable stream', async () => {
    const response = new StreamingUDPResponse();
    response.pushPacket(Buffer.from('stream'));
    response.complete();

    const stream = response.read();
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it('should clone streaming response', async () => {
    const response = new StreamingUDPResponse({
      timings: { queued: 1, send: 2, receive: 3, retransmissions: 0, total: 6 },
      connection: {
        protocol: 'udp',
        localAddress: '127.0.0.1',
        localPort: 12345,
        remoteAddress: '192.168.1.1',
        remotePort: 5000,
      },
      url: 'udp://test',
    });
    response.pushPacket(Buffer.from('clone'));
    response.complete();

    const cloned = response.clone();
    expect(await cloned.text()).toBe('clone');
    expect(cloned.timings).toEqual(response.timings);
    expect(cloned.connection).toEqual(response.connection);
    expect(cloned.url).toBe('udp://test');
  });

  it('should throw SSE error for streaming response', async () => {
    const response = new StreamingUDPResponse();
    response.complete();

    await expect(async () => {
      for await (const _ of response.sse()) { /* empty */ }
    }).rejects.toThrow('SSE is not supported for UDP responses');
  });

  it('should emit download progress for streaming response', async () => {
    const response = new StreamingUDPResponse();
    response.pushPacket(Buffer.from('chunk1'));
    response.pushPacket(Buffer.from('chunk2'));
    response.complete();

    const events: any[] = [];
    for await (const event of response.download()) {
      events.push(event);
    }

    expect(events.length).toBe(2);
    expect(events[0].loaded).toBe(6);
    expect(events[1].loaded).toBe(12);
  });

  it('should async iterate streaming response', async () => {
    const response = new StreamingUDPResponse();
    response.pushPacket(Buffer.from('iter1'));
    response.pushPacket(Buffer.from('iter2'));
    response.complete();

    const chunks: Uint8Array[] = [];
    for await (const chunk of response) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(2);
    expect(Buffer.from(chunks[0]).toString()).toBe('iter1');
    expect(Buffer.from(chunks[1]).toString()).toBe('iter2');
  });

  it('should throw when pushing to completed stream', () => {
    const response = new StreamingUDPResponse();
    response.complete();

    expect(() => response.pushPacket(Buffer.from('late'))).toThrow('Cannot push to completed stream');
  });

  it('should get url, timings, and connection properties', () => {
    const response = new StreamingUDPResponse({
      url: 'udp://example.com:1234',
      timings: { queued: 5, send: 10, receive: 15, retransmissions: 1, total: 30 },
      connection: {
        protocol: 'udp',
        localAddress: '127.0.0.1',
        localPort: 54321,
        remoteAddress: '192.168.0.1',
        remotePort: 1234,
      },
    });

    expect(response.url).toBe('udp://example.com:1234');
    expect(response.timings.total).toBe(30);
    expect(response.connection.remotePort).toBe(1234);
  });
});

describe('Simple UDP API', () => {
  let server: dgram.Socket;
  let serverPort: number;

  beforeEach(async () => {
    server = dgram.createSocket('udp4');

    await new Promise<void>((resolve) => {
      server.on('message', (msg, rinfo) => {
        server.send(msg, rinfo.port, rinfo.address);
      });

      server.bind(0, '127.0.0.1', () => {
        serverPort = (server.address() as dgram.AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should send via simple API', async () => {
    const response = await udp.send(
      `127.0.0.1:${serverPort}`,
      Buffer.from('simple api'),
      { timeout: 1000 }
    );

    expect(await response.text()).toBe('simple api');
  });
});

describe('createUDP', () => {
  it('should create a UDP client', () => {
    const client = createUDP({ timeout: 5000 });
    expect(client).toBeInstanceOf(UDPClient);
  });
});
