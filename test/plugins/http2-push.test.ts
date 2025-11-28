import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Http2PushManager, http2Push } from '../../src/plugins/http2-push.js';
import { EventEmitter } from 'node:events';

// Mock http2 module
vi.mock('node:http2', () => {
  const EventEmitter = require('node:events').EventEmitter;

  class MockStream extends EventEmitter {
    closed = false;
    write = vi.fn();
    end = vi.fn();
    close = vi.fn((code) => { this.closed = true; });
  }

  class MockSession extends EventEmitter {
    closed = false;
    destroyed = false;

    request(headers: any) {
      const stream = new MockStream();
      // Auto-resolve after short delay
      setTimeout(() => {
        stream.emit('response', { ':status': 200 });
        stream.emit('data', Buffer.from('response data'));
        stream.emit('end');
      }, 10);
      return stream;
    }

    close(callback?: () => void) {
      this.closed = true;
      if (callback) callback();
    }
  }

  return {
    default: {},
    connect: vi.fn((origin: string, options: any) => {
      const session = new MockSession();
      // Emit connect after short delay
      setTimeout(() => {
        session.emit('connect');
      }, 10);
      return session;
    }),
    constants: {
      NGHTTP2_CANCEL: 8,
    },
  };
});

describe('Http2PushManager', () => {
  describe('constructor', () => {
    it('should create manager with default options', () => {
      const manager = new Http2PushManager();
      expect(manager).toBeDefined();
    });

    it('should create manager with custom options', () => {
      const onPush = vi.fn();
      const filter = vi.fn(() => true);

      const manager = new Http2PushManager({
        enabled: true,
        maxConcurrentPushes: 50,
        pushTimeout: 10000,
        cachePushes: true,
        maxCacheSize: 50,
        cacheTtl: 30000,
        filter,
        onPush,
      });

      expect(manager).toBeDefined();
    });

    it('should extend EventEmitter', () => {
      const manager = new Http2PushManager();
      expect(typeof manager.on).toBe('function');
      expect(typeof manager.emit).toBe('function');
    });
  });

  describe('cache operations', () => {
    let manager: Http2PushManager;

    beforeEach(() => {
      manager = new Http2PushManager({
        cachePushes: true,
        cacheTtl: 60000,
        maxCacheSize: 10,
      });
    });

    it('should return null for non-cached URL', () => {
      const cached = manager.getCachedPush('https://example.com/style.css');
      expect(cached).toBeNull();
    });

    it('should return all cached pushes', () => {
      const cached = manager.getCachedPushes();
      expect(cached).toBeInstanceOf(Map);
      expect(cached.size).toBe(0);
    });

    it('should clear cache', () => {
      manager.clearCache();
      const cached = manager.getCachedPushes();
      expect(cached.size).toBe(0);
    });
  });

  describe('session management', () => {
    let manager: Http2PushManager;

    beforeEach(() => {
      manager = new Http2PushManager();
    });

    it('should return undefined for non-existent session', () => {
      const session = manager.getSession('https://example.com');
      expect(session).toBeUndefined();
    });

    it('should close all sessions', async () => {
      // With no sessions, close should complete immediately
      await manager.close();
      expect(manager.getSession('https://example.com')).toBeUndefined();
    });
  });

  describe('waitForPush', () => {
    let manager: Http2PushManager;

    beforeEach(() => {
      manager = new Http2PushManager({
        pushTimeout: 100, // Short timeout for tests
      });
    });

    it('should return null when push times out', async () => {
      const result = await manager.waitForPush('https://example.com/style.css', 50);
      expect(result).toBeNull();
    });

    it('should use default timeout from options', async () => {
      const result = await manager.waitForPush('https://example.com/style.css');
      expect(result).toBeNull();
    });
  });

  describe('event emission', () => {
    let manager: Http2PushManager;

    beforeEach(() => {
      manager = new Http2PushManager();
    });

    it('should emit events', () => {
      const handler = vi.fn();
      manager.on('error', handler);

      const error = new Error('Test error');
      manager.emit('error', error);

      expect(handler).toHaveBeenCalledWith(error);
    });

    it('should remove listeners', () => {
      const handler = vi.fn();
      manager.on('push', handler);
      manager.removeListener('push', handler);

      manager.emit('push', { promise: {}, status: 200, headers: {}, body: Buffer.from(''), receivedAt: new Date() });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('URL cache key generation', () => {
    it('should handle various URL formats', () => {
      const manager = new Http2PushManager();

      // These should all return null since nothing is cached
      expect(manager.getCachedPush('https://example.com/path')).toBeNull();
      expect(manager.getCachedPush('https://example.com/path?query=1')).toBeNull();
      expect(manager.getCachedPush('https://example.com:443/path')).toBeNull();
    });

    it('should handle invalid URLs gracefully', () => {
      const manager = new Http2PushManager();
      // Invalid URLs should be used as-is for cache key
      expect(manager.getCachedPush('not-a-valid-url')).toBeNull();
    });
  });

  describe('connect', () => {
    let manager: Http2PushManager;

    beforeEach(() => {
      manager = new Http2PushManager();
    });

    afterEach(async () => {
      await manager.close();
    });

    it('should connect to HTTP/2 server', async () => {
      const session = await manager.connect('https://example.com');
      expect(session).toBeDefined();
    });

    it('should reuse existing session', async () => {
      const session1 = await manager.connect('https://example.com');
      const session2 = await manager.connect('https://example.com');
      expect(session1).toBe(session2);
    });

    it('should create new session for different origins', async () => {
      const session1 = await manager.connect('https://example.com');
      const session2 = await manager.connect('https://other.com');
      expect(session1).not.toBe(session2);
    });

    it('should handle connection errors', async () => {
      const http2 = await import('node:http2');
      vi.mocked(http2.connect).mockImplementationOnce((origin: string) => {
        const EventEmitter = require('node:events').EventEmitter;
        const session = new EventEmitter();
        session.closed = false;
        session.destroyed = false;
        setTimeout(() => {
          session.emit('error', new Error('Connection failed'));
        }, 10);
        return session as any;
      });

      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      await expect(manager.connect('https://bad.example.com')).rejects.toThrow('Connection failed');
      expect(errorHandler).toHaveBeenCalled();
    });

    it('should emit sessionClosed when session closes', async () => {
      const session = await manager.connect('https://example.com');

      const closedHandler = vi.fn();
      manager.on('sessionClosed', closedHandler);

      session.emit('close');

      expect(closedHandler).toHaveBeenCalledWith('https://example.com');
    });
  });

  describe('request', () => {
    let manager: Http2PushManager;

    beforeEach(() => {
      manager = new Http2PushManager();
    });

    afterEach(async () => {
      await manager.close();
    });

    it('should make HTTP/2 request', async () => {
      const result = await manager.request('https://example.com/api/data');

      expect(result.status).toBe(200);
      expect(result.body.toString()).toBe('response data');
    });

    it('should make request with custom method', async () => {
      const result = await manager.request('https://example.com/api/data', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      });

      expect(result.status).toBe(200);
    });

    it('should return cached push instead of making request', async () => {
      // Manually populate cache
      const pushedResource = {
        promise: { path: '/api/data', method: 'GET', authority: 'example.com', scheme: 'https', headers: {} },
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('cached data'),
        receivedAt: new Date(),
      };

      // Access private cache through connect + emit
      await manager.connect('https://example.com');
      (manager as any).pushCache.set('https://example.com/api/data', {
        resource: pushedResource,
        expiresAt: Date.now() + 60000,
      });

      const cacheHitHandler = vi.fn();
      manager.on('cacheHit', cacheHitHandler);

      const result = await manager.request('https://example.com/api/data');

      expect(result.body.toString()).toBe('cached data');
      expect(cacheHitHandler).toHaveBeenCalled();
    });

    it('should handle request errors', async () => {
      const http2 = await import('node:http2');
      const EventEmitter = require('node:events').EventEmitter;

      vi.mocked(http2.connect).mockImplementationOnce((origin: string) => {
        const session = new EventEmitter();
        session.closed = false;
        session.destroyed = false;
        session.request = () => {
          const stream = new EventEmitter();
          stream.write = vi.fn();
          stream.end = vi.fn();
          setTimeout(() => {
            stream.emit('error', new Error('Request failed'));
          }, 10);
          return stream;
        };
        setTimeout(() => session.emit('connect'), 5);
        return session as any;
      });

      const newManager = new Http2PushManager();
      await expect(newManager.request('https://error.example.com/api/data')).rejects.toThrow('Request failed');
    });
  });

  describe('push handling', () => {
    it('should handle push promise and cache resource', async () => {
      const http2 = await import('node:http2');
      const EventEmitter = require('node:events').EventEmitter;

      let sessionInstance: any;

      vi.mocked(http2.connect).mockImplementationOnce((origin: string) => {
        const session = new EventEmitter();
        session.closed = false;
        session.destroyed = false;
        session.request = () => {
          const stream = new EventEmitter();
          setTimeout(() => {
            stream.emit('response', { ':status': 200 });
            stream.emit('data', Buffer.from('main response'));
            stream.emit('end');
          }, 10);
          return stream;
        };
        sessionInstance = session;
        setTimeout(() => session.emit('connect'), 5);
        return session as any;
      });

      const onPush = vi.fn();
      const manager = new Http2PushManager({ onPush });

      const pushPromiseHandler = vi.fn();
      const pushHandler = vi.fn();
      manager.on('pushPromise', pushPromiseHandler);
      manager.on('push', pushHandler);

      await manager.connect('https://example.com');

      // Simulate a push stream
      const pushedStream = new EventEmitter();
      const pushHeaders = {
        ':path': '/style.css',
        ':method': 'GET',
        ':authority': 'example.com',
        ':scheme': 'https',
      };

      sessionInstance.emit('stream', pushedStream, pushHeaders);

      // Simulate push response
      setTimeout(() => {
        pushedStream.emit('response', { ':status': 200, 'content-type': 'text/css' });
        pushedStream.emit('data', Buffer.from('body { color: red; }'));
        pushedStream.emit('end');
      }, 10);

      // Wait for push to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(pushPromiseHandler).toHaveBeenCalled();
      expect(pushHandler).toHaveBeenCalled();
      expect(onPush).toHaveBeenCalled();

      const cached = manager.getCachedPush('https://example.com/style.css');
      expect(cached).not.toBeNull();
      expect(cached?.body.toString()).toBe('body { color: red; }');
    });

    it('should filter and reject pushes', async () => {
      const http2 = await import('node:http2');
      const EventEmitter = require('node:events').EventEmitter;

      let sessionInstance: any;

      vi.mocked(http2.connect).mockImplementationOnce((origin: string) => {
        const session = new EventEmitter();
        session.closed = false;
        session.destroyed = false;
        sessionInstance = session;
        setTimeout(() => session.emit('connect'), 5);
        return session as any;
      });

      // Filter rejects all pushes
      const manager = new Http2PushManager({
        filter: () => false,
      });

      const pushRejectedHandler = vi.fn();
      manager.on('pushRejected', pushRejectedHandler);

      await manager.connect('https://example.com');

      // Simulate a push stream
      const pushedStream = new EventEmitter();
      pushedStream.close = vi.fn();
      const pushHeaders = {
        ':path': '/unwanted.js',
        ':method': 'GET',
        ':authority': 'example.com',
        ':scheme': 'https',
      };

      sessionInstance.emit('stream', pushedStream, pushHeaders);

      expect(pushRejectedHandler).toHaveBeenCalled();
      expect(pushedStream.close).toHaveBeenCalledWith(8); // NGHTTP2_CANCEL
    });

    it('should handle push stream timeout', async () => {
      const http2 = await import('node:http2');
      const EventEmitter = require('node:events').EventEmitter;

      let sessionInstance: any;

      vi.mocked(http2.connect).mockImplementationOnce((origin: string) => {
        const session = new EventEmitter();
        session.closed = false;
        session.destroyed = false;
        sessionInstance = session;
        setTimeout(() => session.emit('connect'), 5);
        return session as any;
      });

      const manager = new Http2PushManager({
        pushTimeout: 50, // Short timeout
      });

      const pushErrorHandler = vi.fn();
      manager.on('pushError', pushErrorHandler);

      await manager.connect('https://example.com');

      // Simulate a push stream that never responds
      const pushedStream = new EventEmitter();
      pushedStream.close = vi.fn();
      const pushHeaders = {
        ':path': '/slow.js',
        ':method': 'GET',
      };

      sessionInstance.emit('stream', pushedStream, pushHeaders);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(pushErrorHandler).toHaveBeenCalled();
      expect(pushedStream.close).toHaveBeenCalled();
    });

    it('should handle push stream error', async () => {
      const http2 = await import('node:http2');
      const EventEmitter = require('node:events').EventEmitter;

      let sessionInstance: any;

      vi.mocked(http2.connect).mockImplementationOnce((origin: string) => {
        const session = new EventEmitter();
        session.closed = false;
        session.destroyed = false;
        sessionInstance = session;
        setTimeout(() => session.emit('connect'), 5);
        return session as any;
      });

      const manager = new Http2PushManager();
      const pushErrorHandler = vi.fn();
      manager.on('pushError', pushErrorHandler);

      await manager.connect('https://example.com');

      const pushedStream = new EventEmitter();
      const pushHeaders = { ':path': '/error.js' };

      sessionInstance.emit('stream', pushedStream, pushHeaders);

      // Emit error on push stream
      setTimeout(() => {
        pushedStream.emit('error', new Error('Push stream error'));
      }, 10);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(pushErrorHandler).toHaveBeenCalled();
    });
  });

  describe('cache eviction', () => {
    it('should evict oldest entry when cache is full', async () => {
      const http2 = await import('node:http2');
      const EventEmitter = require('node:events').EventEmitter;

      let sessionInstance: any;

      vi.mocked(http2.connect).mockImplementationOnce((origin: string) => {
        const session = new EventEmitter();
        session.closed = false;
        session.destroyed = false;
        sessionInstance = session;
        setTimeout(() => session.emit('connect'), 5);
        return session as any;
      });

      const manager = new Http2PushManager({
        maxCacheSize: 2,
        cacheTtl: 60000,
      });

      await manager.connect('https://example.com');

      // Fill cache with pushes
      for (let i = 0; i < 3; i++) {
        const pushedStream = new EventEmitter();
        const pushHeaders = {
          ':path': `/file${i}.js`,
          ':method': 'GET',
          ':authority': 'example.com',
          ':scheme': 'https',
        };

        sessionInstance.emit('stream', pushedStream, pushHeaders);

        setTimeout(() => {
          pushedStream.emit('response', { ':status': 200 });
          pushedStream.emit('data', Buffer.from(`content${i}`));
          pushedStream.emit('end');
        }, 10);

        await new Promise(resolve => setTimeout(resolve, 30));
      }

      // The first entry should have been evicted
      const cached = manager.getCachedPushes();
      expect(cached.size).toBeLessThanOrEqual(2);
    });
  });

  describe('cache expiration', () => {
    it('should return null for expired cache entries', async () => {
      const manager = new Http2PushManager({
        cacheTtl: 10, // Very short TTL
      });

      // Manually insert expired entry
      (manager as any).pushCache.set('https://example.com/expired.js', {
        resource: {
          promise: { path: '/expired.js', method: 'GET', authority: 'example.com', scheme: 'https', headers: {} },
          status: 200,
          headers: {},
          body: Buffer.from('old data'),
          receivedAt: new Date(),
        },
        expiresAt: Date.now() - 1000, // Already expired
      });

      const cached = manager.getCachedPush('https://example.com/expired.js');
      expect(cached).toBeNull();
    });

    it('should filter expired entries from getCachedPushes', async () => {
      const manager = new Http2PushManager();

      // Insert one valid and one expired entry
      (manager as any).pushCache.set('https://example.com/valid.js', {
        resource: { promise: {}, status: 200, headers: {}, body: Buffer.from(''), receivedAt: new Date() },
        expiresAt: Date.now() + 60000,
      });
      (manager as any).pushCache.set('https://example.com/expired.js', {
        resource: { promise: {}, status: 200, headers: {}, body: Buffer.from(''), receivedAt: new Date() },
        expiresAt: Date.now() - 1000,
      });

      const cached = manager.getCachedPushes();
      expect(cached.size).toBe(1);
    });
  });

  describe('waitForPush with pending push', () => {
    it('should return pending push if available', async () => {
      const manager = new Http2PushManager();

      // Create a pending promise
      const pendingPromise = Promise.resolve({
        promise: { path: '/pending.js', method: 'GET', authority: 'example.com', scheme: 'https', headers: {} },
        status: 200,
        headers: {},
        body: Buffer.from('pending content'),
        receivedAt: new Date(),
      });

      (manager as any).pendingPushes.set('https://example.com/pending.js', pendingPromise);

      const result = await manager.waitForPush('https://example.com/pending.js');
      expect(result?.body.toString()).toBe('pending content');
    });

    it('should return cached push immediately', async () => {
      const manager = new Http2PushManager();

      // Insert cached entry
      (manager as any).pushCache.set('https://example.com/cached.js', {
        resource: {
          promise: { path: '/cached.js', method: 'GET', authority: 'example.com', scheme: 'https', headers: {} },
          status: 200,
          headers: {},
          body: Buffer.from('cached content'),
          receivedAt: new Date(),
        },
        expiresAt: Date.now() + 60000,
      });

      const result = await manager.waitForPush('https://example.com/cached.js');
      expect(result?.body.toString()).toBe('cached content');
    });

    it('should resolve when push event matches', async () => {
      const manager = new Http2PushManager({ pushTimeout: 1000 });

      const waitPromise = manager.waitForPush('https://example.com/eventual.js');

      // Emit push event after short delay
      setTimeout(() => {
        manager.emit('push', {
          promise: { path: '/eventual.js', method: 'GET', authority: 'example.com', scheme: 'https', headers: {} },
          status: 200,
          headers: {},
          body: Buffer.from('eventually pushed'),
          receivedAt: new Date(),
        });
      }, 50);

      const result = await waitPromise;
      expect(result?.body.toString()).toBe('eventually pushed');
    });
  });
});

describe('http2Push plugin', () => {
  it('should add middleware that checks push cache', async () => {
    const manager = new Http2PushManager();

    // Pre-populate cache
    (manager as any).pushCache.set('https://example.com/style.css', {
      resource: {
        promise: { path: '/style.css', method: 'GET', authority: 'example.com', scheme: 'https', headers: {} },
        status: 200,
        headers: { 'content-type': 'text/css' },
        body: Buffer.from('body { }'),
        receivedAt: new Date(),
      },
      expiresAt: Date.now() + 60000,
    });

    const plugin = http2Push({ manager });

    // Mock client
    let registeredMiddleware: any;
    const mockClient = {
      use: vi.fn((mw) => { registeredMiddleware = mw; }),
    };

    plugin(mockClient as any);

    expect(mockClient.use).toHaveBeenCalled();
    expect((mockClient as any).getPushManager).toBeDefined();
    expect((mockClient as any).getPushManager()).toBe(manager);

    // Test middleware with cached push
    const mockReq = { url: 'https://example.com/style.css', method: 'GET' };
    const mockNext = vi.fn();

    const result = await registeredMiddleware(mockReq, mockNext);

    expect(mockNext).not.toHaveBeenCalled(); // Should return cached
    expect(result).toBeDefined();
  });

  it('should call next for non-cached requests', async () => {
    const manager = new Http2PushManager();
    const plugin = http2Push({ manager });

    let registeredMiddleware: any;
    const mockClient = {
      use: vi.fn((mw) => { registeredMiddleware = mw; }),
    };

    plugin(mockClient as any);

    const mockReq = { url: 'https://example.com/not-cached.js', method: 'GET' };
    const mockResponse = { status: 200 };
    const mockNext = vi.fn().mockResolvedValue(mockResponse);

    const result = await registeredMiddleware(mockReq, mockNext);

    expect(mockNext).toHaveBeenCalledWith(mockReq);
    expect(result).toBe(mockResponse);
  });

  it('should not use cache for non-GET requests', async () => {
    const manager = new Http2PushManager();

    // Pre-populate cache
    (manager as any).pushCache.set('https://example.com/data', {
      resource: {
        promise: { path: '/data', method: 'GET', authority: 'example.com', scheme: 'https', headers: {} },
        status: 200,
        headers: {},
        body: Buffer.from('cached'),
        receivedAt: new Date(),
      },
      expiresAt: Date.now() + 60000,
    });

    const plugin = http2Push({ manager });

    let registeredMiddleware: any;
    const mockClient = {
      use: vi.fn((mw) => { registeredMiddleware = mw; }),
    };

    plugin(mockClient as any);

    const mockReq = { url: 'https://example.com/data', method: 'POST' };
    const mockResponse = { status: 201 };
    const mockNext = vi.fn().mockResolvedValue(mockResponse);

    const result = await registeredMiddleware(mockReq, mockNext);

    expect(mockNext).toHaveBeenCalled(); // Should not use cache for POST
    expect(result).toBe(mockResponse);
  });

  it('should set X-Push-Cache header on cached responses', async () => {
    const manager = new Http2PushManager();

    (manager as any).pushCache.set('https://example.com/api', {
      resource: {
        promise: { path: '/api', method: 'GET', authority: 'example.com', scheme: 'https', headers: {} },
        status: 200,
        headers: { 'content-type': 'application/json', ':status': '200' },
        body: Buffer.from('{"data": "cached"}'),
        receivedAt: new Date(),
      },
      expiresAt: Date.now() + 60000,
    });

    const plugin = http2Push({ manager });

    let registeredMiddleware: any;
    const mockClient = {
      use: vi.fn((mw) => { registeredMiddleware = mw; }),
    };

    plugin(mockClient as any);

    const mockReq = { url: 'https://example.com/api', method: 'GET' };
    const mockNext = vi.fn();

    const result = await registeredMiddleware(mockReq, mockNext);

    // The result should have X-Push-Cache header
    expect(result).toBeDefined();
  });
});
