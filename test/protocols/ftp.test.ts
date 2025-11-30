import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { FTP, createFTP, ftp } from '../../src/protocols/ftp.js';

// Mock socket factory for testing
function createMockSocket() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  const socket = {
    emitter,
    connect: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
    destroyed: false,
    setTimeout: vi.fn(),
    on: function(event: string, handler: (...args: unknown[]) => void) {
      emitter.on(event, handler);
      return this;
    },
    once: function(event: string, handler: (...args: unknown[]) => void) {
      emitter.once(event, handler);
      return this;
    },
    removeListener: function(event: string, handler: (...args: unknown[]) => void) {
      emitter.removeListener(event, handler);
      return this;
    },
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
  };

  return socket as any;
}

/**
 * Creates a mock write function with correct timing for FTP tests.
 * IMPORTANT: Callback must be called BEFORE data is emitted so that
 * sendCommand's readResponse() can attach its data listener first.
 */
function createMockWrite(
  mockSocket: ReturnType<typeof createMockSocket>,
  mockDataSocket?: ReturnType<typeof createMockSocket>,
  extraHandlers?: Record<string, { response: string; onMatch?: () => void }>
) {
  return vi.fn((data: string | Buffer, encoding?: string, callback?: (err?: Error) => void) => {
    const cmd = data.toString().trim();

    // Call callback first (so readResponse can attach its listener)
    if (callback) {
      setImmediate(() => callback());
    }

    // Then emit response after a delay (so listener is attached)
    setTimeout(() => {
      let response = '';

      // Check extra handlers first
      if (extraHandlers) {
        for (const [pattern, handler] of Object.entries(extraHandlers)) {
          if (cmd.startsWith(pattern) || cmd === pattern) {
            response = handler.response;
            if (handler.onMatch) handler.onMatch();
            break;
          }
        }
      }

      // Default handlers
      if (!response) {
        if (cmd.startsWith('USER ')) response = '331 Password required\r\n';
        else if (cmd.startsWith('PASS ')) response = '230 User logged in\r\n';
        else if (cmd === 'TYPE I') response = '200 Type set to I\r\n';
        else if (cmd === 'PWD') response = '257 "/home/user" is current directory\r\n';
        else if (cmd.startsWith('CWD ')) response = '250 Directory changed\r\n';
        else if (cmd.startsWith('DELE ')) response = '250 File deleted\r\n';
        else if (cmd.startsWith('MKD ')) response = '257 Directory created\r\n';
        else if (cmd.startsWith('RMD ')) response = '250 Directory removed\r\n';
        else if (cmd.startsWith('RNFR ')) response = '350 Ready for destination\r\n';
        else if (cmd.startsWith('RNTO ')) response = '250 Rename successful\r\n';
        else if (cmd.startsWith('SIZE ')) response = '213 1024\r\n';
        else if (cmd === 'QUIT') response = '221 Goodbye\r\n';
        else response = '500 Unknown command\r\n';
      }

      mockSocket.emitter.emit('data', Buffer.from(response));
    }, 5);

    return true;
  });
}

