import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Telnet, createTelnet, telnet } from '../../src/protocols/telnet.js';
import { Socket } from 'node:net';
import { EventEmitter } from 'node:events';

// Mock socket factory
function createMockSocket() {
  const emitter = new EventEmitter();
  // Prevent unhandled error events from crashing tests
  emitter.on('error', () => {});

  const mockSocket = {
    connect: vi.fn((port: number, host: string) => {
      setImmediate(() => emitter.emit('connect'));
    }),
    write: vi.fn((data: Buffer | string) => true),
    end: vi.fn(() => {
      emitter.emit('close');
    }),
    destroy: vi.fn(() => {
      emitter.emit('close');
    }),
    setTimeout: vi.fn(),
    destroyed: false,
    on: (event: string, handler: (...args: unknown[]) => void) => {
      emitter.on(event, handler);
      return mockSocket;
    },
    once: (event: string, handler: (...args: unknown[]) => void) => {
      emitter.once(event, handler);
      return mockSocket;
    },
    off: (event: string, handler: (...args: unknown[]) => void) => {
      emitter.off(event, handler);
      return mockSocket;
    },
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
    removeListener: (event: string, handler: (...args: unknown[]) => void) => {
      emitter.removeListener(event, handler);
      return mockSocket;
    },
    removeAllListeners: (event?: string) => {
      emitter.removeAllListeners(event);
      return mockSocket;
    }
  } as unknown as Socket & { emit: (event: string, ...args: unknown[]) => boolean };

  return mockSocket;
}

// Mock net module
let mockSocket: ReturnType<typeof createMockSocket>;

vi.mock('node:net', () => ({
  Socket: vi.fn().mockImplementation(() => mockSocket)
}));

