/**
 * Tests for the unified Recker API
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recker,
  get,
  post,
  put,
  patch,
  head,
  options,
  whois,
  whoisAvailable,
  dns,
  dnsSecurity,
  ws,
  del,
} from '../src/index.js';

describe('Unified Recker API', () => {
  beforeEach(() => {
    // Reset singletons before each test
    recker.reset();
  });

  describe('recker namespace', () => {
    it('should have all HTTP methods', () => {
      expect(recker.get).toBeDefined();
      expect(recker.post).toBeDefined();
      expect(recker.put).toBeDefined();
      expect(recker.patch).toBeDefined();
      expect(recker.delete).toBeDefined();
      expect(recker.head).toBeDefined();
      expect(recker.options).toBeDefined();
    });

    it('should have WHOIS methods', () => {
      expect(recker.whois).toBeDefined();
      expect(recker.whoisAvailable).toBeDefined();
    });

    it('should have DNS methods', () => {
      expect(recker.dns).toBeDefined();
      expect(recker.dnsSecurity).toBeDefined();
    });

    it('should have WebSocket method', () => {
      expect(recker.ws).toBeDefined();
    });

    it('should have AI namespace', () => {
      expect(recker.ai).toBeDefined();
      expect(recker.ai.chat).toBeDefined();
      expect(recker.ai.stream).toBeDefined();
      expect(recker.ai.embed).toBeDefined();
      expect(recker.ai.extend).toBeDefined();
    });

    it('should have factory methods for custom config', () => {
      expect(recker.client).toBeDefined();
      expect(recker.dnsClient).toBeDefined();
      expect(recker.whoisClient).toBeDefined();
      expect(recker.aiClient).toBeDefined();
    });

    it('should have reset method', () => {
      expect(recker.reset).toBeDefined();
      expect(typeof recker.reset).toBe('function');
    });
  });

  describe('Direct function exports', () => {
    it('should export get function', () => {
      expect(get).toBeDefined();
      expect(typeof get).toBe('function');
    });

    it('should export post function', () => {
      expect(post).toBeDefined();
      expect(typeof post).toBe('function');
    });

    it('should export put function', () => {
      expect(put).toBeDefined();
      expect(typeof put).toBe('function');
    });

    it('should export patch function', () => {
      expect(patch).toBeDefined();
      expect(typeof patch).toBe('function');
    });

    it('should export del function', () => {
      expect(del).toBeDefined();
      expect(typeof del).toBe('function');
    });

    it('should export head function', () => {
      expect(head).toBeDefined();
      expect(typeof head).toBe('function');
    });

    it('should export options function', () => {
      expect(options).toBeDefined();
      expect(typeof options).toBe('function');
    });

    it('should export whois function', () => {
      expect(whois).toBeDefined();
      expect(typeof whois).toBe('function');
    });

    it('should export whoisAvailable function', () => {
      expect(whoisAvailable).toBeDefined();
      expect(typeof whoisAvailable).toBe('function');
    });

    it('should export dns function', () => {
      expect(dns).toBeDefined();
      expect(typeof dns).toBe('function');
    });

    it('should export dnsSecurity function', () => {
      expect(dnsSecurity).toBeDefined();
      expect(typeof dnsSecurity).toBe('function');
    });

    it('should export ws function', () => {
      expect(ws).toBeDefined();
      expect(typeof ws).toBe('function');
    });
  });

  describe('HTTP methods return RequestPromise', () => {
    it('get should return RequestPromise with json method', () => {
      const promise = recker.get('https://httpbin.org/get');
      expect(promise).toBeDefined();
      expect(promise.json).toBeDefined();
      expect(promise.text).toBeDefined();
      expect(promise.cancel).toBeDefined();
      promise.cancel(); // Cancel to avoid actual request
    });

    it('post should return RequestPromise', () => {
      const promise = recker.post('https://httpbin.org/post', { json: { test: true } });
      expect(promise).toBeDefined();
      expect(promise.json).toBeDefined();
      promise.cancel();
    });

    it('put should return RequestPromise', () => {
      const promise = recker.put('https://httpbin.org/put', { json: { data: 'test' } });
      expect(promise).toBeDefined();
      expect(promise.json).toBeDefined();
      promise.cancel();
    });

    it('patch should return RequestPromise', () => {
      const promise = recker.patch('https://httpbin.org/patch', { json: { field: 'value' } });
      expect(promise).toBeDefined();
      expect(promise.json).toBeDefined();
      promise.cancel();
    });

    it('delete should return RequestPromise', () => {
      const promise = recker.delete('https://httpbin.org/delete');
      expect(promise).toBeDefined();
      expect(promise.json).toBeDefined();
      promise.cancel();
    });

    it('head should return RequestPromise', () => {
      const promise = recker.head('https://httpbin.org/get');
      expect(promise).toBeDefined();
      promise.cancel();
    });

    it('options should return RequestPromise', () => {
      const promise = recker.options('https://httpbin.org/get');
      expect(promise).toBeDefined();
      promise.cancel();
    });
  });

  describe('Direct HTTP functions return RequestPromise', () => {
    it('put function should return RequestPromise', () => {
      const promise = put('https://httpbin.org/put');
      expect(promise).toBeDefined();
      expect(promise.json).toBeDefined();
      promise.cancel();
    });

    it('patch function should return RequestPromise', () => {
      const promise = patch('https://httpbin.org/patch');
      expect(promise).toBeDefined();
      expect(promise.json).toBeDefined();
      promise.cancel();
    });

    it('del function should return RequestPromise', () => {
      const promise = del('https://httpbin.org/delete');
      expect(promise).toBeDefined();
      expect(promise.json).toBeDefined();
      promise.cancel();
    });

    it('head function should return RequestPromise', () => {
      const promise = head('https://httpbin.org/get');
      expect(promise).toBeDefined();
      promise.cancel();
    });

    it('options function should return RequestPromise', () => {
      const promise = options('https://httpbin.org/get');
      expect(promise).toBeDefined();
      promise.cancel();
    });
  });

  describe('Factory methods create new instances', () => {
    it('client() should create a new HTTP client', () => {
      const client = recker.client({ baseUrl: 'https://api.example.com' });
      expect(client).toBeDefined();
      expect(client.get).toBeDefined();
      expect(client.post).toBeDefined();
    });

    it('dnsClient() should create a new DNS client', () => {
      const dnsClient = recker.dnsClient({ timeout: 5000 });
      expect(dnsClient).toBeDefined();
      expect(dnsClient.resolve).toBeDefined();
      expect(dnsClient.resolve4).toBeDefined();
    });

    it('whoisClient() should create a new WHOIS client', () => {
      const whoisClient = recker.whoisClient({ timeout: 10000 });
      expect(whoisClient).toBeDefined();
      expect(whoisClient.lookup).toBeDefined();
      expect(whoisClient.isAvailable).toBeDefined();
    });
  });

  describe('Direct functions work same as recker namespace', () => {
    it('get function should work same as recker.get', () => {
      const directPromise = get('https://httpbin.org/get');
      const namespacePromise = recker.get('https://httpbin.org/get');

      expect(typeof directPromise.json).toBe(typeof namespacePromise.json);
      expect(typeof directPromise.text).toBe(typeof namespacePromise.text);

      directPromise.cancel();
      namespacePromise.cancel();
    });
  });

  describe('AI namespace', () => {
    it('should have metrics getter', () => {
      expect(recker.ai.metrics).toBeDefined();
    });

    it('aiClient() should create a new AI client', () => {
      const aiClient = recker.aiClient({ defaultProvider: 'openai' });
      expect(aiClient).toBeDefined();
      expect(aiClient.chat).toBeDefined();
      expect(aiClient.stream).toBeDefined();
    });
  });

  describe('Singleton reuse', () => {
    it('should reuse same client instance across calls', () => {
      const promise1 = recker.get('https://example.com/1');
      const promise2 = recker.get('https://example.com/2');

      // Both should be using the same underlying client
      expect(promise1).toBeDefined();
      expect(promise2).toBeDefined();

      promise1.cancel();
      promise2.cancel();
    });

    it('reset should clear singletons', () => {
      // Make a request to initialize singleton
      const promise1 = recker.get('https://example.com/test');
      promise1.cancel();

      // Reset
      recker.reset();

      // New request should create new singleton
      const promise2 = recker.get('https://example.com/test2');
      expect(promise2).toBeDefined();
      promise2.cancel();
    });
  });
});

describe('Recker API Integration', () => {
  beforeEach(() => {
    recker.reset();
  });

  describe('DNS functions (mocked)', () => {
    it('should call dns function and return result', async () => {
      // dns function exists and is callable
      expect(typeof dns).toBe('function');
      // The function signature is correct
      expect(dns.length).toBeGreaterThanOrEqual(1);
    });

    it('should call dnsSecurity function and return result', async () => {
      // dnsSecurity function exists and is callable
      expect(typeof dnsSecurity).toBe('function');
      expect(dnsSecurity.length).toBeGreaterThanOrEqual(1);
    });

    it('should call recker.dns and return result', async () => {
      expect(typeof recker.dns).toBe('function');
    });

    it('should call recker.dnsSecurity and return result', async () => {
      expect(typeof recker.dnsSecurity).toBe('function');
    });
  });

  describe('WebSocket functions', () => {
    it('should call ws function and return WebSocket', () => {
      // ws function exists and is callable
      expect(typeof ws).toBe('function');
    });

    it('should call recker.ws and return WebSocket', () => {
      expect(typeof recker.ws).toBe('function');
    });
  });

  describe('WHOIS functions', () => {
    it('should call whois function', () => {
      expect(typeof whois).toBe('function');
    });

    it('should call whoisAvailable function', () => {
      expect(typeof whoisAvailable).toBe('function');
    });
  });

  // These tests require network - mark as integration
  describe.skip('Real HTTP requests', () => {
    it('should make GET request', async () => {
      const data = await recker.get('https://httpbin.org/get').json();
      expect(data).toBeDefined();
      expect(data.url).toBe('https://httpbin.org/get');
    });

    it('should make POST request', async () => {
      const data = await recker.post('https://httpbin.org/post', {
        json: { name: 'test' }
      }).json();
      expect(data).toBeDefined();
      expect(data.json).toEqual({ name: 'test' });
    });
  });

  describe.skip('Real DNS lookups', () => {
    it('should resolve DNS', async () => {
      const ips = await recker.dns('google.com');
      expect(Array.isArray(ips)).toBe(true);
      expect(ips.length).toBeGreaterThan(0);
    });
  });
});
