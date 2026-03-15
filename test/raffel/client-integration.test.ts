import { describe, it, expect, afterEach } from 'vitest';
import { RaffelClient, createRaffelClient } from '../../src/raffel/client.js';
import { createMockWebSocketServer, type MockWebSocketServer } from 'raffel/testing';

describe('RaffelClient integration with MockWebSocketServer', () => {
  let server: MockWebSocketServer | null = null;
  let clients: RaffelClient[] = [];

  afterEach(async () => {
    for (const c of clients) c.close();
    clients = [];
    if (server) { await server.stop(); server = null; }
  });

  // ============================================================================
  // Raw mode — RaffelClient(raw) + MockWebSocketServer(raw)
  // ============================================================================

  describe('raw mode', () => {
    it('sends and receives raw JSON messages', async () => {
      server = await createMockWebSocketServer({ mode: 'raw' });
      // Echo server: returns whatever it receives
      server.setMessageHandler((msg) => msg);

      const rc = createRaffelClient(server.url, { mode: 'raw', ws: { reconnect: false } });
      clients.push(rc);
      await rc.connect();

      rc.sendRaw({ type: 'hello', data: 'world' });
      const echo = await rc.waitFor((msg: any) => msg.type === 'hello', 3000);
      expect(echo.data).toBe('world');
    });

    it('handles 5 sequential raw messages', async () => {
      server = await createMockWebSocketServer({ mode: 'raw' });
      server.setMessageHandler((msg) => {
        const parsed = JSON.parse(msg.toString());
        return JSON.stringify({ ...parsed, processed: true });
      });

      const rc = createRaffelClient(server.url, { mode: 'raw', ws: { reconnect: false } });
      clients.push(rc);
      await rc.connect();

      for (let i = 1; i <= 5; i++) {
        rc.sendRaw({ id: `msg-${i}`, type: 'ping', seq: i });
        const reply = await rc.waitFor((msg: any) => msg.id === `msg-${i}`, 3000);
        expect(reply.processed).toBe(true);
        expect(reply.seq).toBe(i);
      }
    });

    it('pattern-based responses work with raw mode', async () => {
      server = await createMockWebSocketServer({ mode: 'raw' });
      // Pattern matches the raw JSON string on the wire
      server.setResponse(/ping/, '{"type":"pong"}');

      const rc = createRaffelClient(server.url, { mode: 'raw', ws: { reconnect: false } });
      clients.push(rc);
      await rc.connect();

      rc.sendRaw({ type: 'ping' });
      const pong = await rc.waitFor((msg: any) => msg.type === 'pong', 3000);
      expect(pong.type).toBe('pong');
    });
  });

  // ============================================================================
  // Full mode — RaffelClient(full) + MockWebSocketServer(full)
  // ============================================================================

  describe('full mode', () => {
    it('connects and receives onConnection message', async () => {
      server = await createMockWebSocketServer({
        mode: 'full',
        onConnection: (socketId, send) => {
          send({ type: 'welcome', socketId });
        },
      });

      const rc = createRaffelClient(server.url, { mode: 'full', ws: { reconnect: false } });
      clients.push(rc);
      await rc.connect();

      const welcome = await rc.waitFor((msg: any) => msg.type === 'welcome', 3000);
      expect(welcome.socketId).toBeTruthy();
    });

    it('RPC call/response with 5 procedures', async () => {
      server = await createMockWebSocketServer({ mode: 'full' });
      server.setProcedure('math.add', async (payload: any) => ({
        result: payload.a + payload.b,
      }));
      server.setProcedure('math.multiply', async (payload: any) => ({
        result: payload.a * payload.b,
      }));
      server.setProcedure('echo', async (payload: any) => payload);

      const rc = createRaffelClient(server.url, { mode: 'full', ws: { reconnect: false } });
      clients.push(rc);
      await rc.connect();
      await new Promise(r => setTimeout(r, 50));

      // 5 RPC calls
      const r1 = await rc.call<any>('math.add', { a: 2, b: 3 });
      expect(r1.result).toBe(5);

      const r2 = await rc.call<any>('math.multiply', { a: 4, b: 5 });
      expect(r2.result).toBe(20);

      const r3 = await rc.call<any>('echo', { hello: 'world' });
      expect(r3.hello).toBe('world');

      const r4 = await rc.call<any>('math.add', { a: 100, b: -50 });
      expect(r4.result).toBe(50);

      const r5 = await rc.call<any>('math.multiply', { a: 0, b: 999 });
      expect(r5.result).toBe(0);
    });

    it('RPC error for unknown procedure', async () => {
      server = await createMockWebSocketServer({ mode: 'full' });

      const rc = createRaffelClient(server.url, { mode: 'full', ws: { reconnect: false } });
      clients.push(rc);
      await rc.connect();
      await new Promise(r => setTimeout(r, 50));

      await expect(rc.call('nonexistent.proc')).rejects.toThrow(/not found/i);
    });

    it('channel subscribe/publish between two clients', async () => {
      server = await createMockWebSocketServer({ mode: 'full' });

      const rc1 = createRaffelClient(server.url, { mode: 'full', ws: { reconnect: false } });
      const rc2 = createRaffelClient(server.url, { mode: 'full', ws: { reconnect: false } });
      clients.push(rc1, rc2);
      await Promise.all([rc1.connect(), rc2.connect()]);
      await new Promise(r => setTimeout(r, 50));

      // Both subscribe to chat-room
      const sub1 = new Promise<void>(r => rc1.once('raffel:channel:subscribed', () => r()));
      const sub2 = new Promise<void>(r => rc2.once('raffel:channel:subscribed', () => r()));
      rc1.subscribe('chat-room');
      rc2.subscribe('chat-room');
      await Promise.all([sub1, sub2]);

      // rc1 publishes, rc2 receives
      const eventPromise = new Promise<any>(resolve => {
        rc2.on('raffel:channel:event', (channel: string, event: string, data: unknown) => {
          if (channel === 'chat-room' && event === 'message') {
            resolve({ channel, event, data });
          }
        });
      });

      rc1.publish('chat-room', 'message', { text: 'Hello from rc1!' });
      const received = await eventPromise;
      expect(received.data.text).toBe('Hello from rc1!');
    });

    it('presence channel tracks member_added and member_removed', async () => {
      server = await createMockWebSocketServer({ mode: 'full' });

      const rc1 = createRaffelClient(server.url, { mode: 'full', ws: { reconnect: false } });
      const rc2 = createRaffelClient(server.url, { mode: 'full', ws: { reconnect: false } });
      clients.push(rc1, rc2);
      await Promise.all([rc1.connect(), rc2.connect()]);
      await new Promise(r => setTimeout(r, 50));

      // rc1 joins presence-lobby
      const sub1 = new Promise<void>(r => rc1.once('raffel:channel:subscribed', () => r()));
      rc1.subscribe('presence-lobby');
      await sub1;

      // rc2 joins — rc1 should get member_added
      const memberAddedPromise = new Promise<any>(resolve => {
        rc1.on('raffel:channel:event', (channel: string, event: string, data: unknown) => {
          if (channel === 'presence-lobby' && event === 'member_added') {
            resolve({ channel, event, data });
          }
        });
      });

      const sub2 = new Promise<void>(r => rc2.once('raffel:channel:subscribed', () => r()));
      rc2.subscribe('presence-lobby');
      await sub2;

      const memberAdded = await memberAddedPromise;
      expect(memberAdded.event).toBe('member_added');

      // rc2 unsubscribes — rc1 should get member_removed
      const memberRemovedPromise = new Promise<any>(resolve => {
        rc1.on('raffel:channel:event', (channel: string, event: string, data: unknown) => {
          if (channel === 'presence-lobby' && event === 'member_removed') {
            resolve({ channel, event, data });
          }
        });
      });

      rc2.unsubscribe('presence-lobby');
      const memberRemoved = await memberRemovedPromise;
      expect(memberRemoved.event).toBe('member_removed');
    });

    it('5 channel operations: subscribe, publish x3, unsubscribe', async () => {
      server = await createMockWebSocketServer({ mode: 'full' });

      const rc1 = createRaffelClient(server.url, { mode: 'full', ws: { reconnect: false } });
      const rc2 = createRaffelClient(server.url, { mode: 'full', ws: { reconnect: false } });
      clients.push(rc1, rc2);
      await Promise.all([rc1.connect(), rc2.connect()]);
      await new Promise(r => setTimeout(r, 50));

      // Op 1: Subscribe
      const sub1 = new Promise<void>(r => rc1.once('raffel:channel:subscribed', () => r()));
      const sub2 = new Promise<void>(r => rc2.once('raffel:channel:subscribed', () => r()));
      rc1.subscribe('feed');
      rc2.subscribe('feed');
      await Promise.all([sub1, sub2]);

      const rc2Events: any[] = [];
      rc2.on('raffel:channel:event', (channel: string, event: string, data: unknown) => {
        if (channel === 'feed') rc2Events.push({ event, data });
      });

      // Op 2-4: Publish 3 messages
      rc1.publish('feed', 'update', { seq: 1 });
      rc1.publish('feed', 'update', { seq: 2 });
      rc1.publish('feed', 'update', { seq: 3 });

      // Wait for all 3 events to arrive
      await new Promise<void>(resolve => {
        const check = () => {
          if (rc2Events.length >= 3) resolve();
          else setTimeout(check, 20);
        };
        check();
      });

      expect(rc2Events.length).toBe(3);
      expect(rc2Events[0].data.seq).toBe(1);
      expect(rc2Events[1].data.seq).toBe(2);
      expect(rc2Events[2].data.seq).toBe(3);

      // Op 5: Unsubscribe
      rc1.unsubscribe('feed');
      await new Promise(r => setTimeout(r, 50));

      // Verify server state
      expect(server.getChannelSubscriberCount('feed')).toBe(1); // only rc2 left
    });

    it('mixed: RPC calls + channel pub/sub in same connection', async () => {
      server = await createMockWebSocketServer({ mode: 'full' });
      server.setProcedure('greet', async (payload: any) => ({
        greeting: `Hello, ${payload.name}!`,
      }));

      const rc = createRaffelClient(server.url, { mode: 'full', ws: { reconnect: false } });
      clients.push(rc);
      await rc.connect();
      await new Promise(r => setTimeout(r, 50));

      // RPC call
      const result = await rc.call<any>('greet', { name: 'World' });
      expect(result.greeting).toBe('Hello, World!');

      // Channel subscribe
      const subbed = new Promise<void>(r => rc.once('raffel:channel:subscribed', () => r()));
      rc.subscribe('notifications');
      await subbed;

      // Server broadcasts to channel
      server.broadcastToChannel('notifications', 'alert', { message: 'System update' });

      const event = await new Promise<any>(resolve => {
        rc.on('raffel:channel:event', (channel: string, event: string, data: unknown) => {
          if (channel === 'notifications') resolve({ channel, event, data });
        });
      });
      expect(event.data.message).toBe('System update');

      // Another RPC call
      const result2 = await rc.call<any>('greet', { name: 'Raffel' });
      expect(result2.greeting).toBe('Hello, Raffel!');
    });
  });
});
