/**
 * Tests for DNS propagation checker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkPropagation, formatPropagationReport, type PropagationResult } from '../../src/dns/propagation.js';

// Mock undici request
vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { request } from 'undici';

describe('DNS Propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkPropagation', () => {
    it('should query multiple DNS providers', async () => {
      const mockResponse = {
        Status: 0,
        Answer: [
          { name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' },
        ],
      };

      vi.mocked(request).mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/dns-json' },
        body: { json: () => Promise.resolve(mockResponse) },
      } as any);

      const results = await checkPropagation('example.com', 'A');

      expect(results.length).toBeGreaterThan(0);
      expect(vi.mocked(request)).toHaveBeenCalled();
    });

    it('should return ok status for successful queries', async () => {
      const mockResponse = {
        Status: 0,
        Answer: [
          { name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' },
        ],
      };

      vi.mocked(request).mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/dns-json' },
        body: { json: () => Promise.resolve(mockResponse) },
      } as any);

      const results = await checkPropagation('example.com', 'A');

      expect(results[0].status).toBe('ok');
      expect(results[0].records).toContain('93.184.216.34');
    });

    it('should handle AAAA records', async () => {
      const mockResponse = {
        Status: 0,
        Answer: [
          { name: 'example.com', type: 28, TTL: 300, data: '2606:2800:220:1:248:1893:25c8:1946' },
        ],
      };

      vi.mocked(request).mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/dns-json' },
        body: { json: () => Promise.resolve(mockResponse) },
      } as any);

      const results = await checkPropagation('example.com', 'AAAA');

      expect(results[0].status).toBe('ok');
      expect(results[0].records[0]).toContain('2606');
    });

    it('should handle MX records', async () => {
      const mockResponse = {
        Status: 0,
        Answer: [
          { name: 'example.com', type: 15, TTL: 300, data: '10 mail.example.com.' },
        ],
      };

      vi.mocked(request).mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/dns-json' },
        body: { json: () => Promise.resolve(mockResponse) },
      } as any);

      const results = await checkPropagation('example.com', 'MX');

      expect(results[0].status).toBe('ok');
      expect(results[0].records[0]).toContain('mail.example.com');
    });

    it('should handle NXDomain errors', async () => {
      const mockResponse = {
        Status: 3, // NXDomain
        Answer: [],
      };

      vi.mocked(request).mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/dns-json' },
        body: { json: () => Promise.resolve(mockResponse) },
      } as any);

      const results = await checkPropagation('nonexistent.example.com', 'A');

      expect(results[0].status).toBe('error');
      expect(results[0].error).toBe('NXDomain');
    });

    it('should handle ServFail errors', async () => {
      const mockResponse = {
        Status: 2, // ServFail
        Answer: [],
      };

      vi.mocked(request).mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/dns-json' },
        body: { json: () => Promise.resolve(mockResponse) },
      } as any);

      const results = await checkPropagation('example.com', 'A');

      expect(results[0].status).toBe('error');
      expect(results[0].error).toBe('ServFail');
    });

    it('should handle HTTP errors', async () => {
      vi.mocked(request).mockResolvedValue({
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: { json: () => Promise.resolve({}) },
      } as any);

      const results = await checkPropagation('example.com', 'A');

      expect(results[0].status).toBe('error');
      expect(results[0].error).toContain('HTTP 500');
    });

    it('should handle missing Status in response', async () => {
      // When json.Status is undefined (e.g., from invalid JSON response)
      vi.mocked(request).mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        body: { json: () => Promise.resolve({}) },
      } as any);

      const results = await checkPropagation('example.com', 'A');

      // Status !== 0 triggers error branch, undefined maps to 'Code undefined'
      expect(results[0].status).toBe('error');
      expect(results[0].error).toBe('Code undefined');
    });

    it('should handle network errors', async () => {
      vi.mocked(request).mockRejectedValue(new Error('ECONNREFUSED'));

      const results = await checkPropagation('example.com', 'A');

      expect(results[0].status).toBe('error');
      expect(results[0].error).toBe('ECONNREFUSED');
    });

    it('should handle empty answers', async () => {
      const mockResponse = {
        Status: 0,
        Answer: [],
      };

      vi.mocked(request).mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/dns-json' },
        body: { json: () => Promise.resolve(mockResponse) },
      } as any);

      const results = await checkPropagation('example.com', 'A');

      expect(results[0].status).toBe('ok');
      expect(results[0].records).toHaveLength(0);
    });

    it('should use numeric type when not in map', async () => {
      const mockResponse = {
        Status: 0,
        Answer: [],
      };

      vi.mocked(request).mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/dns-json' },
        body: { json: () => Promise.resolve(mockResponse) },
      } as any);

      const results = await checkPropagation('example.com', '99');

      expect(results[0].status).toBe('ok');
    });

    it('should track latency', async () => {
      const mockResponse = {
        Status: 0,
        Answer: [{ name: 'example.com', type: 1, TTL: 300, data: '1.2.3.4' }],
      };

      vi.mocked(request).mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/dns-json' },
        body: { json: () => Promise.resolve(mockResponse) },
      } as any);

      const results = await checkPropagation('example.com', 'A');

      expect(results[0].latency).toBeGreaterThanOrEqual(0);
    });

    it('should handle unknown DNS status codes', async () => {
      const mockResponse = {
        Status: 99, // Unknown status
        Answer: [],
      };

      vi.mocked(request).mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/dns-json' },
        body: { json: () => Promise.resolve(mockResponse) },
      } as any);

      const results = await checkPropagation('example.com', 'A');

      expect(results[0].status).toBe('error');
      expect(results[0].error).toBe('Code 99');
    });
  });

  describe('formatPropagationReport', () => {
    it('should format successful results', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'ok',
          records: ['93.184.216.34'],
          rawRecords: [{ name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' }],
          latency: 25,
        },
        {
          id: 'cloudflare',
          provider: 'Cloudflare',
          status: 'ok',
          records: ['93.184.216.34'],
          rawRecords: [{ name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' }],
          latency: 15,
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'A');

      expect(report).toContain('example.com');
      expect(report).toContain('Google DNS');
      expect(report).toContain('Cloudflare');
      expect(report).toContain('Propagation is complete');
    });

    it('should detect inconsistent results', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'ok',
          records: ['93.184.216.34'],
          rawRecords: [],
          latency: 25,
        },
        {
          id: 'cloudflare',
          provider: 'Cloudflare',
          status: 'ok',
          records: ['93.184.216.35'], // Different IP
          rawRecords: [],
          latency: 15,
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'A');

      expect(report).toContain('Inconsistent');
    });

    it('should handle error results', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'error',
          records: [],
          rawRecords: [],
          latency: 100,
          error: 'NXDomain',
        },
      ];

      const report = formatPropagationReport(results, 'nonexistent.com', 'A');

      expect(report).toContain('NXDomain');
    });

    it('should handle all errors', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'error',
          records: [],
          rawRecords: [],
          latency: 100,
          error: 'NXDomain',
        },
        {
          id: 'cloudflare',
          provider: 'Cloudflare',
          status: 'error',
          records: [],
          rawRecords: [],
          latency: 100,
          error: 'NXDomain',
        },
      ];

      const report = formatPropagationReport(results, 'nonexistent.com', 'A');

      expect(report).toContain('All providers returned error');
    });

    it('should handle empty records', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'ok',
          records: [],
          rawRecords: [],
          latency: 25,
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'A');

      expect(report).toContain('No records');
    });

    it('should truncate long record lists', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'ok',
          records: [
            '192.168.1.1', '192.168.1.2', '192.168.1.3', '192.168.1.4',
            '192.168.1.5', '192.168.1.6', '192.168.1.7', '192.168.1.8',
          ],
          rawRecords: [],
          latency: 25,
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'A');

      expect(report).toContain('...');
    });

    it('should color-code latency', () => {
      const results: PropagationResult[] = [
        {
          id: 'fast',
          provider: 'Fast Provider',
          status: 'ok',
          records: ['1.1.1.1'],
          rawRecords: [],
          latency: 10, // Fast (green)
        },
        {
          id: 'medium',
          provider: 'Medium Provider',
          status: 'ok',
          records: ['1.1.1.1'],
          rawRecords: [],
          latency: 100, // Medium (yellow)
        },
        {
          id: 'slow',
          provider: 'Slow Provider',
          status: 'ok',
          records: ['1.1.1.1'],
          rawRecords: [],
          latency: 500, // Slow (red)
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'A');

      expect(report).toContain('10ms');
      expect(report).toContain('100ms');
      expect(report).toContain('500ms');
    });

    it('should handle undefined error message', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'error',
          records: [],
          rawRecords: [],
          latency: 100,
          // error is undefined
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'A');

      expect(report).toContain('Unknown Error');
    });
  });
});
