import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Telnet, createTelnet, telnet } from '../../src/protocols/telnet.js';

// Mock telnet-client
vi.mock('telnet-client', () => {
  return {
    Telnet: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      exec: vi.fn().mockResolvedValue('command output\n'),
      send: vi.fn().mockResolvedValue('send response\n')
    }))
  };
});

describe('Telnet Protocol Utility', () => {
  let telnetClient: Telnet;

  beforeEach(() => {
    vi.clearAllMocks();
    telnetClient = createTelnet({
      host: 'router.example.com',
      port: 23,
      username: 'admin',
      password: 'admin'
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
      const result = await telnetClient.connect();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connected successfully');
      expect(telnetClient.isConnected()).toBe(true);
    });

    it('should handle connection errors', async () => {
      const { Telnet: TelnetMock } = await import('telnet-client');
      vi.mocked(TelnetMock).mockImplementationOnce(() => ({
        connect: vi.fn().mockRejectedValue(new Error('Connection timeout')),
        end: vi.fn(),
        destroy: vi.fn()
      } as any));

      const client = createTelnet({ host: 'bad.host' });
      const result = await client.connect();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Connection timeout');
    });
  });

  describe('exec', () => {
    it('should execute command and return output', async () => {
      await telnetClient.connect();
      const result = await telnetClient.exec('show version');

      expect(result.success).toBe(true);
      expect(result.data).toBe('command output\n');
    });

    it('should execute command with options', async () => {
      await telnetClient.connect();
      const result = await telnetClient.exec('show interfaces', {
        timeout: 5000,
        shellPrompt: /[$#>]/
      });

      expect(result.success).toBe(true);
    });

    it('should throw if not connected', async () => {
      await expect(telnetClient.exec('test')).rejects.toThrow('Not connected to Telnet server');
    });

    it('should handle exec errors', async () => {
      const { Telnet: TelnetMock } = await import('telnet-client');
      vi.mocked(TelnetMock).mockImplementationOnce(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
        destroy: vi.fn(),
        exec: vi.fn().mockRejectedValue(new Error('Command timeout'))
      } as any));

      const client = createTelnet({ host: 'test.com' });
      await client.connect();
      const result = await client.exec('long running command');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Command timeout');
    });
  });

  describe('send', () => {
    it('should send data and return response', async () => {
      await telnetClient.connect();
      const result = await telnetClient.send('ping 8.8.8.8\r\n');

      expect(result.success).toBe(true);
      expect(result.data).toBe('send response\n');
    });

    it('should send with options', async () => {
      await telnetClient.connect();
      const result = await telnetClient.send('enable\r\n', { timeout: 3000 });

      expect(result.success).toBe(true);
    });
  });

  describe('shell', () => {
    it('should be an alias for exec', async () => {
      await telnetClient.connect();
      const result = await telnetClient.shell('ls -la');

      expect(result.success).toBe(true);
      expect(result.data).toBe('command output\n');
    });
  });

  describe('waitFor', () => {
    it('should wait for specific pattern', async () => {
      await telnetClient.connect();
      const result = await telnetClient.waitFor(/\$\s*$/);

      expect(result.success).toBe(true);
    });
  });

  describe('close', () => {
    it('should close connection', async () => {
      await telnetClient.connect();
      expect(telnetClient.isConnected()).toBe(true);

      await telnetClient.close();
      expect(telnetClient.isConnected()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should destroy connection immediately', async () => {
      await telnetClient.connect();
      expect(telnetClient.isConnected()).toBe(true);

      telnetClient.destroy();
      expect(telnetClient.isConnected()).toBe(false);
    });
  });

  describe('getClient', () => {
    it('should return underlying client', () => {
      const client = telnetClient.getClient();
      expect(client).toBeDefined();
    });
  });

  describe('telnet helper function', () => {
    it('should execute operation and close connection', async () => {
      const result = await telnet(
        { host: 'router.local', username: 'admin', password: 'admin' },
        async (client) => {
          const execResult = await client.exec('show version');
          return execResult.data;
        }
      );

      expect(result).toBe('command output\n');
    });

    it('should close connection even on error', async () => {
      await expect(
        telnet({ host: 'router.local' }, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should handle connection failure in helper', async () => {
      const { Telnet: TelnetMock } = await import('telnet-client');
      vi.mocked(TelnetMock).mockImplementationOnce(() => ({
        connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
        end: vi.fn(),
        destroy: vi.fn()
      } as any));

      await expect(
        telnet({ host: 'bad.host' }, async (client) => {
          return await client.exec('test');
        })
      ).rejects.toThrow('Connection refused');
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
        negotiationMandatory: false,
        execTimeout: 10000,
        sendTimeout: 5000,
        maxBufferLength: 2 * 1024 * 1024,
        debug: false
      });

      expect(client).toBeInstanceOf(Telnet);
      const result = await client.connect();
      expect(result.success).toBe(true);
    });
  });
});
