import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Create mock socket factory
const createMockSocket = (options: {
  authorized?: boolean;
  authorizationError?: Error;
  cert?: any;
  protocol?: string;
  cipher?: any;
  shouldError?: boolean;
  shouldTimeout?: boolean;
}) => {
  const socket = new EventEmitter() as any;
  socket.authorized = options.authorized ?? true;
  socket.authorizationError = options.authorizationError;
  socket.getPeerCertificate = vi.fn().mockReturnValue(options.cert || {});
  socket.getProtocol = vi.fn().mockReturnValue(options.protocol || 'TLSv1.3');
  socket.getCipher = vi.fn().mockReturnValue(options.cipher || { name: 'AES256-GCM-SHA384', version: 'TLSv1.3' });
  socket.end = vi.fn();
  socket.destroy = vi.fn();
  socket.setTimeout = vi.fn((ms: number, callback: () => void) => {
    if (options.shouldTimeout) {
      // Simulate timeout by calling callback which calls destroy
      setTimeout(() => {
        callback();
        // After destroy is called, emit error event
        socket.emit('error', new Error('TLS connection timed out'));
      }, 10);
    }
  });
  return socket;
};

// Mock node:tls
vi.mock('node:tls', () => ({
  connect: vi.fn(),
}));

// Mock node:crypto for public key parsing
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    createPublicKey: vi.fn(),
  };
});

import { connect } from 'node:tls';
import * as crypto from 'node:crypto';
import { inspectTLS } from '../../src/utils/tls-inspector.js';

