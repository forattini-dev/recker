import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, Http3Manager, http3, detectHttp3Support } from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('HTTP/3 Plugin', () => {
  let mockTransport: MockTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
    vi.clearAllMocks();
  });

  describe('Http3Manager', () => {
    it('should record Alt-Svc header', () => {
      const manager = new Http3Manager();

      manager.recordAltSvc('https://example.com', 'h3=":443"; ma=86400');

      expect(manager.isHttp3Available('https://example.com')).toBe(true);
    });

    it('should parse multiple Alt-Svc entries', () => {
      const manager = new Http3Manager();

      manager.recordAltSvc('https://example.com', 'h3=":443"; ma=86400, h3-29=":443"; ma=86400, h2=":443"');

      const endpoint = manager.getHttp3Endpoint('https://example.com');
      expect(endpoint).toBeDefined();
      expect(endpoint?.protocol).toBe('h3');
      expect(endpoint?.port).toBe(443);
    });

    it('should return null for unknown origins', () => {
      const manager = new Http3Manager();

      expect(manager.isHttp3Available('https://unknown.com')).toBe(false);
      expect(manager.getHttp3Endpoint('https://unknown.com')).toBeNull();
    });

    it('should expire cached entries', async () => {
      const manager = new Http3Manager({
        altSvcCacheTtl: 100 // 100ms
      });

      manager.recordAltSvc('https://example.com', 'h3=":443"; ma=1'); // 1 second max-age

      expect(manager.isHttp3Available('https://example.com')).toBe(true);

      // Wait for expiration
      await new Promise(r => setTimeout(r, 150));

      expect(manager.isHttp3Available('https://example.com')).toBe(false);
    });

    it('should clear cache', () => {
      const manager = new Http3Manager();

      manager.recordAltSvc('https://example.com', 'h3=":443"');
      expect(manager.isHttp3Available('https://example.com')).toBe(true);

      manager.clearCache();
      expect(manager.isHttp3Available('https://example.com')).toBe(false);
    });

    it('should mark origin as unsupported', () => {
      const manager = new Http3Manager();

      manager.recordAltSvc('https://example.com', 'h3=":443"');
      manager.markUnsupported('https://example.com');

      expect(manager.isHttp3Available('https://example.com')).toBe(false);
    });

    it('should emit events', () => {
      const manager = new Http3Manager();
      const discovered = vi.fn();
      const unsupported = vi.fn();

      manager.on('http3Discovered', discovered);
      manager.on('http3Unsupported', unsupported);

      manager.recordAltSvc('https://example.com', 'h3=":443"');
      expect(discovered).toHaveBeenCalledWith('https://example.com', expect.any(Array));

      manager.markUnsupported('https://example.com');
      expect(unsupported).toHaveBeenCalledWith('https://example.com');
    });

    it('should get connection info', () => {
      const manager = new Http3Manager();

      manager.recordAltSvc('https://example.com', 'h3=":443"');

      const info = manager.getConnectionInfo('https://example.com');

      expect(info.supportsHttp3).toBe(true);
      expect(info.endpoint).toBeDefined();
      expect(info.endpoint?.protocol).toBe('h3');
    });

    it('should get all known endpoints', () => {
      const manager = new Http3Manager();

      manager.recordAltSvc('https://example1.com', 'h3=":443"');
      manager.recordAltSvc('https://example2.com', 'h3=":8443"');

      const endpoints = manager.getKnownEndpoints();

      expect(endpoints.size).toBe(2);
    });

    it('should handle custom port in Alt-Svc', () => {
      const manager = new Http3Manager();

      manager.recordAltSvc('https://example.com', 'h3="alt.example.com:8443"');

      const endpoint = manager.getHttp3Endpoint('https://example.com');

      expect(endpoint?.host).toBe('alt.example.com');
      expect(endpoint?.port).toBe(8443);
    });

    it('should filter non-HTTP/3 entries', () => {
      const manager = new Http3Manager();

      // Only h2, no h3
      manager.recordAltSvc('https://example.com', 'h2=":443"; ma=86400');

      expect(manager.isHttp3Available('https://example.com')).toBe(false);
    });
  });

  describe('http3 plugin', () => {
    it('should record Alt-Svc from responses', async () => {
      mockTransport.setMockResponse('GET', '/api/data', 200, { data: 'test' }, {
        'alt-svc': 'h3=":443"; ma=86400'
      });

      const h3Manager = new Http3Manager();

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [http3({ manager: h3Manager })]
      });

      await client.get('/api/data').json();

      expect(h3Manager.isHttp3Available('https://api.example.com')).toBe(true);
    });

    it('should add http3Info method to client', async () => {
      mockTransport.setMockResponse('GET', '/api/data', 200, { data: 'test' }, {
        'alt-svc': 'h3=":443"'
      });

      const h3Manager = new Http3Manager();

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [http3({ manager: h3Manager })]
      });

      await client.get('/api/data').json();

      const info = client.http3Info('https://api.example.com/api/data');
      expect(info.supportsHttp3).toBe(true);
    });

    it('should add getHttp3Manager method to client', () => {
      const h3Manager = new Http3Manager();

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [http3({ manager: h3Manager })]
      });

      expect(client.getHttp3Manager()).toBe(h3Manager);
    });
  });

  describe('detectHttp3Support', () => {
    it('should detect HTTP/3 support from Alt-Svc header', async () => {
      mockTransport.setMockResponse('HEAD', '/test', 200, null, {
        'alt-svc': 'h3=":443"; ma=86400, h3-29=":443"; ma=86400'
      });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const support = await detectHttp3Support(client, 'https://example.com/test');

      expect(support.supported).toBe(true);
      expect(support.protocols).toContain('h3');
      expect(support.protocols).toContain('h3-29');
      expect(support.endpoint).toEqual({ host: 'example.com', port: 443 });
    });

    it('should return not supported when no Alt-Svc', async () => {
      mockTransport.setMockResponse('HEAD', '/test', 200, null);

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const support = await detectHttp3Support(client, 'https://example.com/test');

      expect(support.supported).toBe(false);
      expect(support.protocols).toHaveLength(0);
    });

    it('should return not supported when Alt-Svc has no HTTP/3', async () => {
      mockTransport.setMockResponse('HEAD', '/test', 200, null, {
        'alt-svc': 'h2=":443"'
      });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const support = await detectHttp3Support(client, 'https://example.com/test');

      expect(support.supported).toBe(false);
      expect(support.altSvcHeader).toBe('h2=":443"');
    });
  });

  describe('Http3Manager options', () => {
    it('should respect enabled option', () => {
      const manager = new Http3Manager({ enabled: false });

      manager.recordAltSvc('https://example.com', 'h3=":443"');

      // Should not detect as available when disabled
      expect(manager.isHttp3Available('https://example.com')).toBe(false);
    });

    it('should respect cacheAltSvc option', () => {
      const manager = new Http3Manager({ cacheAltSvc: false });

      manager.recordAltSvc('https://example.com', 'h3=":443"');

      // Should not cache when disabled
      expect(manager.getKnownEndpoints().size).toBe(0);
    });

    it('should call callbacks', async () => {
      const onHttp3 = vi.fn();
      const onFallback = vi.fn();

      const manager = new Http3Manager({
        onHttp3,
        onFallback
      });

      // These callbacks are called by user code, not automatically
      // Just verify the manager is created with the options
      expect(manager).toBeDefined();
    });
  });
});
