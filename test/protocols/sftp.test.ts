import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SFTP, createSFTP, sftp } from '../../src/protocols/sftp.js';

// Mock ssh2-sftp-client
vi.mock('ssh2-sftp-client', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([
        { name: 'file.txt', type: '-', size: 1024, modifyTime: 1700000000, accessTime: 1700000000, rights: { user: 'rwx', group: 'rx', other: 'rx' }, owner: 1000, group: 1000 },
        { name: 'folder', type: 'd', size: 4096, modifyTime: 1700000000, accessTime: 1700000000, rights: { user: 'rwx', group: 'rx', other: 'rx' }, owner: 1000, group: 1000 },
        { name: 'link', type: 'l', size: 0, modifyTime: 1700000000, accessTime: 1700000000, rights: { user: 'rwx', group: 'rx', other: 'rx' }, owner: 1000, group: 1000 }
      ]),
      exists: vi.fn().mockResolvedValue('-'),
      stat: vi.fn().mockResolvedValue({ size: 2048, isDirectory: false, isFile: true }),
      fastGet: vi.fn().mockResolvedValue(undefined),
      fastPut: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(Buffer.from('file content')),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      rmdir: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
      chmod: vi.fn().mockResolvedValue(undefined),
      cwd: vi.fn().mockResolvedValue('/home/user'),
      append: vi.fn().mockResolvedValue(undefined)
    }))
  };
});

