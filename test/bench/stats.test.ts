/**
 * Tests for LoadStats error tracking
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LoadStats } from '../../src/bench/stats.js';

describe('LoadStats', () => {
  let stats: LoadStats;

  beforeEach(() => {
    stats = new LoadStats();
  });

  describe('basic tracking', () => {
    it('should track successful requests', () => {
      stats.addResult(100, 200, 1024);
      stats.addResult(150, 200, 2048);

      expect(stats.totalRequests).toBe(2);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(0);
      expect(stats.bytesTransferred).toBe(3072);
    });

    it('should track failed requests', () => {
      stats.addResult(100, 500, 0, new Error('Server Error'));

      expect(stats.totalRequests).toBe(1);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(1);
    });

    it('should track status codes', () => {
      stats.addResult(100, 200, 0);
      stats.addResult(100, 200, 0);
      stats.addResult(100, 404, 0);
      stats.addResult(100, 500, 0);

      expect(stats.statusCodes[200]).toBe(2);
      expect(stats.statusCodes[404]).toBe(1);
      expect(stats.statusCodes[500]).toBe(1);
    });
  });

  describe('error tracking', () => {
    it('should track errors with status codes', () => {
      stats.addResult(100, 404, 0);
      stats.addResult(100, 500, 0);

      const errors = stats.getErrors();
      expect(errors).toHaveLength(2);
      expect(errors.some(e => e.status === 404)).toBe(true);
      expect(errors.some(e => e.status === 500)).toBe(true);
    });

    it('should deduplicate same errors', () => {
      stats.addResult(100, 404, 0);
      stats.addResult(100, 404, 0);
      stats.addResult(100, 404, 0);

      const errors = stats.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].count).toBe(3);
      expect(errors[0].status).toBe(404);
    });

    it('should track network errors (status 0)', () => {
      stats.addResult(100, 0, 0, new Error('ECONNREFUSED'));

      const errors = stats.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].status).toBe(0);
      expect(errors[0].message).toBe('Connection refused');
    });

    it('should format common error messages', () => {
      stats.addResult(100, 0, 0, new Error('connect ECONNRESET 127.0.0.1:8080'));
      stats.addResult(100, 0, 0, new Error('getaddrinfo ENOTFOUND api.example.com'));
      stats.addResult(100, 0, 0, new Error('connect ETIMEDOUT'));
      stats.addResult(100, 0, 0, new Error('UND_ERR_HEADERS_TIMEOUT'));

      const errors = stats.getErrors();
      const messages = errors.map(e => e.message);

      expect(messages).toContain('Connection reset');
      expect(messages).toContain('DNS lookup failed');
      expect(messages).toContain('Connection timeout');
      expect(messages).toContain('Headers timeout');
    });

    it('should provide human-readable status text', () => {
      stats.addResult(100, 401, 0);
      stats.addResult(100, 403, 0);
      stats.addResult(100, 429, 0);
      stats.addResult(100, 502, 0);
      stats.addResult(100, 503, 0);

      const errors = stats.getErrors();
      const messages = errors.map(e => e.message);

      // Compact CamelCase format for cleaner CLI output
      expect(messages).toContain('Unauthorized');
      expect(messages).toContain('Forbidden');
      expect(messages).toContain('TooManyRequests');
      expect(messages).toContain('BadGateway');
      expect(messages).toContain('ServiceUnavailable');
    });

    it('should sort errors by count (descending)', () => {
      stats.addResult(100, 404, 0);
      stats.addResult(100, 500, 0);
      stats.addResult(100, 500, 0);
      stats.addResult(100, 500, 0);
      stats.addResult(100, 429, 0);
      stats.addResult(100, 429, 0);

      const errors = stats.getErrors();
      expect(errors[0].status).toBe(500);
      expect(errors[0].count).toBe(3);
      expect(errors[1].status).toBe(429);
      expect(errors[1].count).toBe(2);
      expect(errors[2].status).toBe(404);
      expect(errors[2].count).toBe(1);
    });

    it('should track recent errors for real-time display', () => {
      stats.addResult(100, 404, 0);
      stats.addResult(100, 500, 0);
      stats.addResult(100, 503, 0);

      const recent = stats.getRecentErrors();
      expect(recent).toHaveLength(3);
    });

    it('should limit recent errors to maxRecentErrors', () => {
      // Add more than 10 different errors
      for (let i = 0; i < 15; i++) {
        const status = 400 + i;
        stats.addResult(100, status, 0);
      }

      const recent = stats.getRecentErrors();
      expect(recent.length).toBeLessThanOrEqual(10);
    });
  });

  describe('legacy errors property', () => {
    it('should provide backward compatible errors object', () => {
      stats.addResult(100, 404, 0);
      stats.addResult(100, 500, 0);
      stats.addResult(100, 0, 0, new Error('ECONNREFUSED'));

      const errors = stats.errors;
      expect(typeof errors).toBe('object');
      expect(Object.keys(errors).length).toBe(3);

      // HTTP errors should have status code prefix
      expect(Object.keys(errors).some(k => k.includes('[404]'))).toBe(true);
      expect(Object.keys(errors).some(k => k.includes('[500]'))).toBe(true);
    });
  });

  describe('getSummary', () => {
    it('should include errors in summary', () => {
      stats.addResult(100, 200, 1024);
      stats.addResult(100, 404, 0);
      stats.addResult(100, 500, 0);

      const summary = stats.getSummary();

      expect(summary.total).toBe(3);
      expect(summary.success).toBe(1);
      expect(summary.failed).toBe(2);
      expect(Object.keys(summary.errors).length).toBe(2);
    });
  });
});
