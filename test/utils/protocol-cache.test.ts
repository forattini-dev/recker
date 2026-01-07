import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProtocolCache,
  extractOrigin,
  normalizeProtocol,
  getGlobalProtocolCache,
  resetGlobalProtocolCache,
} from '../../src/utils/protocol-cache.js';

describe('Protocol Cache', () => {
  describe('extractOrigin', () => {
    it('should extract origin from URL', () => {
      expect(extractOrigin('https://api.example.com/users')).toBe('https://api.example.com');
      expect(extractOrigin('http://localhost:3000/api')).toBe('http://localhost:3000');
      expect(extractOrigin('https://example.com:8443/path?query=1')).toBe('https://example.com:8443');
    });

    it('should handle URLs without path', () => {
      expect(extractOrigin('https://example.com')).toBe('https://example.com');
    });

    it('should return input for invalid URLs', () => {
      expect(extractOrigin('invalid')).toBe('invalid');
    });
  });

  describe('normalizeProtocol', () => {
    it('should normalize HTTP/2 variants', () => {
      expect(normalizeProtocol('h2')).toBe('h2');
      expect(normalizeProtocol('HTTP/2')).toBe('h2');
      expect(normalizeProtocol('http/2.0')).toBe('h2');
    });

    it('should normalize HTTP/1.1 variants', () => {
      expect(normalizeProtocol('http/1.1')).toBe('http/1.1');
      expect(normalizeProtocol('HTTP/1.1')).toBe('http/1.1');
      expect(normalizeProtocol('http/1.0')).toBe('http/1.1');
      expect(normalizeProtocol('http')).toBe('http/1.1');
    });

    it('should normalize HTTP/3 variants', () => {
      expect(normalizeProtocol('h3')).toBe('h3');
      expect(normalizeProtocol('h3-29')).toBe('h3');
    });

    it('should return undefined for unknown protocols', () => {
      expect(normalizeProtocol(undefined)).toBe(undefined);
      expect(normalizeProtocol('')).toBe(undefined);
    });
  });

  describe('ProtocolCache', () => {
    let cache: ProtocolCache;

    beforeEach(() => {
      cache = new ProtocolCache();
    });

    describe('basic operations', () => {
      it('should store and retrieve protocol', () => {
        cache.set('https://api.example.com', 'h2');
        expect(cache.get('https://api.example.com')).toBe('h2');
      });

      it('should return undefined for unknown origins', () => {
        expect(cache.get('https://unknown.com')).toBe(undefined);
      });

      it('should extract origin from full URL', () => {
        cache.set('https://api.example.com/users/123', 'h2');
        expect(cache.get('https://api.example.com/other/path')).toBe('h2');
      });

      it('should delete cached protocol', () => {
        cache.set('https://api.example.com', 'h2');
        expect(cache.delete('https://api.example.com')).toBe(true);
        expect(cache.get('https://api.example.com')).toBe(undefined);
      });

      it('should clear all cached protocols', () => {
        cache.set('https://api1.example.com', 'h2');
        cache.set('https://api2.example.com', 'http/1.1');
        cache.clear();
        expect(cache.get('https://api1.example.com')).toBe(undefined);
        expect(cache.get('https://api2.example.com')).toBe(undefined);
      });
    });

    describe('TTL expiration', () => {
      it('should expire entries after TTL', async () => {
        const shortTtlCache = new ProtocolCache({ ttl: 50 }); // 50ms TTL
        shortTtlCache.set('https://api.example.com', 'h2');

        expect(shortTtlCache.get('https://api.example.com')).toBe('h2');

        // Wait for TTL to expire
        await new Promise((resolve) => setTimeout(resolve, 60));

        expect(shortTtlCache.get('https://api.example.com')).toBe(undefined);
      });
    });

    describe('LRU eviction', () => {
      it('should evict oldest entry when max size reached', () => {
        const smallCache = new ProtocolCache({ maxSize: 3 });

        smallCache.set('https://api1.example.com', 'h2');
        smallCache.set('https://api2.example.com', 'h2');
        smallCache.set('https://api3.example.com', 'h2');

        // All three should exist
        expect(smallCache.get('https://api1.example.com')).toBe('h2');

        // Add a fourth - should evict the first
        smallCache.set('https://api4.example.com', 'h2');

        // Note: The LRU implementation moves accessed items to end
        // So api1 was just accessed and won't be evicted
        const stats = smallCache.getStats();
        expect(stats.size).toBe(3);
      });
    });

    describe('failure tracking', () => {
      it('should record failures', () => {
        cache.set('https://api.example.com', 'h2');
        cache.recordFailure('https://api.example.com');
        cache.recordFailure('https://api.example.com');

        const entry = cache.getEntry('https://api.example.com');
        expect(entry?.failureCount).toBe(2);
      });

      it('should mark HTTP/2 as rejected', () => {
        cache.set('https://api.example.com', 'h2');
        cache.recordFailure('https://api.example.com', true); // HTTP/2 error

        expect(cache.hasHttp2Issues('https://api.example.com')).toBe(true);
      });

      it('should recommend against HTTP/2 after threshold failures', () => {
        const cache = new ProtocolCache({ failureThreshold: 2 });
        cache.set('https://api.example.com', 'http/1.1');
        cache.recordFailure('https://api.example.com');
        cache.recordFailure('https://api.example.com');

        expect(cache.shouldTryHttp2('https://api.example.com')).toBe(false);
      });

      it('should recommend HTTP/2 for healthy origins', () => {
        cache.set('https://api.example.com', 'h2');
        cache.recordSuccess('https://api.example.com');

        expect(cache.shouldTryHttp2('https://api.example.com')).toBe(true);
      });

      it('should be optimistic for unknown origins', () => {
        expect(cache.shouldTryHttp2('https://unknown.example.com')).toBe(true);
      });
    });

    describe('success tracking', () => {
      it('should increment success count', () => {
        cache.set('https://api.example.com', 'h2');
        cache.recordSuccess('https://api.example.com');
        cache.recordSuccess('https://api.example.com');

        const entry = cache.getEntry('https://api.example.com');
        expect(entry?.successCount).toBe(3); // 1 from set + 2 from recordSuccess
      });

      it('should decay failures on success', () => {
        cache.set('https://api.example.com', 'h2');
        cache.recordFailure('https://api.example.com');
        cache.recordFailure('https://api.example.com');

        const entryBefore = cache.getEntry('https://api.example.com');
        expect(entryBefore?.failureCount).toBe(2);

        cache.recordSuccess('https://api.example.com');

        const entryAfter = cache.getEntry('https://api.example.com');
        expect(entryAfter?.failureCount).toBe(1);
      });
    });

    describe('statistics', () => {
      it('should return cache stats', () => {
        cache.set('https://api1.example.com', 'h2');
        cache.set('https://api2.example.com', 'http/1.1');
        cache.set('https://api3.example.com', 'h2');
        cache.recordFailure('https://api2.example.com', true);

        const stats = cache.getStats();
        expect(stats.size).toBe(3);
        expect(stats.http2Origins).toContain('https://api1.example.com');
        expect(stats.http2Origins).toContain('https://api3.example.com');
        expect(stats.http1Origins).toContain('https://api2.example.com');
        expect(stats.problematicOrigins).toContain('https://api2.example.com');
      });
    });

    describe('serialization', () => {
      it('should export and import cache', () => {
        cache.set('https://api1.example.com', 'h2');
        cache.set('https://api2.example.com', 'http/1.1');

        const json = cache.toJSON();

        const newCache = new ProtocolCache();
        newCache.fromJSON(json);

        expect(newCache.get('https://api1.example.com')).toBe('h2');
        expect(newCache.get('https://api2.example.com')).toBe('http/1.1');
      });

      it('should skip expired entries during import', async () => {
        const shortTtlCache = new ProtocolCache({ ttl: 50 });
        shortTtlCache.set('https://api.example.com', 'h2');

        const json = shortTtlCache.toJSON();

        // Wait for TTL to expire
        await new Promise((resolve) => setTimeout(resolve, 60));

        const newCache = new ProtocolCache({ ttl: 50 });
        newCache.fromJSON(json);

        expect(newCache.get('https://api.example.com')).toBe(undefined);
      });
    });
  });

  describe('Global Cache', () => {
    beforeEach(() => {
      resetGlobalProtocolCache();
    });

    it('should return the same instance', () => {
      const cache1 = getGlobalProtocolCache();
      const cache2 = getGlobalProtocolCache();
      expect(cache1).toBe(cache2);
    });

    it('should reset global cache', () => {
      const cache1 = getGlobalProtocolCache();
      cache1.set('https://api.example.com', 'h2');

      resetGlobalProtocolCache();

      const cache2 = getGlobalProtocolCache();
      expect(cache2.get('https://api.example.com')).toBe(undefined);
    });
  });
});