describe('SFTP Protocol Utility', () => {
  let sftpClient: SFTP;

  beforeEach(() => {
    vi.clearAllMocks();
    sftpClient = createSFTP({
      host: 'sftp.example.com',
      username: 'testuser',
      password: 'testpass'
    });
  });

  afterEach(async () => {
    if (sftpClient.isConnected()) {
      await sftpClient.close();
    }
  });

  describe('createSFTP', () => {
    it('should create an SFTP instance', () => {
      const client = createSFTP({ host: 'test.com' });
      expect(client).toBeInstanceOf(SFTP);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      const result = await sftpClient.connect();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connected successfully');
      expect(sftpClient.isConnected()).toBe(true);
    });

    it('should handle connection errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockRejectedValue(new Error('Authentication failed')),
        end: vi.fn()
      } as any));

      const client = createSFTP({ host: 'bad.host' });
      const result = await client.connect();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Authentication failed');
    });
  });

  describe('list', () => {
    it('should list files in directory', async () => {
      await sftpClient.connect();
      const result = await sftpClient.list('/home/user');

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
      await expect(sftpClient.list()).rejects.toThrow('Not connected to SFTP server');
    });
  });

  describe('exists', () => {
    it('should check if path exists', async () => {
      await sftpClient.connect();
      const exists = await sftpClient.exists('/home/user/file.txt');

      expect(exists).toBe('-'); // Returns type: '-' for file, 'd' for dir, false if not exists
    });
  });

  describe('stat', () => {
    it('should get file stats', async () => {
      await sftpClient.connect();
      const result = await sftpClient.stat('/home/user/file.txt');

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ size: 2048 });
    });
  });

  describe('download', () => {
    it('should download file to local path', async () => {
      await sftpClient.connect();
      const result = await sftpClient.download('/remote/file.txt', './local/file.txt');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Downloaded');
    });

    it('should download to buffer', async () => {
      await sftpClient.connect();
      const result = await sftpClient.downloadToBuffer('/remote/file.txt');

      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.data!.toString()).toBe('file content');
    });
  });

  describe('upload', () => {
    it('should upload file to remote path', async () => {
      await sftpClient.connect();
      const result = await sftpClient.upload('./local/file.txt', '/remote/file.txt');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Uploaded');
    });

    it('should upload from buffer', async () => {
      await sftpClient.connect();
      const result = await sftpClient.uploadFromBuffer('test content', '/remote/file.txt');

      expect(result.success).toBe(true);
    });
  });

  describe('directory operations', () => {
    it('should create directory', async () => {
      await sftpClient.connect();
      const result = await sftpClient.mkdir('/new/folder', true);

      expect(result.success).toBe(true);
    });

    it('should remove directory', async () => {
      await sftpClient.connect();
      const result = await sftpClient.rmdir('/old/folder');

      expect(result.success).toBe(true);
    });

    it('should get current directory', async () => {
      await sftpClient.connect();
      const result = await sftpClient.pwd();

      expect(result.success).toBe(true);
      expect(result.data).toBe('/home/user');
    });
  });

  describe('file operations', () => {
    it('should delete file', async () => {
      await sftpClient.connect();
      const result = await sftpClient.delete('/remote/file.txt');

      expect(result.success).toBe(true);
    });

    it('should rename file', async () => {
      await sftpClient.connect();
      const result = await sftpClient.rename('/old.txt', '/new.txt');

      expect(result.success).toBe(true);
    });

    it('should change permissions', async () => {
      await sftpClient.connect();
      const result = await sftpClient.chmod('/remote/file.txt', 0o755);

      expect(result.success).toBe(true);
    });

    it('should append to file', async () => {
      await sftpClient.connect();
      const result = await sftpClient.append('more content', '/remote/file.txt');

      expect(result.success).toBe(true);
    });
  });

  describe('close', () => {
    it('should close connection', async () => {
      await sftpClient.connect();
      expect(sftpClient.isConnected()).toBe(true);

      await sftpClient.close();
      expect(sftpClient.isConnected()).toBe(false);
    });
  });

  describe('sftp helper function', () => {
    it('should execute operation and close connection', async () => {
      const result = await sftp(
        { host: 'sftp.example.com', username: 'user' },
        async (client) => {
          const listResult = await client.list('/');
          return listResult.data;
        }
      );

      expect(result).toHaveLength(3);
    });

    it('should close connection even on error', async () => {
      await expect(
        sftp({ host: 'sftp.example.com', username: 'user' }, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should throw when connection fails', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
        end: vi.fn()
      } as any));

      await expect(
        sftp({ host: 'bad.host' }, async () => {
          return 'should not reach';
        })
      ).rejects.toThrow('Connection refused');
    });
  });

  describe('downloadToStream', () => {
    it('should download to writable stream', async () => {
      await sftpClient.connect();
      const { Writable } = await import('node:stream');
      const stream = new Writable({ write(c, e, cb) { cb(); } });

      const result = await sftpClient.downloadToStream('/remote/file.txt', stream);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Downloaded');
    });

    it('should handle download stream errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        get: vi.fn().mockRejectedValue(new Error('Stream download failed'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();

      const { Writable } = await import('node:stream');
      const stream = new Writable({ write(c, e, cb) { cb(); } });

      const result = await client.downloadToStream('/fail', stream);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Stream download failed');
    });
  });

  describe('downloadToBuffer', () => {
    it('should download to buffer', async () => {
      await sftpClient.connect();
      const result = await sftpClient.downloadToBuffer('/file.txt');

      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Buffer);
    });

    it('should convert string to buffer', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        get: vi.fn().mockResolvedValue('string content')
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.downloadToBuffer('/file.txt');

      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.data!.toString()).toBe('string content');
    });

    it('should handle buffer download errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        get: vi.fn().mockRejectedValue(new Error('Buffer download failed'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.downloadToBuffer('/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Buffer download failed');
    });
  });

  describe('uploadFromStream', () => {
    it('should upload from readable stream', async () => {
      await sftpClient.connect();
      const { Readable } = await import('node:stream');
      const stream = Readable.from(Buffer.from('test content'));

      const result = await sftpClient.uploadFromStream(stream, '/remote/file.txt');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Uploaded');
    });

    it('should handle upload stream errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        put: vi.fn().mockRejectedValue(new Error('Stream upload failed'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();

      const { Readable } = await import('node:stream');
      const stream = Readable.from(Buffer.from('test'));

      const result = await client.uploadFromStream(stream, '/fail');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Stream upload failed');
    });
  });

  describe('uploadFromBuffer', () => {
    it('should upload from buffer', async () => {
      await sftpClient.connect();
      const result = await sftpClient.uploadFromBuffer(Buffer.from('test'), '/remote/file.txt');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Uploaded');
    });

    it('should upload from string', async () => {
      await sftpClient.connect();
      const result = await sftpClient.uploadFromBuffer('test content', '/remote/file.txt');

      expect(result.success).toBe(true);
    });

    it('should handle buffer upload errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        put: vi.fn().mockRejectedValue(new Error('Buffer upload failed'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.uploadFromBuffer('test', '/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Buffer upload failed');
    });
  });

  describe('error handling', () => {
    it('should handle list errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        list: vi.fn().mockRejectedValue(new Error('List failed'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.list('/');

      expect(result.success).toBe(false);
      expect(result.message).toBe('List failed');
    });

    it('should handle stat errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        stat: vi.fn().mockRejectedValue(new Error('Stat failed'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.stat('/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Stat failed');
    });

    it('should handle download errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        fastGet: vi.fn().mockRejectedValue(new Error('Download error'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.download('/fail', './local');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Download error');
    });

    it('should handle upload errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        fastPut: vi.fn().mockRejectedValue(new Error('Upload error'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.upload('./local', '/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Upload error');
    });

    it('should handle delete errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        delete: vi.fn().mockRejectedValue(new Error('Delete error'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.delete('/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Delete error');
    });

    it('should handle mkdir errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        mkdir: vi.fn().mockRejectedValue(new Error('Mkdir error'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.mkdir('/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Mkdir error');
    });

    it('should handle rmdir errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        rmdir: vi.fn().mockRejectedValue(new Error('Rmdir error'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.rmdir('/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Rmdir error');
    });

    it('should handle rename errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        rename: vi.fn().mockRejectedValue(new Error('Rename error'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.rename('/old', '/new');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Rename error');
    });

    it('should handle chmod errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        chmod: vi.fn().mockRejectedValue(new Error('Chmod error'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.chmod('/fail', 0o755);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Chmod error');
    });

    it('should handle pwd errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        cwd: vi.fn().mockRejectedValue(new Error('PWD error'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.pwd();

      expect(result.success).toBe(false);
      expect(result.message).toBe('PWD error');
    });

    it('should handle append errors', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        append: vi.fn().mockRejectedValue(new Error('Append error'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.append('data', '/fail');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Append error');
    });

    it('should return false for exists on error', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        exists: vi.fn().mockRejectedValue(new Error('Access denied'))
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const exists = await client.exists('/protected');

      expect(exists).toBe(false);
    });
  });

  describe('file type mapping', () => {
    it('should handle unknown file type', async () => {
      const SFTPClient = (await import('ssh2-sftp-client')).default;
      vi.mocked(SFTPClient).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        list: vi.fn().mockResolvedValue([
          { name: 'unknown', type: 'x', size: 0, modifyTime: 1700000000, accessTime: 1700000000, rights: { user: 'rwx', group: 'rx', other: 'rx' }, owner: 1000, group: 1000 }
        ])
      } as any));

      const client = createSFTP({ host: 'test.com' });
      await client.connect();
      const result = await client.list('/');

      expect(result.success).toBe(true);
      expect(result.data![0].type).toBe('unknown');
    });
  });

  describe('getClient', () => {
    it('should return underlying client', () => {
      const client = createSFTP({ host: 'test.com' });
      const underlying = client.getClient();
      expect(underlying).toBeDefined();
    });
  });
});
