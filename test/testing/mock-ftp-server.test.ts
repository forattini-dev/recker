import { describe, it, expect, afterEach } from 'vitest';
import { MockFtpServer, createMockFtpServer } from 'raffel/testing';
import * as net from 'node:net';

describe('MockFtpServer', () => {
  let server: MockFtpServer;

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop', async () => {
      server = new MockFtpServer();
      await server.start();
      expect(server.isRunning).toBe(true);
      expect(server.port).toBeGreaterThan(0);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should not throw when stopping non-running server', async () => {
      server = new MockFtpServer();
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('should silently skip start if already running', async () => {
      server = await createMockFtpServer();
      await expect(server.start()).resolves.toBeUndefined();
    });

    it('should create server via factory', async () => {
      server = await createMockFtpServer();
      expect(server.isRunning).toBe(true);
    });
  });

  describe('FTP connection handling', () => {
    it('should send welcome message on connect', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommand(server.port, null);
      expect(response).toContain('220');
    });

    it('should handle USER command', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommands(server.port, ['USER testuser']);
      expect(response).toContain('331');
    });

    it('should handle USER + PASS sequence', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommands(server.port, ['USER testuser', 'PASS password']);
      expect(response).toContain('230');
    });

    it('should handle SYST command', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommands(server.port, ['USER testuser', 'PASS p', 'SYST']);
      expect(response).toContain('215');
      expect(response).toContain('UNIX');
    });

    it('should handle PWD command', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommands(server.port, ['USER testuser', 'PASS p', 'PWD']);
      expect(response).toContain('257');
    });

    it('should handle CWD command', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommands(server.port, ['USER testuser', 'PASS p', 'CWD /data']);
      expect(response).toContain('250');
    });

    it('should handle TYPE command', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommands(server.port, ['USER testuser', 'PASS p', 'TYPE I']);
      expect(response).toContain('200');
    });

    it('should handle PASV command', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommands(server.port, ['USER testuser', 'PASS p', 'PASV']);
      expect(response).toContain('227');
    });

    it('should handle NOOP command', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommands(server.port, ['USER testuser', 'PASS p', 'NOOP']);
      expect(response).toContain('200');
    });

    it('should handle QUIT command', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommands(server.port, ['USER testuser', 'PASS p', 'QUIT']);
      expect(response).toContain('221');
    });

    it('should respond with 500 for unknown command', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommands(server.port, ['USER testuser', 'PASS p', 'UNKNOWNCMD']);
      expect(response).toContain('500');
    });

    it('should handle PASS without prior USER', async () => {
      server = await createMockFtpServer();

      const response = await sendFtpCommands(server.port, ['PASS password']);
      expect(response).toContain('503');
    });
  });
});

async function sendFtpCommand(port: number, command: string | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let response = '';
    let hasWelcome = false;

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(response);
    }, 3000);

    socket.on('data', (data) => {
      const chunk = data.toString();
      response += chunk;

      if (!hasWelcome && chunk.includes('220')) {
        hasWelcome = true;

        if (!command) {
          clearTimeout(timeout);
          socket.destroy();
          resolve(response);
          return;
        }

        socket.write(command + '\r\n');
        return;
      }

      if (hasWelcome && command) {
        if (chunk.match(/\d{3}[ -].+\r?\n/)) {
          clearTimeout(timeout);
          socket.destroy();
          resolve(response);
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function sendFtpCommands(port: number, commands: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let response = '';
    let commandIndex = 0;
    let hasWelcome = false;

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(response);
    }, 3000);

    const sendNext = () => {
      if (commandIndex < commands.length) {
        socket.write(commands[commandIndex++] + '\r\n');
      } else {
        clearTimeout(timeout);
        socket.destroy();
        resolve(response);
      }
    };

    socket.on('data', (data) => {
      const chunk = data.toString();
      response += chunk;

      if (!hasWelcome && chunk.includes('220')) {
        hasWelcome = true;
        sendNext();
        return;
      }

      if (hasWelcome && chunk.match(/\d{3}[ -].+\r?\n/)) {
        sendNext();
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
