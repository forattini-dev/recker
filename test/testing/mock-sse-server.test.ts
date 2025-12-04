import { describe, it, expect, afterEach } from 'vitest';
import { MockSSEServer, createMockSSEServer } from '../../src/testing/mock-sse-server.js';

describe('MockSSEServer', () => {
  let server: MockSSEServer;

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop', async () => {
      server = new MockSSEServer();
      await server.start();
      expect(server.isRunning).toBe(true);
      expect(server.port).toBeGreaterThan(0);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should not start if already running', async () => {
      server = await MockSSEServer.create();
      await expect(server.start()).rejects.toThrow('already started');
    });

    it('should provide URL', async () => {
      server = await MockSSEServer.create({ host: '127.0.0.1', path: '/events' });
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/events$/);
    });
  });

  describe('Connections', () => {
    it('should accept connections', async () => {
      server = await MockSSEServer.create();

      const connectionPromise = new Promise((resolve) => {
        server.on('connection', resolve);
      });

      const response = await fetch(server.url);
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('text/event-stream');

      await connectionPromise;
      expect(server.connectionCount).toBe(1);

      // Abort connection
      response.body?.cancel();
    });

    it('should track all clients', async () => {
      server = await MockSSEServer.create();

      const response1 = fetch(server.url);
      const response2 = fetch(server.url);

      await server.waitForConnections(2);

      expect(server.allClients.length).toBe(2);
      expect(server.allClients[0].id).toMatch(/^sse-client-\d+$/);

      (await response1).body?.cancel();
      (await response2).body?.cancel();
    });

    it('should send retry hint on connection', async () => {
      server = await MockSSEServer.create({ retryInterval: 5000, sendRetry: true });

      const response = await fetch(server.url);
      const reader = response.body!.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('retry: 5000');

      reader.cancel();
    });

    it('should enforce max connections', async () => {
      server = await MockSSEServer.create({ maxConnections: 1 });

      const response1 = await fetch(server.url);
      expect(response1.ok).toBe(true);

      const response2 = await fetch(server.url);
      expect(response2.status).toBe(503);

      response1.body?.cancel();
    });

    it('should return 404 for wrong path', async () => {
      server = await MockSSEServer.create({ path: '/events' });

      const response = await fetch(server.url.replace('/events', '/wrong'));
      expect(response.status).toBe(404);
    });
  });

  describe('Event Sending', () => {
    it('should send simple data event', async () => {
      server = await MockSSEServer.create();

      const response = await fetch(server.url);
      const reader = response.body!.getReader();

      // Skip retry line
      await reader.read();

      // Send event
      server.sendData('Hello, World!');

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('data: Hello, World!');

      reader.cancel();
    });

    it('should send event with type', async () => {
      server = await MockSSEServer.create();

      const response = await fetch(server.url);
      const reader = response.body!.getReader();

      await reader.read(); // Skip retry

      server.sendEvent({ event: 'update', data: 'test' });

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('event: update');
      expect(text).toContain('data: test');

      reader.cancel();
    });

    it('should send event with ID', async () => {
      server = await MockSSEServer.create();

      const response = await fetch(server.url);
      const reader = response.body!.getReader();

      await reader.read(); // Skip retry

      server.sendEvent({ id: '123', data: 'test' });

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('id: 123');

      reader.cancel();
    });

    it('should send JSON data', async () => {
      server = await MockSSEServer.create();

      const response = await fetch(server.url);
      const reader = response.body!.getReader();

      await reader.read(); // Skip retry

      server.sendJSON({ status: 'ok', value: 42 });

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('data: {"status":"ok","value":42}');

      reader.cancel();
    });

    it('should handle multi-line data', async () => {
      server = await MockSSEServer.create();

      const response = await fetch(server.url);
      const reader = response.body!.getReader();

      await reader.read(); // Skip retry

      server.sendEvent({ data: 'line1\nline2\nline3' });

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('data: line1');
      expect(text).toContain('data: line2');
      expect(text).toContain('data: line3');

      reader.cancel();
    });

    it('should broadcast to all clients', async () => {
      server = await MockSSEServer.create({ sendRetry: false });

      // Connect 2 clients using AbortController for cleanup
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      fetch(server.url, { signal: controller1.signal }).catch(() => {});
      fetch(server.url, { signal: controller2.signal }).catch(() => {});

      await server.waitForConnections(2);

      // Send broadcast
      const sentCount = server.sendData('broadcast');

      // Verify event was sent to all clients
      expect(sentCount).toBe(2);
      expect(server.statistics.totalEventsSent).toBe(2);

      // Cleanup
      controller1.abort();
      controller2.abort();
    });

    it('should send to specific client', async () => {
      server = await MockSSEServer.create({ sendRetry: false });

      // Connect 2 clients using AbortController for cleanup
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      fetch(server.url, { signal: controller1.signal }).catch(() => {});
      fetch(server.url, { signal: controller2.signal }).catch(() => {});

      await server.waitForConnections(2);

      const [client1] = server.allClients;

      // Send to first client only
      const success = server.sendEventTo(client1.id, { data: 'private' });

      // Verify event was sent successfully
      expect(success).toBe(true);
      expect(server.statistics.totalEventsSent).toBe(1);

      // Cleanup
      controller1.abort();
      controller2.abort();
    });
  });

  describe('Periodic Events', () => {
    it('should send periodic events', async () => {
      server = await MockSSEServer.create({ sendRetry: false });

      const controller = new AbortController();
      fetch(server.url, { signal: controller.signal }).catch(() => {});

      await server.waitForConnections(1);

      server.startPeriodicEvents('heartbeat', 20);

      // Wait for a few events to be sent
      await new Promise((resolve) => setTimeout(resolve, 100));

      server.stopPeriodicEvents('heartbeat');
      controller.abort();

      // Verify events were sent
      expect(server.statistics.totalEventsSent).toBeGreaterThanOrEqual(2);
    });

    it('should use custom data generator', async () => {
      server = await MockSSEServer.create({ sendRetry: false });

      const controller = new AbortController();
      fetch(server.url, { signal: controller.signal }).catch(() => {});

      await server.waitForConnections(1);

      let counter = 0;
      server.startPeriodicEvents('counter', 20, () => String(++counter));

      // Wait for a few intervals
      await new Promise((resolve) => setTimeout(resolve, 100));

      server.stopPeriodicEvents();

      // Verify events were sent with incremented counter
      expect(counter).toBeGreaterThan(0);
      expect(server.statistics.totalEventsSent).toBeGreaterThan(0);

      controller.abort();
    });
  });

  describe('Client Management', () => {
    it('should disconnect specific client', async () => {
      server = await MockSSEServer.create();

      const response = await fetch(server.url);

      await server.waitForConnections(1);
      const [client] = server.allClients;

      const disconnectPromise = new Promise<void>((resolve) => {
        server.on('disconnect', () => resolve());
      });

      server.disconnectClient(client.id);

      await disconnectPromise;
      expect(server.connectionCount).toBe(0);

      response.body?.cancel();
    });

    it('should disconnect all clients', async () => {
      server = await MockSSEServer.create();

      const response1 = await fetch(server.url);
      const response2 = await fetch(server.url);

      await server.waitForConnections(2);

      server.disconnectAll();

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(server.connectionCount).toBe(0);

      response1.body?.cancel();
      response2.body?.cancel();
    });
  });

  describe('Last-Event-ID', () => {
    it('should capture Last-Event-ID header', async () => {
      server = await MockSSEServer.create();

      const response = await fetch(server.url, {
        headers: { 'Last-Event-ID': '42' },
      });

      await server.waitForConnections(1);
      const [client] = server.allClients;

      expect(client.lastEventId).toBe('42');

      response.body?.cancel();
    });
  });

  describe('Statistics', () => {
    it('should track event statistics', async () => {
      server = await MockSSEServer.create();

      const response = await fetch(server.url);
      await server.waitForConnections(1);

      server.sendData('event1');
      server.sendData('event2');

      const stats = server.statistics;
      expect(stats.totalConnections).toBe(1);
      expect(stats.currentConnections).toBe(1);
      expect(stats.totalEventsSent).toBe(2);
      expect(stats.eventLog.length).toBe(2);

      response.body?.cancel();
    });
  });

  describe('Reset', () => {
    it('should reset server state', async () => {
      server = await MockSSEServer.create();

      const response = await fetch(server.url);
      await server.waitForConnections(1);

      server.sendData('test');

      server.reset();

      const stats = server.statistics;
      expect(stats.totalEventsSent).toBe(0);
      expect(stats.eventLog.length).toBe(0);

      response.body?.cancel();
    });
  });

  describe('Helper Functions', () => {
    it('createMockSSEServer should create server', async () => {
      server = await createMockSSEServer({ path: '/stream' });
      expect(server.isRunning).toBe(true);
      expect(server.url).toContain('/stream');
    });
  });
});
