import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:dns
vi.mock('node:dns', () => ({
  promises: {
    resolveTxt: vi.fn(),
    resolveCaa: vi.fn(),
    resolveMx: vi.fn(),
  }
}));

import { promises as dns } from 'node:dns';
import { getSecurityRecords } from '../../src/utils/dns-toolkit.js';

describe('DNS Toolkit', () => {
  const mockedResolveTxt = vi.mocked(dns.resolveTxt);
  const mockedResolveCaa = vi.mocked(dns.resolveCaa);
  const mockedResolveMx = vi.mocked(dns.resolveMx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSecurityRecords', () => {
    it('should resolve TXT records', async () => {
      mockedResolveTxt.mockResolvedValueOnce([
        ['some', 'txt', 'record'],
        ['another record']
      ]);
      mockedResolveTxt.mockRejectedValueOnce(new Error('No DMARC'));
      mockedResolveCaa.mockRejectedValueOnce(new Error('No CAA'));
      mockedResolveMx.mockRejectedValueOnce(new Error('No MX'));

      const result = await getSecurityRecords('example.com');

      expect(result.txt).toEqual(['sometxtrecord', 'another record']);
      expect(mockedResolveTxt).toHaveBeenCalledWith('example.com');
    });

    it('should parse SPF records', async () => {
      mockedResolveTxt.mockResolvedValueOnce([
        ['v=spf1 include:_spf.google.com ~all']
      ]);
      mockedResolveTxt.mockRejectedValueOnce(new Error('No DMARC'));
      mockedResolveCaa.mockRejectedValueOnce(new Error('No CAA'));
      mockedResolveMx.mockRejectedValueOnce(new Error('No MX'));

      const result = await getSecurityRecords('example.com');

      expect(result.spf).toEqual(['v=spf1 include:_spf.google.com ~all']);
    });

    it('should parse DMARC records', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 ~all']]);
      mockedResolveTxt.mockResolvedValueOnce([['v=DMARC1; p=reject; rua=mailto:admin@example.com']]);
      mockedResolveCaa.mockRejectedValueOnce(new Error('No CAA'));
      mockedResolveMx.mockRejectedValueOnce(new Error('No MX'));

      const result = await getSecurityRecords('example.com');

      expect(result.dmarc).toBe('v=DMARC1; p=reject; rua=mailto:admin@example.com');
      expect(mockedResolveTxt).toHaveBeenCalledWith('_dmarc.example.com');
    });

    it('should ignore non-DMARC TXT records at _dmarc subdomain', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 ~all']]);
      mockedResolveTxt.mockResolvedValueOnce([['some other record']]);
      mockedResolveCaa.mockRejectedValueOnce(new Error('No CAA'));
      mockedResolveMx.mockRejectedValueOnce(new Error('No MX'));

      const result = await getSecurityRecords('example.com');

      expect(result.dmarc).toBeUndefined();
    });

    it('should parse CAA records with issue', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 ~all']]);
      mockedResolveTxt.mockRejectedValueOnce(new Error('No DMARC'));
      mockedResolveCaa.mockResolvedValueOnce([
        { critical: 0, issue: 'letsencrypt.org' },
        { critical: 0, issue: 'digicert.com' }
      ] as any);
      mockedResolveMx.mockRejectedValueOnce(new Error('No MX'));

      const result = await getSecurityRecords('example.com');

      expect(result.caa).toBeDefined();
      expect(result.caa?.issue).toEqual(['letsencrypt.org', 'digicert.com']);
    });

    it('should parse CAA records with issuewild', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 ~all']]);
      mockedResolveTxt.mockRejectedValueOnce(new Error('No DMARC'));
      mockedResolveCaa.mockResolvedValueOnce([
        { critical: 0, issuewild: 'letsencrypt.org' }
      ] as any);
      mockedResolveMx.mockRejectedValueOnce(new Error('No MX'));

      const result = await getSecurityRecords('example.com');

      expect(result.caa?.issuewild).toEqual(['letsencrypt.org']);
    });

    it('should parse CAA records with iodef', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 ~all']]);
      mockedResolveTxt.mockRejectedValueOnce(new Error('No DMARC'));
      mockedResolveCaa.mockResolvedValueOnce([
        { critical: 0, iodef: 'mailto:security@example.com' }
      ] as any);
      mockedResolveMx.mockRejectedValueOnce(new Error('No MX'));

      const result = await getSecurityRecords('example.com');

      expect(result.caa?.iodef).toBe('mailto:security@example.com');
    });

    it('should parse MX records', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 ~all']]);
      mockedResolveTxt.mockRejectedValueOnce(new Error('No DMARC'));
      mockedResolveCaa.mockRejectedValueOnce(new Error('No CAA'));
      mockedResolveMx.mockResolvedValueOnce([
        { priority: 10, exchange: 'mail1.example.com' },
        { priority: 20, exchange: 'mail2.example.com' }
      ]);

      const result = await getSecurityRecords('example.com');

      expect(result.mx).toEqual(['mail1.example.com', 'mail2.example.com']);
    });

    it('should return all security records combined', async () => {
      mockedResolveTxt.mockResolvedValueOnce([
        ['v=spf1 include:_spf.google.com ~all'],
        ['google-site-verification=abcd1234']
      ]);
      mockedResolveTxt.mockResolvedValueOnce([['v=DMARC1; p=quarantine']]);
      mockedResolveCaa.mockResolvedValueOnce([
        { critical: 0, issue: 'letsencrypt.org' },
        { critical: 0, iodef: 'mailto:caa@example.com' }
      ] as any);
      mockedResolveMx.mockResolvedValueOnce([
        { priority: 10, exchange: 'aspmx.l.google.com' }
      ]);

      const result = await getSecurityRecords('example.com');

      expect(result.spf).toEqual(['v=spf1 include:_spf.google.com ~all']);
      expect(result.dmarc).toBe('v=DMARC1; p=quarantine');
      expect(result.caa?.issue).toEqual(['letsencrypt.org']);
      expect(result.caa?.iodef).toBe('mailto:caa@example.com');
      expect(result.mx).toEqual(['aspmx.l.google.com']);
      expect(result.txt).toHaveLength(2);
    });

    it('should throw error when DNS resolution fails', async () => {
      mockedResolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));

      await expect(getSecurityRecords('nonexistent.invalid')).rejects.toThrow(
        'Failed to resolve DNS for nonexistent.invalid'
      );
    });

    it('should handle domain with no SPF records', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['other-record']]);
      mockedResolveTxt.mockRejectedValueOnce(new Error('No DMARC'));
      mockedResolveCaa.mockRejectedValueOnce(new Error('No CAA'));
      mockedResolveMx.mockRejectedValueOnce(new Error('No MX'));

      const result = await getSecurityRecords('example.com');

      expect(result.spf).toEqual([]);
    });

    it('should handle multiple SPF records', async () => {
      mockedResolveTxt.mockResolvedValueOnce([
        ['v=spf1 include:_spf1.google.com ~all'],
        ['v=spf1 include:_spf2.google.com ~all']
      ]);
      mockedResolveTxt.mockRejectedValueOnce(new Error('No DMARC'));
      mockedResolveCaa.mockRejectedValueOnce(new Error('No CAA'));
      mockedResolveMx.mockRejectedValueOnce(new Error('No MX'));

      const result = await getSecurityRecords('example.com');

      expect(result.spf).toHaveLength(2);
    });

    it('should handle empty CAA response', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 ~all']]);
      mockedResolveTxt.mockRejectedValueOnce(new Error('No DMARC'));
      mockedResolveCaa.mockResolvedValueOnce([]);
      mockedResolveMx.mockRejectedValueOnce(new Error('No MX'));

      const result = await getSecurityRecords('example.com');

      // Empty CAA array results in undefined or empty object
      expect(result.caa === undefined || Object.keys(result.caa || {}).length === 0).toBe(true);
    });
  });
});
