import { describe, it, expect, afterEach } from 'vitest';
import { MockWhoisServer, createMockWhoisServer } from 'raffel/testing';
import * as net from 'node:net';

describe('MockWhoisServer', () => {
  let server: MockWhoisServer;

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop', async () => {
      server = new MockWhoisServer();
      await server.start();
      expect(server.isRunning).toBe(true);
      expect(server.port).toBeGreaterThan(0);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should not throw when stopping non-running server', async () => {
      server = new MockWhoisServer();
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('should silently skip start if already running', async () => {
      server = await createMockWhoisServer();
      await expect(server.start()).resolves.toBeUndefined();
    });

    it('should create server via factory', async () => {
      server = await createMockWhoisServer();
      expect(server.isRunning).toBe(true);
    });
  });

  describe('WHOIS query handling', () => {
    it('should respond to example.com (default record)', async () => {
      server = await createMockWhoisServer();

      const response = await sendWhoisQuery(server.port, 'example.com');
      expect(response).toContain('EXAMPLE.COM');
      expect(response).toContain('Mock Registrar');
    });

    it('should respond to raffel.io (default record)', async () => {
      server = await createMockWhoisServer();

      const response = await sendWhoisQuery(server.port, 'raffel.io');
      expect(response).toContain('RAFFEL.IO');
    });

    it('should return not found for unknown domain', async () => {
      server = await createMockWhoisServer();

      const response = await sendWhoisQuery(server.port, 'unknown-nonexistent-domain.xyz');
      expect(response).toContain('No match for');
    });

    it('should support custom records via constructor option', async () => {
      server = await createMockWhoisServer({
        records: {
          'mytest.com': 'Domain Name: MYTEST.COM\r\nRegistrar: My Test Registrar',
        },
      });

      const response = await sendWhoisQuery(server.port, 'mytest.com');
      expect(response).toContain('MYTEST.COM');
      expect(response).toContain('My Test Registrar');
    });

    it('should handle HELP query', async () => {
      server = await createMockWhoisServer();

      const response = await sendWhoisQuery(server.port, 'help');
      expect(response).toContain('Usage');
    });
  });
});

async function sendWhoisQuery(port: number, domain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let response = '';

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(response);
    }, 2000);

    socket.on('connect', () => {
      socket.write(domain + '\r\n');
    });

    socket.on('data', (data) => {
      response += data.toString();
      // Once we have data with a newline, wait briefly then close
      if (response.includes('\n')) {
        setTimeout(() => {
          clearTimeout(timeout);
          socket.destroy();
          resolve(response);
        }, 50);
      }
    });

    socket.on('close', () => {
      clearTimeout(timeout);
      resolve(response);
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
