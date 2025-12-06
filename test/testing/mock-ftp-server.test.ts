import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockFtpServer } from '../../src/testing/mock-ftp-server.js';
import * as net from 'node:net';

describe('MockFtpServer', () => {
  let server: MockFtpServer;

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe('constructor and defaults', () => {
    it('should create server with default options', () => {
      server = new MockFtpServer();
      expect(server.port).toBe(2121);
      expect(server.host).toBe('127.0.0.1');
      expect(server.isRunning).toBe(false);
    });

    it('should create server with custom options', () => {
      server = new MockFtpServer({ port: 2122, host: '0.0.0.0', delay: 100 });
      expect(server.port).toBe(2122);
      expect(server.host).toBe('0.0.0.0');
    });

    it('should return url property', () => {
      server = new MockFtpServer({ port: 2123, host: '127.0.0.1' });
      expect(server.url).toBe('ftp://127.0.0.1:2123');
    });
  });

  describe('lifecycle', () => {
    it('should start and stop server', async () => {
      server = new MockFtpServer({ port: 12121 });
      expect(server.isRunning).toBe(false);

      await server.start();
      expect(server.isRunning).toBe(true);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should throw if starting already started server', async () => {
      server = new MockFtpServer({ port: 12122 });
      await server.start();

      await expect(server.start()).rejects.toThrow('Server already started');
    });

    it('should not throw when stopping already stopped server', async () => {
      server = new MockFtpServer({ port: 12123 });
      await server.stop(); // Should not throw
    });

    it('should create server via static factory', async () => {
      server = await MockFtpServer.create({ port: 12124 });
      expect(server.isRunning).toBe(true);
    });
  });

  describe('file system management', () => {
    beforeEach(() => {
      server = new MockFtpServer({ port: 12125 });
    });

    it('should add and get file', () => {
      server.addFile('/test.txt', 'test content');
      const file = server.getFile('/test.txt');
      expect(file).toBeDefined();
      expect(file?.content).toBe('test content');
      expect(file?.size).toBe(12);
      expect(file?.isDirectory).toBe(false);
    });

    it('should add file with Buffer content', () => {
      const buffer = Buffer.from('binary content');
      server.addFile('/binary.dat', buffer);
      const file = server.getFile('/binary.dat');
      expect(file).toBeDefined();
      expect(file?.size).toBe(14);
    });

    it('should add directory', () => {
      server.addDirectory('/newdir');
      const dir = server.getFile('/newdir');
      expect(dir).toBeDefined();
      expect(dir?.isDirectory).toBe(true);
    });

    it('should create parent directories automatically', () => {
      server.addFile('/deep/nested/file.txt', 'content');
      expect(server.getFile('/deep')).toBeDefined();
      expect(server.getFile('/deep/nested')).toBeDefined();
      expect(server.getFile('/deep/nested/file.txt')).toBeDefined();
    });

    it('should remove file', () => {
      server.addFile('/remove.txt', 'content');
      expect(server.getFile('/remove.txt')).toBeDefined();

      const result = server.removeFile('/remove.txt');
      expect(result).toBe(true);
      expect(server.getFile('/remove.txt')).toBeUndefined();
    });

    it('should return false when removing non-existent file', () => {
      const result = server.removeFile('/nonexistent.txt');
      expect(result).toBe(false);
    });

    it('should list directory contents', () => {
      server.addFile('/listdir/file1.txt', 'content1');
      server.addFile('/listdir/file2.txt', 'content2');
      server.addDirectory('/listdir/subdir');

      const entries = server.listDirectory('/listdir');
      expect(entries).toContain('file1.txt');
      expect(entries).toContain('file2.txt');
      expect(entries).toContain('subdir');
    });

    it('should clear all files and restore defaults', () => {
      server.addFile('/custom.txt', 'custom');
      server.clearFiles();

      expect(server.getFile('/custom.txt')).toBeUndefined();
      expect(server.getFile('/welcome.txt')).toBeDefined();
      expect(server.getFile('/readme.md')).toBeDefined();
      expect(server.getFile('/data')).toBeDefined();
    });

    it('should have default files', () => {
      expect(server.getFile('/')).toBeDefined();
      expect(server.getFile('/welcome.txt')).toBeDefined();
      expect(server.getFile('/readme.md')).toBeDefined();
      expect(server.getFile('/data')).toBeDefined();
      expect(server.getFile('/data/sample.json')).toBeDefined();
      expect(server.getFile('/data/config.txt')).toBeDefined();
      expect(server.getFile('/public')).toBeDefined();
      expect(server.getFile('/public/index.html')).toBeDefined();
    });

    it('should normalize paths correctly', () => {
      server.addFile('no-leading-slash.txt', 'content');
      expect(server.getFile('/no-leading-slash.txt')).toBeDefined();

      server.addFile('/trailing-slash/', 'content');
      expect(server.getFile('/trailing-slash')).toBeDefined();

      server.addFile('//double//slashes//file.txt', 'content');
      expect(server.getFile('/double/slashes/file.txt')).toBeDefined();
    });
  });

  describe('statistics', () => {
    it('should return statistics copy', () => {
      server = new MockFtpServer({ port: 12126 });
      const stats = server.statistics;
      expect(stats.connectionsTotal).toBe(0);
      expect(stats.commandsReceived).toBe(0);
      expect(stats.filesDownloaded).toBe(0);
      expect(stats.filesUploaded).toBe(0);
      expect(stats.bytesTransferred).toBe(0);
      expect(stats.commandLog).toEqual([]);
    });

    it('should reset statistics', async () => {
      server = new MockFtpServer({ port: 12127 });
      await server.start();
      server.reset();
      expect(server.statistics.commandsReceived).toBe(0);
    });
  });

  describe('events', () => {
    it('should emit start event', async () => {
      server = new MockFtpServer({ port: 12128 });
      let started = false;
      server.on('start', () => { started = true; });

      await server.start();
      expect(started).toBe(true);
    });

    it('should emit stop event', async () => {
      server = new MockFtpServer({ port: 12129 });
      await server.start();

      let stopped = false;
      server.on('stop', () => { stopped = true; });

      await server.stop();
      expect(stopped).toBe(true);
    });

    it('should emit reset event', async () => {
      server = new MockFtpServer({ port: 12130 });
      await server.start();

      let resetTriggered = false;
      server.on('reset', () => { resetTriggered = true; });

      server.reset();
      expect(resetTriggered).toBe(true);
    });
  });

  describe('FTP connection handling', () => {
    it('should accept connections and send welcome message', async () => {
      server = await MockFtpServer.create({ port: 12131 });

      const response = await sendFtpCommand(12131, null);
      expect(response).toContain('220');
      expect(response).toContain('Welcome');
      expect(server.statistics.connectionsTotal).toBe(1);
    });

    it('should handle USER command with anonymous', async () => {
      server = await MockFtpServer.create({ port: 12132 });

      const response = await sendFtpCommand(12132, 'USER anonymous');
      expect(response).toContain('230'); // Login successful
    });

    it('should handle USER command with regular user', async () => {
      server = await MockFtpServer.create({ port: 12133, anonymous: false });

      const response = await sendFtpCommand(12133, 'USER user');
      expect(response).toContain('331'); // Password required
    });

    it('should handle PASS command with correct password', async () => {
      server = await MockFtpServer.create({ port: 12134 });

      const response = await sendFtpCommands(12134, ['USER user', 'PASS pass']);
      expect(response).toContain('230'); // Login successful
    });

    it('should handle PASS command with incorrect password', async () => {
      server = await MockFtpServer.create({ port: 12135 });

      const response = await sendFtpCommands(12135, ['USER user', 'PASS wrong']);
      expect(response).toContain('530'); // Login incorrect
    });

    it('should handle SYST command', async () => {
      server = await MockFtpServer.create({ port: 12136 });

      const response = await sendFtpCommands(12136, ['USER anonymous', 'SYST']);
      expect(response).toContain('215');
      expect(response).toContain('UNIX');
    });

    it('should handle FEAT command', async () => {
      server = await MockFtpServer.create({ port: 12137 });

      const response = await sendFtpCommands(12137, ['USER anonymous', 'FEAT']);
      expect(response).toContain('211');
      expect(response).toContain('PASV');
    });

    it('should handle PWD command', async () => {
      server = await MockFtpServer.create({ port: 12138 });

      const response = await sendFtpCommands(12138, ['USER anonymous', 'PWD']);
      expect(response).toContain('257');
      expect(response).toContain('/');
    });

    it('should handle TYPE command', async () => {
      server = await MockFtpServer.create({ port: 12139 });

      const responseAscii = await sendFtpCommands(12139, ['USER anonymous', 'TYPE A']);
      expect(responseAscii).toContain('200');
      expect(responseAscii).toContain('ASCII');
    });

    it('should handle TYPE I command', async () => {
      server = await MockFtpServer.create({ port: 12140 });

      const responseBinary = await sendFtpCommands(12140, ['USER anonymous', 'TYPE I']);
      expect(responseBinary).toContain('200');
      expect(responseBinary).toContain('Binary');
    });

    it('should handle NOOP command', async () => {
      server = await MockFtpServer.create({ port: 12141 });

      const response = await sendFtpCommands(12141, ['USER anonymous', 'NOOP']);
      expect(response).toContain('200');
    });

    it('should handle QUIT command', async () => {
      server = await MockFtpServer.create({ port: 12142 });

      const response = await sendFtpCommands(12142, ['USER anonymous', 'QUIT']);
      expect(response).toContain('221');
      expect(response).toContain('Goodbye');
    });

    it('should handle unknown command', async () => {
      server = await MockFtpServer.create({ port: 12143 });

      const response = await sendFtpCommands(12143, ['USER anonymous', 'UNKNOWN']);
      expect(response).toContain('502');
    });

    it('should require authentication for protected commands', async () => {
      server = await MockFtpServer.create({ port: 12144, anonymous: false });

      const response = await sendFtpCommands(12144, ['CWD /data']);
      expect(response).toContain('530'); // Please login first
    });

    it('should log commands', async () => {
      server = await MockFtpServer.create({ port: 12145 });

      await sendFtpCommands(12145, ['USER anonymous', 'PWD']);

      const stats = server.statistics;
      expect(stats.commandsReceived).toBeGreaterThanOrEqual(2);
      expect(stats.commandLog.some(log => log.command.includes('USER'))).toBe(true);
    });

    it('should emit command event', async () => {
      server = await MockFtpServer.create({ port: 12146 });

      let commandReceived = '';
      server.on('command', (cmd) => {
        commandReceived = cmd;
      });

      await sendFtpCommand(12146, 'USER anonymous');
      expect(commandReceived).toBe('USER');
    });
  });

  describe('FTP directory commands', () => {
    it('should handle CWD command', async () => {
      server = await MockFtpServer.create({ port: 12147 });
      server.addDirectory('/testdir');

      const response = await sendFtpCommands(12147, ['USER anonymous', 'CWD /testdir']);
      expect(response).toContain('250');
    });

    it('should handle CWD to non-existent directory', async () => {
      server = await MockFtpServer.create({ port: 12148 });

      const response = await sendFtpCommands(12148, ['USER anonymous', 'CWD /nonexistent']);
      expect(response).toContain('550');
    });

    it('should handle CDUP command', async () => {
      server = await MockFtpServer.create({ port: 12149 });
      server.addDirectory('/parent/child');

      const response = await sendFtpCommands(12149, ['USER anonymous', 'CWD /parent/child', 'CDUP']);
      expect(response).toContain('250');
    });

    it('should handle MKD command', async () => {
      server = await MockFtpServer.create({ port: 12150 });

      const response = await sendFtpCommands(12150, ['USER anonymous', 'MKD /newdir']);
      expect(response).toContain('257');
      expect(server.getFile('/newdir')).toBeDefined();
    });

    it('should handle RMD command', async () => {
      server = await MockFtpServer.create({ port: 12151 });
      server.addDirectory('/removeme');

      const response = await sendFtpCommands(12151, ['USER anonymous', 'RMD /removeme']);
      expect(response).toContain('250');
      expect(server.getFile('/removeme')).toBeUndefined();
    });

    it('should handle RMD for non-existent directory', async () => {
      server = await MockFtpServer.create({ port: 12152 });

      const response = await sendFtpCommands(12152, ['USER anonymous', 'RMD /nonexistent']);
      expect(response).toContain('550');
    });
  });

  describe('FTP file commands', () => {
    it('should handle SIZE command', async () => {
      server = await MockFtpServer.create({ port: 12153 });
      server.addFile('/sizefile.txt', 'hello world');

      const response = await sendFtpCommands(12153, ['USER anonymous', 'SIZE /sizefile.txt']);
      expect(response).toContain('213');
      expect(response).toContain('11');
    });

    it('should handle SIZE for non-existent file', async () => {
      server = await MockFtpServer.create({ port: 12154 });

      const response = await sendFtpCommands(12154, ['USER anonymous', 'SIZE /nonexistent.txt']);
      expect(response).toContain('550');
    });

    it('should handle MDTM command', async () => {
      server = await MockFtpServer.create({ port: 12155 });
      server.addFile('/timefile.txt', 'content');

      const response = await sendFtpCommands(12155, ['USER anonymous', 'MDTM /timefile.txt']);
      expect(response).toContain('213');
    });

    it('should handle MDTM for non-existent file', async () => {
      server = await MockFtpServer.create({ port: 12156 });

      const response = await sendFtpCommands(12156, ['USER anonymous', 'MDTM /nonexistent.txt']);
      expect(response).toContain('550');
    });

    it('should handle DELE command', async () => {
      server = await MockFtpServer.create({ port: 12157 });
      server.addFile('/deleteme.txt', 'content');

      const response = await sendFtpCommands(12157, ['USER anonymous', 'DELE /deleteme.txt']);
      expect(response).toContain('250');
      expect(server.getFile('/deleteme.txt')).toBeUndefined();
    });

    it('should handle DELE for non-existent file', async () => {
      server = await MockFtpServer.create({ port: 12158 });

      const response = await sendFtpCommands(12158, ['USER anonymous', 'DELE /nonexistent.txt']);
      expect(response).toContain('550');
    });
  });

  describe('FTP passive mode', () => {
    it('should handle PASV command', async () => {
      server = await MockFtpServer.create({ port: 12159 });

      const response = await sendFtpCommands(12159, ['USER anonymous', 'PASV']);
      expect(response).toContain('227');
      expect(response).toContain('Entering Passive Mode');
    });
  });

  describe('authentication edge cases', () => {
    it('should handle PASS when already authenticated', async () => {
      server = await MockFtpServer.create({ port: 12160 });

      const response = await sendFtpCommands(12160, ['USER anonymous', 'PASS anything']);
      expect(response).toContain('230'); // Already logged in
    });

    it('should handle anonymous with email password', async () => {
      server = await MockFtpServer.create({ port: 12161 });

      const response = await sendFtpCommands(12161, ['USER anonymous', 'PASS user@email.com']);
      expect(response).toContain('230');
    });
  });
});

// Helper function to send a single FTP command
async function sendFtpCommand(port: number, command: string | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let response = '';

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(response);
    }, 3000);

    socket.on('connect', () => {
      if (command) {
        setTimeout(() => {
          socket.write(command + '\r\n');
          setTimeout(() => {
            clearTimeout(timeout);
            socket.destroy();
            resolve(response);
          }, 500);
        }, 200);
      } else {
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

// Helper function to send multiple FTP commands
async function sendFtpCommands(port: number, commands: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let response = '';
    let commandIndex = 0;

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(response);
    }, 5000);

    const sendNextCommand = () => {
      if (commandIndex < commands.length) {
        setTimeout(() => {
          socket.write(commands[commandIndex++] + '\r\n');
          if (commandIndex < commands.length) {
            sendNextCommand();
          } else {
            setTimeout(() => {
              clearTimeout(timeout);
              socket.destroy();
              resolve(response);
            }, 500);
          }
        }, 150);
      }
    };

    socket.on('connect', () => {
      setTimeout(sendNextCommand, 200);
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
