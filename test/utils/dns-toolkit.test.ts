import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:dns
vi.mock('node:dns', () => ({
  promises: {
    resolve4: vi.fn(),
    resolve6: vi.fn(),
    resolveTxt: vi.fn(),
    resolveCaa: vi.fn(),
    resolveMx: vi.fn(),
    resolveNs: vi.fn(),
    resolveCname: vi.fn(),
    resolveSoa: vi.fn(),
    resolvePtr: vi.fn(),
    resolveSrv: vi.fn(),
    resolveNaptr: vi.fn(),
    reverse: vi.fn(),
  },
  Resolver: vi.fn(() => ({
    setServers: vi.fn(),
    resolve4: vi.fn(),
    resolve6: vi.fn(),
    resolveMx: vi.fn(),
    resolveNs: vi.fn(),
    resolveTxt: vi.fn(),
    resolveCname: vi.fn(),
    resolveSoa: vi.fn(),
    resolvePtr: vi.fn(),
    resolveSrv: vi.fn(),
    resolveCaa: vi.fn(),
    resolveNaptr: vi.fn(),
    reverse: vi.fn(),
  })),
}));

import { promises as dns } from 'node:dns';
import {
  getSecurityRecords,
  generateDmarc,
  formatDigOutput,
  dnsLookup,
  dnsLookupAll,
  reverseLookup,
  validateSpf,
  validateDmarc,
  checkDkim,
  checkDnsHealth,
  dig,
  type DigResult,
} from '../../src/utils/dns-toolkit.js';

