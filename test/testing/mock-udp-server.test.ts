import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { MockUdpServer, createMockUdpServer } from 'raffel/testing';
import dgram from 'node:dgram';

describe('MockUdpServer', () => {
  let server: MockUdpServer;
  let client: dgram.Socket;

  beforeEach(async () => {
    client = dgram.createSocket('udp4');
  });

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
    client.close();
  });

  describe('Basic Operations', () => {
    it('should start and stop', async () => {
      server = new MockUdpServer();
      await server.start();
      expect(server.isRunning).toBe(true);
      expect(server.port).toBeGreaterThan(0);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should not throw when stopping non-running server', async () => {
      server = new MockUdpServer();
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('should expose host', async () => {
      server = new MockUdpServer({ host: '127.0.0.1' });
      await server.start();
      expect(server.host).toBe('127.0.0.1');
      expect(server.port).toBeGreaterThan(0);
    });
  });

  describe('Echo Mode', () => {
    it('should echo messages when echo is enabled', async () => {
      server = await createMockUdpServer({ echo: true });

      const promise = new Promise<string>((resolve) => {
        client.on('message', (msg) => resolve(msg.toString()));
      });

      client.send('ping', server.port, server.host);

      const response = await promise;
      expect(response).toBe('ping');
    });

    it('should respond with default when echo is disabled', async () => {
      server = await createMockUdpServer({ echo: false, defaultResponse: 'pong' });

      const promise = new Promise<string>((resolve) => {
        client.on('message', (msg) => resolve(msg.toString()));
      });

      client.send('hello', server.port, server.host);

      const response = await promise;
      expect(response).toBe('pong');
    });
  });

  describe('Custom Handler', () => {
    it('should use custom message handler', async () => {
      server = await createMockUdpServer();
      server.setMessageHandler(({ data }) => {
        const msg = data.toString();
        if (msg === 'hello') return 'world';
        return 'unknown';
      });

      const promise = new Promise<string>((resolve) => {
        client.on('message', (msg) => resolve(msg.toString()));
      });

      client.send('hello', server.port, server.host);

      const response = await promise;
      expect(response).toBe('world');
    });

    it('should support returning void to not respond', async () => {
      server = await createMockUdpServer();
      server.setMessageHandler(() => undefined);

      let received = false;
      client.on('message', () => { received = true; });

      client.send('quiet', server.port, server.host);

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(received).toBe(false);
    });
  });

  describe('Helper Function', () => {
    it('createMockUdpServer should create a running server', async () => {
      server = await createMockUdpServer({ echo: true });
      expect(server.isRunning).toBe(true);

      const promise = new Promise<string>((resolve) => {
        client.on('message', (msg) => resolve(msg.toString()));
      });
      client.send('test', server.port, server.host);
      const response = await promise;
      expect(response).toBe('test');
    });
  });
});
