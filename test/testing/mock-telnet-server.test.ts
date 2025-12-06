import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockTelnetServer } from '../../src/testing/mock-telnet-server.js';
import * as net from 'node:net';

describe('MockTelnetServer', () => {
  let server: MockTelnetServer;

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe('constructor and defaults', () => {
    it('should create server with default options', () => {
      server = new MockTelnetServer();
      expect(server.port).toBe(2323);
      expect(server.host).toBe('127.0.0.1');
      expect(server.isRunning).toBe(false);
    });

    it('should create server with custom options', () => {
      server = new MockTelnetServer({ port: 2324, host: '0.0.0.0', echo: false, delay: 100 });
      expect(server.port).toBe(2324);
      expect(server.host).toBe('0.0.0.0');
    });

    it('should return url property', () => {
      server = new MockTelnetServer({ port: 2325, host: '127.0.0.1' });
      expect(server.url).toBe('telnet://127.0.0.1:2325');
    });
  });

  describe('lifecycle', () => {
    it('should start and stop server', async () => {
      server = new MockTelnetServer({ port: 12323 });
      expect(server.isRunning).toBe(false);

      await server.start();
      expect(server.isRunning).toBe(true);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should throw if starting already started server', async () => {
      server = new MockTelnetServer({ port: 12324 });
      await server.start();

      await expect(server.start()).rejects.toThrow('Server already started');
    });

    it('should not throw when stopping already stopped server', async () => {
      server = new MockTelnetServer({ port: 12325 });
      await server.stop(); // Should not throw
    });

    it('should create server via static factory', async () => {
      server = await MockTelnetServer.create({ port: 12326 });
      expect(server.isRunning).toBe(true);
    });
  });

  describe('command management', () => {
    beforeEach(() => {
      server = new MockTelnetServer({ port: 12327 });
    });

    it('should add and get command', () => {
      server.addCommand('test', 'test response');
      const handler = server.getCommand('test');
      expect(handler).toBe('test response');
    });

    it('should get command case-insensitively', () => {
      server.addCommand('TEST', 'test response');
      const handler = server.getCommand('test');
      expect(handler).toBe('test response');
    });

    it('should add command with function handler', () => {
      server.addCommand('greet', (args) => `Hello ${args.join(' ')}`);
      const handler = server.getCommand('greet');
      expect(typeof handler).toBe('function');
    });

    it('should remove command', () => {
      server.addCommand('remove-me', 'test');
      expect(server.getCommand('remove-me')).toBeDefined();

      server.removeCommand('remove-me');
      expect(server.getCommand('remove-me')).toBeUndefined();
    });

    it('should clear all commands and restore defaults', () => {
      server.addCommand('custom', 'custom response');
      server.clearCommands();

      expect(server.getCommand('custom')).toBeUndefined();
      expect(server.getCommand('help')).toBeDefined();
      expect(server.getCommand('ping')).toBeDefined();
    });

    it('should have default commands', () => {
      expect(server.getCommand('help')).toBeDefined();
      expect(server.getCommand('echo')).toBeDefined();
      expect(server.getCommand('date')).toBeDefined();
      expect(server.getCommand('time')).toBeDefined();
      expect(server.getCommand('datetime')).toBeDefined();
      expect(server.getCommand('uptime')).toBeDefined();
      expect(server.getCommand('version')).toBeDefined();
      expect(server.getCommand('whoami')).toBeDefined();
      expect(server.getCommand('sessions')).toBeDefined();
      expect(server.getCommand('clear')).toBeDefined();
      expect(server.getCommand('quit')).toBeDefined();
      expect(server.getCommand('exit')).toBeDefined();
      expect(server.getCommand('ping')).toBeDefined();
      expect(server.getCommand('reverse')).toBeDefined();
      expect(server.getCommand('upper')).toBeDefined();
      expect(server.getCommand('lower')).toBeDefined();
      expect(server.getCommand('count')).toBeDefined();
      expect(server.getCommand('sleep')).toBeDefined();
    });
  });

  describe('statistics', () => {
    it('should return statistics copy', () => {
      server = new MockTelnetServer({ port: 12328 });
      const stats = server.statistics;
      expect(stats.connectionsTotal).toBe(0);
      expect(stats.connectionsActive).toBe(0);
      expect(stats.commandsReceived).toBe(0);
      expect(stats.commandLog).toEqual([]);
    });

    it('should reset statistics', async () => {
      server = new MockTelnetServer({ port: 12329 });
      await server.start();
      server.reset();
      expect(server.statistics.commandsReceived).toBe(0);
    });
  });

  describe('events', () => {
    it('should emit start event', async () => {
      server = new MockTelnetServer({ port: 12330 });
      let started = false;
      server.on('start', () => { started = true; });

      await server.start();
      expect(started).toBe(true);
    });

    it('should emit stop event', async () => {
      server = new MockTelnetServer({ port: 12331 });
      await server.start();

      let stopped = false;
      server.on('stop', () => { stopped = true; });

      await server.stop();
      expect(stopped).toBe(true);
    });

    it('should emit reset event', async () => {
      server = new MockTelnetServer({ port: 12332 });
      await server.start();

      let resetTriggered = false;
      server.on('reset', () => { resetTriggered = true; });

      server.reset();
      expect(resetTriggered).toBe(true);
    });
  });

  describe('telnet connection handling', () => {
    it('should accept connections and send banner', async () => {
      server = await MockTelnetServer.create({ port: 12333 });

      const response = await sendTelnetCommand(12333, '');
      expect(response).toContain('Welcome');
      expect(server.statistics.connectionsTotal).toBe(1);
    });

    it('should respond to ping command', async () => {
      server = await MockTelnetServer.create({ port: 12334 });

      const response = await sendTelnetCommand(12334, 'ping');
      expect(response).toContain('pong');
    });

    it('should respond to echo command', async () => {
      server = await MockTelnetServer.create({ port: 12335 });

      const response = await sendTelnetCommand(12335, 'echo hello world');
      expect(response).toContain('hello world');
    });

    it('should respond to help command', async () => {
      server = await MockTelnetServer.create({ port: 12336 });

      const response = await sendTelnetCommand(12336, 'help');
      expect(response).toContain('Available commands');
    });

    it('should respond with unknown command message', async () => {
      server = await MockTelnetServer.create({ port: 12337 });

      const response = await sendTelnetCommand(12337, 'nonexistent');
      expect(response).toContain('Unknown command');
    });

    it('should log commands', async () => {
      server = await MockTelnetServer.create({ port: 12338 });

      await sendTelnetCommand(12338, 'ping');

      const stats = server.statistics;
      expect(stats.commandsReceived).toBe(1);
      expect(stats.commandLog.length).toBe(1);
      expect(stats.commandLog[0].command).toBe('ping');
    });

    it('should emit command event', async () => {
      server = await MockTelnetServer.create({ port: 12339 });

      let commandReceived = '';
      server.on('command', (cmd) => {
        commandReceived = cmd;
      });

      await sendTelnetCommand(12339, 'ping');
      expect(commandReceived).toBe('ping');
    });

    it('should track active sessions', async () => {
      server = await MockTelnetServer.create({ port: 12340 });
      expect(server.activeSessions).toBe(0);
    });

    it('should execute custom command handler', async () => {
      server = await MockTelnetServer.create({ port: 12341 });
      server.addCommand('custom', () => 'custom response');

      const response = await sendTelnetCommand(12341, 'custom');
      expect(response).toContain('custom response');
    });

    it('should execute string command handler', async () => {
      server = await MockTelnetServer.create({ port: 12342 });
      server.addCommand('static', 'static response');

      const response = await sendTelnetCommand(12342, 'static');
      expect(response).toContain('static response');
    });
  });

  describe('session management', () => {
    it('should get session by id', async () => {
      server = await MockTelnetServer.create({ port: 12343 });

      // Session doesn't exist until connection
      expect(server.getSession('session-999')).toBeUndefined();
    });

    it('should broadcast to all sessions', async () => {
      server = await MockTelnetServer.create({ port: 12344 });

      // Should not throw even with no sessions
      server.broadcast('test message');
    });

    it('should return false when disconnecting non-existent session', async () => {
      server = await MockTelnetServer.create({ port: 12345 });

      const result = server.disconnectSession('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('default commands behavior', () => {
    it('should execute upper command', async () => {
      server = await MockTelnetServer.create({ port: 12346 });

      const response = await sendTelnetCommand(12346, 'upper hello');
      expect(response).toContain('HELLO');
    });

    it('should execute lower command', async () => {
      server = await MockTelnetServer.create({ port: 12347 });

      const response = await sendTelnetCommand(12347, 'lower HELLO');
      expect(response).toContain('hello');
    });

    it('should execute reverse command', async () => {
      server = await MockTelnetServer.create({ port: 12348 });

      const response = await sendTelnetCommand(12348, 'reverse abc');
      expect(response).toContain('cba');
    });

    it('should execute count command', async () => {
      server = await MockTelnetServer.create({ port: 12349 });

      const response = await sendTelnetCommand(12349, 'count hello');
      expect(response).toContain('5 characters');
    });
  });
});

// Helper function to send a telnet command
async function sendTelnetCommand(port: number, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let response = '';

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(response); // Return what we have
    }, 2000);

    socket.on('connect', () => {
      if (command) {
        // Wait a bit for banner, then send command
        setTimeout(() => {
          socket.write(command + '\r\n');
          // Wait for response
          setTimeout(() => {
            clearTimeout(timeout);
            socket.destroy();
            resolve(response);
          }, 500);
        }, 200);
      } else {
        // Just read initial banner
        setTimeout(() => {
          clearTimeout(timeout);
          socket.destroy();
          resolve(response);
        }, 500);
      }
    });

    socket.on('data', (data) => {
      response += data.toString();
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
