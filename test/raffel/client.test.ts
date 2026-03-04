import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { MockWebSocket } from '../helpers/mock-websocket.js';

// Mock undici WebSocket BEFORE importing
vi.mock('undici', async () => {
  const { MockWebSocket } = await import('../helpers/mock-websocket.js');
  return { WebSocket: MockWebSocket };
});

import { RaffelClient, createRaffelClient } from '../../src/raffel/client.js';
import { RaffelError } from '../../src/raffel/types.js';

function getMockWs(client: RaffelClient): MockWebSocket {
  return (client.rawWs as any).ws as MockWebSocket;
}

function getSentMessages(client: RaffelClient): any[] {
  const mock = getMockWs(client);
  return mock.getSentMessages().map((m: string) => JSON.parse(m));
}

function lastSent(client: RaffelClient): any {
  const msgs = getSentMessages(client);
  return msgs[msgs.length - 1];
}

describe('RaffelClient', () => {
  let client: RaffelClient;

  afterEach(() => {
    if (client) client.close();
  });

  // ==========================================================================
  // Connection lifecycle
  // ==========================================================================

  describe('Connection', () => {
    it('should connect and emit raffel:connected', async () => {
      client = createRaffelClient('ws://localhost:9999');

      const connected = new Promise<void>((resolve) => {
        client.on('raffel:connected', resolve);
      });

      await client.connect();
      await connected;

      expect(client.isConnected).toBe(true);
    });

    it('should emit raffel:disconnected on close', async () => {
      client = createRaffelClient('ws://localhost:9999');
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      const disconnected = new Promise<void>((resolve) => {
        client.on('raffel:disconnected', resolve);
      });

      getMockWs(client).simulateUnexpectedClose();
      await disconnected;
    });

    it('should expose raw transport and rawWs', async () => {
      client = createRaffelClient('ws://localhost:9999');
      await client.connect();
      expect(client.raw).toBeDefined();
      expect(client.rawWs).toBeDefined();
      expect(client.rawWs!.isConnected).toBe(true);
    });
  });

  // ==========================================================================
  // call() — RPC correlation
  // ==========================================================================

  describe('call()', () => {
    beforeEach(async () => {
      client = createRaffelClient('ws://localhost:9999', { defaultTimeout: 5000 });
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));
    });

    it('should send request envelope and resolve on response', async () => {
      const callPromise = client.call('game.status', { map: 'forest' });

      // Check the sent envelope
      const sent = lastSent(client);
      expect(sent.procedure).toBe('game.status');
      expect(sent.type).toBe('request');
      expect(sent.payload).toEqual({ map: 'forest' });
      expect(sent.id).toMatch(/^req-/);

      // Simulate server response
      const responseId = `${sent.id}:response`;
      getMockWs(client).receive(JSON.stringify({
        id: responseId,
        procedure: 'game.status',
        type: 'response',
        payload: { players: 42 },
        metadata: {},
      }));

      const result = await callPromise;
      expect(result).toEqual({ players: 42 });
    });

    it('should reject on error envelope with RaffelError', async () => {
      const callPromise = client.call('game.join');

      const sent = lastSent(client);
      const errorId = `${sent.id}:error`;

      getMockWs(client).receive(JSON.stringify({
        id: errorId,
        procedure: 'game.join',
        type: 'error',
        payload: { code: 'FORBIDDEN', status: 403, message: 'Not allowed', details: null },
        metadata: {},
      }));

      await expect(callPromise).rejects.toThrow(RaffelError);
      await expect(callPromise).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
        message: 'Not allowed',
        procedure: 'game.join',
      });
    });

    it('should timeout after configured duration', async () => {
      const shortClient = createRaffelClient('ws://localhost:9999', { defaultTimeout: 50 });
      await shortClient.connect();
      await new Promise((r) => setTimeout(r, 20));

      await expect(shortClient.call('slow.rpc')).rejects.toThrow(/timed out/);
      shortClient.close();
    });

    it('should respect per-call timeout override', async () => {
      await expect(client.call('slow.rpc', {}, { timeout: 50 })).rejects.toThrow(/timed out/);
    });

    it('should reject on abort signal', async () => {
      const ac = new AbortController();
      const callPromise = client.call('long.rpc', {}, { signal: ac.signal });

      // Abort immediately
      ac.abort();

      await expect(callPromise).rejects.toThrow(/aborted/);

      // Should have sent a cancel envelope
      const msgs = getSentMessages(client);
      const cancelMsg = msgs.find((m) => m.type === 'cancel');
      expect(cancelMsg).toBeDefined();
    });

    it('should reject immediately if signal is already aborted', async () => {
      const ac = new AbortController();
      ac.abort();

      await expect(client.call('rpc', {}, { signal: ac.signal })).rejects.toThrow(/aborted/);
    });

    it('should handle multiple concurrent calls with different IDs', async () => {
      const p1 = client.call('rpc.a');
      const p2 = client.call('rpc.b');

      const msgs = getSentMessages(client);
      const [m1, m2] = msgs.slice(-2);

      expect(m1.id).not.toBe(m2.id);

      // Respond to second first
      getMockWs(client).receive(JSON.stringify({
        id: `${m2.id}:response`, procedure: 'rpc.b', type: 'response', payload: 'B',
      }));
      getMockWs(client).receive(JSON.stringify({
        id: `${m1.id}:response`, procedure: 'rpc.a', type: 'response', payload: 'A',
      }));

      expect(await p1).toBe('A');
      expect(await p2).toBe('B');
    });
  });

  // ==========================================================================
  // notify()
  // ==========================================================================

  describe('notify()', () => {
    it('should send event envelope with no pending entry', async () => {
      client = createRaffelClient('ws://localhost:9999');
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      client.notify('game.ping', { ts: 123 });

      const sent = lastSent(client);
      expect(sent.type).toBe('event');
      expect(sent.procedure).toBe('game.ping');
      expect(sent.payload).toEqual({ ts: 123 });

      // No pending calls should exist for this
      expect((client as any).pendingCalls.size).toBe(0);
    });
  });

  // ==========================================================================
  // cancel()
  // ==========================================================================

  describe('cancel()', () => {
    it('should send cancel envelope and reject the pending call', async () => {
      client = createRaffelClient('ws://localhost:9999', { defaultTimeout: 5000 });
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      const callPromise = client.call('slow.rpc');
      const sent = lastSent(client);

      client.cancel(sent.id);

      await expect(callPromise).rejects.toThrow(/cancelled/);

      const msgs = getSentMessages(client);
      const cancelMsg = msgs.find((m) => m.type === 'cancel');
      expect(cancelMsg).toBeDefined();
      expect(cancelMsg.id).toBe(sent.id);
    });
  });

  // ==========================================================================
  // Channels
  // ==========================================================================

  describe('Channels', () => {
    it('should send subscribe on connect for pre-configured channels', async () => {
      client = createRaffelClient('ws://localhost:9999', {
        channels: ['game', 'chat'],
      });

      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      const msgs = getSentMessages(client);
      const subscribes = msgs.filter((m) => m.type === 'subscribe');
      expect(subscribes).toHaveLength(2);
      expect(subscribes.map((m: any) => m.channel).sort()).toEqual(['chat', 'game']);
    });

    it('should subscribe dynamically and route events to handler', async () => {
      client = createRaffelClient('ws://localhost:9999');
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      const events: any[] = [];
      client.subscribe('game', (event, data) => events.push({ event, data }));

      const sent = lastSent(client);
      expect(sent.type).toBe('subscribe');
      expect(sent.channel).toBe('game');

      // Simulate channel event
      getMockWs(client).receive(JSON.stringify({
        type: 'event',
        channel: 'game',
        event: 'player.joined',
        data: { name: 'Alice' },
      }));

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ event: 'player.joined', data: { name: 'Alice' } });
    });

    it('should emit raffel:channel:event catch-all', async () => {
      client = createRaffelClient('ws://localhost:9999');
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      client.subscribe('game');

      const events: any[] = [];
      client.on('raffel:channel:event', (ch, ev, data) => events.push({ ch, ev, data }));

      getMockWs(client).receive(JSON.stringify({
        type: 'event', channel: 'game', event: 'tick', data: 1,
      }));

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ ch: 'game', ev: 'tick', data: 1 });
    });

    it('should unsubscribe and stop routing events', async () => {
      client = createRaffelClient('ws://localhost:9999');
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      const events: any[] = [];
      client.subscribe('game', (ev, data) => events.push({ ev, data }));
      client.unsubscribe('game');

      const sent = lastSent(client);
      expect(sent.type).toBe('unsubscribe');
      expect(sent.channel).toBe('game');

      // Event after unsubscribe should NOT route to handler
      getMockWs(client).receive(JSON.stringify({
        type: 'event', channel: 'game', event: 'tick', data: 1,
      }));

      expect(events).toHaveLength(0);
    });

    it('should emit raffel:channel:subscribed on subscribed message', async () => {
      client = createRaffelClient('ws://localhost:9999');
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      client.subscribe('game');

      const subscribed = new Promise<any>((resolve) => {
        client.on('raffel:channel:subscribed', (ch, members) => resolve({ ch, members }));
      });

      getMockWs(client).receive(JSON.stringify({
        id: 'sub-1',
        type: 'subscribed',
        channel: 'game',
        members: ['alice', 'bob'],
      }));

      const result = await subscribed;
      expect(result).toEqual({ ch: 'game', members: ['alice', 'bob'] });
    });

    it('should publish to a channel', async () => {
      client = createRaffelClient('ws://localhost:9999');
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      client.publish('game', 'chat.message', { text: 'hello' });

      const sent = lastSent(client);
      expect(sent.type).toBe('publish');
      expect(sent.channel).toBe('game');
      expect(sent.event).toBe('chat.message');
      expect(sent.data).toEqual({ text: 'hello' });
    });
  });

  // ==========================================================================
  // Auto-resubscribe on reconnect
  // ==========================================================================

  describe('Auto-resubscribe', () => {
    it('should re-subscribe all channels after reconnect', async () => {
      client = createRaffelClient('ws://localhost:9999', {
        channels: ['game', 'chat'],
        ws: {
          reconnect: true,
          maxReconnectAttempts: 0,
        },
      });

      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      // Initial subscribes
      const initialMsgs = getSentMessages(client);
      const initialSubs = initialMsgs.filter((m) => m.type === 'subscribe');
      expect(initialSubs).toHaveLength(2);

      // Simulate reconnect: the MockWebSocket fires open on the underlying ws
      const mockWs = getMockWs(client);
      mockWs.emit('open');

      await new Promise((r) => setTimeout(r, 20));

      // Should have 4 subscribe messages total (2 initial + 2 resubscribe)
      const allMsgs = getSentMessages(client);
      const allSubs = allMsgs.filter((m) => m.type === 'subscribe');
      expect(allSubs).toHaveLength(4);
    });
  });

  // ==========================================================================
  // Pending calls rejected on close
  // ==========================================================================

  describe('Pending calls on close', () => {
    it('should reject all pending calls when connection closes', async () => {
      client = createRaffelClient('ws://localhost:9999', { defaultTimeout: 5000 });
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      const p1 = client.call('rpc.a');
      const p2 = client.call('rpc.b');

      getMockWs(client).simulateUnexpectedClose();

      await expect(p1).rejects.toThrow(/closed/i);
      await expect(p2).rejects.toThrow(/closed/i);
    });

    it('should reject pending calls when close() is called explicitly', async () => {
      client = createRaffelClient('ws://localhost:9999', { defaultTimeout: 5000 });
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      const p1 = client.call('rpc.a');
      client.close();

      await expect(p1).rejects.toThrow(/closed/i);
    });
  });

  // ==========================================================================
  // Message discrimination
  // ==========================================================================

  describe('Message discrimination', () => {
    beforeEach(async () => {
      client = createRaffelClient('ws://localhost:9999');
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));
    });

    it('should route channel messages (has channel field)', async () => {
      client.subscribe('game');

      const events: any[] = [];
      client.on('raffel:channel:event', (...args) => events.push(args));

      getMockWs(client).receive(JSON.stringify({
        type: 'event', channel: 'game', event: 'tick', data: 1,
      }));

      expect(events).toHaveLength(1);
    });

    it('should route RPC envelopes (has procedure field)', async () => {
      const events: any[] = [];
      client.on('raffel:event', (...args) => events.push(args));

      getMockWs(client).receive(JSON.stringify({
        id: 'evt-1', procedure: 'game.update', type: 'event', payload: { score: 10 },
      }));

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(['game.update', { score: 10 }]);
    });

    it('should emit raffel:unknown for unrecognized messages', async () => {
      const unknowns: any[] = [];
      client.on('raffel:unknown', (msg) => unknowns.push(msg));

      getMockWs(client).receive(JSON.stringify({ random: 'data' }));

      expect(unknowns).toHaveLength(1);
      expect(unknowns[0]).toEqual({ random: 'data' });
    });

    it('should ignore non-string (binary) messages', async () => {
      const unknowns: any[] = [];
      client.on('raffel:unknown', (msg) => unknowns.push(msg));

      // MockWebSocket.receive sets isBinary based on Buffer.isBuffer
      getMockWs(client).receive(Buffer.from('binary'));

      // Should not emit anything — binary messages are silently ignored
      expect(unknowns).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Server-pushed events on procedures
  // ==========================================================================

  describe('onEvent handler', () => {
    it('should call onEvent for server-pushed procedure events', async () => {
      const events: any[] = [];
      client = createRaffelClient('ws://localhost:9999', {
        onEvent: (proc, payload) => events.push({ proc, payload }),
      });
      await client.connect();
      await new Promise((r) => setTimeout(r, 20));

      getMockWs(client).receive(JSON.stringify({
        id: 'evt-1', procedure: 'game.scoreUpdate', type: 'event', payload: { score: 99 },
      }));

      expect(events).toEqual([{ proc: 'game.scoreUpdate', payload: { score: 99 } }]);
    });
  });
});
