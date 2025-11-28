import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Http2PushManager } from '../../src/plugins/http2-push.js';

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
  });
});