describe('TLS Inspector', () => {
  const mockedConnect = vi.mocked(connect);
  const mockedCreatePublicKey = vi.mocked(crypto.createPublicKey);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('inspectTLS', () => {
    it('should return valid TLS info for valid certificate', async () => {
      const now = new Date();
      const validFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const validTo = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days from now

      const mockCert = {
        valid_from: validFrom.toISOString(),
        valid_to: validTo.toISOString(),
        issuer: { CN: 'Test CA', O: 'Test Org' },
        subject: { CN: 'example.com', O: 'Example Inc' },
        fingerprint: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD',
        fingerprint256: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:00:11:22:33:44:55:66:77:88:99:AA:BB',
        serialNumber: '0123456789ABCDEF',
        subjectaltname: 'DNS:example.com, DNS:www.example.com, DNS:api.example.com',
        ext_key_usage: ['serverAuth', 'clientAuth'],
      };

      const mockSocket = createMockSocket({
        authorized: true,
        cert: mockCert,
        protocol: 'TLSv1.3',
        cipher: { name: 'AES256-GCM-SHA384', version: 'TLSv1.3' },
      });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await inspectTLS('example.com', 443);

      expect(result.valid).toBe(true);
      expect(result.daysRemaining).toBeGreaterThan(0);
      expect(result.authorized).toBe(true);
      expect(result.issuer.CN).toBe('Test CA');
      expect(result.subject.CN).toBe('example.com');
      expect(result.altNames).toContain('example.com');
      expect(result.altNames).toContain('www.example.com');
      expect(result.protocol).toBe('TLSv1.3');
      expect(result.cipher?.name).toBe('AES256-GCM-SHA384');
    });

    it('should handle expired certificate', async () => {
      const now = new Date();
      const validFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year ago
      const validTo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago (expired)

      const mockCert = {
        valid_from: validFrom.toISOString(),
        valid_to: validTo.toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: 'expired.example.com' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
      };

      const mockSocket = createMockSocket({
        authorized: false,
        authorizationError: new Error('CERT_HAS_EXPIRED'),
        cert: mockCert,
      });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await inspectTLS('expired.example.com', 443);

      expect(result.valid).toBe(false);
      expect(result.daysRemaining).toBeLessThan(0);
      expect(result.authorized).toBe(false);
      expect(result.authorizationError?.message).toBe('CERT_HAS_EXPIRED');
    });

    it('should handle connection error', async () => {
      const mockSocket = createMockSocket({ shouldError: true });

      mockedConnect.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit('error', new Error('ECONNREFUSED'));
        }, 0);
        return mockSocket;
      });

      await expect(inspectTLS('unreachable.example.com', 443)).rejects.toThrow('ECONNREFUSED');
    });

    // Timeout test removed - hard to mock reliably

    it('should reject if no certificate provided', async () => {
      const mockSocket = createMockSocket({
        cert: {}, // Empty certificate
      });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      await expect(inspectTLS('nocert.example.com', 443)).rejects.toThrow('No certificate provided by peer');
    });

    it('should handle certificate with IP address SAN', async () => {
      const now = new Date();
      const mockCert = {
        valid_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: '192.168.1.1' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
        subjectaltname: 'IP Address:192.168.1.1, DNS:localhost',
      };

      const mockSocket = createMockSocket({ cert: mockCert });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await inspectTLS('192.168.1.1', 443);

      expect(result.altNames).toContain('192.168.1.1');
      expect(result.altNames).toContain('localhost');
    });

    it('should handle certificate without SANs', async () => {
      const now = new Date();
      const mockCert = {
        valid_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: 'old.example.com' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
        // No subjectaltname
      };

      const mockSocket = createMockSocket({ cert: mockCert });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await inspectTLS('old.example.com', 443);

      expect(result.altNames).toEqual([]);
    });

    it('should extract RSA public key info', async () => {
      const now = new Date();
      const mockCert = {
        valid_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: 'rsa.example.com' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
        pubkey: Buffer.from('fake-pubkey'), // Will be handled by try/catch
      };

      const mockSocket = createMockSocket({ cert: mockCert });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await inspectTLS('rsa.example.com', 443);

      // pubkey parsing may fail with fake data, should be null
      expect(result.pubkey).toBeNull();
    });

    it('should use default port 443', async () => {
      const now = new Date();
      const mockCert = {
        valid_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: 'example.com' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
      };

      const mockSocket = createMockSocket({ cert: mockCert });

      mockedConnect.mockImplementation((port, _host, _options, callback) => {
        expect(port).toBe(443);
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      await inspectTLS('example.com'); // No port specified
    });

    it('should pass custom port', async () => {
      const now = new Date();
      const mockCert = {
        valid_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: 'example.com' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
      };

      const mockSocket = createMockSocket({ cert: mockCert });

      mockedConnect.mockImplementation((port, _host, _options, callback) => {
        expect(port).toBe(8443);
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      await inspectTLS('example.com', 8443);
    });

    it('should include ext_key_usage when present', async () => {
      const now = new Date();
      const mockCert = {
        valid_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: 'example.com' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
        ext_key_usage: ['serverAuth', 'clientAuth', 'codeSigning'],
      };

      const mockSocket = createMockSocket({ cert: mockCert });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await inspectTLS('example.com', 443);

      expect(result.extKeyUsage).toContain('serverAuth');
      expect(result.extKeyUsage).toContain('clientAuth');
      expect(result.extKeyUsage).toContain('codeSigning');
    });

    it('should extract RSA public key with modulusLength', async () => {
      const now = new Date();
      const mockCert = {
        valid_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: 'rsa.example.com' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
        pubkey: Buffer.from('mock-rsa-pubkey'),
      };

      mockedCreatePublicKey.mockReturnValue({
        asymmetricKeyType: 'rsa',
        asymmetricKeyDetails: { modulusLength: 2048 },
      } as any);

      const mockSocket = createMockSocket({ cert: mockCert });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await inspectTLS('rsa.example.com', 443);

      expect(result.pubkey).toEqual({ algo: 'rsa', size: 2048 });
    });

    it('should extract EC P-256 public key', async () => {
      const now = new Date();
      const mockCert = {
        valid_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: 'ec256.example.com' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
        pubkey: Buffer.from('mock-ec-pubkey'),
      };

      mockedCreatePublicKey.mockReturnValue({
        asymmetricKeyType: 'ec',
        asymmetricKeyDetails: { namedCurve: 'prime256v1' },
      } as any);

      const mockSocket = createMockSocket({ cert: mockCert });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await inspectTLS('ec256.example.com', 443);

      expect(result.pubkey).toEqual({ algo: 'ec', size: 256 });
    });

    it('should extract EC P-384 public key', async () => {
      const now = new Date();
      const mockCert = {
        valid_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: 'ec384.example.com' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
        pubkey: Buffer.from('mock-ec-pubkey'),
      };

      mockedCreatePublicKey.mockReturnValue({
        asymmetricKeyType: 'ec',
        asymmetricKeyDetails: { namedCurve: 'secp384r1' },
      } as any);

      const mockSocket = createMockSocket({ cert: mockCert });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await inspectTLS('ec384.example.com', 443);

      expect(result.pubkey).toEqual({ algo: 'ec', size: 384 });
    });

    it('should extract EC P-521 public key', async () => {
      const now = new Date();
      const mockCert = {
        valid_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: 'ec521.example.com' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
        pubkey: Buffer.from('mock-ec-pubkey'),
      };

      mockedCreatePublicKey.mockReturnValue({
        asymmetricKeyType: 'ec',
        asymmetricKeyDetails: { namedCurve: 'secp521r1' },
      } as any);

      const mockSocket = createMockSocket({ cert: mockCert });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await inspectTLS('ec521.example.com', 443);

      expect(result.pubkey).toEqual({ algo: 'ec', size: 521 });
    });

    it('should return null pubkey when no asymmetricKeyDetails', async () => {
      const now = new Date();
      const mockCert = {
        valid_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        issuer: { CN: 'Test CA' },
        subject: { CN: 'unknown.example.com' },
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD',
        serialNumber: '123',
        pubkey: Buffer.from('mock-pubkey'),
      };

      mockedCreatePublicKey.mockReturnValue({
        asymmetricKeyType: 'unknown',
        asymmetricKeyDetails: undefined,
      } as any);

      const mockSocket = createMockSocket({ cert: mockCert });

      mockedConnect.mockImplementation((_port, _host, _options, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await inspectTLS('unknown.example.com', 443);

      expect(result.pubkey).toBeNull();
    });

    it('should handle connection timeout', async () => {
      const mockSocket = createMockSocket({ shouldTimeout: true });

      mockedConnect.mockImplementation(() => {
        return mockSocket;
      });

      await expect(inspectTLS('slow.example.com', 443)).rejects.toThrow('TLS connection timed out');
    });
  });
});
