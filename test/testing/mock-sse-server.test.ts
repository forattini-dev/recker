import { describe, it, expect, afterEach } from 'vitest';
import { MockSSEServer, createMockSSEServer } from 'raffel/testing';

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

    it('should silently skip start if already running', async () => {
      server = await createMockSSEServer();
      await expect(server.start()).resolves.toBeUndefined();
    });

    it('should provide URL', async () => {
      server = await createMockSSEServer({ host: '127.0.0.1', path: '/events' });
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/events$/);
    });

    it('should use custom path', async () => {
      server = await createMockSSEServer({ path: '/stream' });
      expect(server.url).toContain('/stream');
    });
  });

  describe('Connections', () => {
    it('should accept connections and track count', async () => {
      server = await createMockSSEServer();

      // Set up listener before fetching to avoid race
      const connectionPromise = new Promise<void>((resolve) => {
        server.once('connection', () => resolve());
      });

      const ac = new AbortController();
      fetch(server.url, { signal: ac.signal }).catch(() => {});
      await connectionPromise;

      expect(server.connectionCount).toBe(1);

      ac.abort();
    });

    it('should enforce max connections', async () => {
      server = await createMockSSEServer({ maxConnections: 1 });

      const response1 = await fetch(server.url);
      expect(response1.ok).toBe(true);

      const response2 = await fetch(server.url);
      expect(response2.status).toBe(503);

      response1.body?.cancel();
    });

    it('should return 404 for wrong path', async () => {
      server = await createMockSSEServer({ path: '/events' });

      const response = await fetch(server.url.replace('/events', '/wrong'));
      expect(response.status).toBe(404);
    });

    it('should emit connection event with client ID', async () => {
      server = await createMockSSEServer();

      const clientIdPromise = new Promise<string>((resolve) => {
        server.once('connection', (id) => resolve(id as string));
      });

      const ac = new AbortController();
      fetch(server.url, { signal: ac.signal }).catch(() => {});

      const clientId = await clientIdPromise;
      expect(clientId).toMatch(/^client-\d+$/);

      ac.abort();
    });

    it('should emit disconnect event', async () => {
      server = await createMockSSEServer();

      const connectedPromise = new Promise<void>((resolve) => {
        server.once('connection', () => resolve());
      });
      const ac = new AbortController();
      fetch(server.url, { signal: ac.signal }).catch(() => {});
      await connectedPromise;

      const disconnectedPromise = new Promise<void>((resolve) => {
        server.once('disconnect', () => resolve());
      });
      server.closeAllConnections();
      await disconnectedPromise;

      ac.abort();
    });
  });

  describe('Event Sending', () => {
    it('should send event with data', async () => {
      server = await createMockSSEServer({ retryInterval: 0, keepAliveInterval: 0 });

      // Wait for connection before sending event
      const connectedPromise = new Promise<void>((resolve) => {
        server.once('connection', () => resolve());
      });

      const ac = new AbortController();
      const fetchPromise = fetch(server.url, { signal: ac.signal });
      await connectedPromise;

      // Send event BEFORE awaiting the response — the write flushes the HTTP headers
      // (with retryInterval:0 no prior write flushes them, causing fetch to stall).
      server.sendEvent({ data: 'Hello, World!' });

      const response = await fetchPromise;
      const reader = response.body!.getReader();

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('data:Hello, World!');

      reader.cancel();
      ac.abort();
    });

    it('should send event with type and id', async () => {
      server = await createMockSSEServer({ retryInterval: 0, keepAliveInterval: 0 });

      const connectedPromise = new Promise<void>((resolve) => {
        server.once('connection', () => resolve());
      });

      const ac = new AbortController();
      const fetchPromise = fetch(server.url, { signal: ac.signal });
      await connectedPromise;

      // Send event BEFORE awaiting the response (flush headers).
      server.sendEvent({ event: 'update', id: '42', data: 'payload' });

      const response = await fetchPromise;
      const reader = response.body!.getReader();

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('event:update');
      expect(text).toContain('id:42');
      expect(text).toContain('data:payload');

      reader.cancel();
      ac.abort();
    });

    it('should send to specific client by ID', async () => {
      server = await createMockSSEServer({ retryInterval: 0, keepAliveInterval: 0 });

      const clientIdPromise = new Promise<string>((resolve) => {
        server.once('connection', (id) => resolve(id as string));
      });

      const ac = new AbortController();
      fetch(server.url, { signal: ac.signal }).catch(() => {});

      const clientId = await clientIdPromise;

      // sendEventToClient should not throw for valid client
      expect(() => server.sendEventToClient(clientId, { data: 'private' })).not.toThrow();

      ac.abort();
    });
  });

  describe('Periodic Events', () => {
    it('should start and stop periodic events', async () => {
      server = await createMockSSEServer({ retryInterval: 0, keepAliveInterval: 0 });

      const connectedPromise = new Promise<void>((resolve) => {
        server.once('connection', () => resolve());
      });
      const ac = new AbortController();
      fetch(server.url, { signal: ac.signal }).catch(() => {});
      await connectedPromise;

      let eventCount = 0;
      const origSendEvent = server.sendEvent.bind(server);
      server.sendEvent = (event) => {
        eventCount++;
        origSendEvent(event);
      };

      server.startPeriodicEvents('heartbeat', 50, () => ({ data: 'tick' }));
      await new Promise(resolve => setTimeout(resolve, 200));
      server.stopPeriodicEvents('heartbeat');

      expect(eventCount).toBeGreaterThanOrEqual(2);

      ac.abort();
    });
  });

  describe('Client Management', () => {
    it('should close all connections', async () => {
      server = await createMockSSEServer();

      const p1 = new Promise<void>((resolve) => server.once('connection', () => resolve()));
      const ac1 = new AbortController();
      fetch(server.url, { signal: ac1.signal }).catch(() => {});
      await p1;

      const p2 = new Promise<void>((resolve) => server.once('connection', () => resolve()));
      const ac2 = new AbortController();
      fetch(server.url, { signal: ac2.signal }).catch(() => {});
      await p2;

      expect(server.connectionCount).toBe(2);

      server.closeAllConnections();

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(server.connectionCount).toBe(0);

      ac1.abort();
      ac2.abort();
    });
  });

  describe('Helper Functions', () => {
    it('createMockSSEServer should create running server', async () => {
      server = await createMockSSEServer({ path: '/stream' });
      expect(server.isRunning).toBe(true);
      expect(server.url).toContain('/stream');
    });
  });
});
