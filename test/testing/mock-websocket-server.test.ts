import { describe, it, expect, afterEach } from 'vitest';
import { MockWebSocketServer, createMockWebSocketServer } from 'raffel/testing';
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

    it('should provide URL', async () => {
      server = new MockWebSocketServer({ host: '127.0.0.1' });
      await server.start();
      expect(server.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\//);
    });

    it('should use custom path', async () => {
      server = new MockWebSocketServer({ path: '/ws' });
      await server.start();
      expect(server.url).toContain('/ws');
    });
  });

  describe('Connections', () => {
    it('should accept connections and track count', async () => {
      server = new MockWebSocketServer();
      await server.start();

      const ws = new WebSocket(server.url);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      expect(server.connectionCount).toBe(1);

      ws.close();
    });

    it('should enforce max connections', async () => {
      server = new MockWebSocketServer({ maxConnections: 1 });
      await server.start();

      const ws1 = new WebSocket(server.url);
      await new Promise<void>((resolve) => ws1.on('open', () => resolve()));

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
      server = new MockWebSocketServer();
      await server.start();

      const ws = new WebSocket(server.url);

      const response = await new Promise<string>((resolve) => {
        ws.on('open', () => ws.send('hello'));
        ws.on('message', (data) => resolve(data.toString()));
      });

      expect(response).toBe('hello');

      ws.close();
    });
  });

  describe('Custom Responses', () => {
    it('should match string pattern', async () => {
      server = new MockWebSocketServer();
      await server.start();
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
      server = new MockWebSocketServer();
      await server.start();
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
      server = new MockWebSocketServer();
      await server.start();
      server.setResponse('reverse', (msg) => msg.split('').reverse().join(''));

      const ws = new WebSocket(server.url);

      const response = await new Promise<string>((resolve) => {
        ws.on('open', () => ws.send('reverse'));
        ws.on('message', (data) => resolve(data.toString()));
      });

      expect(response).toBe('esrever');

      ws.close();
    });
  });

  describe('Broadcast', () => {
    it('should broadcast to all clients', async () => {
      server = new MockWebSocketServer();
      await server.start();

      const ws1 = new WebSocket(server.url);
      const ws2 = new WebSocket(server.url);

      await Promise.all([
        new Promise<void>(resolve => ws1.onopen = () => resolve()),
        new Promise<void>(resolve => ws2.onopen = () => resolve()),
      ]);

      const messages: string[] = [];
      ws1.on('message', (data) => messages.push(data.toString()));
      ws2.on('message', (data) => messages.push(data.toString()));

      server.broadcast('broadcast message');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(messages.filter(m => m === 'broadcast message').length).toBe(2);

      ws1.close();
      ws2.close();
    });
  });

  describe('Disconnect', () => {
    it('should close all connections', async () => {
      server = new MockWebSocketServer();
      await server.start();

      const ws1 = new WebSocket(server.url);
      const ws2 = new WebSocket(server.url);

      await Promise.all([
        new Promise<void>(resolve => ws1.onopen = () => resolve()),
        new Promise<void>(resolve => ws2.onopen = () => resolve()),
      ]);

      server.closeAllConnections();

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(server.connectionCount).toBe(0);

      ws1.close();
      ws2.close();
    });
  });

  describe('Helper Functions', () => {
    it('createMockWebSocketServer should create configured server', async () => {
      server = await createMockWebSocketServer();
      server.setResponse('ping', 'pong');

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
