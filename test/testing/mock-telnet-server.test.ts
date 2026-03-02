import { describe, it, expect, afterEach } from 'vitest';
import { MockTelnetServer, createMockTelnetServer } from 'raffel/testing';
import * as net from 'node:net';

describe('MockTelnetServer', () => {
  let server: MockTelnetServer;

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop', async () => {
      server = new MockTelnetServer();
      await server.start();
      expect(server.isRunning).toBe(true);
      expect(server.port).toBeGreaterThan(0);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should not throw when stopping non-running server', async () => {
      server = new MockTelnetServer();
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('should silently skip start if already running', async () => {
      server = await createMockTelnetServer();
      await expect(server.start()).resolves.toBeUndefined();
    });

    it('should create server via factory', async () => {
      server = await createMockTelnetServer();
      expect(server.isRunning).toBe(true);
    });
  });

  describe('Telnet connection handling', () => {
    it('should send banner on connect', async () => {
      server = await createMockTelnetServer();

      const response = await sendTelnetCommand(server.port, null);
      expect(response).toContain('Telnet');
    });

    it('should send custom banner', async () => {
      server = await createMockTelnetServer({ banner: 'Custom Banner\r\n' });

      const response = await sendTelnetCommand(server.port, null);
      expect(response).toContain('Custom Banner');
    });

    it('should respond to PING command', async () => {
      server = await createMockTelnetServer();

      const response = await sendTelnetCommand(server.port, 'PING');
      expect(response).toContain('PONG');
    });

    it('should respond to ECHO command', async () => {
      server = await createMockTelnetServer();

      const response = await sendTelnetCommand(server.port, 'ECHO hello world');
      expect(response).toContain('hello world');
    });

    it('should respond to HELP command', async () => {
      server = await createMockTelnetServer();

      const response = await sendTelnetCommand(server.port, 'HELP');
      expect(response).toContain('HELP');
    });

    it('should respond to TIME command', async () => {
      server = await createMockTelnetServer();

      const response = await sendTelnetCommand(server.port, 'TIME');
      // Should contain an ISO-like date string
      expect(response).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should respond to unknown commands', async () => {
      server = await createMockTelnetServer();

      const response = await sendTelnetCommand(server.port, 'UNKNOWN_CMD');
      expect(response).toContain('Unknown command');
    });

    it('should handle QUIT command', async () => {
      server = await createMockTelnetServer();

      const response = await sendTelnetCommand(server.port, 'QUIT');
      expect(response).toContain('Bye');
    });

    it('should support custom commands via setCommand', async () => {
      server = await createMockTelnetServer();
      server.setCommand('CUSTOM', () => 'custom response\r\n');

      const response = await sendTelnetCommand(server.port, 'CUSTOM');
      expect(response).toContain('custom response');
    });
  });
});

async function sendTelnetCommand(port: number, command: string | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let response = '';
    let bannerReceived = false;

    const done = () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(response);
    };

    const timeout = setTimeout(done, 2000);

    socket.on('data', (data) => {
      response += data.toString();

      if (!bannerReceived) {
        bannerReceived = true;

        if (!command) {
          done();
          return;
        }

        // Send command after receiving banner
        setTimeout(() => {
          socket.write(command + '\r\n');
        }, 20);
        return;
      }

      // After sending command, collect response for a bit then resolve
      // (for QUIT, the socket closes, handled by 'close' event)
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
