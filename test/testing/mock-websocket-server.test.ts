import { describe, it, expect, afterEach } from 'vitest';
import { MockWebSocketServer, createMockWebSocketServer } from '../../src/testing/mock-websocket-server.js';
import WebSocket from 'ws';

describe('MockWebSocketServer', () => {
  let server: MockWebSocketServer;

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop', async () => {
      server = new MockWebSocketServer();
      await server.start();
      expect(server.isRunning).toBe(true);
      expect(server.port).toBeGreaterThan(0);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should not start if already running', async () => {
      server = await MockWebSocketServer.create();
      await expect(server.start()).rejects.toThrow('already started');
    });

    it('should provide URL', async () => {
      server = await MockWebSocketServer.create({ host: '127.0.0.1' });
      expect(server.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/$/);
    });

    it('should use custom path', async () => {
      server = await MockWebSocketServer.create({ path: '/ws' });
      expect(server.url).toContain('/ws');
    });
  });

  describe('Connections', () => {
    it('should accept connections', async () => {
      server = await MockWebSocketServer.create();

      const connectionPromise = new Promise((resolve) => {
        server.on('connection', resolve);
      });

      const ws = new WebSocket(server.url);

      // Wait for websocket to be open before doing anything
      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      await connectionPromise;
      expect(server.connectionCount).toBe(1);

      ws.close();
    });

    it('should track all clients', async () => {
      server = await MockWebSocketServer.create();

      const ws1 = new WebSocket(server.url);
      const ws2 = new WebSocket(server.url);

      await server.waitForConnections(2);

      expect(server.allClients.length).toBe(2);
      expect(server.allClients[0].id).toMatch(/^client-\d+$/);

      ws1.close();
      ws2.close();
    });

    it('should emit disconnect event', async () => {
      server = await MockWebSocketServer.create();

      const disconnectPromise = new Promise<any>((resolve) => {
        server.on('disconnect', resolve);
      });

      const ws = new WebSocket(server.url);
      await server.waitForConnections(1);

      ws.close();

      const client = await disconnectPromise;
      expect(client.id).toBeDefined();
    });

    it('should enforce max connections', async () => {
      server = await MockWebSocketServer.create({ maxConnections: 1 });

      const ws1 = new WebSocket(server.url);
      await server.waitForConnections(1);

      const ws2 = new WebSocket(server.url);

      await new Promise<void>((resolve) => {
        ws2.on('close', () => resolve());
      });

      expect(server.connectionCount).toBe(1);

      ws1.close();
    });
  });

  describe('Echo Mode', () => {
    it('should echo messages by default', async () => {
      server = await MockWebSocketServer.create();

      const ws = new WebSocket(server.url);

      const response = await new Promise<string>((resolve) => {
        ws.on('open', () => ws.send('hello'));
        ws.on('message', (data) => resolve(data.toString()));
      });

      expect(response).toBe('hello');

      ws.close();
    });

    it('should allow disabling echo', async () => {
      server = await MockWebSocketServer.create({ echo: false });

      const ws = new WebSocket(server.url);

      let received = false;
      ws.on('message', () => {
        received = true;
      });

      await new Promise<void>((resolve) => {
        ws.on('open', () => {
          ws.send('hello');
          setTimeout(resolve, 50);
        });
      });

      expect(received).toBe(false);

      ws.close();
    });
  });

  describe('Custom Responses', () => {
    it('should match string pattern', async () => {
      server = await MockWebSocketServer.create({ echo: false });
      server.setResponse('ping', 'pong');

      const ws = new WebSocket(server.url);

      const response = await new Promise<string>((resolve) => {
        ws.on('open', () => ws.send('ping'));
        ws.on('message', (data) => resolve(data.toString()));
      });

      expect(response).toBe('pong');

      ws.close();
    });

    it('should match regex pattern', async () => {
      server = await MockWebSocketServer.create({ echo: false });
      server.setResponse(/^get:/, 'got it');

      const ws = new WebSocket(server.url);

      const response = await new Promise<string>((resolve) => {
        ws.on('open', () => ws.send('get:data'));
        ws.on('message', (data) => resolve(data.toString()));
      });

      expect(response).toBe('got it');

      ws.close();
    });

    it('should support functional response', async () => {
      server = await MockWebSocketServer.create({ echo: false });
      server.setResponse('reverse', (msg) => msg.split('').reverse().join(''));

      const ws = new WebSocket(server.url);

      const response = await new Promise<string>((resolve) => {
        ws.on('open', () => ws.send('reverse'));
        ws.on('message', (data) => resolve(data.toString()));
      });

      expect(response).toBe('esrever');

      ws.close();
    });

    it('should return null from function to not respond', async () => {
      server = await MockWebSocketServer.create({ echo: false });
      server.setResponse('quiet', () => null);

      const ws = new WebSocket(server.url);

      let received = false;
      ws.on('message', () => {
        received = true;
      });

      await new Promise<void>((resolve) => {
        ws.on('open', () => {
          ws.send('quiet');
          setTimeout(resolve, 50);
        });
      });

      expect(received).toBe(false);

      ws.close();
    });
  });

  describe('Server-Initiated Messages', () => {
    it('should send to specific client', async () => {
      server = await MockWebSocketServer.create();

      const ws = new WebSocket(server.url);

      const [client] = await server.waitForConnections(1);

      const messagePromise = new Promise<string>((resolve) => {
        ws.on('message', (data) => resolve(data.toString()));
      });

      server.send(client.id, 'server message');

      const message = await messagePromise;
      expect(message).toBe('server message');

      ws.close();
    });

    it('should broadcast to all clients', async () => {
      server = await MockWebSocketServer.create();

      const ws1 = new WebSocket(server.url);
      const ws2 = new WebSocket(server.url);

      await server.waitForConnections(2);

      const messages: string[] = [];
      ws1.on('message', (data) => messages.push(data.toString()));
      ws2.on('message', (data) => messages.push(data.toString()));

      server.broadcast('broadcast message');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(messages).toContain('broadcast message');
      expect(messages.length).toBe(2);

      ws1.close();
      ws2.close();
    });

    it('should send JSON objects', async () => {
      server = await MockWebSocketServer.create();

      const ws = new WebSocket(server.url);

      const [client] = await server.waitForConnections(1);

      const messagePromise = new Promise<any>((resolve) => {
        ws.on('message', (data) => resolve(JSON.parse(data.toString())));
      });

      server.send(client.id, { type: 'update', value: 42 });

      const message = await messagePromise;
      expect(message).toEqual({ type: 'update', value: 42 });

      ws.close();
    });
  });

  describe('Client Management', () => {
    it('should disconnect specific client', async () => {
      server = await MockWebSocketServer.create();

      const ws = new WebSocket(server.url);

      const closePromise = new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
      });

      const [client] = await server.waitForConnections(1);
      server.disconnectClient(client.id, 4000, 'Test disconnect');

      await closePromise;
      // Wait a bit for the server to update its state
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(server.connectionCount).toBe(0);
    });

    it('should disconnect all clients', async () => {
      server = await MockWebSocketServer.create();

      const ws1 = new WebSocket(server.url);
      const ws2 = new WebSocket(server.url);

      await server.waitForConnections(2);

      server.disconnectAll();

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(server.connectionCount).toBe(0);

      ws1.close();
      ws2.close();
    });
  });

  describe('Delay Simulation', () => {
    it('should add delay to responses', async () => {
      server = await MockWebSocketServer.create({ delay: 50 });

      const ws = new WebSocket(server.url);

      const start = Date.now();

      await new Promise<void>((resolve) => {
        ws.on('open', () => ws.send('test'));
        ws.on('message', () => resolve());
      });

      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(50);

      ws.close();
    });
  });

  describe('Statistics', () => {
    it('should track message statistics', async () => {
      server = await MockWebSocketServer.create();

      const ws = new WebSocket(server.url);

      await new Promise<void>((resolve) => {
        ws.on('open', () => {
          ws.send('message1');
          ws.send('message2');
          setTimeout(resolve, 50);
        });
      });

      const stats = server.statistics;
      expect(stats.totalConnections).toBe(1);
      expect(stats.currentConnections).toBe(1);
      expect(stats.totalMessages).toBe(2);
      expect(stats.messageLog.length).toBe(2);

      ws.close();
    });

    it('should wait for messages', async () => {
      server = await MockWebSocketServer.create();

      const ws = new WebSocket(server.url);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      ws.send('msg1');
      ws.send('msg2');

      const messages = await server.waitForMessages(2);
      expect(messages.length).toBe(2);

      ws.close();
    });
  });

  describe('Reset', () => {
    it('should reset server state', async () => {
      server = await MockWebSocketServer.create();
      server.setResponse('test', 'response');
      server.setDelay(100);

      const ws = new WebSocket(server.url);
      await server.waitForConnections(1);

      server.reset();

      const stats = server.statistics;
      expect(stats.totalMessages).toBe(0);
      expect(stats.messageLog.length).toBe(0);

      ws.close();
    });
  });

  describe('Helper Functions', () => {
    it('createMockWebSocketServer should create configured server', async () => {
      server = await createMockWebSocketServer({
        ping: 'pong',
        hello: 'world',
      });

      expect(server.isRunning).toBe(true);

      const ws = new WebSocket(server.url);

      const response = await new Promise<string>((resolve) => {
        ws.on('open', () => ws.send('ping'));
        ws.on('message', (data) => resolve(data.toString()));
      });

      expect(response).toBe('pong');

      ws.close();
    });
  });
});
