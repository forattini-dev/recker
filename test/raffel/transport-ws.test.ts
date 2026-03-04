import { describe, it, expect, afterEach, vi } from 'vitest';
import { MockWebSocket } from '../helpers/mock-websocket.js';

vi.mock('undici', async () => {
  const { MockWebSocket } = await import('../helpers/mock-websocket.js');
  return { WebSocket: MockWebSocket };
});

import { WsTransport } from '../../src/raffel/transport-ws.js';
import { TransportCapability, hasCapability } from '../../src/raffel/transport.js';

describe('WsTransport', () => {
  let transport: WsTransport;

  afterEach(() => {
    if (transport) transport.close();
  });

  it('should have all capabilities', () => {
    transport = new WsTransport('ws://localhost:9999');
    expect(hasCapability(transport, TransportCapability.CALL)).toBe(true);
    expect(hasCapability(transport, TransportCapability.NOTIFY)).toBe(true);
    expect(hasCapability(transport, TransportCapability.SUBSCRIBE)).toBe(true);
    expect(hasCapability(transport, TransportCapability.PUBLISH)).toBe(true);
    expect(hasCapability(transport, TransportCapability.CANCEL)).toBe(true);
    expect(hasCapability(transport, TransportCapability.STREAM)).toBe(true);
  });

  it('should connect and emit connected event', async () => {
    transport = new WsTransport('ws://localhost:9999');

    const connected = new Promise<void>((resolve) => {
      transport.on('connected', resolve);
    });

    await transport.connect();
    await connected;
    expect(transport.isConnected).toBe(true);
  });

  it('should parse JSON messages and emit message event', async () => {
    transport = new WsTransport('ws://localhost:9999');
    await transport.connect();
    await new Promise((r) => setTimeout(r, 20));

    const messages: any[] = [];
    transport.on('message', (data) => messages.push(data));

    // Access underlying mock ws
    const mockWs = (transport.socket as any).ws as MockWebSocket;
    mockWs.receive(JSON.stringify({ id: 'test-1', type: 'response', payload: 'hello' }));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ id: 'test-1', type: 'response', payload: 'hello' });
  });

  it('should ignore binary and invalid JSON messages', async () => {
    transport = new WsTransport('ws://localhost:9999');
    await transport.connect();
    await new Promise((r) => setTimeout(r, 20));

    const messages: any[] = [];
    transport.on('message', (data) => messages.push(data));

    const mockWs = (transport.socket as any).ws as MockWebSocket;
    mockWs.receive(Buffer.from('binary'));
    mockWs.receive('not json {{{');

    expect(messages).toHaveLength(0);
  });

  it('should send JSON data', async () => {
    transport = new WsTransport('ws://localhost:9999');
    await transport.connect();
    await new Promise((r) => setTimeout(r, 20));

    transport.send({ id: 'req-1', type: 'request', procedure: 'test' });

    const mockWs = (transport.socket as any).ws as MockWebSocket;
    const sent = mockWs.getSentMessages().map((m: string) => JSON.parse(m));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ id: 'req-1', type: 'request', procedure: 'test' });
  });

  it('should emit disconnected on close', async () => {
    transport = new WsTransport('ws://localhost:9999');
    await transport.connect();
    await new Promise((r) => setTimeout(r, 20));

    const disconnected = new Promise<void>((resolve) => {
      transport.on('disconnected', resolve);
    });

    const mockWs = (transport.socket as any).ws as MockWebSocket;
    mockWs.simulateUnexpectedClose();

    await disconnected;
  });

  it('should expose the ReckerWebSocket via socket getter', async () => {
    transport = new WsTransport('ws://localhost:9999');
    await transport.connect();
    expect(transport.socket).toBeDefined();
    expect(transport.socket.isConnected).toBe(true);
  });

  it('should support once() listener', async () => {
    transport = new WsTransport('ws://localhost:9999');
    await transport.connect();
    await new Promise((r) => setTimeout(r, 20));

    let count = 0;
    transport.once('message', () => count++);

    const mockWs = (transport.socket as any).ws as MockWebSocket;
    mockWs.receive(JSON.stringify({ test: 1 }));
    mockWs.receive(JSON.stringify({ test: 2 }));

    expect(count).toBe(1);
  });
});
