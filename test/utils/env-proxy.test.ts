import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getProxyForUrl,
  shouldBypassProxy,
  getProxyEnv,
  createProxyConfig,
} from '../../src/utils/env-proxy.js';

describe('Environment Proxy Utils', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all proxy-related env vars
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.ALL_PROXY;
    delete process.env.all_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
  });

  afterEach(() => {
    // Restore original env
    Object.assign(process.env, originalEnv);
  });

  describe('getProxyForUrl', () => {
    it('should return undefined for invalid URL', () => {
      expect(getProxyForUrl('not-a-url')).toBeUndefined();
    });

    it('should return HTTP_PROXY for http URLs', () => {
      process.env.HTTP_PROXY = 'http://proxy:8080';
      expect(getProxyForUrl('http://example.com')).toBe('http://proxy:8080');
    });

    it('should return http_proxy (lowercase) for http URLs', () => {
      process.env.http_proxy = 'http://proxy:8080';
      expect(getProxyForUrl('http://example.com')).toBe('http://proxy:8080');
    });

    it('should return HTTPS_PROXY for https URLs', () => {
      process.env.HTTPS_PROXY = 'http://secure-proxy:8080';
      expect(getProxyForUrl('https://example.com')).toBe('http://secure-proxy:8080');
    });

    it('should return https_proxy (lowercase) for https URLs', () => {
      process.env.https_proxy = 'http://secure-proxy:8080';
      expect(getProxyForUrl('https://example.com')).toBe('http://secure-proxy:8080');
    });

    it('should fallback to ALL_PROXY for http URLs', () => {
      process.env.ALL_PROXY = 'http://all-proxy:8080';
      expect(getProxyForUrl('http://example.com')).toBe('http://all-proxy:8080');
    });

    it('should fallback to ALL_PROXY for https URLs', () => {
      process.env.ALL_PROXY = 'http://all-proxy:8080';
      expect(getProxyForUrl('https://example.com')).toBe('http://all-proxy:8080');
    });

    it('should fallback to all_proxy (lowercase) for http URLs', () => {
      process.env.all_proxy = 'http://all-proxy:8080';
      expect(getProxyForUrl('http://example.com')).toBe('http://all-proxy:8080');
    });

    it('should fallback to all_proxy (lowercase) for https URLs', () => {
      process.env.all_proxy = 'http://all-proxy:8080';
      expect(getProxyForUrl('https://example.com')).toBe('http://all-proxy:8080');
    });

    it('should return undefined when no proxy is set', () => {
      expect(getProxyForUrl('http://example.com')).toBeUndefined();
    });

    it('should use options.httpProxy override', () => {
      process.env.HTTP_PROXY = 'http://env-proxy:8080';
      expect(getProxyForUrl('http://example.com', { httpProxy: 'http://override:8080' }))
        .toBe('http://override:8080');
    });

    it('should use options.httpsProxy override', () => {
      process.env.HTTPS_PROXY = 'http://env-proxy:8080';
      expect(getProxyForUrl('https://example.com', { httpsProxy: 'http://override:8080' }))
        .toBe('http://override:8080');
    });

    it('should bypass proxy with NO_PROXY', () => {
      process.env.HTTP_PROXY = 'http://proxy:8080';
      process.env.NO_PROXY = 'localhost,example.com';
      expect(getProxyForUrl('http://example.com')).toBeUndefined();
    });

    it('should use options.noProxy override', () => {
      process.env.HTTP_PROXY = 'http://proxy:8080';
      expect(getProxyForUrl('http://example.com', { noProxy: 'example.com' }))
        .toBeUndefined();
    });
  });

  describe('shouldBypassProxy', () => {
    it('should return false for empty noProxy', () => {
      expect(shouldBypassProxy('example.com', '', '')).toBe(false);
    });

    it('should return true for wildcard *', () => {
      expect(shouldBypassProxy('anything.com', '', '*')).toBe(true);
    });

    it('should match exact hostname', () => {
      expect(shouldBypassProxy('localhost', '', 'localhost')).toBe(true);
      expect(shouldBypassProxy('localhost', '', 'other')).toBe(false);
    });

    it('should match domain suffix with leading dot', () => {
      expect(shouldBypassProxy('sub.example.com', '', '.example.com')).toBe(true);
      expect(shouldBypassProxy('example.com', '', '.example.com')).toBe(true);
      expect(shouldBypassProxy('other.com', '', '.example.com')).toBe(false);
    });

    it('should match domain suffix without leading dot', () => {
      expect(shouldBypassProxy('sub.example.com', '', 'example.com')).toBe(true);
    });

    it('should match host:port pattern', () => {
      expect(shouldBypassProxy('localhost', '8080', 'localhost:8080')).toBe(true);
      expect(shouldBypassProxy('localhost', '3000', 'localhost:8080')).toBe(false);
      expect(shouldBypassProxy('localhost', '', 'localhost:')).toBe(true);
    });

    it('should match CIDR notation', () => {
      expect(shouldBypassProxy('192.168.1.100', '', '192.168.0.0/16')).toBe(true);
      expect(shouldBypassProxy('10.0.0.1', '', '192.168.0.0/16')).toBe(false);
    });

    it('should handle invalid CIDR mask', () => {
      expect(shouldBypassProxy('192.168.1.1', '', '192.168.0.0/invalid')).toBe(false);
    });

    it('should handle non-IPv4 addresses in CIDR check', () => {
      expect(shouldBypassProxy('example.com', '', '192.168.0.0/16')).toBe(false);
      expect(shouldBypassProxy('::1', '', '192.168.0.0/16')).toBe(false);
    });

    it('should handle multiple rules (comma-separated)', () => {
      expect(shouldBypassProxy('localhost', '', 'example.com,localhost')).toBe(true);
    });

    it('should handle multiple rules (space-separated)', () => {
      expect(shouldBypassProxy('localhost', '', 'example.com localhost')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(shouldBypassProxy('LOCALHOST', '', 'localhost')).toBe(true);
      expect(shouldBypassProxy('localhost', '', 'LOCALHOST')).toBe(true);
    });
  });

  describe('getProxyEnv', () => {
    it('should return all proxy environment variables', () => {
      process.env.HTTP_PROXY = 'http://http-proxy:8080';
      process.env.HTTPS_PROXY = 'http://https-proxy:8080';
      process.env.NO_PROXY = 'localhost';

      const env = getProxyEnv();

      expect(env.HTTP_PROXY).toBe('http://http-proxy:8080');
      expect(env.HTTPS_PROXY).toBe('http://https-proxy:8080');
      expect(env.NO_PROXY).toBe('localhost');
    });

    it('should return undefined for unset variables', () => {
      const env = getProxyEnv();

      expect(env.HTTP_PROXY).toBeUndefined();
      expect(env.http_proxy).toBeUndefined();
      expect(env.HTTPS_PROXY).toBeUndefined();
      expect(env.https_proxy).toBeUndefined();
      expect(env.ALL_PROXY).toBeUndefined();
      expect(env.all_proxy).toBeUndefined();
      expect(env.NO_PROXY).toBeUndefined();
      expect(env.no_proxy).toBeUndefined();
    });
  });

  describe('createProxyConfig', () => {
    it('should return proxy config when proxy is set', () => {
      process.env.HTTP_PROXY = 'http://proxy:8080';

      const config = createProxyConfig('http://example.com');

      expect(config).toEqual({ url: 'http://proxy:8080' });
    });

    it('should return undefined when no proxy', () => {
      const config = createProxyConfig('http://example.com');

      expect(config).toBeUndefined();
    });

    it('should return undefined when URL is bypassed', () => {
      process.env.HTTP_PROXY = 'http://proxy:8080';
      process.env.NO_PROXY = 'example.com';

      const config = createProxyConfig('http://example.com');

      expect(config).toBeUndefined();
    });
  });
});