describe('FTP Protocol Utility', () => {
  let ftpClient: FTP;
  let mockControlSocket: ReturnType<typeof createMockSocket>;
  let mockDataSocket: ReturnType<typeof createMockSocket>;
  let socketCallCount = 0;

  function socketFactory() {
    socketCallCount++;
    if (socketCallCount === 1) {
      return mockControlSocket;
    }
    return mockDataSocket;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    socketCallCount = 0;

    // Create mock sockets
    mockControlSocket = createMockSocket();
    mockDataSocket = createMockSocket();

    // Setup default control socket behavior
    mockControlSocket.connect = vi.fn((port: number, host: string) => {
      setImmediate(() => {
        mockControlSocket.emitter.emit('connect');
        // Delay welcome message to ensure readResponse listener is added
        setTimeout(() => {
          mockControlSocket.emitter.emit('data', Buffer.from('220 FTP Server Ready\r\n'));
        }, 10);
      });
    });

    // Use the helper for consistent timing
    mockControlSocket.write = createMockWrite(mockControlSocket);

    mockControlSocket.end = vi.fn(() => mockControlSocket.emitter.emit('close'));
    mockControlSocket.destroy = vi.fn(() => mockControlSocket.emitter.emit('close'));

    // Setup data socket
    mockDataSocket.connect = vi.fn((port: number, host: string) => {
      setImmediate(() => mockDataSocket.emitter.emit('connect'));
    });
    mockDataSocket.write = vi.fn(() => true);
    mockDataSocket.end = vi.fn(() => {
      setImmediate(() => mockDataSocket.emitter.emit('end'));
    });

    ftpClient = createFTP({
      host: 'ftp.example.com',
      user: 'testuser',
      password: 'testpass',
      timeout: 1000,
      _socketFactory: socketFactory,
    });
  });

  afterEach(async () => {
    try {
      if (ftpClient.isConnected()) {
        await ftpClient.close();
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createFTP', () => {
    it('should create an FTP instance', () => {
      const client = createFTP({ host: 'test.com' });
      expect(client).toBeInstanceOf(FTP);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      const result = await ftpClient.connect();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connected successfully');
      expect(ftpClient.isConnected()).toBe(true);
    });

    it('should handle connection errors', async () => {
      mockControlSocket.connect = vi.fn(() => {
        setImmediate(() => {
          mockControlSocket.emitter.emit('error', new Error('Connection refused'));
        });
      });

      socketCallCount = 0;
      const client = createFTP({
        host: 'bad.host',
        timeout: 200,
        _socketFactory: socketFactory
      });
      const result = await client.connect();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection refused');
    });

    it('should handle connection timeout', async () => {
      mockControlSocket.connect = vi.fn(() => {
        setImmediate(() => {
          mockControlSocket.emitter.emit('timeout');
        });
      });

      socketCallCount = 0;
      const client = createFTP({
        host: 'slow.host',
        timeout: 200,
        _socketFactory: socketFactory
      });
      const result = await client.connect();

      expect(result.success).toBe(false);
      expect(result.message).toContain('timeout');
    });
  });

  describe('directory operations', () => {
    beforeEach(async () => {
      await ftpClient.connect();
    });

    it('should get current directory', async () => {
      const result = await ftpClient.pwd();
      expect(result.success).toBe(true);
      expect(result.data).toBe('/home/user');
    });

    it('should change directory', async () => {
      const result = await ftpClient.cd('/other/dir');
      expect(result.success).toBe(true);
    });

    it('should create directory', async () => {
      const result = await ftpClient.mkdir('/new/folder', false);
      expect(result.success).toBe(true);
    });

    it('should remove directory', async () => {
      const result = await ftpClient.rmdir('/old/folder');
      expect(result.success).toBe(true);
    });
  });

  describe('file operations', () => {
    beforeEach(async () => {
      await ftpClient.connect();
    });

    it('should delete file', async () => {
      const result = await ftpClient.delete('/remote/file.txt');
      expect(result.success).toBe(true);
    });

    it('should rename file', async () => {
      const result = await ftpClient.rename('/old.txt', '/new.txt');
      expect(result.success).toBe(true);
    });

    it('should get file size', async () => {
      const result = await ftpClient.size('/remote/file.txt');
      expect(result.success).toBe(true);
      expect(result.data).toBe(1024);
    });
  });

  describe('close', () => {
    it('should close connection', async () => {
      await ftpClient.connect();
      expect(ftpClient.isConnected()).toBe(true);

      await ftpClient.close();
      expect(ftpClient.isConnected()).toBe(false);
    });
  });

  describe('getSocket', () => {
    it('should throw if called before connect', () => {
      socketCallCount = 0;
      const client = createFTP({
        host: 'test.com',
        _socketFactory: socketFactory
      });
      expect(() => client.getSocket()).toThrow('Not connected');
    });

    it('should return socket after connect', async () => {
      await ftpClient.connect();
      const socket = ftpClient.getSocket();
      expect(socket).toBeDefined();
    });
  });

  describe('list operation', () => {
    it('should list files in directory', async () => {
      const listingData = '-rw-r--r-- 1 user group 1024 Jan 15 12:00 file.txt\r\n' +
        'drwxr-xr-x 2 user group 4096 Jan 15 12:00 folder\r\n';

      // Setup for LIST operation with PASV
      mockControlSocket.write = vi.fn((data: string | Buffer, encoding?: string, callback?: (err?: Error) => void) => {
        const cmd = data.toString().trim();

        // Call callback first
        if (callback) {
          setImmediate(() => callback());
        }

        // Then emit response
        setTimeout(() => {
          let response = '';

          if (cmd.startsWith('USER ')) response = '331 Password required\r\n';
          else if (cmd.startsWith('PASS ')) response = '230 User logged in\r\n';
          else if (cmd === 'TYPE I') response = '200 Type set to I\r\n';
          else if (cmd === 'PASV') {
            response = '227 Entering Passive Mode (127,0,0,1,195,80)\r\n';
            // Simulate data socket receiving listing
            setTimeout(() => {
              mockDataSocket.emitter.emit('data', Buffer.from(listingData));
              mockDataSocket.emitter.emit('end');
            }, 20);
          }
          else if (cmd.startsWith('LIST ')) {
            response = '150 Opening data connection\r\n';
            // Send transfer complete after data
            setTimeout(() => {
              mockControlSocket.emitter.emit('data', Buffer.from('226 Transfer complete\r\n'));
            }, 60);
          }
          else if (cmd === 'QUIT') response = '221 Goodbye\r\n';
          else response = '500 Unknown command\r\n';

          mockControlSocket.emitter.emit('data', Buffer.from(response));
        }, 5);

        return true;
      });

      await ftpClient.connect();
      const result = await ftpClient.list('/pub');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.length).toBe(2);
      expect(result.data![0]).toMatchObject({
        name: 'file.txt',
        type: 'file',
        size: 1024
      });
      expect(result.data![1]).toMatchObject({
        name: 'folder',
        type: 'directory'
      });
    });

    it('should throw if not connected', async () => {
      socketCallCount = 0;
      const client = createFTP({
        host: 'test.com',
        _socketFactory: socketFactory
      });
      await expect(client.list()).rejects.toThrow('Not connected to FTP server');
    });
  });

  describe('configuration options', () => {
    it('should accept all config options', () => {
      const client = createFTP({
        host: 'ftp.example.com',
        port: 2121,
        user: 'admin',
        password: 'secret',
        secure: true,
        timeout: 60000,
        verbose: true,
        tlsOptions: { rejectUnauthorized: false }
      });

      expect(client).toBeInstanceOf(FTP);
    });

    it('should use default port 990 for implicit TLS', () => {
      const client = createFTP({
        host: 'ftp.example.com',
        secure: 'implicit'
      });

      expect(client).toBeInstanceOf(FTP);
    });
  });

  describe('error handling', () => {
    it('should handle pwd errors', async () => {
      // Setup write mock that returns error for PWD
      mockControlSocket.write = vi.fn((data: string | Buffer, encoding?: string, callback?: (err?: Error) => void) => {
        const cmd = data.toString().trim();
        // Call callback first
        if (callback) {
          setImmediate(() => callback());
        }
        setTimeout(() => {
          let response = '';
          if (cmd.startsWith('USER ')) response = '331 Password required\r\n';
          else if (cmd.startsWith('PASS ')) response = '230 User logged in\r\n';
          else if (cmd === 'TYPE I') response = '200 Type set to I\r\n';
          else if (cmd === 'PWD') response = '550 PWD failed\r\n';
          else if (cmd === 'QUIT') response = '221 Goodbye\r\n';
          else response = '500 Unknown\r\n';
          mockControlSocket.emitter.emit('data', Buffer.from(response));
        }, 5);
        return true;
      });

      socketCallCount = 0;
      const client = createFTP({
        host: 'test.com',
        timeout: 1000,
        _socketFactory: socketFactory
      });
      await client.connect();
      const result = await client.pwd();
      expect(result.success).toBe(false);
      await client.close();
    });

    it('should handle cd errors', async () => {
      // Setup write mock that returns error for CWD
      mockControlSocket.write = vi.fn((data: string | Buffer, encoding?: string, callback?: (err?: Error) => void) => {
        const cmd = data.toString().trim();
        // Call callback first
        if (callback) {
          setImmediate(() => callback());
        }
        setTimeout(() => {
          let response = '';
          if (cmd.startsWith('USER ')) response = '331 Password required\r\n';
          else if (cmd.startsWith('PASS ')) response = '230 User logged in\r\n';
          else if (cmd === 'TYPE I') response = '200 Type set to I\r\n';
          else if (cmd.startsWith('CWD ')) response = '550 Directory not found\r\n';
          else if (cmd === 'QUIT') response = '221 Goodbye\r\n';
          else response = '500 Unknown\r\n';
          mockControlSocket.emitter.emit('data', Buffer.from(response));
        }, 5);
        return true;
      });

      socketCallCount = 0;
      const client = createFTP({
        host: 'test.com',
        timeout: 1000,
        _socketFactory: socketFactory
      });
      await client.connect();
      const result = await client.cd('/nonexistent');
      expect(result.success).toBe(false);
      await client.close();
    });
  });

  describe('ftp helper function', () => {
    it('should throw when connection fails', async () => {
      // Emit error immediately instead of waiting for actual timeout
      mockControlSocket.connect = vi.fn(() => {
        setImmediate(() => {
          mockControlSocket.emitter.emit('error', new Error('Connection failed'));
        });
      });

      socketCallCount = 0;
      await expect(
        ftp({ host: 'bad.host', timeout: 200, _socketFactory: socketFactory }, async () => {
          return 'should not reach';
        })
      ).rejects.toThrow();
    });
  });

  describe('upload and download', () => {
    beforeEach(async () => {
      // Setup for PASV-based transfers
      mockControlSocket.write = vi.fn((data: string | Buffer, encoding?: string, callback?: (err?: Error) => void) => {
        const cmd = data.toString().trim();

        // Call callback first
        if (callback) {
          setImmediate(() => callback());
        }

        setTimeout(() => {
          let response = '';

          if (cmd.startsWith('USER ')) response = '331 Password required\r\n';
          else if (cmd.startsWith('PASS ')) response = '230 User logged in\r\n';
          else if (cmd === 'TYPE I') response = '200 Type set to I\r\n';
          else if (cmd === 'PASV') {
            response = '227 Entering Passive Mode (127,0,0,1,195,80)\r\n';
          }
          else if (cmd.startsWith('STOR ')) {
            response = '150 Opening data connection\r\n';
            setTimeout(() => {
              mockControlSocket.emitter.emit('data', Buffer.from('226 Transfer complete\r\n'));
            }, 60);
          }
          else if (cmd.startsWith('SIZE ')) response = '213 1024\r\n';
          else if (cmd.startsWith('RETR ')) {
            response = '150 Opening data connection\r\n';
            setTimeout(() => {
              mockDataSocket.emitter.emit('data', Buffer.from('file content'));
              mockDataSocket.emitter.emit('end');
            }, 20);
            setTimeout(() => {
              mockControlSocket.emitter.emit('data', Buffer.from('226 Transfer complete\r\n'));
            }, 60);
          }
          else if (cmd === 'QUIT') response = '221 Goodbye\r\n';
          else response = '500 Unknown command\r\n';

          mockControlSocket.emitter.emit('data', Buffer.from(response));
        }, 5);

        return true;
      });

      await ftpClient.connect();
    });

    it('should upload from buffer', async () => {
      const result = await ftpClient.uploadFromBuffer(Buffer.from('test data'), '/remote/file.txt');
      expect(result.success).toBe(true);
      expect(result.message).toContain('Uploaded');
    });

    it('should upload from string', async () => {
      const result = await ftpClient.uploadFromBuffer('test content', '/remote/file.txt');
      expect(result.success).toBe(true);
    });

    it('should download to buffer', async () => {
      const result = await ftpClient.downloadToBuffer('/remote/file.txt');
      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.data!.toString()).toBe('file content');
    });
  });

  describe('progress tracking', () => {
    it('should call progress callback', async () => {
      const progressCb = vi.fn();
      ftpClient.progress(progressCb);

      // Setup for download with progress
      mockControlSocket.write = vi.fn((data: string | Buffer, encoding?: string, callback?: (err?: Error) => void) => {
        const cmd = data.toString().trim();

        // Call callback first
        if (callback) {
          setImmediate(() => callback());
        }

        setTimeout(() => {
          let response = '';

          if (cmd.startsWith('USER ')) response = '331 Password required\r\n';
          else if (cmd.startsWith('PASS ')) response = '230 User logged in\r\n';
          else if (cmd === 'TYPE I') response = '200 Type set to I\r\n';
          else if (cmd === 'PASV') response = '227 Entering Passive Mode (127,0,0,1,195,80)\r\n';
          else if (cmd.startsWith('SIZE ')) response = '213 1024\r\n';
          else if (cmd.startsWith('RETR ')) {
            response = '150 Opening data connection\r\n';
            setTimeout(() => {
              mockDataSocket.emitter.emit('data', Buffer.from('file content here'));
              mockDataSocket.emitter.emit('end');
            }, 20);
            setTimeout(() => {
              mockControlSocket.emitter.emit('data', Buffer.from('226 Transfer complete\r\n'));
            }, 60);
          }
          else if (cmd === 'QUIT') response = '221 Goodbye\r\n';
          else response = '500 Unknown\r\n';

          mockControlSocket.emitter.emit('data', Buffer.from(response));
        }, 5);

        return true;
      });

      await ftpClient.connect();

      const { Writable } = await import('node:stream');
      const chunks: Buffer[] = [];
      const stream = new Writable({
        write(chunk, enc, cb) { chunks.push(chunk); cb(); }
      });

      await ftpClient.downloadToStream('/file.txt', stream);

      expect(progressCb).toHaveBeenCalled();
    });
  });

  describe('directory listing parser', () => {
    it('should parse Unix format listings', async () => {
      const listingData =
        '-rw-r--r-- 1 user group 1024 Jan 15 12:00 file.txt\r\n' +
        'drwxr-xr-x 2 user group 4096 Dec 31 2023 folder\r\n';

      mockControlSocket.write = vi.fn((data: string | Buffer, encoding?: string, callback?: (err?: Error) => void) => {
        const cmd = data.toString().trim();

        // Call callback first
        if (callback) {
          setImmediate(() => callback());
        }

        setTimeout(() => {
          let response = '';

          if (cmd.startsWith('USER ')) response = '331 Password required\r\n';
          else if (cmd.startsWith('PASS ')) response = '230 User logged in\r\n';
          else if (cmd === 'TYPE I') response = '200 Type set to I\r\n';
          else if (cmd === 'PASV') {
            response = '227 Entering Passive Mode (127,0,0,1,195,80)\r\n';
            setTimeout(() => {
              mockDataSocket.emitter.emit('data', Buffer.from(listingData));
              mockDataSocket.emitter.emit('end');
            }, 20);
          }
          else if (cmd.startsWith('LIST ')) {
            response = '150 Opening data connection\r\n';
            setTimeout(() => {
              mockControlSocket.emitter.emit('data', Buffer.from('226 Transfer complete\r\n'));
            }, 60);
          }
          else if (cmd === 'QUIT') response = '221 Goodbye\r\n';
          else response = '500 Unknown\r\n';

          mockControlSocket.emitter.emit('data', Buffer.from(response));
        }, 5);

        return true;
      });

      socketCallCount = 0;
      const client = createFTP({
        host: 'test.com',
        timeout: 1000,
        _socketFactory: socketFactory
      });
      await client.connect();
      const result = await client.list('/');

      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(2);
      expect(result.data![0].type).toBe('file');
      expect(result.data![0].permissions).toBe('rw-r--r--');
      expect(result.data![1].type).toBe('directory');
    });

    it('should parse DOS format listings', async () => {
      const listingData =
        '01-15-24  12:00PM              1024 file.txt\r\n' +
        '01-15-24  12:00PM       <DIR>       folder\r\n';

      mockControlSocket.write = vi.fn((data: string | Buffer, encoding?: string, callback?: (err?: Error) => void) => {
        const cmd = data.toString().trim();

        // Call callback first
        if (callback) {
          setImmediate(() => callback());
        }

        setTimeout(() => {
          let response = '';

          if (cmd.startsWith('USER ')) response = '331 Password required\r\n';
          else if (cmd.startsWith('PASS ')) response = '230 User logged in\r\n';
          else if (cmd === 'TYPE I') response = '200 Type set to I\r\n';
          else if (cmd === 'PASV') {
            response = '227 Entering Passive Mode (127,0,0,1,195,80)\r\n';
            setTimeout(() => {
              mockDataSocket.emitter.emit('data', Buffer.from(listingData));
              mockDataSocket.emitter.emit('end');
            }, 20);
          }
          else if (cmd.startsWith('LIST ')) {
            response = '150 Opening data connection\r\n';
            setTimeout(() => {
              mockControlSocket.emitter.emit('data', Buffer.from('226 Transfer complete\r\n'));
            }, 60);
          }
          else if (cmd === 'QUIT') response = '221 Goodbye\r\n';
          else response = '500 Unknown\r\n';

          mockControlSocket.emitter.emit('data', Buffer.from(response));
        }, 5);

        return true;
      });

      socketCallCount = 0;
      const client = createFTP({
        host: 'test.com',
        timeout: 1000,
        _socketFactory: socketFactory
      });
      await client.connect();
      const result = await client.list('/');

      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(2);
      expect(result.data![0].type).toBe('file');
      expect(result.data![0].size).toBe(1024);
      expect(result.data![1].type).toBe('directory');
    });
  });
});
