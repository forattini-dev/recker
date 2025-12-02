/**
 * Tests for DNS propagation checker.
 *
 * Note: Since propagation.ts now uses the Recker Client internally,
 * we test the public API behavior and formatPropagationReport directly.
 * The checkPropagation function makes real network requests to DoH providers,
 * so we focus on unit testing the helper functions and report formatting.
 */

import { describe, it, expect } from 'vitest';
import { formatPropagationReport, getTypeName, type PropagationResult } from '../../src/dns/propagation.js';

describe('DNS Propagation', () => {
  describe('getTypeName', () => {
    it('should return name for known type IDs', () => {
      expect(getTypeName(1)).toBe('A');
      expect(getTypeName(28)).toBe('AAAA');
      expect(getTypeName(15)).toBe('MX');
      expect(getTypeName(5)).toBe('CNAME');
      expect(getTypeName(2)).toBe('NS');
      expect(getTypeName(16)).toBe('TXT');
      expect(getTypeName(12)).toBe('PTR');
      expect(getTypeName(33)).toBe('SRV');
      expect(getTypeName(6)).toBe('SOA');
      expect(getTypeName(257)).toBe('CAA');
    });

    it('should return TYPE<id> for unknown type IDs', () => {
      expect(getTypeName(999)).toBe('TYPE999');
      expect(getTypeName(100)).toBe('TYPE100');
      expect(getTypeName(0)).toBe('TYPE0');
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
          location: 'Global',
        },
        {
          id: 'cloudflare',
          provider: 'Cloudflare',
          status: 'ok',
          records: ['93.184.216.34'],
          rawRecords: [{ name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' }],
          latency: 15,
          location: 'Global',
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'A');

      expect(report).toContain('example.com');
      expect(report).toContain('Google DNS');
      expect(report).toContain('Cloudflare');
      expect(report).toContain('All providers agree');
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
          location: 'Global',
        },
        {
          id: 'cloudflare',
          provider: 'Cloudflare',
          status: 'ok',
          records: ['93.184.216.35'], // Different IP
          rawRecords: [],
          latency: 15,
          location: 'Global',
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'A');

      expect(report).toContain('Inconsistent');
    });

    it('should handle mixed success and error results', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'ok',
          records: ['93.184.216.34'],
          rawRecords: [],
          latency: 25,
          location: 'Global',
        },
        {
          id: 'cloudflare',
          provider: 'Cloudflare',
          status: 'error',
          records: [],
          rawRecords: [],
          latency: 100,
          error: 'Timeout',
          location: 'Global',
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'A');

      expect(report).toContain('1/2 providers responded');
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
          location: 'Global',
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
          location: 'Global',
        },
        {
          id: 'cloudflare',
          provider: 'Cloudflare',
          status: 'error',
          records: [],
          rawRecords: [],
          latency: 100,
          error: 'NXDomain',
          location: 'Global',
        },
      ];

      const report = formatPropagationReport(results, 'nonexistent.com', 'A');

      expect(report).toContain('All providers returned errors');
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
          location: 'Global',
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
          location: 'Global',
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
          location: 'Global',
        },
        {
          id: 'medium',
          provider: 'Medium Provider',
          status: 'ok',
          records: ['1.1.1.1'],
          rawRecords: [],
          latency: 100, // Medium (yellow)
          location: 'Global',
        },
        {
          id: 'slow',
          provider: 'Slow Provider',
          status: 'ok',
          records: ['1.1.1.1'],
          rawRecords: [],
          latency: 500, // Slow (red)
          location: 'Global',
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
          location: 'Global',
          // error is undefined
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'A');

      expect(report).toContain('Unknown Error');
    });

    it('should display TTL when minTTL is provided', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'ok',
          records: ['93.184.216.34'],
          rawRecords: [{ name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' }],
          latency: 25,
          location: 'Global',
          minTTL: 300,
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'A');

      expect(report).toContain('TTL 300s');
    });

    it('should sanitize domain with protocol prefix', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'ok',
          records: ['93.184.216.34'],
          rawRecords: [],
          latency: 25,
          location: 'Global',
        },
      ];

      const report = formatPropagationReport(results, 'https://example.com/path?query=1', 'A');

      expect(report).toContain('example.com');
      expect(report).not.toContain('https://');
      expect(report).not.toContain('/path');
    });

    it('should handle multiple record types', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'ok',
          records: ['10 mail.example.com.', '20 backup.example.com.'],
          rawRecords: [
            { name: 'example.com', type: 15, TTL: 300, data: '10 mail.example.com.' },
            { name: 'example.com', type: 15, TTL: 300, data: '20 backup.example.com.' },
          ],
          latency: 25,
          location: 'Global',
          minTTL: 300,
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'MX');

      expect(report).toContain('MX');
      expect(report).toContain('mail.example.com');
    });

    it('should display type in uppercase', () => {
      const results: PropagationResult[] = [
        {
          id: 'google',
          provider: 'Google DNS',
          status: 'ok',
          records: [],
          rawRecords: [],
          latency: 25,
          location: 'Global',
        },
      ];

      const report = formatPropagationReport(results, 'example.com', 'aaaa');

      expect(report).toContain('AAAA');
    });
  });
});