describe('DNS Toolkit', () => {
  const mockedResolve4 = vi.mocked(dns.resolve4);
  const mockedResolve6 = vi.mocked(dns.resolve6);
  const mockedResolveTxt = vi.mocked(dns.resolveTxt);
  const mockedResolveCaa = vi.mocked(dns.resolveCaa);
  const mockedResolveMx = vi.mocked(dns.resolveMx);
  const mockedResolveNs = vi.mocked(dns.resolveNs);
  const mockedResolveCname = vi.mocked(dns.resolveCname);
  const mockedResolveSoa = vi.mocked(dns.resolveSoa);
  const mockedResolvePtr = vi.mocked(dns.resolvePtr);
  const mockedResolveSrv = vi.mocked(dns.resolveSrv);
  const mockedResolveNaptr = vi.mocked(dns.resolveNaptr);
  const mockedReverse = vi.mocked(dns.reverse);

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

      expect(result.mx).toEqual([
        { priority: 10, exchange: 'mail1.example.com' },
        { priority: 20, exchange: 'mail2.example.com' }
      ]);
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
      expect(result.mx).toEqual([{ priority: 10, exchange: 'aspmx.l.google.com' }]);
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

  describe('generateDmarc', () => {
    it('should generate basic DMARC record', () => {
      const result = generateDmarc({ policy: 'reject' });
      expect(result).toBe('v=DMARC1; p=reject');
    });

    it('should include subdomain policy when different', () => {
      const result = generateDmarc({ policy: 'reject', subdomainPolicy: 'quarantine' });
      expect(result).toBe('v=DMARC1; p=reject; sp=quarantine');
    });

    it('should not include subdomain policy when same as policy', () => {
      const result = generateDmarc({ policy: 'reject', subdomainPolicy: 'reject' });
      expect(result).toBe('v=DMARC1; p=reject');
    });

    it('should include percentage when not 100', () => {
      const result = generateDmarc({ policy: 'reject', percentage: 50 });
      expect(result).toBe('v=DMARC1; p=reject; pct=50');
    });

    it('should not include percentage when 100', () => {
      const result = generateDmarc({ policy: 'reject', percentage: 100 });
      expect(result).toBe('v=DMARC1; p=reject');
    });

    it('should include aggregate reports', () => {
      const result = generateDmarc({
        policy: 'reject',
        aggregateReports: ['admin@example.com', 'security@example.com'],
      });
      expect(result).toContain('rua=mailto:admin@example.com,mailto:security@example.com');
    });

    it('should include forensic reports', () => {
      const result = generateDmarc({
        policy: 'reject',
        forensicReports: ['forensic@example.com'],
      });
      expect(result).toContain('ruf=mailto:forensic@example.com');
    });

    it('should include strict DKIM alignment', () => {
      const result = generateDmarc({ policy: 'reject', alignmentDkim: 'strict' });
      expect(result).toContain('adkim=s');
    });

    it('should include strict SPF alignment', () => {
      const result = generateDmarc({ policy: 'reject', alignmentSpf: 'strict' });
      expect(result).toContain('aspf=s');
    });

    it('should include custom report interval', () => {
      const result = generateDmarc({ policy: 'reject', reportInterval: 3600 });
      expect(result).toContain('ri=3600');
    });

    it('should not include default report interval', () => {
      const result = generateDmarc({ policy: 'reject', reportInterval: 86400 });
      expect(result).not.toContain('ri=');
    });

    it('should include failure options', () => {
      const result = generateDmarc({ policy: 'reject', failureOptions: '1' });
      expect(result).toContain('fo=1');
    });

    it('should generate complete DMARC record', () => {
      const result = generateDmarc({
        policy: 'reject',
        subdomainPolicy: 'quarantine',
        percentage: 75,
        aggregateReports: ['admin@example.com'],
        forensicReports: ['forensic@example.com'],
        alignmentDkim: 'strict',
        alignmentSpf: 'strict',
        reportInterval: 3600,
        failureOptions: '1',
      });
      expect(result).toContain('v=DMARC1');
      expect(result).toContain('p=reject');
      expect(result).toContain('sp=quarantine');
      expect(result).toContain('pct=75');
      expect(result).toContain('rua=mailto:admin@example.com');
      expect(result).toContain('ruf=mailto:forensic@example.com');
      expect(result).toContain('adkim=s');
      expect(result).toContain('aspf=s');
      expect(result).toContain('ri=3600');
      expect(result).toContain('fo=1');
    });
  });

  describe('formatDigOutput', () => {
    const baseResult: DigResult = {
      question: { name: 'example.com', type: 'A', class: 'IN' },
      answer: [
        { name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '93.184.216.34' },
      ],
      server: '8.8.8.8',
      queryTime: 25,
      when: new Date('2024-01-15T12:00:00Z'),
    };

    it('should format short output', () => {
      const result = formatDigOutput(baseResult, true);
      expect(result).toBe('93.184.216.34');
    });

    it('should format short output with multiple answers', () => {
      const multiResult: DigResult = {
        ...baseResult,
        answer: [
          { name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '93.184.216.34' },
          { name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '93.184.216.35' },
        ],
      };
      const result = formatDigOutput(multiResult, true);
      expect(result).toBe('93.184.216.34\n93.184.216.35');
    });

    it('should format full output with header', () => {
      const result = formatDigOutput(baseResult, false);
      expect(result).toContain('rek dig');
      expect(result).toContain('example.com');
      expect(result).toContain('QUESTION SECTION');
      expect(result).toContain('ANSWER SECTION');
    });

    it('should include query time in full output', () => {
      const result = formatDigOutput(baseResult, false);
      expect(result).toContain('Query time: 25 msec');
    });

    it('should include server in full output', () => {
      const result = formatDigOutput(baseResult, false);
      expect(result).toContain('SERVER: 8.8.8.8');
    });

    it('should format empty answer', () => {
      const emptyResult: DigResult = {
        ...baseResult,
        answer: [],
      };
      const result = formatDigOutput(emptyResult, false);
      expect(result).not.toContain('ANSWER SECTION');
    });
  });

  describe('dnsLookup', () => {
    it('should resolve A records', async () => {
      mockedResolve4.mockResolvedValueOnce([
        { address: '93.184.216.34', ttl: 300 },
      ] as any);

      const result = await dnsLookup('example.com', 'A');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('A');
      expect(result[0].data).toBe('93.184.216.34');
    });

    it('should resolve AAAA records', async () => {
      mockedResolve6.mockResolvedValueOnce([
        { address: '2606:2800:220:1:248:1893:25c8:1946', ttl: 300 },
      ] as any);

      const result = await dnsLookup('example.com', 'AAAA');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('AAAA');
    });

    it('should resolve CNAME records', async () => {
      mockedResolveCname.mockResolvedValueOnce(['www.example.com']);

      const result = await dnsLookup('alias.example.com', 'CNAME');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CNAME');
      expect(result[0].data).toBe('www.example.com');
    });

    it('should resolve MX records', async () => {
      mockedResolveMx.mockResolvedValueOnce([
        { priority: 10, exchange: 'mail.example.com' },
      ]);

      const result = await dnsLookup('example.com', 'MX');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('MX');
      expect(result[0].data).toEqual({ priority: 10, exchange: 'mail.example.com' });
    });

    it('should resolve NS records', async () => {
      mockedResolveNs.mockResolvedValueOnce(['ns1.example.com', 'ns2.example.com']);

      const result = await dnsLookup('example.com', 'NS');
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('NS');
    });

    it('should resolve TXT records', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1', ' ~all']]);

      const result = await dnsLookup('example.com', 'TXT');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('TXT');
      expect(result[0].data).toBe('v=spf1 ~all');
    });

    it('should resolve SOA records', async () => {
      mockedResolveSoa.mockResolvedValueOnce({
        nsname: 'ns1.example.com',
        hostmaster: 'admin.example.com',
        serial: 2024011501,
        refresh: 7200,
        retry: 3600,
        expire: 604800,
        minttl: 3600,
      } as any);

      const result = await dnsLookup('example.com', 'SOA');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('SOA');
    });

    it('should resolve PTR records', async () => {
      mockedResolvePtr.mockResolvedValueOnce(['host.example.com']);

      const result = await dnsLookup('34.216.184.93.in-addr.arpa', 'PTR');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('PTR');
    });

    it('should resolve SRV records', async () => {
      mockedResolveSrv.mockResolvedValueOnce([
        { priority: 0, weight: 5, port: 5269, name: 'xmpp.example.com' },
      ]);

      const result = await dnsLookup('_xmpp._tcp.example.com', 'SRV');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('SRV');
    });

    it('should resolve CAA records', async () => {
      mockedResolveCaa.mockResolvedValueOnce([
        { critical: 0, issue: 'letsencrypt.org' },
      ] as any);

      const result = await dnsLookup('example.com', 'CAA');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CAA');
    });

    it('should resolve NAPTR records', async () => {
      mockedResolveNaptr.mockResolvedValueOnce([
        { order: 100, preference: 10, flags: 'u', service: 'E2U+sip', regexp: '!^.*$!sip:info@example.com!', replacement: '' },
      ]);

      const result = await dnsLookup('example.com', 'NAPTR');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('NAPTR');
    });

    it('should return empty array for ENODATA', async () => {
      const error = new Error('ENODATA') as any;
      error.code = 'ENODATA';
      mockedResolve4.mockRejectedValueOnce(error);

      const result = await dnsLookup('example.com', 'A');
      expect(result).toEqual([]);
    });

    it('should return empty array for ENOTFOUND', async () => {
      const error = new Error('ENOTFOUND') as any;
      error.code = 'ENOTFOUND';
      mockedResolve4.mockRejectedValueOnce(error);

      const result = await dnsLookup('example.com', 'A');
      expect(result).toEqual([]);
    });

    it('should throw for unsupported record type', async () => {
      await expect(dnsLookup('example.com', 'UNKNOWN')).rejects.toThrow('Unsupported DNS record type');
    });

    it('should handle case-insensitive type', async () => {
      mockedResolve4.mockResolvedValueOnce([{ address: '1.2.3.4', ttl: 300 }] as any);

      const result = await dnsLookup('example.com', 'a');
      expect(result[0].type).toBe('A');
    });
  });

  describe('reverseLookup', () => {
    it('should resolve IP to hostname', async () => {
      mockedReverse.mockResolvedValueOnce(['host.example.com']);

      const result = await reverseLookup('93.184.216.34');
      expect(result).toEqual(['host.example.com']);
    });

    it('should return empty array for ENOTFOUND', async () => {
      const error = new Error('ENOTFOUND') as any;
      error.code = 'ENOTFOUND';
      mockedReverse.mockRejectedValueOnce(error);

      const result = await reverseLookup('1.2.3.4');
      expect(result).toEqual([]);
    });

    it('should throw for other errors', async () => {
      mockedReverse.mockRejectedValueOnce(new Error('Network error'));

      await expect(reverseLookup('1.2.3.4')).rejects.toThrow('Network error');
    });
  });

  describe('validateSpf', () => {
    it('should validate valid SPF record', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 include:_spf.google.com -all']]);

      const result = await validateSpf('example.com');
      expect(result.valid).toBe(true);
      expect(result.record).toBe('v=spf1 include:_spf.google.com -all');
      expect(result.mechanisms).toContain('include:_spf.google.com');
      expect(result.mechanisms).toContain('-all');
    });

    it('should detect missing SPF record', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['other-record']]);

      const result = await validateSpf('example.com');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No SPF record found');
    });

    it('should detect multiple SPF records', async () => {
      mockedResolveTxt.mockResolvedValueOnce([
        ['v=spf1 include:a.com ~all'],
        ['v=spf1 include:b.com ~all'],
      ]);

      const result = await validateSpf('example.com');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Multiple SPF records');
    });

    it('should count DNS lookups', async () => {
      mockedResolveTxt.mockResolvedValueOnce([
        ['v=spf1 include:a.com include:b.com mx a ptr -all'],
      ]);

      const result = await validateSpf('example.com');
      expect(result.lookupCount).toBeGreaterThan(0);
      expect(result.includes).toContain('a.com');
      expect(result.includes).toContain('b.com');
    });

    it('should warn about high lookup count', async () => {
      mockedResolveTxt.mockResolvedValueOnce([
        ['v=spf1 include:a.com include:b.com include:c.com include:d.com include:e.com include:f.com include:g.com include:h.com -all'],
      ]);

      const result = await validateSpf('example.com');
      expect(result.warnings.some(w => w.includes('lookup'))).toBe(true);
    });

    it('should error on too many lookups', async () => {
      mockedResolveTxt.mockResolvedValueOnce([
        ['v=spf1 include:1.com include:2.com include:3.com include:4.com include:5.com include:6.com include:7.com include:8.com include:9.com include:10.com include:11.com -all'],
      ]);

      const result = await validateSpf('example.com');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Too many DNS lookups'))).toBe(true);
    });

    it('should warn about missing all mechanism', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 include:a.com']]);

      const result = await validateSpf('example.com');
      expect(result.warnings.some(w => w.includes('all'))).toBe(true);
    });

    it('should error on +all', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 +all']]);

      const result = await validateSpf('example.com');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('+all'))).toBe(true);
    });

    it('should handle DNS errors', async () => {
      mockedResolveTxt.mockRejectedValueOnce(new Error('DNS error'));

      const result = await validateSpf('example.com');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('DNS lookup failed'))).toBe(true);
    });

    it('should handle redirect mechanism', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 redirect=_spf.example.com']]);

      const result = await validateSpf('example.com');
      expect(result.lookupCount).toBe(1);
    });
  });

  describe('validateDmarc', () => {
    it('should validate DMARC with reject policy', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=DMARC1; p=reject; rua=mailto:admin@example.com']]);

      const result = await validateDmarc('example.com');
      expect(result.valid).toBe(true);
      expect(result.policy).toBe('reject');
      expect(result.rua).toContain('mailto:admin@example.com');
    });

    it('should warn about none policy', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=DMARC1; p=none']]);

      const result = await validateDmarc('example.com');
      expect(result.valid).toBe(true);
      expect(result.policy).toBe('none');
      expect(result.warnings.some(w => w.includes('none'))).toBe(true);
    });

    it('should parse subdomain policy', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=DMARC1; p=reject; sp=quarantine']]);

      const result = await validateDmarc('example.com');
      expect(result.subdomainPolicy).toBe('quarantine');
    });

    it('should parse percentage', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=DMARC1; p=reject; pct=50']]);

      const result = await validateDmarc('example.com');
      expect(result.percentage).toBe(50);
      expect(result.warnings.some(w => w.includes('50%'))).toBe(true);
    });

    it('should parse forensic reports', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=DMARC1; p=reject; ruf=mailto:forensic@example.com']]);

      const result = await validateDmarc('example.com');
      expect(result.ruf).toContain('mailto:forensic@example.com');
    });

    it('should warn about missing rua', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=DMARC1; p=reject']]);

      const result = await validateDmarc('example.com');
      expect(result.warnings.some(w => w.includes('aggregate report'))).toBe(true);
    });

    it('should handle missing DMARC record', async () => {
      const error = new Error('ENODATA') as any;
      error.code = 'ENODATA';
      mockedResolveTxt.mockRejectedValueOnce(error);

      const result = await validateDmarc('example.com');
      expect(result.valid).toBe(false);
      expect(result.warnings.some(w => w.includes('No DMARC'))).toBe(true);
    });

    it('should handle non-DMARC TXT record', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['other-record']]);

      const result = await validateDmarc('example.com');
      expect(result.valid).toBe(false);
      expect(result.warnings.some(w => w.includes('No DMARC'))).toBe(true);
    });
  });

  describe('checkDkim', () => {
    it('should find DKIM record with public key', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=DKIM1; k=rsa; p=MIGfMA0GCSqG']]);

      const result = await checkDkim('example.com', 'default');
      expect(result.found).toBe(true);
      expect(result.publicKey).toBe('MIGfMA0GCSqG');
    });

    it('should return not found for missing DKIM', async () => {
      mockedResolveTxt.mockRejectedValueOnce(new Error('ENODATA'));

      const result = await checkDkim('example.com', 'google');
      expect(result.found).toBe(false);
    });

    it('should handle DKIM without public key', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=DKIM1; k=rsa']]);

      const result = await checkDkim('example.com', 'default');
      expect(result.found).toBe(true);
      expect(result.publicKey).toBeUndefined();
    });
  });

  describe('dnsLookupAll', () => {
    it('should return results for all record types', async () => {
      mockedResolve4.mockResolvedValueOnce([{ address: '1.2.3.4', ttl: 300 }] as any);
      mockedResolve6.mockRejectedValueOnce({ code: 'ENODATA' });
      mockedResolveCname.mockRejectedValueOnce({ code: 'ENODATA' });
      mockedResolveMx.mockResolvedValueOnce([{ priority: 10, exchange: 'mail.example.com' }]);
      mockedResolveNs.mockResolvedValueOnce(['ns1.example.com']);
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 ~all']]);
      mockedResolveSoa.mockResolvedValueOnce({
        nsname: 'ns1.example.com',
        hostmaster: 'admin.example.com',
        serial: 2024,
        refresh: 7200,
        retry: 3600,
        expire: 604800,
        minttl: 3600,
      } as any);
      mockedResolveCaa.mockResolvedValueOnce([{ critical: 0, issue: 'letsencrypt.org' }] as any);

      const result = await dnsLookupAll('example.com');

      expect(result.length).toBeGreaterThan(0);
      expect(result.some(r => r.type === 'A')).toBe(true);
      expect(result.some(r => r.type === 'MX')).toBe(true);
    });

    it('should handle errors gracefully for each type', async () => {
      // All lookups fail
      mockedResolve4.mockRejectedValueOnce(new Error('DNS error'));
      mockedResolve6.mockRejectedValueOnce(new Error('DNS error'));
      mockedResolveCname.mockRejectedValueOnce(new Error('DNS error'));
      mockedResolveMx.mockRejectedValueOnce(new Error('DNS error'));
      mockedResolveNs.mockRejectedValueOnce(new Error('DNS error'));
      mockedResolveTxt.mockRejectedValueOnce(new Error('DNS error'));
      mockedResolveSoa.mockRejectedValueOnce(new Error('DNS error'));
      mockedResolveCaa.mockRejectedValueOnce(new Error('DNS error'));

      const result = await dnsLookupAll('example.com');

      expect(result).toEqual([]);
    });
  });

  describe('checkDnsHealth', () => {
    const setupFullMocks = () => {
      // A and AAAA records
      mockedResolve4.mockResolvedValue([{ address: '1.2.3.4', ttl: 300 }] as any);
      mockedResolve6.mockResolvedValue([{ address: '2001:db8::1', ttl: 300 }] as any);

      // NS records (2+ for redundancy)
      mockedResolveNs.mockResolvedValue(['ns1.example.com', 'ns2.example.com']);

      // SOA record
      mockedResolveSoa.mockResolvedValue({
        nsname: 'ns1.example.com',
        hostmaster: 'admin.example.com',
        serial: 2024,
        refresh: 7200,
        retry: 3600,
        expire: 604800,
        minttl: 3600,
      } as any);

      // SPF record
      mockedResolveTxt
        .mockResolvedValueOnce([['v=spf1 include:_spf.google.com -all']]) // For validateSpf
        .mockResolvedValueOnce([['v=DMARC1; p=reject; rua=mailto:admin@example.com']]); // For validateDmarc

      // MX records
      mockedResolveMx.mockResolvedValue([
        { priority: 10, exchange: 'mail.example.com' },
      ]);

      // CAA records
      mockedResolveCaa.mockResolvedValue([
        { critical: 0, issue: 'letsencrypt.org' },
      ] as any);
    };

    it('should return health report with checks', async () => {
      setupFullMocks();

      const report = await checkDnsHealth('example.com');

      expect(report.domain).toBe('example.com');
      expect(report.score).toBeGreaterThan(0);
      expect(report.grade).toBeDefined();
      expect(report.checks.length).toBeGreaterThan(0);
    });

    it('should pass A/AAAA check with records', async () => {
      setupFullMocks();

      const report = await checkDnsHealth('example.com');

      const aCheck = report.checks.find(c => c.name === 'A/AAAA Records');
      expect(aCheck?.status).toBe('pass');
    });

    it('should fail A/AAAA check without records', async () => {
      mockedResolve4.mockResolvedValue([]);
      mockedResolve6.mockResolvedValue([]);
      mockedResolveNs.mockRejectedValue({ code: 'ENODATA' });
      mockedResolveSoa.mockRejectedValue({ code: 'ENODATA' });
      mockedResolveTxt.mockRejectedValue({ code: 'ENODATA' });
      mockedResolveMx.mockRejectedValue({ code: 'ENODATA' });
      mockedResolveCaa.mockRejectedValue({ code: 'ENODATA' });

      const report = await checkDnsHealth('example.com');

      const aCheck = report.checks.find(c => c.name === 'A/AAAA Records');
      expect(aCheck?.status).toBe('fail');
    });

    it('should warn about single nameserver', async () => {
      mockedResolve4.mockResolvedValue([{ address: '1.2.3.4', ttl: 300 }] as any);
      mockedResolve6.mockResolvedValue([]);
      mockedResolveNs.mockResolvedValue(['ns1.example.com']); // Only 1 NS
      mockedResolveSoa.mockRejectedValue({ code: 'ENODATA' });
      mockedResolveTxt.mockRejectedValue({ code: 'ENODATA' });
      mockedResolveMx.mockRejectedValue({ code: 'ENODATA' });
      mockedResolveCaa.mockRejectedValue({ code: 'ENODATA' });

      const report = await checkDnsHealth('example.com');

      const nsCheck = report.checks.find(c => c.name === 'Nameservers');
      expect(nsCheck?.status).toBe('warn');
    });

    it('should assign grade based on score', async () => {
      setupFullMocks();

      const report = await checkDnsHealth('example.com');

      expect(['A', 'B', 'C', 'D', 'F']).toContain(report.grade);
    });
  });

  describe('dig', () => {
    it('should perform A record lookup', async () => {
      mockedResolve4.mockResolvedValueOnce([
        { address: '93.184.216.34', ttl: 300 },
      ] as any);

      const result = await dig('example.com', { type: 'A' });
      expect(result.question.type).toBe('A');
      expect(result.answer).toHaveLength(1);
      expect(result.answer[0].data).toBe('93.184.216.34');
    });

    it('should perform AAAA record lookup', async () => {
      mockedResolve6.mockResolvedValueOnce([
        { address: '2606:2800:220:1:248:1893:25c8:1946', ttl: 300 },
      ] as any);

      const result = await dig('example.com', { type: 'AAAA' });
      expect(result.question.type).toBe('AAAA');
    });

    it('should perform MX record lookup', async () => {
      mockedResolveMx.mockResolvedValueOnce([
        { priority: 10, exchange: 'mail.example.com' },
      ]);

      const result = await dig('example.com', { type: 'MX' });
      expect(result.answer[0].data).toContain('10 mail.example.com');
    });

    it('should perform NS record lookup', async () => {
      mockedResolveNs.mockResolvedValueOnce(['ns1.example.com']);

      const result = await dig('example.com', { type: 'NS' });
      expect(result.answer[0].data).toBe('ns1.example.com');
    });

    it('should perform TXT record lookup', async () => {
      mockedResolveTxt.mockResolvedValueOnce([['v=spf1 ~all']]);

      const result = await dig('example.com', { type: 'TXT' });
      expect(result.answer[0].data).toBe('"v=spf1 ~all"');
    });

    it('should perform CNAME record lookup', async () => {
      mockedResolveCname.mockResolvedValueOnce(['www.example.com']);

      const result = await dig('alias.example.com', { type: 'CNAME' });
      expect(result.answer[0].data).toBe('www.example.com');
    });

    it('should perform SOA record lookup', async () => {
      mockedResolveSoa.mockResolvedValueOnce({
        nsname: 'ns1.example.com',
        hostmaster: 'admin.example.com',
        serial: 2024011501,
        refresh: 7200,
        retry: 3600,
        expire: 604800,
        minttl: 3600,
      } as any);

      const result = await dig('example.com', { type: 'SOA' });
      expect(result.answer[0].data).toContain('ns1.example.com');
    });

    it('should perform PTR record lookup', async () => {
      mockedResolvePtr.mockResolvedValueOnce(['host.example.com']);

      const result = await dig('1.2.3.4.in-addr.arpa', { type: 'PTR' });
      expect(result.answer[0].data).toBe('host.example.com');
    });

    it('should perform SRV record lookup', async () => {
      mockedResolveSrv.mockResolvedValueOnce([
        { priority: 0, weight: 5, port: 5269, name: 'xmpp.example.com' },
      ]);

      const result = await dig('_xmpp._tcp.example.com', { type: 'SRV' });
      expect(result.answer[0].data).toContain('5269');
    });

    it('should perform CAA record lookup', async () => {
      mockedResolveCaa.mockResolvedValueOnce([
        { critical: 0, issue: 'letsencrypt.org' },
      ] as any);

      const result = await dig('example.com', { type: 'CAA' });
      expect(result.answer[0].data).toContain('letsencrypt.org');
    });

    it('should perform NAPTR record lookup', async () => {
      mockedResolveNaptr.mockResolvedValueOnce([
        { order: 100, preference: 10, flags: 'u', service: 'E2U+sip', regexp: '!^.*$!sip:info@example.com!', replacement: '' },
      ]);

      const result = await dig('example.com', { type: 'NAPTR' });
      expect(result.answer[0].type).toBe('NAPTR');
    });

    it('should handle reverse lookup', async () => {
      mockedReverse.mockResolvedValueOnce(['host.example.com']);

      const result = await dig('93.184.216.34', { reverse: true });
      expect(result.question.type).toBe('PTR');
      expect(result.answer[0].data).toBe('host.example.com');
    });

    it('should return query time', async () => {
      mockedResolve4.mockResolvedValueOnce([{ address: '1.2.3.4', ttl: 300 }] as any);

      const result = await dig('example.com');
      expect(result.queryTime).toBeGreaterThanOrEqual(0);
    });

    it('should throw for unsupported type', async () => {
      await expect(dig('example.com', { type: 'UNKNOWN' })).rejects.toThrow('Unsupported DNS record type');
    });

    it('should handle ENODATA gracefully', async () => {
      const error = new Error('ENODATA') as any;
      error.code = 'ENODATA';
      mockedResolve4.mockRejectedValueOnce(error);

      const result = await dig('example.com', { type: 'A' });
      expect(result.answer).toEqual([]);
    });
  });
});
