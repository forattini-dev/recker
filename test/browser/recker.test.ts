import { describe, it, expect } from 'vitest';
import { recker, get, post, put, patch, del, head, options, purge, ws } from '../../src/browser/recker.js';

describe('recker browser API', () => {
  describe('recker namespace', () => {
    it('should have HTTP methods', () => {
      expect(typeof recker.get).toBe('function');
      expect(typeof recker.post).toBe('function');
      expect(typeof recker.put).toBe('function');
      expect(typeof recker.patch).toBe('function');
      expect(typeof recker.delete).toBe('function');
      expect(typeof recker.head).toBe('function');
      expect(typeof recker.options).toBe('function');
      expect(typeof recker.purge).toBe('function');
    });

    it('should have WebSocket function', () => {
      expect(typeof recker.ws).toBe('function');
    });

    it('should have client factory', () => {
      expect(typeof recker.client).toBe('function');
    });

    it('should have reset function', () => {
      expect(typeof recker.reset).toBe('function');
    });

    it('should be marked as browser build', () => {
      expect(recker.isBrowser).toBe(true);
    });

    it('should list unavailable features', () => {
      expect(recker.unavailable).toContain('whois');
      expect(recker.unavailable).toContain('dns');
    });
  });

  describe('direct functions', () => {
    it('should export all HTTP method functions', () => {
      expect(typeof get).toBe('function');
      expect(typeof post).toBe('function');
      expect(typeof put).toBe('function');
      expect(typeof patch).toBe('function');
      expect(typeof del).toBe('function');
      expect(typeof head).toBe('function');
      expect(typeof options).toBe('function');
      expect(typeof purge).toBe('function');
    });

    it('should export ws function', () => {
      expect(typeof ws).toBe('function');
    });
  });

  describe('client factory', () => {
    it('should create a client with options', () => {
      const client = recker.client({
        baseUrl: 'https://api.example.com',
        headers: {
          'X-Custom-Header': 'test',
        },
      });

      expect(client).toBeDefined();
      expect(typeof client.get).toBe('function');
      expect(typeof client.post).toBe('function');
    });
  });
});
