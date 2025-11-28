import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FTP, createFTP, ftp } from '../../src/protocols/ftp.js';

// Mock basic-ftp
vi.mock('basic-ftp', () => {
  return {
    Client: vi.fn().mockImplementation(() => {
      const mockFtp = { verbose: false };
      return {
        ftp: mockFtp,
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        list: vi.fn().mockResolvedValue([
          { name: 'file.txt', type: 1, size: 1024, modifiedAt: new Date(), permissions: { user: 7, group: 5, other: 5 }, rawModifiedAt: '2024-01-01' },
          { name: 'folder', type: 2, size: 0, modifiedAt: new Date() },
          { name: 'link', type: 3, size: 0, modifiedAt: new Date() }
        ]),
        downloadTo: vi.fn().mockResolvedValue(undefined),
        uploadFrom: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        ensureDir: vi.fn().mockResolvedValue(undefined),
        removeDir: vi.fn().mockResolvedValue(undefined),
        rename: vi.fn().mockResolvedValue(undefined),
        pwd: vi.fn().mockResolvedValue('/home/user'),
        cd: vi.fn().mockResolvedValue(undefined),
        size: vi.fn().mockResolvedValue(2048),
        trackProgress: vi.fn()
      };
    })
  };
});

describe('FTP Protocol Utility', () => {
  let ftpClient: FTP;

  beforeEach(() => {
    vi.clearAllMocks();
    ftpClient = createFTP({
      host: 'ftp.example.com',
      user: 'testuser',
      password: 'testpass'
    });
  });

  afterEach(async () => {
    if (ftpClient.isConnected()) {
      await ftpClient.close();
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
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockRejectedValue(new Error('Connection refused')),
        close: vi.fn()
      } as any));

      const client = createFTP({ host: 'bad.host' });
      const result = await client.connect();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Connection refused');
    });
  });

  describe('list', () => {
    it('should list files in directory', async () => {
      await ftpClient.connect();
      const result = await ftpClient.list('/pub');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.data![0]).toMatchObject({
        name: 'file.txt',
        type: 'file',
        size: 1024
      });
      expect(result.data![1]).toMatchObject({
        name: 'folder',
        type: 'directory'
      });
      expect(result.data![2]).toMatchObject({
        name: 'link',
        type: 'link'
      });
    });

    it('should throw if not connected', async () => {
      await expect(ftpClient.list()).rejects.toThrow('Not connected to FTP server');
    });
  });

  describe('download', () => {
    it('should download file to local path', async () => {
      await ftpClient.connect();
      const result = await ftpClient.download('/remote/file.txt', './local/file.txt');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Downloaded');
    });

    it('should support progress tracking', async () => {
      const progressCb = vi.fn();
      ftpClient.progress(progressCb);

      await ftpClient.connect();
      await ftpClient.download('/remote/file.txt', './local/file.txt');

      const client = ftpClient.getClient();
      expect(client.trackProgress).toHaveBeenCalled();
    });
  });

  describe('upload', () => {
    it('should upload file to remote path', async () => {
      await ftpClient.connect();
      const result = await ftpClient.upload('./local/file.txt', '/remote/file.txt');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Uploaded');
    });
  });

  describe('directory operations', () => {
    it('should create directory', async () => {
      await ftpClient.connect();
      const result = await ftpClient.mkdir('/new/folder');

      expect(result.success).toBe(true);
    });

    it('should remove directory', async () => {
      await ftpClient.connect();
      const result = await ftpClient.rmdir('/old/folder');

      expect(result.success).toBe(true);
    });

    it('should get current directory', async () => {
      await ftpClient.connect();
      const result = await ftpClient.pwd();

      expect(result.success).toBe(true);
      expect(result.data).toBe('/home/user');
    });

    it('should change directory', async () => {
      await ftpClient.connect();
      const result = await ftpClient.cd('/other/dir');

      expect(result.success).toBe(true);
    });
  });

  describe('file operations', () => {
    it('should delete file', async () => {
      await ftpClient.connect();
      const result = await ftpClient.delete('/remote/file.txt');

      expect(result.success).toBe(true);
    });

    it('should rename file', async () => {
      await ftpClient.connect();
      const result = await ftpClient.rename('/old.txt', '/new.txt');

      expect(result.success).toBe(true);
    });

    it('should get file size', async () => {
      await ftpClient.connect();
      const result = await ftpClient.size('/remote/file.txt');

      expect(result.success).toBe(true);
      expect(result.data).toBe(2048);
    });

    it('should check if file exists', async () => {
      await ftpClient.connect();
      const exists = await ftpClient.exists('/home/user/file.txt');

      expect(exists).toBe(true);
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

  describe('ftp helper function', () => {
    it('should execute operation and close connection', async () => {
      const result = await ftp(
        { host: 'ftp.example.com' },
        async (client) => {
          const listResult = await client.list('/');
          return listResult.data;
        }
      );

      expect(result).toHaveLength(3);
    });

    it('should close connection even on error', async () => {
      await expect(
        ftp({ host: 'ftp.example.com' }, async (client) => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should throw when connection fails', async () => {
      const { Client } = await import('basic-ftp');
      // This mock will be used for the ftp() call
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockRejectedValue(new Error('Connection refused')),
        close: vi.fn()
      } as any));

      await expect(
        ftp({ host: 'bad.host' }, async () => {
          return 'should not reach';
        })
      ).rejects.toThrow('Connection refused');
    });
  });

  describe('downloadToStream', () => {
    it('should download to writable stream', async () => {
      await ftpClient.connect();
      const { Writable } = await import('node:stream');
      const chunks: Buffer[] = [];
      const stream = new Writable({
        write(chunk, enc, cb) { chunks.push(chunk); cb(); }
      });

      const result = await ftpClient.downloadToStream('/remote/file.txt', stream);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Downloaded');
    });

    it('should handle download errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        downloadTo: vi.fn().mockRejectedValue(new Error('Download failed')),
        trackProgress: vi.fn()
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();

      const { Writable } = await import('node:stream');
      const stream = new Writable({ write(c, e, cb) { cb(); } });

      const result = await client.downloadToStream('/fail', stream);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Download failed');
    });

    it('should track progress during download to stream', async () => {
      const progressCb = vi.fn();
      ftpClient.progress(progressCb);

      await ftpClient.connect();
      const { Writable } = await import('node:stream');
      const stream = new Writable({ write(c, e, cb) { cb(); } });

      await ftpClient.downloadToStream('/remote/file.txt', stream);

      expect(ftpClient.getClient().trackProgress).toHaveBeenCalled();
    });
  });

  describe('downloadToBuffer', () => {
    it('should download to buffer', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        downloadTo: vi.fn().mockImplementation(async (stream: any) => {
          stream.write(Buffer.from('file content'));
          stream.end();
        })
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.downloadToBuffer('/file.txt');

      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Buffer);
    });

    it('should handle buffer download errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        downloadTo: vi.fn().mockRejectedValue(new Error('Buffer download failed'))
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.downloadToBuffer('/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Buffer download failed');
    });
  });

  describe('uploadFromStream', () => {
    it('should upload from readable stream', async () => {
      await ftpClient.connect();
      const { Readable } = await import('node:stream');
      const stream = Readable.from(Buffer.from('test content'));

      const result = await ftpClient.uploadFromStream(stream, '/remote/file.txt');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Uploaded');
    });

    it('should handle upload stream errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        uploadFrom: vi.fn().mockRejectedValue(new Error('Stream upload failed')),
        trackProgress: vi.fn()
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();

      const { Readable } = await import('node:stream');
      const stream = Readable.from(Buffer.from('test'));

      const result = await client.uploadFromStream(stream, '/fail');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Stream upload failed');
    });

    it('should track progress during upload from stream', async () => {
      const progressCb = vi.fn();
      ftpClient.progress(progressCb);

      await ftpClient.connect();
      const { Readable } = await import('node:stream');
      const stream = Readable.from(Buffer.from('test'));

      await ftpClient.uploadFromStream(stream, '/remote/file.txt');

      expect(ftpClient.getClient().trackProgress).toHaveBeenCalled();
    });
  });

  describe('uploadFromBuffer', () => {
    it('should upload from buffer', async () => {
      await ftpClient.connect();
      const result = await ftpClient.uploadFromBuffer(Buffer.from('test'), '/remote/file.txt');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Uploaded');
    });

    it('should upload from string', async () => {
      await ftpClient.connect();
      const result = await ftpClient.uploadFromBuffer('test content', '/remote/file.txt');

      expect(result.success).toBe(true);
    });

    it('should handle buffer upload errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        uploadFrom: vi.fn().mockRejectedValue(new Error('Buffer upload failed'))
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.uploadFromBuffer('test', '/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Buffer upload failed');
    });
  });

  describe('error handling', () => {
    it('should handle list errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        list: vi.fn().mockRejectedValue(new Error('List failed'))
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.list('/');

      expect(result.success).toBe(false);
      expect(result.message).toBe('List failed');
    });

    it('should handle download errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        downloadTo: vi.fn().mockRejectedValue(new Error('Download error')),
        trackProgress: vi.fn()
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.download('/fail', './local');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Download error');
    });

    it('should handle upload errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        uploadFrom: vi.fn().mockRejectedValue(new Error('Upload error')),
        trackProgress: vi.fn()
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.upload('./local', '/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Upload error');
    });

    it('should handle delete errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        remove: vi.fn().mockRejectedValue(new Error('Delete error'))
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.delete('/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Delete error');
    });

    it('should handle mkdir errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        ensureDir: vi.fn().mockRejectedValue(new Error('Mkdir error'))
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.mkdir('/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Mkdir error');
    });

    it('should handle rmdir errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        removeDir: vi.fn().mockRejectedValue(new Error('Rmdir error'))
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.rmdir('/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Rmdir error');
    });

    it('should handle rename errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        rename: vi.fn().mockRejectedValue(new Error('Rename error'))
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.rename('/old', '/new');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Rename error');
    });

    it('should handle pwd errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        pwd: vi.fn().mockRejectedValue(new Error('PWD error'))
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.pwd();

      expect(result.success).toBe(false);
      expect(result.message).toBe('PWD error');
    });

    it('should handle cd errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        cd: vi.fn().mockRejectedValue(new Error('CD error'))
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.cd('/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('CD error');
    });

    it('should handle size errors', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        size: vi.fn().mockRejectedValue(new Error('Size error'))
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.size('/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Size error');
    });
  });

  describe('file type mapping', () => {
    it('should handle unknown file type (0)', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        list: vi.fn().mockResolvedValue([
          { name: 'unknown', type: 0, size: 0, modifiedAt: new Date() }
        ])
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.list('/');

      expect(result.success).toBe(true);
      expect(result.data![0].type).toBe('unknown');
    });

    it('should handle undefined file type', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        list: vi.fn().mockResolvedValue([
          { name: 'unknown', type: 99, size: 0, modifiedAt: new Date() }
        ])
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.list('/');

      expect(result.success).toBe(true);
      expect(result.data![0].type).toBe('unknown');
    });
  });

  describe('exists edge cases', () => {
    it('should handle root path file', async () => {
      await ftpClient.connect();
      const exists = await ftpClient.exists('/file.txt');
      expect(typeof exists).toBe('boolean');
    });

    it('should return false on list error', async () => {
      const { Client } = await import('basic-ftp');
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: { verbose: false },
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        list: vi.fn().mockRejectedValue(new Error('Access denied'))
      } as any));

      const client = createFTP({ host: 'test.com' });
      await client.connect();
      const exists = await client.exists('/protected/file.txt');

      expect(exists).toBe(false);
    });
  });

  describe('verbose mode', () => {
    it('should enable verbose logging', async () => {
      const { Client } = await import('basic-ftp');
      const mockFtp = { verbose: false };
      vi.mocked(Client).mockImplementationOnce(() => ({
        ftp: mockFtp,
        closed: false,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn()
      } as any));

      const client = createFTP({ host: 'test.com', verbose: true });
      expect(mockFtp.verbose).toBe(true);
    });
  });

  describe('isConnected', () => {
    it('should return false when client is closed', async () => {
      const { Client } = await import('basic-ftp');
      const mockClient = {
        ftp: { verbose: false },
        closed: true,
        access: vi.fn().mockResolvedValue(undefined),
        close: vi.fn()
      };
      vi.mocked(Client).mockImplementationOnce(() => mockClient as any);

      const client = createFTP({ host: 'test.com' });
      await client.connect();

      // Simulate client being closed
      mockClient.closed = true;

      expect(client.isConnected()).toBe(false);
    });
  });
});
