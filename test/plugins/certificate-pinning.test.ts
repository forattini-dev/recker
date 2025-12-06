import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  certificatePinning,
  certificatePinningPlugin,
  CertificatePinningError,
  clearPinCache,
  getPinCacheStats,
  generatePinsFromHost,
  preloadPins,
  validateCertificate,
  reportPinFailure,
  extractCertificateInfo,
  type CertificateInfo,
  type PinConfig,
} from '../../src/plugins/certificate-pinning.js';
import { HttpRequest } from '../../src/core/request.js';
import * as crypto from 'node:crypto';

describe('CertificatePinning Plugin', () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearPinCache();
    next = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers() });
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CertificatePinningError', () => {
    it('should create error with correct properties', () => {
      const error = new CertificatePinningError('test message', 'example.com', ['pin1']);
      expect(error.message).toBe('test message');
      expect(error.hostname).toBe('example.com');
      expect(error.name).toBe('CertificatePinningError');
    });

    it('should be instanceof Error', () => {
      const error = new CertificatePinningError('test', 'host', []);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CertificatePinningError);
    });

    it('should store expected pins', () => {
      const pins = ['pin1', 'pin2'];
      const error = new CertificatePinningError('test', 'host', pins);
      expect(error.expectedPins).toEqual(pins);
    });
  });

  describe('clearPinCache and getPinCacheStats', () => {
    it('should clear cache and return stats', () => {
      const stats = getPinCacheStats();
      expect(stats).toBeDefined();
      expect(typeof stats.size).toBe('number');

      clearPinCache();
      const statsAfter = getPinCacheStats();
      expect(statsAfter.size).toBe(0);
    });
  });

  describe('Middleware Logic', () => {
    it('should skip non-HTTPS requests', async () => {
      const middleware = certificatePinning({ pins: { 'example.com': { sha256: ['any'] } } });

      const req = new HttpRequest('http://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledWith(req);
    });

    it('should skip requests if skip function returns true', async () => {
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        skip: (req) => req.url.includes('skipme'),
      });

      const req = new HttpRequest('https://example.com/skipme', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledWith(req);
    });

    it('should pass through if no pin configured for host', async () => {
      const middleware = certificatePinning({ pins: { 'other.com': { sha256: ['any'] } } });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledWith(req);
    });

    it('should handle requests with custom ports', async () => {
      const middleware = certificatePinning({ pins: { 'example.com': { sha256: ['any'] } } });

      const req = new HttpRequest('https://example.com:8443/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should handle network errors', async () => {
      const onErrorSpy = vi.fn();
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        onError: onErrorSpy,
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      next.mockRejectedValue(new Error('Network error'));

      await expect(middleware(req, next)).rejects.toThrow('Network error');
    });

    it('should support wildcard patterns', async () => {
      const middleware = certificatePinning({
        pins: { '*.example.com': { sha256: ['any'] } },
      });

      const req = new HttpRequest('https://api.example.com/test', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should support includeSubdomains option', async () => {
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        includeSubdomains: true,
      });

      const req = new HttpRequest('https://sub.example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should cache results', async () => {
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        cache: true,
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);
      await middleware(req, next);

      expect(next).toHaveBeenCalledTimes(2);
      const stats = getPinCacheStats();
      expect(stats.size).toBe(1);
    });

    it('should support cache disabled', async () => {
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        cache: false,
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should support cacheMaxAge option', async () => {
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        cacheMaxAge: 1000,
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('Pin configurations', () => {
    it('should support sha256 pins', async () => {
      const middleware = certificatePinning({
        pins: {
          'example.com': {
            sha256: ['abc123def456'],
          },
        },
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should support spki pins', async () => {
      const middleware = certificatePinning({
        pins: {
          'example.com': {
            spki: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
          },
        },
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should support backup pins', async () => {
      const middleware = certificatePinning({
        pins: {
          'example.com': {
            sha256: ['primary-pin'],
            backup: ['backup-pin-1', 'backup-pin-2'],
          },
        },
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should support issuer pinning', async () => {
      const middleware = certificatePinning({
        pins: {
          'example.com': {
            issuer: 'DigiCert',
          },
        },
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should support subject pinning', async () => {
      const middleware = certificatePinning({
        pins: {
          'example.com': {
            subject: 'example.com',
          },
        },
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should support minValidDays', async () => {
      const middleware = certificatePinning({
        pins: {
          'example.com': {
            sha256: ['abc123'],
            minValidDays: 30,
          },
        },
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should support allowExpired', async () => {
      const middleware = certificatePinning({
        pins: {
          'example.com': {
            sha256: ['abc123'],
            allowExpired: true,
          },
        },
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('onPinFailure modes', () => {
    it('should support reject mode', async () => {
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        onPinFailure: 'reject',
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should support warn mode', async () => {
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        onPinFailure: 'warn',
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should support report mode with reportUri', async () => {
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        onPinFailure: 'report',
        reportUri: 'https://report.example.com/hpkp',
      });

      const req = new HttpRequest('https://example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('Fingerprint utilities', () => {
    it('should calculate SHA-256 fingerprint correctly', () => {
      const data = Buffer.from('test_cert_data');
      const hash = crypto.createHash('sha256').update(data).digest('hex');
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should normalize fingerprints with colons', () => {
      const withColons = 'AA:BB:CC:DD:EE:FF';
      const normalized = withColons.replace(/:/g, '').toLowerCase();
      expect(normalized).toBe('aabbccddeeff');
    });

    it('should calculate base64 SPKI fingerprint', () => {
      const pubkey = Buffer.from('test_public_key');
      const spki = crypto.createHash('sha256').update(pubkey).digest('base64');
      expect(spki).toBeDefined();
      expect(spki.endsWith('=')).toBe(true);
    });
  });

  describe('certificatePinningPlugin', () => {
    it('should create plugin that adds middleware', () => {
      const plugin = certificatePinningPlugin({
        pins: {
          'example.com': { sha256: ['abc123'] }
        }
      });

      const mockClient = {
        use: vi.fn()
      };

      plugin(mockClient as any);

      expect(mockClient.use).toHaveBeenCalledTimes(1);
      expect(mockClient.use).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should pass options to middleware', () => {
      const plugin = certificatePinningPlugin({
        pins: {
          'example.com': { sha256: ['abc123'] },
          '*.test.com': { spki: ['def456'] }
        },
        includeSubdomains: true,
        onPinFailure: 'warn'
      });

      const mockClient = { use: vi.fn() };
      plugin(mockClient as any);

      expect(mockClient.use).toHaveBeenCalled();
    });
  });

  describe('generatePinsFromHost', () => {
    it('should connect to host and retrieve pins', async () => {
      // Integration test - makes real connection
      const pins = await generatePinsFromHost('google.com', 443);

      expect(pins.sha256).toBeDefined();
      expect(typeof pins.sha256).toBe('string');
      expect(pins.sha256.length).toBeGreaterThan(0);
    }, 15000);

    it('should use default port 443', async () => {
      const pins = await generatePinsFromHost('github.com');

      expect(pins.sha256).toBeDefined();
    }, 15000);

    it('should reject for invalid host', async () => {
      await expect(
        generatePinsFromHost('this-host-does-not-exist-xyz123.invalid', 443)
      ).rejects.toThrow();
    }, 10000);

    it('should include SPKI when available', async () => {
      const pins = await generatePinsFromHost('google.com');

      expect(pins.sha256).toBeDefined();
      // SPKI may or may not be available depending on the cert
      if (pins.spki) {
        expect(typeof pins.spki).toBe('string');
      }
    }, 15000);
  });

  describe('preloadPins', () => {
    it('should preload pins for multiple hosts', async () => {
      const results = await preloadPins(['google.com', 'github.com']);

      expect(results.size).toBeGreaterThanOrEqual(1);
    }, 20000);

    it('should skip hosts that fail', async () => {
      const results = await preloadPins([
        'google.com',
        'invalid-host-xyz123.invalid'
      ]);

      expect(results.size).toBeGreaterThanOrEqual(1);
      expect(results.get('google.com')).toBeDefined();
      expect(results.has('invalid-host-xyz123.invalid')).toBe(false);
    }, 20000);

    it('should handle custom port in host string', async () => {
      const results = await preloadPins(['google.com:443']);

      expect(results.size).toBe(1);
      expect(results.get('google.com:443')).toBeDefined();
    }, 15000);

    it('should return empty map for all failed hosts', async () => {
      const results = await preloadPins([
        'invalid1.invalid',
        'invalid2.invalid'
      ]);

      expect(results.size).toBe(0);
    }, 10000);

    it('should handle empty array', async () => {
      const results = await preloadPins([]);

      expect(results.size).toBe(0);
    });
  });

  describe('hostname matching edge cases', () => {
    it('should match exact wildcard *', async () => {
      const middleware = certificatePinning({
        pins: { '*': { sha256: ['any'] } }
      });

      const req = new HttpRequest('https://anything.example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should match deep subdomain with *.domain pattern', async () => {
      const middleware = certificatePinning({
        pins: { '*.example.com': { sha256: ['any'] } }
      });

      const req = new HttpRequest('https://a.b.c.example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should match parent domain with includeSubdomains', async () => {
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        includeSubdomains: true
      });

      // Test deep subdomain
      const req = new HttpRequest('https://deep.sub.example.com/api', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should not match unrelated domain with includeSubdomains', async () => {
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        includeSubdomains: true
      });

      const req = new HttpRequest('https://notexample.com/api', { method: 'GET' });
      await middleware(req, next);

      // Should pass through (no pin configured for this host)
      expect(next).toHaveBeenCalledWith(req);
    });
  });

  describe('validateCertificate', () => {
    const validCert: CertificateInfo = {
      subject: 'CN=example.com',
      issuer: 'CN=DigiCert',
      validFrom: new Date(Date.now() - 86400000), // Yesterday
      validTo: new Date(Date.now() + 86400000 * 365), // 1 year from now
      fingerprint: 'AA:BB:CC:DD',
      fingerprintSha256: 'aabbccdd1234567890abcdef1234567890abcdef1234567890abcdef12345678',
      serialNumber: '123456',
      subjectPublicKeyInfo: Buffer.from('test-public-key').toString('base64'),
    };

    it('should return valid for matching certificate', () => {
      const result = validateCertificate(validCert, {});
      expect(result.valid).toBe(true);
    });

    it('should reject expired certificate', () => {
      const expiredCert: CertificateInfo = {
        ...validCert,
        validTo: new Date(Date.now() - 86400000), // Yesterday
      };
      const result = validateCertificate(expiredCert, {});
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Certificate has expired');
    });

    it('should allow expired certificate when allowExpired is true', () => {
      const expiredCert: CertificateInfo = {
        ...validCert,
        validTo: new Date(Date.now() - 86400000),
      };
      const result = validateCertificate(expiredCert, { allowExpired: true });
      expect(result.valid).toBe(true);
    });

    it('should reject certificate not yet valid', () => {
      const futureCert: CertificateInfo = {
        ...validCert,
        validFrom: new Date(Date.now() + 86400000), // Tomorrow
      };
      const result = validateCertificate(futureCert, {});
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Certificate is not yet valid');
    });

    it('should reject certificate expiring too soon', () => {
      const soonExpiringCert: CertificateInfo = {
        ...validCert,
        validTo: new Date(Date.now() + 86400000 * 10), // 10 days
      };
      const result = validateCertificate(soonExpiringCert, { minValidDays: 30 });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expires in');
    });

    it('should accept certificate with enough validity days', () => {
      const result = validateCertificate(validCert, { minValidDays: 30 });
      expect(result.valid).toBe(true);
    });

    it('should reject mismatched issuer', () => {
      const result = validateCertificate(validCert, { issuer: 'WrongCA' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Issuer mismatch');
    });

    it('should accept matching issuer', () => {
      const result = validateCertificate(validCert, { issuer: 'DigiCert' });
      expect(result.valid).toBe(true);
    });

    it('should reject mismatched subject', () => {
      const result = validateCertificate(validCert, { subject: 'other.com' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Subject mismatch');
    });

    it('should accept matching subject', () => {
      const result = validateCertificate(validCert, { subject: 'example.com' });
      expect(result.valid).toBe(true);
    });

    it('should reject mismatched sha256 fingerprint', () => {
      const result = validateCertificate(validCert, { sha256: ['wrongfingerprint'] });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('SHA-256 fingerprint');
    });

    it('should accept matching sha256 fingerprint', () => {
      const result = validateCertificate(validCert, {
        sha256: [validCert.fingerprintSha256]
      });
      expect(result.valid).toBe(true);
    });

    it('should accept backup pin when primary fails', () => {
      const result = validateCertificate(validCert, {
        sha256: ['wrongpin'],
        backup: [validCert.fingerprintSha256],
      });
      expect(result.valid).toBe(true);
    });

    it('should reject when both primary and backup pins fail', () => {
      const result = validateCertificate(validCert, {
        sha256: ['wrongpin'],
        backup: ['alsobadpin'],
      });
      expect(result.valid).toBe(false);
    });

    it('should handle fingerprints with colons', () => {
      const certWithColons: CertificateInfo = {
        ...validCert,
        fingerprintSha256: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
      };
      const result = validateCertificate(certWithColons, {
        sha256: ['aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899'],
      });
      expect(result.valid).toBe(true);
    });

    it('should reject mismatched SPKI fingerprint', () => {
      const result = validateCertificate(validCert, {
        spki: ['wrongspkifingerprint'],
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('SPKI fingerprint');
    });
  });

  describe('reportPinFailure', () => {
    it('should send POST request to reportUri', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));

      const error = new CertificatePinningError('test', 'example.com', ['pin1']);
      await reportPinFailure('https://report.example.com', 'example.com', error);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://report.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should silently ignore fetch failures', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const error = new CertificatePinningError('test', 'example.com', ['pin1']);
      // Should not throw
      await expect(reportPinFailure('https://report.example.com', 'example.com', error)).resolves.toBeUndefined();
    });

    it('should include error details in report body', async () => {
      let capturedBody: string | undefined;
      vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
        capturedBody = init?.body as string;
        return new Response('{}');
      });

      const error = new CertificatePinningError('Pin mismatch', 'example.com', ['pin1', 'pin2'], 'actualPin123');
      await reportPinFailure('https://report.example.com', 'example.com', error);

      const body = JSON.parse(capturedBody!);
      expect(body.hostname).toBe('example.com');
      expect(body.expectedPins).toEqual(['pin1', 'pin2']);
      expect(body.actualPin).toBe('actualPin123');
      expect(body.error).toBe('Pin mismatch');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('extractCertificateInfo', () => {
    it('should return null for socket without certificate', () => {
      const mockSocket = {
        getPeerCertificate: vi.fn().mockReturnValue(null),
      };
      const result = extractCertificateInfo(mockSocket as any);
      expect(result).toBeNull();
    });

    it('should return null for certificate without fingerprint256', () => {
      const mockSocket = {
        getPeerCertificate: vi.fn().mockReturnValue({ subject: 'test' }),
      };
      const result = extractCertificateInfo(mockSocket as any);
      expect(result).toBeNull();
    });

    it('should extract certificate info from valid socket', () => {
      const mockCert = {
        subject: { CN: 'example.com' },
        issuer: { CN: 'DigiCert' },
        valid_from: '2024-01-01T00:00:00Z',
        valid_to: '2025-01-01T00:00:00Z',
        fingerprint: 'AA:BB:CC',
        fingerprint256: 'AA:BB:CC:DD:EE:FF',
        serialNumber: '123456',
        pubkey: Buffer.from('test-pubkey'),
      };
      const mockSocket = {
        getPeerCertificate: vi.fn().mockReturnValue(mockCert),
      };

      const result = extractCertificateInfo(mockSocket as any);

      expect(result).not.toBeNull();
      expect(result!.fingerprint).toBe('AA:BB:CC');
      expect(result!.fingerprintSha256).toBe('AA:BB:CC:DD:EE:FF');
      expect(result!.serialNumber).toBe('123456');
      expect(result!.subjectPublicKeyInfo).toBeDefined();
    });

    it('should handle getPeerCertificate throwing error', () => {
      const mockSocket = {
        getPeerCertificate: vi.fn().mockImplementation(() => {
          throw new Error('Socket error');
        }),
      };
      const result = extractCertificateInfo(mockSocket as any);
      expect(result).toBeNull();
    });

    it('should handle subject as string', () => {
      const mockCert = {
        subject: 'CN=example.com',
        issuer: 'CN=CA',
        valid_from: '2024-01-01',
        valid_to: '2025-01-01',
        fingerprint: 'AA:BB',
        fingerprint256: 'CC:DD',
        serialNumber: '789',
      };
      const mockSocket = {
        getPeerCertificate: vi.fn().mockReturnValue(mockCert),
      };

      const result = extractCertificateInfo(mockSocket as any);
      expect(result!.subject).toBe('CN=example.com');
    });
  });

  describe('cache behavior', () => {
    it('should return cached stats with entries', async () => {
      const middleware = certificatePinning({
        pins: {
          'a.com': { sha256: ['abc'] },
          'b.com': { sha256: ['def'] }
        },
        cache: true
      });

      await middleware(new HttpRequest('https://a.com/api', { method: 'GET' }), next);
      await middleware(new HttpRequest('https://b.com/api', { method: 'GET' }), next);

      const stats = getPinCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.entries).toContain('a.com:443');
      expect(stats.entries).toContain('b.com:443');
    });

    it('should use different cache keys for different ports', async () => {
      const middleware = certificatePinning({
        pins: { 'example.com': { sha256: ['any'] } },
        cache: true
      });

      await middleware(new HttpRequest('https://example.com/api', { method: 'GET' }), next);
      await middleware(new HttpRequest('https://example.com:8443/api', { method: 'GET' }), next);

      const stats = getPinCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.entries).toContain('example.com:443');
      expect(stats.entries).toContain('example.com:8443');
    });
  });
});