describe('Telnet Protocol Utility', () => {
  let telnetClient: Telnet;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = createMockSocket();

    telnetClient = createTelnet({
      host: 'router.example.com',
      port: 23,
      username: 'admin',
      password: 'admin',
      timeout: 1000,
      execTimeout: 500
    });
  });

  afterEach(async () => {
    if (telnetClient.isConnected()) {
      await telnetClient.close();
    }
  });

  describe('createTelnet', () => {
    it('should create a Telnet instance', () => {
      const client = createTelnet({ host: 'test.com' });
      expect(client).toBeInstanceOf(Telnet);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      // Simulate server sending shell prompt after connection
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          // Send shell prompt to complete authentication
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('Welcome\r\nrouter# '));
          });
        });
      });

      const result = await telnetClient.connect();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connected successfully');
      expect(telnetClient.isConnected()).toBe(true);
    });

    it('should handle connection errors', async () => {
      mockSocket.connect = vi.fn(() => {
        // Don't emit anything - just let the connection timeout
        // This simulates a connection that never completes
      });

      const client = createTelnet({ host: 'bad.host', timeout: 200 });
      const result = await client.connect();

      expect(result.success).toBe(false);
      expect(result.message?.toLowerCase()).toContain('timeout');
    });

    it('should handle socket timeout', async () => {
      mockSocket.connect = vi.fn(() => {
        setImmediate(() => {
          mockSocket.emit('timeout');
        });
      });

      const client = createTelnet({ host: 'slow.host', timeout: 500 });
      const result = await client.connect();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Connection timeout');
    });
  });

  describe('exec', () => {
    beforeEach(async () => {
      // Set up mock to connect and show prompt
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('router# '));
          });
        });
      });
      await telnetClient.connect();
    });

    it('should execute command and return output', async () => {
      // Mock the response to the command
      mockSocket.write = vi.fn((data: Buffer | string) => {
        const str = data.toString();
        if (str.includes('show version')) {
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('show version\r\nCisco IOS version 15.1\r\nrouter# '));
          });
        }
        return true;
      });

      const result = await telnetClient.exec('show version');

      expect(result.success).toBe(true);
      expect(result.data).toContain('Cisco IOS');
    });

    it('should execute command with options', async () => {
      mockSocket.write = vi.fn((data: Buffer | string) => {
        const str = data.toString();
        if (str.includes('show interfaces')) {
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('show interfaces\r\nGigabit0/0 is up\r\nswitch> '));
          });
        }
        return true;
      });

      const result = await telnetClient.exec('show interfaces', {
        timeout: 5000,
        shellPrompt: /[$#>]/
      });

      expect(result.success).toBe(true);
    });

    it('should throw if not connected', async () => {
      await telnetClient.close();
      await expect(telnetClient.exec('test')).rejects.toThrow('Not connected to Telnet server');
    });

    it('should handle exec timeout', async () => {
      // Don't send any response to cause timeout
      mockSocket.write = vi.fn(() => true);

      const result = await telnetClient.exec('long running command', { timeout: 100 });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Timeout');
    });
  });

  describe('send', () => {
    beforeEach(async () => {
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('router# '));
          });
        });
      });
      await telnetClient.connect();
    });

    it('should send data successfully', async () => {
      const result = await telnetClient.send('ping 8.8.8.8\r\n');

      expect(result.success).toBe(true);
      expect(mockSocket.write).toHaveBeenCalled();
    });

    it('should send with waitFor option', async () => {
      mockSocket.write = vi.fn((data: Buffer | string) => {
        if (data.toString().includes('enable')) {
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('router# '));
          });
        }
        return true;
      });

      const result = await telnetClient.send('enable\r\n', {
        timeout: 3000,
        waitFor: 'router#'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('shell', () => {
    beforeEach(async () => {
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('$ '));
          });
        });
      });
      await telnetClient.connect();
    });

    it('should be an alias for exec', async () => {
      mockSocket.write = vi.fn((data: Buffer | string) => {
        if (data.toString().includes('ls -la')) {
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('ls -la\r\ntotal 100\r\n$ '));
          });
        }
        return true;
      });

      const result = await telnetClient.shell('ls -la');

      expect(result.success).toBe(true);
      expect(result.data).toContain('total 100');
    });
  });

  describe('waitFor', () => {
    beforeEach(async () => {
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('$ '));
          });
        });
      });
      await telnetClient.connect();
    });

    it('should wait for specific pattern', async () => {
      setImmediate(() => {
        mockSocket.emit('data', Buffer.from('some output $ '));
      });

      const result = await telnetClient.waitFor(/\$\s*$/);

      expect(result.success).toBe(true);
    });

    it('should timeout if pattern not found', async () => {
      const result = await telnetClient.waitFor(/never-match/, 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Timeout');
    });
  });

  describe('close', () => {
    it('should close connection', async () => {
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('$ '));
          });
        });
      });

      await telnetClient.connect();
      expect(telnetClient.isConnected()).toBe(true);

      await telnetClient.close();
      expect(telnetClient.isConnected()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should destroy connection immediately', async () => {
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('$ '));
          });
        });
      });

      await telnetClient.connect();
      expect(telnetClient.isConnected()).toBe(true);

      telnetClient.destroy();
      expect(telnetClient.isConnected()).toBe(false);
    });
  });

  describe('getSocket', () => {
    it('should throw if called before connect', () => {
      const client = createTelnet({ host: 'router.local' });
      expect(() => client.getSocket()).toThrow('Not connected. Call connect() first.');
    });

    it('should return underlying socket after connect', async () => {
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('$ '));
          });
        });
      });

      await telnetClient.connect();
      const socket = telnetClient.getSocket();
      expect(socket).toBeDefined();
    });
  });

  describe('telnet helper function', () => {
    it('should execute operation and close connection', async () => {
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('router# '));
          });
        });
      });

      mockSocket.write = vi.fn((data: Buffer | string) => {
        if (data.toString().includes('show version')) {
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('show version\r\nVersion 1.0\r\nrouter# '));
          });
        }
        return true;
      });

      const result = await telnet(
        { host: 'router.local', username: 'admin', password: 'admin', timeout: 1000, execTimeout: 500 },
        async (client) => {
          const execResult = await client.exec('show version');
          return execResult.data;
        }
      );

      expect(result).toContain('Version 1.0');
    });

    it('should close connection even on error', async () => {
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('$ '));
          });
        });
      });

      await expect(
        telnet({ host: 'router.local', timeout: 1000 }, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should handle connection failure in helper', async () => {
      mockSocket.connect = vi.fn(() => {
        // Don't emit anything - just let the connection timeout
      });

      await expect(
        telnet({ host: 'bad.host', timeout: 200 }, async (client) => {
          return await client.exec('test');
        })
      ).rejects.toThrow(/timeout/i); // Connection timeout
    });
  });

  describe('IAC command handling', () => {
    beforeEach(async () => {
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
        });
      });
    });

    it('should respond to DO with WILL for supported options', async () => {
      const connectPromise = telnetClient.connect();

      // Send DO SGA (Suppress Go Ahead) - option we support
      setImmediate(() => {
        mockSocket.emit('data', Buffer.from([255, 253, 3])); // IAC DO SGA
        setImmediate(() => {
          mockSocket.emit('data', Buffer.from('$ ')); // Shell prompt
        });
      });

      await connectPromise;

      // Check that WILL SGA was sent
      const writeCalls = mockSocket.write.mock.calls;
      const willSga = writeCalls.some(call => {
        const buf = Buffer.from(call[0] as string | Buffer);
        return buf[0] === 255 && buf[1] === 251 && buf[2] === 3; // IAC WILL SGA
      });
      expect(willSga).toBe(true);
    });

    it('should respond to DO with WONT for unsupported options', async () => {
      const connectPromise = telnetClient.connect();

      // Send DO for an unsupported option (LINEMODE = 34)
      setImmediate(() => {
        mockSocket.emit('data', Buffer.from([255, 253, 34])); // IAC DO LINEMODE
        setImmediate(() => {
          mockSocket.emit('data', Buffer.from('$ ')); // Shell prompt
        });
      });

      await connectPromise;

      // Check that WONT was sent
      const writeCalls = mockSocket.write.mock.calls;
      const wontLinemode = writeCalls.some(call => {
        const buf = Buffer.from(call[0] as string | Buffer);
        return buf[0] === 255 && buf[1] === 252 && buf[2] === 34; // IAC WONT LINEMODE
      });
      expect(wontLinemode).toBe(true);
    });

    it('should handle escaped IAC bytes (0xFF 0xFF)', async () => {
      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            // Send data with escaped IAC: "test<0xFF>data$ "
            mockSocket.emit('data', Buffer.from([116, 101, 115, 116, 255, 255, 100, 97, 116, 97, 36, 32]));
          });
        });
      });

      await telnetClient.connect();
      // If no crash, the escaped IAC was handled correctly
      expect(telnetClient.isConnected()).toBe(true);
    });
  });

  describe('login automation', () => {
    it('should auto-login when username/password are provided', async () => {
      const client = createTelnet({
        host: 'router.local',
        username: 'admin',
        password: 'secret',
        timeout: 1000
      });

      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          // Send login prompt
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('login: '));
          });
        });
      });

      // Track what's written
      const written: string[] = [];
      mockSocket.write = vi.fn((data: Buffer | string) => {
        const str = data.toString();
        written.push(str);

        // Simulate server response to username
        if (str.includes('admin')) {
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('Password: '));
          });
        }
        // Simulate server response to password
        if (str.includes('secret')) {
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('router# '));
          });
        }
        return true;
      });

      await client.connect();

      // Verify username and password were sent
      expect(written.some(w => w.includes('admin'))).toBe(true);
      expect(written.some(w => w.includes('secret'))).toBe(true);
    });
  });

  describe('configuration options', () => {
    it('should accept all config options', async () => {
      const client = createTelnet({
        host: 'device.local',
        port: 2323,
        timeout: 30000,
        shellPrompt: /[$#>]\s*$/,
        loginPrompt: /login:/i,
        passwordPrompt: /password:/i,
        username: 'admin',
        password: 'secret',
        initialLFCR: true,
        pageSeparator: /--More--/,
        execTimeout: 10000,
        sendTimeout: 5000,
        maxBufferLength: 2 * 1024 * 1024,
        debug: false,
        terminalType: 'vt100',
        windowSize: [120, 40]
      });

      expect(client).toBeInstanceOf(Telnet);

      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('$ '));
          });
        });
      });

      const result = await client.connect();
      expect(result.success).toBe(true);
    });
  });

  describe('EventEmitter interface', () => {
    it('should emit events', async () => {
      const onData = vi.fn();
      const onClose = vi.fn();

      telnetClient.on('data', onData);
      telnetClient.on('close', onClose);

      mockSocket.connect = vi.fn((port: number, host: string) => {
        setImmediate(() => {
          mockSocket.emit('connect');
          setImmediate(() => {
            mockSocket.emit('data', Buffer.from('$ '));
          });
        });
      });

      await telnetClient.connect();

      expect(onData).toHaveBeenCalled();

      await telnetClient.close();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
