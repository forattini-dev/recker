import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FTP, createFTP, ftp } from '../../src/protocols/ftp.js';

// Mock basic-ftp
vi.mock('basic-ftp', () => {
  const mockFtp = {
    verbose: false
  };

  return {
    Client: vi.fn().mockImplementation(() => ({
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
    }))
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
  });
});
